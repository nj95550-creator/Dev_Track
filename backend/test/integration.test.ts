/**
 * Real HTTP integration coverage using an isolated in-memory PostgreSQL engine.
 * Account fixtures exercise ownership, validation, CSRF, credentials and CRUD;
 * SMTP and controlled transaction overlap cover recovery and password races.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { QueryResultRow } from 'pg';
import { runInNewContext } from 'node:vm';
import { smtpFixture } from './smtpFixture';
process.env.DATA_DIR = 'memory://';
process.env.DEVTRACK_TEST_DATABASE = 'memory';
process.env.SERVE_FRONTEND = 'false';
process.env.AUTO_MIGRATE = 'false';
process.env.APP_ORIGIN = 'http://localhost:4173';
process.env.NODE_ENV = 'test';
process.env.SESSION_NAMESPACE = 'test';
let server: Server, db: typeof import('../src/database').databasePool, base: string;
let mail: Awaited<ReturnType<typeof smtpFixture>>;
type Client = { cookie: string; csrf: string };
const alice: Client = { cookie: '', csrf: '' };
const bob: Client = { cookie: '', csrf: '' };
const password = 'A memorable testing passphrase 2026!';
/**
 * Call the real test HTTP server and maintain one fixture account's cookie/
 * CSRF state. A separate client object lets assertions prove account separation.
 */
