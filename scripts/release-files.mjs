/**
 * Single source allowlist for ZIP packaging and the public source browser.
 * The collector refuses symlinks and excludes private/generated directories
 * recursively so both outputs use the same controlled set of project files.
 */
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
export const releasePaths = [
  'package.json',
  'package-lock.json',
  'README.md',
  '.env.example',
  '.gitignore',
  '.dockerignore',
  '.github/workflows',
  'Dockerfile',
  'compose.yaml',
  'compose.production.yaml',
  'Start_DevTrack.cmd',
  'Start_DevTrack_Docker.cmd',
  'database/schema.sql',
  'docs',
  'scripts',
  'tests',
  'playwright.config.ts',
  'backend/package.json',
  'backend/package-lock.json',
  'backend/tsconfig.json',
  'backend/.env.example',
  'backend/src',
  'backend/test',
  'backend/public',
  'frontend/package.json',
  'frontend/package-lock.json',
  'frontend/tsconfig.json',
  'frontend/eslint.config.ts',
  'frontend/vite.config.ts',
  'frontend/index.html',
  'frontend/README.md',
  'frontend/src',
  'frontend/public',
];
/**
 * Apply exclusions to every path segment, including nested dependencies,
 * private dotenv files and generated source copies. Template env files remain allowed.
 */
export function excludedReleasePath(path) {
  return path
    .split(/[\\/]/)
    .some(
      (part) =>
        ['node_modules', '.git', 'data', 'dist', 'test-results', 'playwright-report', 'release', 'source'].includes(
          part,
        ) ||
        (part.startsWith('.env') && part !== '.env.example') ||
        /\.(log|zip)$/i.test(part),
    );
}
/**
 * Recursively collect only allowlisted roots in stable directory order.
 * Use lstat to reject symlinks rather than following them into private paths.
 */
export async function releaseEntries(projectRoot) {
  const entries = {};
  /**
   * Skip excluded paths before reading bytes; optional missing roots are safe,
   * while a symbolic link is an error rather than an implicit file inclusion.
   */
  async function collect(path) {
    if (excludedReleasePath(path)) return;
    const absolute = resolve(projectRoot, path);
    const { lstat } = await import('node:fs/promises');
    let info;
    try {
      info = await lstat(absolute);
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    if (info.isSymbolicLink()) throw new Error(`Refusing to package a symbolic link: ${path}`);
    if (info.isDirectory()) {
      for (const child of (await readdir(absolute)).sort()) await collect(`${path}/${child}`);
    } else if (info.isFile()) {
      entries[`DevTrack/${path.replaceAll('\\', '/')}`] = new Uint8Array(await readFile(absolute));
    }
  }
  for (const path of releasePaths) await collect(path);
  return entries;
}
