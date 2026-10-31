/**
 * End-to-end account, project and goal workflows with real browser interaction.
 * Check dialogs, keyboard focus, storage/cookies and both themes; accessibility
 * scans supplement visible behavior on desktop and mobile.
 */
import { test, expect, type Page } from './fixtures';
import AxeBuilder from '@axe-core/playwright';
const password = 'A browser testing passphrase 2026!';
/**
 * Use the real section links, opening mobile navigation when it is hidden.
 */
async function navigate(page: Page, name: RegExp) {
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('link', { name }).click();
}
/**
 * Run automated WCAG A/AA checks on the current page state and report the
 * affected targets. These scans supplement the explicit keyboard/focus assertions.
 */
async function accessibility(page: Page) {
  const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(
    scan.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) })),
  ).toEqual([]);
}
test('account, projects, goals, preferences, keyboard access, cookies and logout', async ({
  page,
  context,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await accessibility(page);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  const username = `demo_ui_${info.project.name}_${Date.now()}`;
  await page.getByLabel('Your name', { exact: true }).fill('Browser Tester');
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Email address', { exact: true }).fill(`${username}@example.test`);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create your workspace', exact: true }).click();
  await expect(page.locator('.app-shell')).toBeVisible();
  await expect(page.locator('.workspace-switch strong')).toHaveText('Personal workspace');
  const cookie = (await context.cookies()).find((c) => c.name === 'devtrack_browser_session');
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe('Lax');
  expect(await page.evaluate(() => document.cookie)).not.toContain('devtrack_browser_session');
  await accessibility(page);
  await navigate(page, /^My projects/);
  const create = page.getByRole('button', { name: 'New project', exact: true });
  await create.click();
  await expect(page.getByLabel('Project title', { exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(create).toBeFocused();
  await create.click();
  await page.getByLabel('Project title', { exact: true }).fill('Browser project');
  await page.getByLabel('Description', { exact: true }).fill('Created through the interface');
  await page.getByLabel('Start date', { exact: true }).fill('2026-10-01');
  await page.getByLabel('Target date', { exact: true }).fill('2026-12-01');
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Browser project', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit project', exact: true }).click();
  await page.getByLabel('Project title', { exact: true }).fill('Updated browser project');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Updated browser project', exact: true }),
  ).toBeVisible();
  await navigate(page, /^Learning goals/);
  await page.getByRole('button', { name: 'New learning goal', exact: true }).click();
  await page.getByLabel('Goal title', { exact: true }).fill('Browser learning goal');
  await page
    .getByLabel('Connected project', { exact: true })
    .selectOption({ label: 'Updated browser project' });
  await page.getByRole('button', { name: 'Create goal', exact: true }).click();
  await page.getByRole('button', { name: 'Edit Browser learning goal', exact: true }).click();
  await page.getByLabel('Goal title', { exact: true }).fill('Updated learning goal');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.getByRole('button', { name: 'Complete Updated learning goal', exact: true }).click();
  await page.getByRole('button', { name: /^Completed/ }).click();
  await expect(
    page.getByRole('button', { name: 'Reopen Updated learning goal', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Reopen Updated learning goal', exact: true }).click();
  await page.getByRole('button', { name: /^Active/ }).click();
  await accessibility(page);
  await navigate(page, /^My projects/);
  await page.getByRole('button', { name: 'Delete Updated browser project', exact: true }).click();
  await page.getByRole('button', { name: 'Delete permanently', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Updated browser project', exact: true }),
  ).toHaveCount(0);
  await navigate(page, /^Learning goals/);
  await expect(page.getByText('Independent goal', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Delete Updated learning goal', exact: true }).click();
  await page.getByRole('button', { name: 'Delete permanently', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Updated learning goal', exact: true }),
  ).toHaveCount(0);
  await navigate(page, /^Settings & preferences/);
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await accessibility(page);
  await page.reload();
  await expect(page.locator('.app-shell')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await navigate(page, /^My projects/);
  if (await page.getByRole('button', { name: 'Open navigation', exact: true }).isVisible())
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByRole('button', { name: 'About this workspace', exact: true }).click();
  await expect(page.locator('#privacy-note')).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const storage = await page.evaluate(() => ({
    local: Object.keys(localStorage).sort(),
    session: Object.keys(sessionStorage),
  }));
  expect(storage.local).toEqual(['devtrack-theme', 'devtrack-view']);
  expect(storage.session).toEqual([]);
  if (await page.getByRole('button', { name: 'Open navigation', exact: true }).isVisible())
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Sign in to your workspace', exact: true }),
  ).toBeVisible();
  expect(
    (await context.cookies()).find((c) => c.name === 'devtrack_browser_session'),
  ).toBeUndefined();
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill('An incorrect testing passphrase');
  await page.getByRole('button', { name: 'Sign in to your workspace', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in to your workspace', exact: true }).click();
  await expect(page.locator('.app-shell')).toBeVisible();
  expect(errors).toEqual([]);
});
test('mobile menu returns keyboard focus and short sidebars remain scrollable', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the demo', exact: true }).click();
  await expect(page.locator('.app-shell')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 480 });
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  await menu.click();
  await expect(page.getByRole('link', { name: 'Overview', exact: true })).toBeFocused();
  expect(
    await page.locator('#sidebar').evaluate((node) => node.scrollHeight > node.clientHeight),
  ).toBe(true);
  await page.getByRole('button', { name: 'Sign out', exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeInViewport();
  await page.keyboard.press('Escape');
  await expect(menu).toBeFocused();
});
test('populated dashboards and project lists are accessible in both themes', async ({
  page,
}, info) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the demo' }).click();
  await expect(page.locator('.app-shell')).toBeVisible();
  await accessibility(page);
  await page.screenshot({ path: info.outputPath('dashboard-light.png'), fullPage: true });
  await navigate(page, /^My projects/);
  await accessibility(page);
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  await accessibility(page);
  await page.keyboard.press('Escape');
  await navigate(page, /^Settings & preferences/);
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await navigate(page, /^Overview/);
  await accessibility(page);
  await page.screenshot({ path: info.outputPath('dashboard-dark.png'), fullPage: true });
  await navigate(page, /^My projects/);
  await accessibility(page);
});
