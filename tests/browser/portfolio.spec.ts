/**
 * Public landing/demo/source/metadata and render-error recovery browser checks.
 * Screenshots used for QA stay in the test report; malformed session data is
 * intercepted only in the browser and never changes the saved account fixture.
 */
import { test, expect } from './fixtures';
import AxeBuilder from '@axe-core/playwright';

test('landing screenshots, source, metadata and isolated demo work at visitor sizes', async ({ page, context, baseURL }, info) => {
  const response = await page.goto('/');
  const html = await response!.text();
  expect(html).not.toContain('__DEVTRACK_ORIGIN__');
  expect(html).toContain(`content="${baseURL}/screenshots/share.png"`);
  await expect(page.getByRole('heading', { name: 'Less scattered. More shipped.' })).toBeVisible();
  for (const width of [1440, 1020, 800, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 1440 || width === 390)
      expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  }
  for (const image of await page.locator('.landing-page img').all()) {
    await image.scrollIntoViewIfNeeded();
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate((node) => (node as HTMLImageElement).naturalWidth)).toBe(1440);
  }
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  await page.setViewportSize(info.project.name === 'mobile' ? { width: 390, height: 700 } : { width: 1440, height: 900 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath('landing.png'), fullPage: true });
  await page.getByRole('link', { name: 'View source', exact: false }).first().click();
  await expect(page.getByRole('heading', { name: 'Explore the source.' })).toBeVisible();
  await expect(page.getByText('frontend/src/App.tsx', { exact: true })).toBeVisible();
  const raw = await context.request.get('/source/files/frontend/src/App.tsx.txt');
  expect(raw.status()).toBe(200);
  expect(await raw.text()).toContain('export default function App()');
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the demo', exact: true }).click();
  await expect(page.locator('.app-shell')).toBeVisible();
  await expect(page.locator('.workspace-switch strong')).toHaveText('Demo workspace');
  await expect(page.locator('.compact-panel article').first()).toBeVisible();
  const current = await (await context.request.get('/api/session')).json();
  expect(current.user.isDemo).toBe(true);
  expect((await context.request.post('/api/projects', { headers: { 'X-CSRF-Token': current.csrfToken }, data: { title: 'Visitor can edit the demo' } })).status()).toBe(201);
});

test('error boundary offers reload recovery without losing saved workspace data', async ({ page, context }, info) => {
  const username = `boundary_${info.project.name}_${Date.now()}`;
  const response = await context.request.post('/api/users', { data: { username, name: 'Boundary Tester', email: `${username}@example.test`, password: 'An error boundary testing passphrase!' } });
  expect(response.status()).toBe(201);
  const session = await response.json();
  expect((await context.request.post('/api/projects', { headers: { 'X-CSRF-Token': session.csrfToken }, data: { title: 'Preserved through recovery' } })).status()).toBe(201);
  await page.route('**/api/session', async (route) => {
    // Deliberately corrupt a render input; the real saved account is unchanged.
    await route.fulfill({ json: { ...session, user: { ...session.user, name: null } } });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'This page couldn’t be displayed.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open the home page' })).toHaveAttribute('href', '/');
  await page.unrouteAll({ behavior: 'wait' });
  await page.getByRole('button', { name: 'Reload workspace', exact: true }).click();
  await expect(page.locator('.app-shell')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Preserved through recovery', exact: true })).toBeVisible();
});
