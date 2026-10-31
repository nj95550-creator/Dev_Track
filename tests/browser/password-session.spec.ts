/**
 * Browser password/session race regressions using a real streaming HTTP proxy.
 * The proxy forwards actual response cookies and withholds only the body,
 * allowing navigation, logout and account replacement to race with completion.
 */
import http from 'node:http';
import { test, expect, type Page } from './fixtures';

const password = 'An account race testing passphrase 2026!';
const nextPassword = 'A replacement account password 2026!';
/**
 * Navigate through the actual sidebar, opening the mobile drawer when required.
 */
async function navigate(page: Page, name: RegExp) {
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('link', { name }).click();
}
/**
 * Proxy real HTTP responses and flush password headers/cookies immediately
 * while holding the body behind a test gate. Rewriting origin is limited to
 * this loopback test proxy so the upstream app keeps its real origin checks.
 */
async function delayedPassword(baseURL: string) {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  const target = new URL(baseURL);
  const proxy = http.createServer((incoming, outgoing) => {
    const upstream = http.request({
      hostname: '127.0.0.1', port: target.port, path: incoming.url, method: incoming.method,
      headers: { ...incoming.headers, host: target.host, ...(incoming.headers.origin ? { origin: target.origin } : {}) },
    }, (response) => {
      outgoing.writeHead(response.statusCode!, response.headers);
      if (incoming.url === '/api/password') {
        outgoing.flushHeaders();
        const chunks: Buffer[] = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => { void gate.then(() => { if (!outgoing.destroyed) outgoing.end(Buffer.concat(chunks)); }); });
      } else response.pipe(outgoing);
    });
    upstream.on('error', () => { if (!outgoing.headersSent) outgoing.writeHead(502); outgoing.end(); });
    incoming.pipe(upstream);
  });
  await new Promise<void>((r) => proxy.listen(0, '127.0.0.1', r));
  return { origin: `http://localhost:${(proxy.address() as {port: number}).port}`, release,
    close: async () => { release(); proxy.closeAllConnections(); await new Promise<void>((r) => proxy.close(() => r())); } };
}
/**
 * Submit the Settings password form and wait for actual successful response
 * headers while the proxy continues to withhold token-delivery body bytes.
 */
async function startChange(page: Page) {
  await page.getByLabel('Current password', { exact: true }).fill(password);
  await page.getByLabel('New password', { exact: true }).fill(nextPassword);
  await page.getByLabel('Confirm new password', { exact: true }).fill(nextPassword);
  const response = page.waitForResponse((r) => r.url().endsWith('/api/password'));
  await page.getByRole('button', { name: 'Update password', exact: true }).click();
  expect((await response).status()).toBe(200);
}
/**
 * Create through the visible editor so the test covers queued UI writes,
 * not a direct API call that could bypass the client synchronization barrier.
 */
async function saveProject(page: Page, title: string) {
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  await page.getByLabel('Project title', { exact: true }).fill(title);
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
}
for (const scenario of ['navigation', 'logout', 'account replacement'] as const) {
  test(`delayed password synchronization is safe across ${scenario}`, async ({ page, context, baseURL }, info) => {
    const username = `race_${info.project.name}_${Date.now()}`;
    expect((await context.request.post('/api/users', { data: { username, name: 'Race Tester', email: `${username}@example.test`, password } })).status()).toBe(201);
    const proxy = await delayedPassword(baseURL!);
    try {
      await page.goto(proxy.origin + '/#settings');
      await startChange(page);
      if (scenario === 'navigation') {
        await navigate(page, /^Overview/);
        let writes = 0;
        page.on('request', (r) => { if (r.url().endsWith('/api/projects') && r.method() === 'POST') writes++; });
        await saveProject(page, 'Saved after navigating away');
        await expect(page.locator('dialog button[type="submit"]')).toBeDisabled();
        expect(writes).toBe(0);
        const saved = page.waitForResponse((r) => r.url().endsWith('/api/projects') && r.request().method() === 'POST');
        proxy.release();
        expect((await saved).status()).toBe(201);
        await expect(page.getByRole('heading', { name: 'Saved after navigating away', exact: true })).toBeVisible();
        expect((await context.request.post('/api/login', { data: { username, password } })).status()).toBe(401);
      } else if (scenario === 'logout') {
        const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
        if (await menu.isVisible()) await menu.click();
        await page.getByRole('button', { name: 'Sign out', exact: true }).click();
        proxy.release();
        await expect(page.getByRole('button', { name: 'Sign in to your workspace', exact: true })).toBeVisible();
        expect((await context.cookies()).find((c) => c.name === 'devtrack_browser_session')).toBeUndefined();
        await page.locator('#auth-username').fill(username);
        await page.locator('#auth-password').fill(nextPassword);
        await page.getByRole('button', { name: 'Sign in to your workspace', exact: true }).click();
        await expect(page.locator('.app-shell')).toBeVisible();
        const saved = page.waitForResponse((r) => r.url().endsWith('/api/projects') && r.request().method() === 'POST');
        await saveProject(page, 'Saved after sign-out and sign-in');
        expect((await saved).status()).toBe(201);
      } else {
        // Exercise the same account-generation invalidation used by logout,
        // while the old response body is still withheld and a new login begins.
        await page.evaluate(() => window.dispatchEvent(new Event('devtrack:expired')));
        await expect(page.getByRole('button', { name: 'Sign in to your workspace', exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Create account', exact: true }).click();
        await page.getByLabel('Your name', { exact: true }).fill('Replacement Tester');
        await page.getByLabel('Username', { exact: true }).fill(username + '_b');
        await page.getByLabel('Email address', { exact: true }).fill(username + '_b@example.test');
        await page.getByLabel('Password', { exact: true }).fill(password);
        await page.getByLabel('Confirm password', { exact: true }).fill(password);
        await page.getByRole('button', { name: 'Create your workspace', exact: true }).click();
        await expect(page.locator('.app-shell')).toBeVisible();
        const before = (await context.cookies()).find((c) => c.name === 'devtrack_browser_session')!.value;
        proxy.release();
        const saved = page.waitForResponse((r) => r.url().endsWith('/api/projects') && r.request().method() === 'POST');
        await saveProject(page, 'New account owns this project');
        expect((await saved).status()).toBe(201);
        expect((await context.request.get('/api/session')).ok()).toBe(true);
        expect((await context.cookies()).find((c) => c.name === 'devtrack_browser_session')!.value).toBe(before);
        await expect(page.locator('.toast')).not.toContainText('Password updated');
      }
    } finally { await proxy.close(); }
  });
}
