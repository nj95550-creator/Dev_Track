/**
 * Real PostgreSQL concurrency checks, guarded to the runner's generated database.
 * Pause transactions after actual account locks, observe competing connections,
 * and verify recovery/partial edits without substituting SQL results.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

const name = process.env.DEVTRACK_POSTGRES_TEST_DATABASE;
if (
  !/^devtrack_verify_[a-f0-9]{24}$/.test(name || '') ||
  new URL(process.env.DATABASE_URL || 'http://invalid').pathname !== `/${name}`
)
  throw new Error(
    'Run this through npm run test:postgres. Only its temporary database is allowed.',
  );
const require = createRequire(
  resolve(process.env.DEVTRACK_TEST_BACKEND_DIR || process.cwd(), 'package.json'),
);
const database = require('./dist/database.js');
assert.equal(database.embedded, null, 'This suite must exercise a real PostgreSQL server.');
const { databasePool: db } = database;
const { digest } = require('./dist/security.js');
const { resetOwnedAccountPassword } = require('./dist/recoverAccount.js');
const { server } = require('./dist/server.js');
const password = 'A PostgreSQL verification passphrase 2026!';
let base;
/**
 * Call the real PostgreSQL-backed API and update one test client's cookie/
 * CSRF pair when credential endpoints rotate them.
 */
async function request(path, method = 'GET', body, client = {}) {
  const response = await fetch(base + '/api' + path, {
    method,
    headers: {
      Origin: 'http://localhost:4173',
      Cookie: client.cookie || '',
      'X-CSRF-Token': client.csrf || '',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const data = await response.json();
  if (response.headers.get('set-cookie'))
    client.cookie = response.headers.get('set-cookie').split(';')[0];
  if (data.csrfToken) client.csrf = data.csrfToken;
  return { status: response.status, data };
}
/**
 * Register a disposable personal account and return its authenticated client
 * and database ID for concurrency/recovery fixtures.
 */
async function account(username) {
  const client = {};
  const response = await request(
    '/users',
    'POST',
    { username, name: 'PG Tester', email: `${username}@example.test`, password },
    client,
  );
  assert.equal(response.status, 201);
  return { client, id: response.data.user.id };
}
/**
 * Seed a real hashed, expiring token for a known disposable account so races
 * can target recovery without requiring an external mail provider.
 */
async function resetToken(id) {
  const token = randomBytes(32).toString('hex');
  await db.query(
    "INSERT INTO password_resets(token_hash,user_id,expires_at) VALUES($1,$2,CURRENT_TIMESTAMP + INTERVAL '20 minutes')",
    [digest(token), id],
  );
  return token;
}
/**
 * Poll pg_stat_activity until a separate account operation is waiting on
 * a real lock. Timeout fails the test instead of assuming overlap occurred.
 */
async function waitForBlockedAccount() {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    const { rows } = await db.query(
      "SELECT query FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock'",
    );
    if (rows.some((row) => /users/.test(row.query))) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error('The competing recovery request did not reach its account lock.');
}
try {
  await database.migrateDatabase();
  await database.migrateDatabase();
  await new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', accept);
  });
  base = `http://127.0.0.1:${server.address().port}`;
  console.log((await db.query('SELECT version() AS version')).rows[0].version);
  for (const action of ['change', 'owner']) {
    const username = `overlap_${action}`;
    const { client, id } = await account(username);
    const token = await resetToken(id);
    let observed, release;
    const locked = new Promise((r) => {
      observed = r;
    });
    const gate = new Promise((r) => {
      release = r;
    });
    const original = database.transaction;
    let paused = false,
      changing,
      recovering;
    // Pause only after the real account row has been locked. No authorization
    // decisions or SQL results are mocked. pg_stat_activity proves the second
    // connection is blocked before the first operation proceeds.
    database.transaction = (work) =>
      original((query) =>
        work(async (sql, params = []) => {
          const result = await query(sql, params);
          if (
            !paused &&
            (action === 'change'
              ? sql.includes('AND password_hash=$3')
              : sql.includes('LOWER(username)=LOWER($1) FOR UPDATE'))
          ) {
            paused = true;
            observed();
            await gate;
          }
          return result;
        }),
      );
    try {
      const next = `A changed ${action} verification passphrase 2026!`;
      changing =
        action === 'change'
          ? request('/password', 'POST', { currentPassword: password, password: next }, client)
          : resetOwnedAccountPassword(username, next);
      let timer;
      try {
        await Promise.race([
          locked,
          changing.then(() => {
            throw new Error('Credential change finished before the controlled lock.');
          }),
          new Promise((_r, reject) => {
            timer = setTimeout(
              () => reject(new Error('Account lock was not observed.')),
              8_000,
            );
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
      recovering = request('/reset-password', 'POST', {
        token,
        password: 'A competing recovery passphrase 2026!',
      });
      await waitForBlockedAccount();
      release();
      const [changed, reset] = await Promise.all([changing, recovering]);
      assert.equal(
        action === 'change' ? changed.status : changed,
        action === 'change' ? 200 : username,
      );
      assert.equal(
        reset.status,
        400,
        'Recovery must reject its revoked token without a deadlock or server error.',
      );
      assert.equal(
        (await request('/login', 'POST', { username, password: next })).status,
        200,
      );
      console.log(`PostgreSQL recovery versus ${action}: passed.`);
    } finally {
      release();
      database.transaction = original;
      await Promise.allSettled([changing, recovering].filter(Boolean));
    }
  }
  const { client, id } = await account('partial_edits');
  for (const [collection, key] of [
    ['projects', 'project'],
    ['learning-goals', 'goal'],
  ]) {
    const created = await request(`/${collection}`, 'POST', { title: 'Original' }, client);
    assert.equal(created.status, 201);
    const path = `/${collection}/${created.data[key].id}`;
    const edits = await Promise.all([
      request(path, 'PATCH', { title: 'Concurrent title' }, client),
      request(path, 'PATCH', { description: 'Concurrent description' }, client),
    ]);
    assert.deepEqual(
      edits.map((r) => r.status),
      [200, 200],
    );
    const saved = (await request(path, 'GET', undefined, client)).data[key];
    assert.equal(saved.title, 'Concurrent title');
    assert.equal(saved.description, 'Concurrent description');
  }
  const token = await resetToken(id);
  const results = await Promise.all(
    [1, 2].map(() =>
      request('/reset-password', 'POST', {
        token,
        password: 'A single-use recovery passphrase 2026!',
      }),
    ),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 400]);
  console.log(
    'PostgreSQL partial edits, idempotent migrations and simultaneous single-use recovery: passed.',
  );
} finally {
  if (server.listening) await new Promise((r) => server.close(r));
  await db.end();
}
