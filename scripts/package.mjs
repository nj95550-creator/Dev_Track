/**
 * Create a distributable source ZIP using the shared allowlist. Required
 * entry points are checked before writing the archive; installed dependencies,
 * private settings, databases and generated output are excluded by release-files.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';

const root = fileURLToPath(new URL('../', import.meta.url));
export { excludedReleasePath, releaseEntries } from './release-files.mjs';
import { releaseEntries } from './release-files.mjs';
/**
 * Collect sanitized source, require the runnable entry points and write one
 * ZIP with a DevTrack top-level folder. The build step runs in the npm script;
 * compiled output is deliberately excluded from the distributable archive.
 */
async function main() {
  const entries = await releaseEntries(root);
  for (const required of [
    'package-lock.json',
    'backend/src/server.ts',
    'frontend/src/main.tsx',
    'scripts/source-preview.mjs',
  ])
    if (!entries[`DevTrack/${required}`])
      throw new Error(`Missing ${required}; check the source checkout.`);
  const output = resolve(root, 'release/DevTrack-fixed.zip');
  await mkdir(resolve(root, 'release'), { recursive: true });
  await writeFile(output, zipSync(entries, { level: 9 }));
  console.log(`Created ${relative(root, output)} (${Object.keys(entries).length} files).`);
}
if (resolve(process.argv[1] || '') === fileURLToPath(import.meta.url))
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
