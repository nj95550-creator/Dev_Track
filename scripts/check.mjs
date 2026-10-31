/**
 * Ordered build/check orchestrator used by the root npm commands. Generate the
 * source browser before bundling; full check mode also runs isolated startup/API
 * tests, frontend lint and compiled production-safety checks, failing immediately.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const mode = process.argv[2];
if (mode === 'check') {
  const startupCheck = spawnSync(
    process.execPath,
    [
      '--test',
      'scripts/test/local-startup.test.mjs',
      'scripts/test/release.test.mjs',
      'scripts/test/environment.test.mjs',
    ],
    {
      cwd: root,
      stdio: 'inherit',
    },
  );
  if (startupCheck.status !== 0) process.exit(startupCheck.status || 1);
}
const source = spawnSync(process.execPath, ['scripts/source-preview.mjs'], { cwd: root, stdio: 'inherit' });
if (source.status !== 0) process.exit(source.status || 1);
const commands =
  mode === 'check'
    ? [
        ['backend', 'test'],
        ['backend', 'build'],
        ['frontend', 'lint'],
        ['frontend', 'build'],
      ]
    : [
        ['backend', 'build'],
        ['frontend', 'build'],
      ];
for (const [folder, script] of commands) {
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', script], {
    cwd: root + folder,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) process.exit(result.status || 1);
}
if (mode === 'check') {
  const productionCheck = spawnSync(process.execPath, ['--test', 'scripts/test/production.test.mjs'], {
    cwd: root, stdio: 'inherit',
  });
  if (productionCheck.status !== 0) process.exit(productionCheck.status || 1);
}
