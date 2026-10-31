/**
 * Launch the real development workflow with conflicting old settings and a
 * port collision, then sign in through Vite's proxy. Disposable environment and
 * process-group cleanup keep this test separate from a running user installation.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
/**
 * Bind a temporary loopback listener and expose its actual port to the test.
 */
async function listen(server, port = 0) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return server.address().port;
}
/**
 * Release an owned test listener only if it is still active.
 */
async function close(server) {
  if (server.listening) await new Promise((resolve) => server.close(resolve));
}
test(
  'local launcher signs in through Vite despite stale origin settings and an occupied API port',
  { timeout: 60_000 },
  async () => {
    // Simulate another app/Docker owning 3000. The launcher must start its own API.
    const occupied = createServer((_request, response) => response.end('another app'));
    try {
      await listen(occupied, 3000);
    } catch (error) {
      if (error.code !== 'EADDRINUSE') throw error;
    }
    const portProbe = createServer();
    const frontendPort = await listen(portProbe);
    await close(portProbe);
    const origin = `http://localhost:${frontendPort}`;
    const base = `http://127.0.0.1:${frontendPort}`;
    const fixtureDirectory = await mkdtemp(join(tmpdir(), 'devtrack-startup-'));
    const envFile = join(fixtureDirectory, 'backend.env');
    await writeFile(envFile, 'APP_ORIGIN=https://old-file-address.invalid\nNODE_ENV=production\n');
    const env = {
      ...process.env,
      APP_ORIGIN: 'https://stale-address.invalid',
      NODE_ENV: 'production',
      DEV_PORT: String(frontendPort),
      DATA_DIR: 'memory://',
      DEVTRACK_TEST_DATABASE: 'memory',
      AUTO_MIGRATE: 'true',
      ENABLE_SWAGGER: 'false',
      DOTENV_CONFIG_PATH: envFile,
    };
    // The test database is disposable even if the developer has PostgreSQL configured.
    delete env.API_PORT;
    delete env.DATABASE_URL;
    delete env.DB_HOST;
    const child = spawn(process.execPath, ['scripts/dev.mjs'], {
      cwd: root,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    child.stderr.on('data', (chunk) => {
      output += chunk;
    });
    let cookie = '';
    let csrf = '';
    /**
     * Call the real frontend proxy with the fixture origin and carry the test
     * account cookie/security token across authentication and protected writes.
     */
    async function request(path, method = 'GET', body, requestOrigin = origin) {
      const headers = { Origin: requestOrigin, 'Sec-Fetch-Site': 'same-origin' };
      if (cookie) headers.Cookie = cookie;
      if (csrf) headers['X-CSRF-Token'] = csrf;
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      const result = await fetch(base + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(3000),
      });
      if (result.headers.get('set-cookie')) cookie = result.headers.get('set-cookie').split(';')[0];
      const data = await result.json();
      if (data.csrfToken) csrf = data.csrfToken;
      return { status: result.status, data };
    }
    try {
      let ready = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        if (child.exitCode !== null) assert.fail('Launcher exited before readiness:\n' + output);
        try {
          const result = await fetch(base + '/api/health', { signal: AbortSignal.timeout(500) });
          if (result.ok) {
            ready = true;
            break;
          }
        } catch {
          /* Startup is still in progress. */
        }
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      assert.ok(ready, output);
      assert.ok(output.includes(`DevTrack website: ${origin}`));
      const account = {
        username: 'startup_tester',
        name: 'Startup tester',
        email: 'startup@example.test',
        password: 'Startup test long passphrase 2026!',
      };
      assert.equal((await request('/api/users', 'POST', account)).status, 201);
      assert.equal((await request('/api/logout', 'POST')).status, 200);
      assert.equal(
        (
          await request('/api/login', 'POST', {
            username: account.username,
            password: 'Incorrect testing password',
          })
        ).status,
        401,
      );
      assert.equal(
        (
          await request('/api/login', 'POST', {
            username: account.username,
            password: account.password,
          })
        ).status,
        200,
      );
      assert.equal(
        (await request('/api/projects', 'POST', { title: 'Proxy login check' })).status,
        201,
      );
      assert.equal(
        (
          await request(
            '/api/projects',
            'POST',
            { title: 'Blocked origin' },
            'https://attacker.example',
          )
        ).status,
        403,
      );
      assert.equal((await fetch(base + '/api-docs/')).status, 200);
      assert.equal(
        (await fetch(base + '/swagger', { redirect: 'manual' })).headers.get('location'),
        '/api-docs/',
      );
      const spec = await (await fetch(base + '/api-docs/openapi.json')).json();
      assert.equal(spec.info.title, 'DevTrack API');
    } finally {
      if (process.platform === 'win32')
        spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      else child.kill('SIGTERM');
      if (child.exitCode === null) await new Promise((resolve) => child.once('exit', resolve));
      await close(occupied);
      await rm(fixtureDirectory, { recursive: true, force: true });
    }
  },
);
