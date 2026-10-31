/**
 * Real PostgreSQL fresh/populated upgrade verification in a generated database.
 * Provision a unique restricted role, run the actual production API through it,
 * check saved-account login and denied DDL, then remove only the temporary grants.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

const name = process.env.DEVTRACK_POSTGRES_TEST_DATABASE;
const ownerUrl = new URL(process.env.DATABASE_URL || 'http://invalid');
if (!/^devtrack_verify_[a-f0-9]{24}$/.test(name || '') || ownerUrl.pathname !== `/${name}`)
  throw new Error('Only the temporary database created by npm run test:postgres is allowed.');
const require = createRequire(resolve(process.env.DEVTRACK_TEST_BACKEND_DIR || process.cwd(), 'package.json'));
const { Client } = require('pg');
const owner = new Client({ connectionString: ownerUrl.href });
const role = `devtrack_runtime_${randomBytes(10).toString('hex')}`;
const password = randomBytes(32).toString('hex');
const runtimeUrl = new URL(ownerUrl);
runtimeUrl.username = role;
runtimeUrl.password = password;
const { provisionRuntimeRole, assertRestrictedRuntime } = require('./dist/databasePrivileges.js');
// Resolve relative to the verification checkout, including when mounted /checks.
const schema = await readFile(new URL('../../database/schema.sql', import.meta.url), 'utf8');
let app, db, runtime;
await owner.connect();
/**
 * Run the actual provisioning SQL in an owner transaction; repeat calls
 * must retain populated records and keep runtime permissions restricted.
 */
async function provision() {
  await owner.query('BEGIN');
  try {
    await provisionRuntimeRole((sql, params) => owner.query(sql, params), role, password, schema);
    await owner.query('COMMIT');
  } catch (error) { await owner.query('ROLLBACK'); throw error; }
}
try {
  await provision();
  runtime = new Client({ connectionString: runtimeUrl.href });
  await runtime.connect();
  await assertRestrictedRuntime((sql, params) => runtime.query(sql, params));
  for (const sql of ['CREATE TABLE public.forbidden(id int)', 'TRUNCATE users CASCADE', 'ALTER TABLE users ADD COLUMN forbidden int', 'CREATE ROLE forbidden'])
    await assert.rejects(runtime.query(sql), (error) => error.code === '42501');
  Object.assign(process.env, {
    DATABASE_URL: runtimeUrl.href, NODE_ENV: 'production', APP_ORIGIN: 'https://portfolio.example',
    AUTO_MIGRATE: 'false', SERVE_FRONTEND: 'false', DEVTRACK_TEST_DATABASE: '',
  });
  db = require('./dist/database.js');
  await db.verifyDatabaseConnection();
  app = require('./dist/server.js').server;
  await new Promise((accept, reject) => { app.once('error', reject); app.listen(0, '127.0.0.1', accept); });
  const base = `http://127.0.0.1:${app.address().port}`;
  let cookie = '', csrf = '';
  /**
   * Exercise production API handlers using only the restricted runtime pool.
   * Maintain the test cookie manually because this private HTTP probe models
   * the backend port behind an HTTPS origin, not public browser TLS.
   */
  async function request(path, method = 'GET', body) {
    const response = await fetch(base + '/api' + path, {
      method, headers: { Origin: 'https://portfolio.example', Cookie: cookie, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20_000),
    });
    const data = await response.json();
    assert.ok(response.ok, `${method} ${path}: ${response.status}`);
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
    if (data.csrfToken) csrf = data.csrfToken;
    return data;
  }
  const accountPassword = 'An existing PostgreSQL account password 2026!';
  await request('/users', 'POST', { username: 'upgrade_saved_user', name: 'Saved User', email: 'upgrade@example.test', password: accountPassword });
  const { project } = await request('/projects', 'POST', { title: 'Saved before upgrade', progress: 42 });
  const { goal } = await request('/learning-goals', 'POST', { title: 'Saved goal', projectId: project.id });
  await request('/logout', 'POST', {});
  const snapshot = (await owner.query("SELECT row_to_json(u) AS user FROM users u WHERE username='upgrade_saved_user'")).rows;
  await provision();
  await provision();
  assert.deepEqual((await owner.query("SELECT row_to_json(u) AS user FROM users u WHERE username='upgrade_saved_user'")).rows, snapshot);
  await request('/login', 'POST', { username: 'upgrade_saved_user', password: accountPassword });
  assert.equal((await request(`/projects/${project.id}`)).project.progress, 42);
  assert.equal((await request(`/learning-goals/${goal.id}`)).goal.projectId, project.id);
  await request(`/projects/${project.id}`, 'PATCH', { title: 'Edited after upgrade' });
  assert.equal((await request(`/projects/${project.id}`)).project.title, 'Edited after upgrade');
  await request(`/projects/${project.id}`, 'DELETE');
  assert.equal((await request(`/learning-goals/${goal.id}`)).goal.projectId, null);
  await assertRestrictedRuntime((sql, params) => runtime.query(sql, params));
  console.log('External PostgreSQL: fresh provisioning, repeat populated upgrades, saved-password login, account/project/goal retention, restricted API CRUD and rejected DDL passed.');
} finally {
  if (app?.listening) await new Promise((r) => app.close(r));
  if (db) await db.databasePool.end();
  if (runtime) await runtime.end();
  // This generated test role owns no objects. Revoke only its test grants.
  await owner.query(`DROP OWNED BY "${role}"`).catch(() => {});
  await owner.query(`DROP ROLE IF EXISTS "${role}"`).catch(() => {});
  await owner.end();
}
