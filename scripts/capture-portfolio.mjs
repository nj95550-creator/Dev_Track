/**
 * Reproduce portfolio screenshot assets from a built app and isolated demo data.
 * A temporary test server/browser captures both themes, projects and sharing
 * assets, then closes its resources without reading the user workspace database.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
const root = fileURLToPath(new URL('../', import.meta.url));
const probe = createServer();
await new Promise((r) => probe.listen(0, '127.0.0.1', r));
const port = probe.address().port;
await new Promise((r) => probe.close(r));
// The screenshot server selects memory isolation before importing backend code.
const child = spawn(process.execPath, ['scripts/ui-test-server.mjs'], { cwd: root, env: { ...process.env, UI_TEST_PORT: String(port) }, stdio: ['ignore', 'inherit', 'inherit'] });
let browser;
try {
  const baseURL = `http://localhost:${port}`;
  for (let attempt = 0; ; attempt++) {
    try { if ((await fetch(baseURL + '/api/health')).ok) break; } catch { /* starting */ }
    if (attempt >= 150 || child.exitCode !== null) throw new Error('Screenshot server did not start.');
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    args: process.env.PLAYWRIGHT_CHROMIUM_ARGS?.split(' ') || [],
  } : {});
  const page = await browser.newPage({ baseURL, viewport: { width: 1440, height: 1050 }, reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the demo', exact: true }).click();
  await page.locator('.app-shell').waitFor();
  await page.locator('.compact-panel article').first().waitFor();
  await page.evaluate(() => document.fonts.ready);
// Capture actual rendered app states; these PNGs are intended portfolio assets.
  const output = root + 'frontend/public/screenshots/';
  await mkdir(output, { recursive: true });
  await page.screenshot({ path: output + 'dashboard-light.png' });
  await page.getByRole('link', { name: /^My projects/ }).click();
  await page.locator('.project-card').first().waitFor();
  await page.screenshot({ path: output + 'projects.png' });
  await page.getByRole('link', { name: /^Settings & preferences/ }).click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  await page.screenshot({ path: output + 'dashboard-dark.png' });
// Compose the sharing preview from the real dashboard capture at card dimensions.
  const cover = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  const image = (await readFile(output + 'dashboard-light.png')).toString('base64');
  await cover.setContent(`<html><style>*{box-sizing:border-box}body{margin:0;background:#f8f9fa;color:#282a29;font-family:Arial,sans-serif;padding:38px 42px;overflow:hidden}header{display:flex;align-items:center;justify-content:space-between;margin-bottom:26px}h1{font-size:40px;letter-spacing:-1px;margin:0}h1 span{color:#a94823}p{margin:0;color:#626a6d;font-size:19px}img{width:1116px;border:1px solid #d9dcde;border-radius:12px;box-shadow:0 15px 35px #172b3a22}</style><header><h1>Dev<span>Track</span></h1><p>Projects. Progress. Learning goals.</p></header><img alt="" src="data:image/png;base64,${image}"></html>`);
  await cover.screenshot({ path: output + 'share.png' });
// Reuse the existing vector mark instead of introducing a separate logo source.
  const icon = await readFile(root + 'frontend/public/favicon.svg', 'utf8');
  await cover.setViewportSize({ width: 180, height: 180 });
  await cover.setContent(`<html><style>body{margin:0;background:#fff0e6;display:grid;place-items:center;height:180px}svg{width:140px;height:140px}</style>${icon}</html>`);
  await cover.screenshot({ path: root + 'frontend/public/apple-touch-icon.png' });
  console.log('Captured real sample-workspace screenshots, sharing cover, and touch icon.');
} finally {
  if (browser) await browser.close();
  child.kill('SIGTERM');
  await new Promise((r) => child.exitCode !== null ? r() : child.once('exit', r));
}
