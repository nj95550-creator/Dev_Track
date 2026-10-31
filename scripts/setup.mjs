/**
 * Install exact lockfile dependencies for root tooling, backend and frontend.
 * Using npm ci keeps local development and automated checks on the same resolved
 * package versions; any failed install stops setup before reporting readiness.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
for (const folder of ['', 'backend', 'frontend']) {
  const result = spawnSync(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['ci', '--no-audit', '--no-fund'],
    { cwd: root + folder, stdio: 'inherit', shell: process.platform === 'win32' },
  );
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log('\nReady. Run npm run dev, then open http://localhost:4173.');
