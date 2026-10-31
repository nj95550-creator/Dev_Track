/**
 * Compiled-output safety checks for production-only guards, metadata, headers
 * and cookie attributes. The unavailable database fixture is intentional: this
 * suite does not claim a real production PostgreSQL connection or public HTTPS test.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const backend = fileURLToPath(new URL('../../backend', import.meta.url));
const env = {
  ...process.env,
  NODE_ENV: 'production',
  DEVTRACK_TEST_DATABASE: '',
  DATABASE_URL: '',
  DB_HOST: '127.0.0.1',
  DB_PORT: '9',
  DB_SSL: 'false',
  APP_ORIGIN: 'https://portfolio.example',
  SMTP_HOST: '',
  SMTP_FROM: '',
  ENABLE_SWAGGER: '',
  SERVE_FRONTEND: 'true',
  AUTO_MIGRATE: 'false',
  SESSION_NAMESPACE: 'production_check',
};
/**
 * Load compiled production modules in an isolated child with explicit test
 * settings; enforce a deadline so a missing safety guard cannot hang the suite.
 */
function run(code, overrides = {}) {
  return spawnSync(process.execPath, ['-e', code], {
    cwd: backend,
    env: { ...env, ...overrides },
    encoding: 'utf8',
    timeout: 15_000,
  });
}
test('production refuses HTTP origins and embedded databases', () => {
  const insecure = run("require('./dist/security.js')", {
    APP_ORIGIN: 'http://localhost:3000',
  });
  assert.notEqual(insecure.status, 0);
  assert.match(insecure.stderr, /must use HTTPS/);
  const embedded = run("require('./dist/database.js')", { DB_HOST: '' });
  assert.notEqual(embedded.status, 0);
  assert.match(embedded.stderr, /Production requires/);
});
test('external PostgreSQL verification requires an explicit disposable service', () => {
  const script = fileURLToPath(new URL('../postgres-test.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [script], {
    env: { ...process.env, DEVTRACK_POSTGRES_TEST_URL: '' },
    encoding: 'utf8',
    timeout: 10_000,
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Set DEVTRACK_POSTGRES_TEST_URL/);
});
test('compiled production output has security headers, private docs and Secure cookies', () => {
  const result = run(`(async()=>{
    const assert=require('node:assert/strict');
    const {server}=require('./dist/server.js');
    const {databasePool}=require('./dist/database.js');
    try {
      await new Promise(r=>server.listen(0,'127.0.0.1',r));
      const base='http://127.0.0.1:'+server.address().port;
      const home=await fetch(base);
      assert.equal(home.status,200);
      const html=await home.text();
      assert.ok(html.includes('content="https://portfolio.example/screenshots/share.png"'));
      assert.ok(!html.includes('__DEVTRACK_ORIGIN__'));
      const source=await fetch(base+'/source/');
      assert.equal(source.status,200);
      assert.match(await source.text(),/Explore the source/);
      assert.equal((await fetch(base+'/screenshots/share.png')).status,200);
      assert.equal((await fetch(base+'/apple-touch-icon.png')).status,200);
      assert.match(home.headers.get('content-security-policy'),/script-src 'self'/);
      assert.match(home.headers.get('strict-transport-security'),/max-age=31536000/);
      assert.equal(home.headers.get('x-content-type-options'),'nosniff');
      assert.equal(home.headers.get('x-frame-options'),'DENY');
      for(const path of ['/api-docs/','/api-docs/openapi.json','/swagger'])
        assert.equal((await fetch(base+path)).status,404);
      const protectedResponse=await fetch(base+'/api/projects');
      assert.equal(protectedResponse.status,401);
      assert.equal(protectedResponse.headers.get('set-cookie'),null);
      assert.equal((await fetch(base+'/api/projects',{method:'POST',headers:{Origin:'https://untrusted.example'}})).status,403);
      let cookie;
      require('./dist/security.js').setSessionCookie({setHeader:(_key,value)=>{cookie=value}},'a'.repeat(64),true);
      assert.match(cookie,/^__Host-devtrack=/);
      for(const flag of ['Secure','HttpOnly','SameSite=Lax','Path=/','Max-Age=2592000']) assert.ok(cookie.includes(flag));
    } finally {
      if(server.listening) await new Promise(r=>server.close(r));
      await databasePool.end();
    }
  })().catch(e=>{console.error(e);process.exitCode=1});`);
  assert.equal(result.status, 0, result.stderr);
});

test('production cannot run automatic migrations in the runtime process', () => {
  const result = spawnSync(process.execPath, ['dist/server.js'], {
    cwd: backend, env: { ...env, AUTO_MIGRATE: 'true' }, encoding: 'utf8', timeout: 15_000,
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /requires AUTO_MIGRATE=false/);
});