async function request(
  path: string,
  method = 'GET',
  body?: unknown,
  client?: Client,
  extra: Record<string, string> = {},
) {
  const headers: Record<string, string> = {
    Origin: 'http://localhost:4173',
    ...extra,
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (client?.cookie) headers.Cookie = client.cookie;
  if (client?.csrf) headers['X-CSRF-Token'] = client.csrf;
  const response = await fetch(base + '/api' + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await response.json()) as any;
  const cookie = response.headers.get('set-cookie');
  if (client && cookie) client.cookie = cookie.split(';')[0];
  if (client && data.csrfToken) client.csrf = data.csrfToken;
  return { response, data, status: response.status };
}
before(async () => {
  mail = await smtpFixture();
  process.env.SMTP_HOST = '127.0.0.1';
  process.env.SMTP_PORT = String(mail.port);
  process.env.SMTP_FROM = 'DevTrack <recovery@example.test>';
  process.env.SMTP_USER = '';
  process.env.SMTP_PASSWORD = '';
  const database = await import('../src/database');
  db = database.databasePool;
  await database.migrateDatabase();
  server = (await import('../src/server')).server;
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
});
after(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await db.end();
  await new Promise<void>((r) => mail.server.close(() => r()));
});
test('complete secured account / project / learning pipeline', async (t) => {
  let aliceId: number, bobId: number, projectId: number, goalId: number;
  await t.test(
    'unauthenticated APIs reject spoofed user IDs and hide account listing',
    async () => {
      assert.equal((await request('/projects?userId=1')).status, 401);
      assert.equal((await request('/projects/1?userId=1', 'DELETE')).status, 401);
      assert.equal((await request('/learning-goals?userId=1')).status, 401);
      assert.equal((await request('/users')).status, 404);
    },
  );
  await t.test(
    'signup issues HttpOnly SameSite cookie and stores only a token hash',
    async () => {
      const result = await request(
        '/users',
        'POST',
        {
          username: 'alice',
          name: 'Alice Example',
          email: 'alice@example.test',
          password,
        },
        alice,
      );
      assert.equal(result.status, 201);
      aliceId = result.data.user.id;
      assert.match(result.response.headers.get('set-cookie')!, /HttpOnly/);
      assert.match(result.response.headers.get('set-cookie')!, /SameSite=Lax/);
      assert.equal(result.data.user.passwordHash, undefined);
      assert.equal(alice.csrf.length, 64);
      const token = alice.cookie.split('=')[1];
      const stored = (
        await db.query('SELECT token_hash FROM sessions WHERE user_id=$1', [aliceId])
      ).rows[0].token_hash;
      assert.notEqual(stored, token);
      const second = await request(
        '/users',
        'POST',
        {
          username: 'bob',
          name: 'Bob Example',
          email: 'bob@example.test',
          password,
        },
        bob,
      );
      assert.equal(second.status, 201);
      bobId = second.data.user.id;
      assert.notEqual(alice.cookie, bob.cookie);
    },
  );
  await t.test('CSRF, foreign origins, and wrong content types are blocked', async () => {
    assert.equal(
      (await request('/projects', 'POST', { title: 'Blocked' }, { ...alice, csrf: '' })).status,
      403,
    );
    assert.equal(
      (
        await request('/projects', 'POST', { title: 'Blocked' }, alice, {
          Origin: 'https://attacker.test',
        })
      ).status,
      403,
    );
    const response = await fetch(base + '/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: '{}',
    });
    assert.equal(response.status, 415);
  });
  await t.test('invalid calendar years and null characters return validation errors', async () => {
    for (const payload of [
      { title: 'Year zero', startDate: '0000-01-01' },
      { title: 'Year zero', targetDate: '0000-01-01' },
      { title: 'Before\0after' },
      { title: 'Description', description: 'Before\0after' },
      { title: 'Technologies', technologies: 'Before\0after' },
      { title: 'URL', repositoryUrl: 'https://example.test/\0' },
    ]) assert.equal((await request('/projects', 'POST', payload, alice)).status, 400);
    for (const payload of [
      { title: 'Year zero', targetDate: '0000-01-01' },
      { title: 'Before\0after' },
      { title: 'Description', description: 'Before\0after' },
    ]) assert.equal((await request('/learning-goals', 'POST', payload, alice)).status, 400);
    assert.equal((await request('/me', 'PATCH', { name: 'Before\0after', username: 'alice' }, alice)).status, 400);
    for (const invalid of [{ name: 'Before\0after' }, { email: 'before\0after@example.test' }]) {
      assert.equal((await request('/users', 'POST', {
        username: 'boundary_user', name: 'Boundary Tester', email: 'boundary@example.test', password, ...invalid,
      })).status, 400);
    }
    assert.equal((await request('/projects', 'GET', undefined, alice)).status, 200);
  });
  await t.test('client-supplied ownership is ignored on create and read', async () => {
    const result = await request(
      '/projects',
      'POST',
      {
        userId: bobId,
        title: 'Secure portfolio',
        description: 'My project',
        status: 'in_progress',
        progress: 35,
        startDate: '2026-10-01',
        targetDate: '2026-11-01',
        technologies: 'React, TypeScript',
        repositoryUrl: 'https://github.com/example/repo',
      },
      alice,
    );
    assert.equal(result.status, 201);
    projectId = result.data.project.id;
    assert.equal(result.data.project.userId, aliceId);
    assert.equal(result.data.project.startDate, '2026-10-01');
    assert.equal(result.data.project.targetDate, '2026-11-01');
    assert.equal(
      (await request(`/projects?userId=${aliceId}`, 'GET', undefined, bob)).data.projects
        .length,
      0,
    );
    assert.equal(
      (await request(`/projects/${projectId}?userId=${aliceId}`, 'GET', undefined, bob)).status,
      404,
    );
    assert.equal(
      (
        await request(
          `/projects/${projectId}`,
          'PATCH',
          { userId: aliceId, title: 'Stolen' },
          bob,
        )
      ).status,
      404,
    );
    assert.equal(
      (await request(`/projects/${projectId}?userId=${aliceId}`, 'DELETE', {}, bob)).status,
      404,
    );
  });
  await t.test(
    'date edits, partial updates, completion progress, and validation work',
    async () => {
      const update = await request(
        `/projects/${projectId}`,
        'PATCH',
        { targetDate: '2026-12-31' },
        alice,
      );
      assert.equal(update.status, 200);
      assert.equal(update.data.project.startDate, '2026-10-01');
      assert.equal(update.data.project.targetDate, '2026-12-31');
      const complete = await request(
        `/projects/${projectId}`,
        'PATCH',
        { status: 'completed' },
        alice,
      );
      assert.equal(complete.data.project.progress, 100);
      assert.equal(
        (
          await request(
            '/projects',
            'POST',
            {
              title: 'Invalid dates',
              startDate: '2026-12-01',
              targetDate: '2026-10-01',
            },
            alice,
          )
        ).status,
        400,
      );
      assert.equal(
        (
          await request(
            '/projects',
            'POST',
            { title: 'Bad URL', repositoryUrl: 'javascript:alert(1)' },
            alice,
          )
        ).status,
        400,
      );
      assert.equal(
        (await request('/projects', 'POST', { title: 'Bad progress', progress: 150 }, alice))
          .status,
        400,
      );
      assert.equal(
        (
          await request(
            '/projects',
            'POST',
            { title: 'Bad date', targetDate: '2026-02-31' },
            alice,
          )
        ).status,
        400,
      );
    },
  );
  await t.test('a completed learning goal is created in one atomic request', async () => {
    const created = await request(
      '/learning-goals',
      'POST',
      {
        title: 'Learn secure sessions',
        status: 'completed',
        targetDate: '2026-12-01',
        projectId,
      },
      alice,
    );
    assert.equal(created.status, 201);
    goalId = created.data.goal.id;
    assert.equal(created.data.goal.status, 'completed');
    assert.equal(created.data.goal.targetDate, '2026-12-01');
    assert.equal(
      (await request('/learning-goals', 'POST', { title: 'Wrong owner', projectId }, bob))
        .status,
      400,
    );
    assert.equal(
      (
        await request(
          `/learning-goals/${goalId}`,
          'PATCH',
          { userId: aliceId, status: 'planned' },
          bob,
        )
      ).status,
      404,
    );
    const updated = await request(
      `/learning-goals/${goalId}`,
      'PATCH',
      { status: 'in_progress' },
      alice,
    );
    assert.equal(updated.data.goal.status, 'in_progress');
    assert.equal(updated.data.goal.projectId, projectId);
  });
  await t.test(
    'simultaneous partial edits preserve unrelated project and goal fields',
    async () => {
      for (const [path, id, key] of [
        ['projects', projectId, 'project'],
        ['learning-goals', goalId, 'goal'],
      ] as const) {
        const responses = await Promise.all([
          request(`/${path}/${id}`, 'PATCH', { title: 'Concurrent title' }, alice),
          request(`/${path}/${id}`, 'PATCH', { description: 'Concurrent description' }, alice),
        ]);
        assert.deepEqual(
          responses.map((r) => r.status),
          [200, 200],
        );
        const saved = (await request(`/${path}/${id}`, 'GET', undefined, alice)).data[key];
        assert.equal(saved.title, 'Concurrent title');
        assert.equal(saved.description, 'Concurrent description');
      }
      assert.equal(
        (await request(`/learning-goals/${goalId}`, 'PATCH', { projectId: 99999 }, alice))
          .status,
        400,
      );
    },
  );
  await t.test('deleting a project preserves and disconnects its goals', async () => {
    assert.equal((await request(`/projects/${projectId}`, 'DELETE', {}, alice)).status, 200);
    const goals = await request('/learning-goals', 'GET', undefined, alice);
    assert.equal(goals.data.goals[0].projectId, null);
    assert.equal((await request(`/learning-goals/${goalId}`, 'DELETE', {}, alice)).status, 200);
  });
  await t.test(
    'profile edits and password changes rotate sessions and keep login working',
    async () => {
      const profile = await request(
        '/me',
        'PATCH',
        { name: 'Alice Updated', username: 'alice_updated' },
        alice,
      );
      assert.equal(profile.status, 200);
      assert.equal(profile.data.user.name, 'Alice Updated');
      const oldCookie = alice.cookie;
      const oldCsrf = alice.csrf;
      assert.equal(
        (
          await request(
            '/password',
            'POST',
            {
              currentPassword: 'wrong',
              password: 'Another memorable passphrase 2026!',
            },
            alice,
          )
        ).status,
        400,
      );
      const changed = await request(
        '/password',
        'POST',
        {
          currentPassword: password,
          password: 'Another memorable passphrase 2026!',
        },
        alice,
      );
      assert.equal(changed.status, 200);
      assert.notEqual(alice.cookie, oldCookie);
      assert.notEqual(alice.csrf, oldCsrf);
      assert.equal(
        (
          await request('/session', 'GET', undefined, {
            cookie: oldCookie,
            csrf: oldCsrf,
          })
        ).status,
        401,
      );
      assert.equal(
        (await request('/login', 'POST', { username: 'alice_updated', password }, alice))
          .status,
        401,
      );
      assert.equal(
        (
          await request(
            '/login',
            'POST',
            {
              username: 'alice_updated',
              password: 'Another memorable passphrase 2026!',
              remember: true,
            },
            alice,
          )
        ).status,
        200,
      );
      const session = await request('/session', 'GET', undefined, alice);
      assert.equal(session.data.user.id, aliceId);
    },
  );
  await t.test('logout invalidates session and idle expiry is enforced', async () => {
    const cookie = alice.cookie;
    assert.equal((await request('/logout', 'POST', {}, alice)).status, 200);
    const stale = await request('/session', 'GET', undefined, { cookie, csrf: alice.csrf });
    assert.equal(stale.status, 401);
    assert.equal(stale.response.headers.get('set-cookie'), null, 'A stale request must not erase a newer browser cookie');
    await db.query(
      "UPDATE sessions SET last_seen_at=CURRENT_TIMESTAMP - INTERVAL '25 hours' WHERE user_id=$1",
      [bobId],
    );
    assert.equal((await request('/session', 'GET', undefined, bob)).status, 401);
  });
  await t.test('single-use password reset tokens are consumed atomically', async () => {
    const { digest } = await import('../src/security');
    const token = 'b'.repeat(64);
    await db.query(
      "INSERT INTO password_resets(token_hash,user_id,expires_at) VALUES($1,$2,CURRENT_TIMESTAMP + INTERVAL '20 minutes')",
      [digest(token), bobId],
    );
    assert.equal(
      (
        await request('/reset-password', 'POST', {
          token,
          password: 'A reset testing passphrase 2026!',
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await request('/reset-password', 'POST', {
          token,
          password: 'A reset testing passphrase 2026!',
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          '/login',
          'POST',
          { username: 'bob', password: 'A reset testing passphrase 2026!' },
          bob,
        )
      ).status,
      200,
    );
  });
  await t.test('demo workspaces are real, isolated, and safe to explore', async () => {
    const one: Client = { cookie: '', csrf: '' },
      two: Client = { cookie: '', csrf: '' };
    assert.equal((await request('/demo', 'POST', {}, one)).status, 201);
    assert.equal((await request('/demo', 'POST', {}, two)).status, 201);
    const first = await request('/projects', 'GET', undefined, one),
      second = await request('/projects', 'GET', undefined, two);
    assert.equal(first.data.projects.length, 6);
    assert.equal(second.data.projects.length, 6);
    assert.notEqual(first.data.projects[0].userId, second.data.projects[0].userId);
    assert.equal((await request('/sample-data', 'POST', {}, one)).status, 409);
  });
  await t.test(
    'demo cleanup uses an explicit flag and never removes a legacy personal account',
    async () => {
      await db.query('DELETE FROM rate_limits');
      assert.equal(
        (
          await request('/users', 'POST', {
            username: 'reserved_email',
            name: 'Reserved',
            email: 'personal@demo.invalid',
            password,
          })
        ).status,
        400,
      );
      const personal = (
        await db.query(`INSERT INTO users(username,name,email,password_hash,created_at)
      VALUES('demo_personal','Personal','legacy@demo.invalid','unused',CURRENT_TIMESTAMP - INTERVAL '8 days') RETURNING id`)
      ).rows[0];
      const project = (
        await db.query(
          "INSERT INTO projects(user_id,title) VALUES($1,'Retain this project') RETURNING id",
          [personal.id],
        )
      ).rows[0];
      const oldDemo = (
        await db.query(`INSERT INTO users(username,name,email,password_hash,is_demo,created_at)
      VALUES('old_demo','Demo','old@demo.invalid','unused',TRUE,CURRENT_TIMESTAMP - INTERVAL '8 days') RETURNING id`)
      ).rows[0];
      const active: Client = { cookie: '', csrf: '' };
      const signedIn = await request('/demo', 'POST', {}, active);
      assert.equal(signedIn.data.user.isDemo, true);
      await db.query(
        "UPDATE users SET created_at=CURRENT_TIMESTAMP - INTERVAL '8 days' WHERE id=$1",
        [signedIn.data.user.id],
      );
      assert.equal((await request('/demo', 'POST', {})).status, 201);
      assert.equal(
        (await db.query('SELECT id FROM users WHERE id=$1', [oldDemo.id])).rows.length,
        0,
      );
      assert.equal(
        (await db.query('SELECT is_demo FROM users WHERE id=$1', [personal.id])).rows[0]
          .is_demo,
        false,
      );
      assert.equal(
        (await db.query('SELECT id FROM projects WHERE id=$1', [project.id])).rows.length,
        1,
      );
      assert.equal(
        (await request('/session', 'GET', undefined, active)).data.user.isDemo,
        true,
      );
      await (await import('../src/database')).migrateDatabase();
      assert.equal(
        (await db.query('SELECT id FROM projects WHERE id=$1', [project.id])).rows.length,
        1,
      );
    },
  );
  await t.test('SMTP recovery delivers an expiring link and revokes old sessions', async () => {
    await db.query('DELETE FROM rate_limits');
    const client: Client = { cookie: '', csrf: '' };
    await request(
      '/login',
      'POST',
      { username: 'bob', password: 'A reset testing passphrase 2026!' },
      client,
    );
    const oldCookie = client.cookie;
    const count = mail.messages.length;
    assert.equal(
      (
        await request('/forgot-password', 'POST', {
          email: 'missing@example.test',
        })
      ).status,
      200,
    );
    assert.equal(mail.messages.length, count);
    assert.equal(
      (
        await request('/forgot-password', 'POST', {
          email: 'bob@example.test',
        })
      ).status,
      200,
    );
    assert.equal(mail.messages.length, count + 1);
    const message = mail.messages
      .at(-1)!
      .replace(/=\r\n/g, '')
      .replace(/=([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    const token = message.match(/reset=([a-f0-9]{64})/)?.[1];
    assert.ok(token, 'Email must contain the actual reset link');
    const resetPassword = 'New emailed recovery passphrase 2026!';
    assert.equal(
      (
        await request('/reset-password', 'POST', {
          token,
          password: resetPassword,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await request('/session', 'GET', undefined, {
          cookie: oldCookie,
          csrf: '',
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await request('/reset-password', 'POST', {
          token,
          password: resetPassword,
        })
      ).status,
      400,
    );
    await request('/forgot-password', 'POST', { email: 'bob@example.test' });
    const expired = mail.messages
      .at(-1)!
      .replace(/=\r\n/g, '')
      .replace(/=3D/g, '=')
      .match(/reset=([a-f0-9]{64})/)?.[1];
    assert.ok(expired);
    await db.query(
      "UPDATE password_resets SET expires_at=CURRENT_TIMESTAMP - INTERVAL '1 minute' WHERE user_id=$1",
      [bobId],
    );
    assert.equal(
      (
        await request('/reset-password', 'POST', {
          token: expired,
          password: resetPassword,
        })
      ).status,
      400,
    );
    assert.equal(
      (await request('/login', 'POST', { username: 'bob', password: resetPassword }, bob))
        .status,
      200,
    );
  });
  await t.test(
    'owner terminal recovery targets one account and revokes sessions and reset links',
    async () => {
      const { resetOwnedAccountPassword } = await import('../src/recoverAccount');
      const password = 'Recovered by the owner passphrase 2026!';
      const oldCookie = bob.cookie;
      await assert.rejects(() => resetOwnedAccountPassword('bob', 'short'), /15–128/);
      await assert.rejects(
        () => resetOwnedAccountPassword('missing_user', password),
        /not found/,
      );
      assert.equal(await resetOwnedAccountPassword('BOB', password), 'bob');
      assert.equal(
        (await db.query('SELECT * FROM sessions WHERE user_id=$1', [bobId])).rows.length,
        0,
      );
      assert.equal(
        (await db.query('SELECT * FROM password_resets WHERE user_id=$1', [bobId])).rows.length,
        0,
      );
      assert.equal(
        (
          await request('/session', 'GET', undefined, {
            cookie: oldCookie,
            csrf: '',
          })
        ).status,
        401,
      );
      assert.equal(
        (await request('/login', 'POST', { username: 'bob', password }, bob)).status,
        200,
      );
      assert.equal((await request('/session', 'GET', undefined, bob)).data.user.isDemo, false);
      assert.equal(
        (await db.query('SELECT name FROM users WHERE id=$1', [aliceId])).rows[0].name,
        'Alice Updated',
      );
    },
  );
  await t.test('password changes reject logins that verified an obsolete hash', async (t) => {
    const { digest } = await import('../src/security');
    const { resetOwnedAccountPassword } = await import('../src/recoverAccount');
    for (const action of ['reset', 'owner', 'change'] as const) {
      await t.test(action, { timeout: 20_000 }, async () => {
        await db.query('DELETE FROM rate_limits');
        const username = `overlap_${action}`;
        const owner: Client = { cookie: '', csrf: '' };
        const created = await request(
          '/users',
          'POST',
          {
            username,
            name: 'Overlap tester',
            email: `${username}@example.test`,
            password,
          },
          owner,
        );
        assert.equal(created.status, 201);
        const userId = created.data.user.id;
        const token = 'f'.repeat(64);
        if (action === 'reset')
          await db.query(
            "INSERT INTO password_resets(token_hash,user_id,expires_at) VALUES($1,$2,CURRENT_TIMESTAMP + INTERVAL '20 minutes')",
            [digest(token), userId],
          );
        let release!: () => void, observed!: () => void;
        const gate = new Promise<void>((r) => (release = r));
        const readObserved = new Promise<void>((r) => (observed = r));
        const originalQuery = db.query;
        let paused = false;
        // Force the real SELECT to overlap a real password change. No password
        // checks or authorization outcomes are mocked.
        db.query = async <T extends QueryResultRow = QueryResultRow>(
          sql: string,
          params: unknown[] = [],
        ) => {
          const result = await originalQuery<T>(sql, params);
          if (
            !paused &&
            sql.includes('password_hash AS "passwordHash"') &&
            params[0] === username
          ) {
            paused = true;
            observed();
            await gate;
          }
          return result;
        };
        const staleLogin = request('/login', 'POST', { username, password });
        const newPassword = `A changed ${action} passphrase 2026!`;
        try {
          await Promise.race([
            readObserved,
            staleLogin.then(() => {
              throw new Error('Login returned before the expected password read.');
            }),
          ]);
          if (action === 'owner') await resetOwnedAccountPassword(username, newPassword);
          else if (action === 'reset')
            assert.equal(
              (
                await request('/reset-password', 'POST', {
                  token,
                  password: newPassword,
                })
              ).status,
              200,
            );
          else
            assert.equal(
              (
                await request(
                  '/password',
                  'POST',
                  { currentPassword: password, password: newPassword },
                  owner,
                )
              ).status,
              200,
            );
        } finally {
          release();
          db.query = originalQuery;
        }
        const rejected = await staleLogin;
        assert.equal(rejected.status, 401);
        assert.equal(rejected.response.headers.get('set-cookie'), null);
        assert.equal(
          (
            await db.query('SELECT COUNT(*)::int AS count FROM sessions WHERE user_id=$1', [
              userId,
            ])
          ).rows[0].count,
          action === 'change' ? 1 : 0,
          'No extra session may be created from the old password',
        );
        const fresh: Client = { cookie: '', csrf: '' };
        const signedIn = await request(
          '/login',
          'POST',
          { username, password: newPassword, remember: true },
          fresh,
        );
        assert.equal(signedIn.status, 200);
        assert.match(signedIn.response.headers.get('set-cookie')!, /Max-Age=2592000/);
        assert.equal((await request('/session', 'GET', undefined, fresh)).data.user.id, userId);
      });
    }
  });
  await t.test(
    'owner recovery accepts a long Unicode password that remains usable for login',
    async () => {
      await db.query('DELETE FROM rate_limits');
      const { resetOwnedAccountPassword } = await import('../src/recoverAccount');
      const unicode = '🔒'.repeat(80);
      await resetOwnedAccountPassword('bob', unicode);
      assert.equal(
        (await request('/login', 'POST', { username: 'bob', password: unicode }, bob)).status,
        200,
      );
      assert.equal((await request('/session', 'GET', undefined, bob)).data.user.id, bobId);
    },
  );
  await t.test(
    'Swagger serves local assets and executes cookie/CSRF requests after reload',
    async () => {
      const page = await fetch(base + '/api-docs/');
      assert.equal(page.status, 200);
      assert.match(await page.text(), /swagger-ui-bundle.js/);
      assert.match(page.headers.get('content-security-policy')!, /script-src 'self'/);
      const alias = await fetch(base + '/swagger', { redirect: 'manual' });
      assert.equal(alias.headers.get('location'), '/api-docs/');
      assert.equal((await fetch(base + '/api-docs/', { method: 'HEAD' })).status, 200);
      const spec = (await (await fetch(base + '/api-docs/openapi.json')).json()) as any;
      assert.equal(spec.components.securitySchemes.sessionCookie.name, 'devtrack_test_session');
      assert.equal(spec.servers[0].url, '/');
      for (const methods of Object.values(spec.paths) as any[]) {
        for (const operation of Object.values(methods) as any[]) {
          for (const [status, result] of Object.entries(operation.responses) as [
            string,
            any,
          ][]) {
            if (!status.startsWith('2')) continue;
            const content = result.content?.['application/json'];
            assert.ok(content?.schema?.$ref, 'Each success response needs a schema');
            assert.ok(content.example, 'Each success response needs an example');
            const schemaName = content.schema.$ref.split('/').at(-1);
            assert.ok(spec.components.schemas[schemaName]);
          }
        }
      }
      assert.ok(spec.components.schemas.User.required.includes('isDemo'));
      assert.ok(spec.components.schemas.Project.required.includes('userId'));

      assert.equal(spec.paths['/api/projects'].post.parameters[0].required, false);
      for (const asset of ['swagger-ui.css', 'swagger-ui-bundle.js', 'swagger-init.js']) {
        assert.equal((await fetch(base + '/api-docs/' + asset)).status, 200);
      }
      assert.equal((await fetch(base + '/api-docs/missing.js')).status, 404);
      process.env.ENABLE_SWAGGER = 'false';
      try {
        assert.equal((await fetch(base + '/api-docs/')).status, 404);
        assert.equal((await fetch(base + '/swagger', { redirect: 'manual' })).status, 404);
      } finally {
        delete process.env.ENABLE_SWAGGER;
      }

      // Run the actual served initializer with a cookie jar, like a browser tab.
      let cookie = '';
      const browserFetch = async (url: string, init: RequestInit = {}) => {
        assert.equal(init.credentials, 'same-origin');
        const headers = new Headers(init.headers);
        headers.set('Origin', 'http://localhost:4173');
        if (cookie) headers.set('Cookie', cookie);
        const response = await fetch(new URL(url, base), { ...init, headers });
        const nextCookie = response.headers.get('set-cookie');
        if (nextCookie) cookie = nextCookie.split(';')[0];
        return response;
      };
      const script = await (await fetch(base + '/api-docs/swagger-init.js')).text();
      /**
       * Evaluate the actually served initializer in a small browser-like VM and
       * capture its Swagger configuration. The network adapter uses a real cookie jar.
       */
      function loadSwagger(): any {
        let options: any;
        runInNewContext(script, {
          window: {
            location: { href: base + '/api-docs/', origin: base },
            addEventListener: (_: string, callback: () => void) => callback(),
          },
          SwaggerUIBundle: (config: any) => {
            options = config;
            return config;
          },
          URL,
          Set,
          Error,
          fetch: browserFetch,
        });
        return options;
      }
      let ui = loadSwagger();
      /**
       * Run the captured Swagger request interceptor before the real HTTP request
       * so tests exercise its same-origin and refreshed-CSRF behavior.
       */
      async function execute(path: string, method = 'GET', body?: unknown) {
        const req = await ui.requestInterceptor({
          url: base + '/api' + path,
          method,
          headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        return browserFetch(req.url, req);
      }
      assert.equal((await execute('/demo', 'POST')).status, 201);
      const created = await execute('/projects', 'POST', {
        title: 'Swagger browser test',
      });
      assert.equal(created.status, 201);
      const projectId = ((await created.json()) as any).project.id;
      ui = loadSwagger(); // A refreshed page must reuse the cookie and fetch a new token.
      assert.equal((await execute('/projects')).status, 200);
      assert.equal((await execute(`/projects/${projectId}`, 'DELETE')).status, 200);
      assert.equal((await execute('/logout', 'POST')).status, 200);
      assert.equal((await execute('/projects')).status, 401);
      await assert.rejects(
        () =>
          ui.requestInterceptor({
            url: 'https://other.example/api/projects',
            method: 'GET',
          }),
        /origin/,
      );
    },
  );
  await t.test('rate limits return a useful 429 response', async () => {
    await db.query('DELETE FROM rate_limits');
    let status = 0;
    for (let i = 0; i < 31; i++) status = (await request('/login', 'POST', {})).status;
    assert.equal(status, 429);
  });
});
