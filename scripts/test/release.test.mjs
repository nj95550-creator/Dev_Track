/**
 * Packaging privacy and symlink-refusal regression tests using a temporary tree.
 * Only allowlisted fixtures should reach the archive collector; private settings,
 * data, dependencies and generated reports must stay out.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { releaseEntries } from '../package.mjs';

test('release excludes private configuration, databases, dependencies and browser reports', async () => {
  const root = await mkdtemp(join(tmpdir(), 'devtrack-release-'));
  const files = [
    'package.json',
    '.env',
    '.env.production',
    '.env.example',
    'backend/.env',
    'backend/.env.example',
    'backend/data/devtrack/secret',
    'backend/src/server.ts',
    'backend/node_modules/pg/index.js',
    'frontend/dist/index.html',
    'frontend/node_modules/react/index.js',
    'docs/nested/.env',
    'frontend/public/source/index.html',
    'backend/dist/server.js',
    'tests/test-results/private.png',
    'scripts/start.mjs',
    '.git/config',
  ];
  try {
    for (const path of files) {
      await mkdir(join(root, path, '..'), { recursive: true });
      await writeFile(join(root, path), 'fixture');
    }
    const entries = await releaseEntries(root);
    assert.deepEqual(
      Object.keys(entries).sort(),
      [
        'DevTrack/package.json',
        'DevTrack/.env.example',
        'DevTrack/backend/.env.example',
        'DevTrack/backend/src/server.ts',
        'DevTrack/scripts/start.mjs',
      ].sort(),
    );
    if (process.platform !== 'win32') {
      await symlink(join(root, '.env'), join(root, 'backend/src/secret.ts'));
      await assert.rejects(() => releaseEntries(root), /symbolic link/);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
