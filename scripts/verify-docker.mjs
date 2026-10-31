/**
 * End-to-end Docker verification in a uniquely named disposable Compose project.
 * Exercise fresh setup, real PostgreSQL tests, retained legacy-volume upgrades
 * and production settings; cleanup targets only this command's test resources.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const project = `devtrack-verify-${randomBytes(8).toString('hex')}`;
/**
 * Execute one verification command in the project directory and reject any
 * nonzero exit so a later phase cannot report success after an earlier failure.
 */
function run(command, args, env) {
  return new Promise((accept, reject) => {
    const child = spawn(command, args, { cwd: root, env, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0 ? accept() : reject(new Error(`${command} exited with code ${code}.`)),
    );
  });
}
/**
 * Reserve/probe an available loopback app port for this isolated Compose run.
 */
async function freePort() {
  const probe = createServer();
  await new Promise((accept, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', accept);
  });
  const port = probe.address().port;
  await new Promise((r) => probe.close(r));
  return String(port);
}
let directory,
  started = false;
try {
  // Probe the engine before creating test files or containers. No installation
  // or privilege escalation is attempted by this verification command.
  await run('docker', ['info'], process.env);
  await run('docker', ['compose', 'version'], process.env);
  directory = await mkdtemp(join(tmpdir(), 'devtrack-docker-'));
  const env = {
    ...process.env,
    APP_PORT: await freePort(),
    APP_ORIGIN: 'https://portfolio.example',
    ENABLE_SWAGGER: 'false',
    TRUST_PROXY: 'false',
    DB_PASSWORD: randomBytes(32).toString('hex'),
    APP_DB_PASSWORD: randomBytes(32).toString('hex'),
    DEVTRACK_DOCKER_SMOKE: 'true',
    SMOKE_STATE: join(directory, 'state.json'),
    SMTP_HOST: '',
    SMTP_FROM: '',
    SMTP_USER: '',
    SMTP_PASSWORD: '',
  };
  const compose = (args, production = false, legacy = false) =>
    run(
      'docker',
      [
        'compose',
        '--project-name',
        project,
        '-f',
        legacy ? 'tests/fixtures/compose.legacy.yaml' : 'compose.yaml',
        ...(production ? ['-f', 'compose.production.yaml'] : []),
        ...args,
      ],
      env,
    );
  try {
    const checkRole = () => compose(['run', '--rm', '--no-deps', '-T', '--volume', `${root}:/checks:ro`, '--env', 'DEVTRACK_DOCKER_SMOKE', 'app', 'node', '/checks/scripts/docker-role-check.mjs']);
    await compose(['config', '--quiet']);
    await compose(['config', '--quiet'], true);
    started = true;
    await compose(['up', '-d', '--build', '--wait', '--wait-timeout', '180']);
    await checkRole();
    await run(process.execPath, ['scripts/docker-smoke.mjs', 'prepare'], env);
    // Tests run inside the built runtime image against their own newly-created
    // database. Mount check sources read-only; no saved user data is used.
    const testUrl = new URL('postgresql://database:5432/postgres');
    testUrl.username = 'devtrack';
    testUrl.password = env.DB_PASSWORD;
    env.DEVTRACK_POSTGRES_TEST_URL = testUrl.href;
    await compose([
      'run',
      '--rm',
      '--no-deps',
      '-T',
      '--volume',
      `${root}:/checks:ro`,
      '--env',
      'DEVTRACK_POSTGRES_TEST_URL',
      '--env',
      'DEVTRACK_TEST_BACKEND_DIR=/app/backend',
      'app',
      'node',
      '/checks/scripts/postgres-test.mjs',
    ]);
    await compose(['down']);
    await compose(['up', '-d', '--wait', '--wait-timeout', '180']);
    await run(process.execPath, ['scripts/docker-smoke.mjs', 'verify'], env);
    await compose(['down', '--volumes', '--remove-orphans']);
    // Recreate the old release's superuser-login installation and populate it
    // before introducing the new setup service. Preserve this named volume.
    await compose(['up', '-d', '--build', '--wait', '--wait-timeout', '180'], false, true);
    await run(process.execPath, ['scripts/docker-smoke.mjs', 'prepare'], env);
    await compose(['down'], false, true);
    await compose(['up', '-d', '--build', '--wait', '--wait-timeout', '180']);
    await checkRole();
    await run(process.execPath, ['scripts/docker-smoke.mjs', 'verify'], env);
    await compose(['run', '--rm', '-T', 'database-setup']);
    await checkRole();
    await compose(['down']);
    await compose(['up', '-d', '--wait', 'database'], true);
    await compose(['run', '--rm', '--no-deps', '-T', 'database-setup'], true);
    await compose(['up', '-d', '--wait', '--wait-timeout', '180'], true);
    await run(process.execPath, ['scripts/docker-smoke.mjs', 'production'], env);
    console.log(
      'Docker verification passed. Only the disposable verification project will be removed.',
    );
  } catch (error) {
    if (started) await compose(['logs', '--tail', '60']).catch(() => {});
    throw error;
  } finally {
    if (started) await compose(['down', '--volumes', '--remove-orphans']);
  }
} catch (error) {
  console.error(
    error.code === 'ENOENT'
      ? 'Docker is unavailable. Install/start Docker Desktop, then rerun npm run verify:docker.'
      : error.message,
  );
  process.exitCode = 1;
} finally {
  if (directory) await rm(directory, { recursive: true, force: true });
}
