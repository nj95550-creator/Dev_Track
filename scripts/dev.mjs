/**
 * Local development launcher for the Node API and Vite frontend. It chooses
 * compatible ports/origins, waits for database-backed API readiness, and shuts
 * down both child process trees together when either exits or the user stops it.
 */
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
const root = fileURLToPath(new URL('../', import.meta.url));
const source = spawnSync(process.execPath, ['scripts/source-preview.mjs'], { cwd: root, stdio: 'inherit' });
if (source.status !== 0) process.exit(source.status || 1);
const children = [];
let stopping = false;
/**
 * Reject invalid explicitly requested ports before spawning either server.
 */
function parsePort(value, name) {
  if (!/^\d+$/.test(String(value)) || Number(value) < 1 || Number(value) > 65535)
    throw new Error(`${name} must be a port between 1 and 65535.`);
  return Number(value);
}
/**
 * Probe loopback availability. Only the default API port may fall back to an
 * ephemeral port; an explicitly chosen website/API port fails when occupied.
 */
function unusedPort(preferred, fallback = false) {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', (error) => {
      if (error.code === 'EADDRINUSE' && fallback) unusedPort(0).then(resolve, reject);
      else reject(error);
    });
    probe.listen(preferred, '127.0.0.1', () => {
      const port = probe.address().port;
      probe.close(() => resolve(String(port)));
    });
  });
}
let frontendPort, apiPort;
try {
  frontendPort = String(parsePort(process.env.DEV_PORT || '4173', 'DEV_PORT'));
  await unusedPort(Number(frontendPort));
  const preferredApi = process.env.API_PORT
    ? parsePort(process.env.API_PORT, 'API_PORT')
    : frontendPort === '3000'
      ? 0
      : 3000;
  if (String(preferredApi) === frontendPort)
    throw new Error('The API and website need different ports.');
  apiPort = await unusedPort(preferredApi, !process.env.API_PORT);
} catch (error) {
  console.error(
    error.code === 'EADDRINUSE'
      ? 'DevTrack is already running on the requested port. Close its existing terminal and run this launcher again.'
      : error.message,
  );
  process.exit(1);
}
const frontendOrigin = `http://localhost:${frontendPort}`;
// The launcher owns the local address. Old .env or shell values must not make
// the browser and API disagree, or turn this local workflow into production.
const localEnvironment = {
  ...process.env,
  NODE_ENV: 'development',
  HOST: '127.0.0.1',
  APP_ORIGIN: frontendOrigin,
  API_PORT: apiPort,
  DEV_PORT: frontendPort,
  ENABLE_SWAGGER: 'true',
  SESSION_NAMESPACE: 'node',
};
/**
 * Spawn one npm child with the launcher-owned development origin/ports.
 * Any unexpected child exit shuts down the companion process as well.
 */
function launch(folder, args) {
  const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, {
    cwd: root + folder,
    stdio: 'inherit',
    env: { ...localEnvironment, PORT: folder === 'backend' ? apiPort : frontendPort },
    shell: process.platform === 'win32',
    detached: process.platform !== 'win32',
  });
  children.push(child);
  child.on('error', (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on('exit', (code) => {
    if (!stopping) stop(code || 0);
  });
  return child;
}
/**
 * Stop each child process tree once, using Windows taskkill or POSIX process
 * groups so a watcher or Vite process cannot remain orphaned after shutdown.
 */
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.pid) continue;
    if (process.platform === 'win32')
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        /* The child already exited. */
      }
    }
  }
  process.exit(code);
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop());
launch('backend', ['run', 'dev']);
// Let the first-run database finish before opening the frontend.
let ready = false;
for (let attempt = 0; attempt < 60; attempt++) {
  try {
    const result = await fetch(`http://127.0.0.1:${apiPort}/api/health`, {
      signal: AbortSignal.timeout(1000),
    });
    if (result.ok) {
      ready = true;
      break;
    }
  } catch {
    /* The API is still starting. */
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
}
if (!ready) {
  console.error('The API could not start. Review its database configuration above.');
  stop(1);
}
console.log(`DevTrack website: ${frontendOrigin}`);
console.log(`DevTrack Swagger: ${frontendOrigin}/api-docs/`);
launch('frontend', [
  'run',
  'dev',
  ...(process.argv.includes('--open') ? ['--', '--open', frontendOrigin] : []),
]);
