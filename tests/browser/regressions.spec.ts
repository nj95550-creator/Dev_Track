/**
 * Browser regressions for stale workspace loads, obsolete sessions, responsive
 * layouts and real Swagger execution. Request gates control completion order
 * while assertions continue to use the app's real account/CRUD behavior.
 */
import { test, expect, type Page } from './fixtures';
import type { BrowserContext } from '@playwright/test';

const password = 'A regression testing passphrase 2026!';
/**
 * Create a unique disposable account with real API authentication and return
 * its CSRF header for fixture setup before browser interactions begin.
 */
async function account(context: BrowserContext, name: string) {
  const username = `${name}_${Date.now()}`;
  const response = await context.request.post('/api/users', {
    data: { username, name: 'Regression Tester', email: `${username}@example.test`, password },
  });
  expect(response.status()).toBe(201);
  const data = await response.json();
  return { username, headers: { 'X-CSRF-Token': data.csrfToken } };
}
/**
 * Use visible desktop/mobile navigation so responsive focus/drawer behavior
 * remains part of each regression rather than an untested shortcut.
 */
async function navigate(page: Page, name: RegExp) {
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('link', { name }).click();
}
for (const collection of ['projects', 'learning-goals'] as const) {
  test(`a late ${collection} snapshot preserves both saved and existing records`, async ({
    page,
    context,
  }) => {
    const { headers } = await account(
      context,
      collection === 'projects' ? 'load_project' : 'load_goal',
    );
    expect(
      (
        await context.request.post(`/api/${collection}`, {
          headers,
          data: { title: 'Existing record' },
        })
      ).status(),
    ).toBe(201);
    let release!: () => void, observed!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const snapshot = new Promise<void>((r) => {
      observed = r;
    });
    let first = true;
    await page.route(`**/api/${collection}`, async (route) => {
      if (route.request().method() !== 'GET' || !first) return route.continue();
      first = false;
      const response = await route.fetch();
      observed();
      await gate;
      await route.fulfill({ response });
    });
    try {
      await page.goto('/');
      await snapshot;
      if (collection === 'learning-goals') await navigate(page, /^Learning goals/);
      await page
        .getByRole('button', {
          name: collection === 'projects' ? 'New project' : 'New learning goal',
          exact: true,
        })
        .click();
      await page
        .getByLabel(collection === 'projects' ? 'Project title' : 'Goal title', {
          exact: true,
        })
        .fill('Saved during loading');
      const saved = page.waitForResponse(
        (r) => r.url().endsWith(`/api/${collection}`) && r.request().method() === 'POST',
      );
      await page
        .getByRole('button', {
          name: collection === 'projects' ? 'Create project' : 'Create goal',
          exact: true,
        })
        .click();
      expect((await saved).status()).toBe(201);
      await expect(page.getByRole('dialog')).toHaveCount(0);
      release();
      await expect(
        page.getByRole('heading', { name: 'Saved during loading', exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Existing record', exact: true }),
      ).toBeVisible();
    } finally {
      release();
      await page.unrouteAll({ behavior: 'wait' });
    }
  });
}
test('sign-out cancels old work and an obsolete cookie cannot erase a new session', async ({
  page,
  context,
}) => {
  const { username, headers } = await account(context, 'late_session');
  const { goal } = await (
    await context.request.post('/api/learning-goals', {
      headers,
      data: { title: 'Delayed goal' },
    })
  ).json();
  const oldCookie = (await context.cookies()).find(
    (c) => c.name === 'devtrack_browser_session',
  )!;
  await page.goto('/#learning-goals');
  let observed!: () => void, release!: () => void;
  const intercepted = new Promise<void>((r) => {
    observed = r;
  });
  const gate = new Promise<void>((r) => {
    release = r;
  });
  await page.route(`**/api/learning-goals/${goal.id}`, async (route) => {
    observed();
    await gate;
    await route.abort().catch(() => {}); // Sign-out may already have cancelled it.
  });
  try {
    const cancelled = page.waitForEvent('requestfailed', (r) =>
      r.url().endsWith(`/api/learning-goals/${goal.id}`),
    );
    await page.getByRole('button', { name: 'Complete Delayed goal', exact: true }).click();
    await intercepted;
    const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
    if (await menu.isVisible()) await menu.click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Sign in to your workspace', exact: true }),
    ).toBeVisible();
    await cancelled;
    release();
    await page.locator('#auth-username').fill(username);
    await page.locator('#auth-password').fill(password);
    await page.getByRole('button', { name: 'Sign in to your workspace', exact: true }).click();
    await expect(page.locator('.app-shell')).toBeVisible();
    const stale = await context.request.patch(`/api/learning-goals/${goal.id}`, {
      headers: { ...headers, Cookie: `${oldCookie.name}=${oldCookie.value}` },
      data: { status: 'completed' },
    });
    expect(stale.status()).toBe(401);
    expect(stale.headers()['set-cookie']).toBeUndefined();
    expect((await context.request.get('/api/session')).status()).toBe(200);
    await expect(page.locator('.app-shell')).toBeVisible();
  } finally {
    release();
    await page.unrouteAll({ behavior: 'wait' });
  }
});
test('tablet cards, long mobile text and About navigation remain usable', async ({
  page,
  context,
}) => {
  const { headers } = await account(context, 'responsive');
  const title = 'Connected project ' + 'x'.repeat(120);
  const { project } = await (
    await context.request.post('/api/projects', { headers, data: { title } })
  ).json();
  const description = 'https://example.test/' + 'a'.repeat(400);
  await context.request.post('/api/learning-goals', {
    headers,
    data: { title: 'g'.repeat(150), description, projectId: project.id },
  });
  await page.goto('/');
  await expect(page.locator('.compact-panel article')).toHaveCount(1);
  for (const width of [1020, 900, 800, 781, 780, 700, 600, 390, 320]) {
    await page.setViewportSize({ width, height: 800 });
    await expect(page.locator('.compact-panel article')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await context.request.post('/api/projects', { headers, data: { title: 'Second project' } });
  await page.setViewportSize({ width: 900, height: 800 });
  await page.reload();
  await expect(page.locator('.compact-panel article')).toHaveCount(2);
  for (const card of await page.locator('.compact-panel article').all())
    await expect(card).toBeVisible();
  await navigate(page, /^My projects/);
  for (const width of [900, 800, 781, 700, 390, 320]) {
    await page.setViewportSize({ width, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await navigate(page, /^Learning goals/);
  await expect(page.getByText(description, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
  await navigate(page, /^Settings & preferences/);
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByRole('button', { name: 'About this workspace', exact: true }).click();
  await expect(page.locator('#sidebar')).not.toHaveClass(/\bopen\b/);
  await expect(page.locator('.app-workspace')).not.toHaveAttribute('inert');
  await expect(page.locator('#privacy-note')).toBeInViewport();
});
test('the real Swagger UI loads and executes protected create/delete after refresh', async ({
  page,
  context,
}) => {
  await account(context, 'swagger_browser');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/api-docs/');
  const create = page.locator('#operations-Projects-post_projects');
  await expect(create).toBeVisible();
  await expect(page.getByText('Failed to load API definition.')).toHaveCount(0);
  await create.locator('.opblock-summary').click();
  await create.getByRole('button', { name: 'Try it out', exact: true }).click();
  const created = page.waitForResponse(
    (r) => r.url().endsWith('/api/projects') && r.request().method() === 'POST',
  );
  await create.getByRole('button', { name: 'Execute', exact: true }).click();
  const response = await created;
  expect(response.status()).toBe(201);
  const { project } = await response.json();
  await page.reload();
  const remove = page.locator('#operations-Projects-delete_projects_id');
  await remove.locator('.opblock-summary').click();
  await remove.getByRole('button', { name: 'Try it out', exact: true }).click();
  await remove.locator('tr[data-param-name="id"] input').fill(String(project.id));
  const deleted = page.waitForResponse(
    (r) =>
      r.url().endsWith(`/api/projects/${project.id}`) && r.request().method() === 'DELETE',
  );
  await remove.getByRole('button', { name: 'Execute', exact: true }).click();
  expect((await deleted).status()).toBe(200);
  expect((await context.request.get(`/api/projects/${project.id}`)).status()).toBe(404);
  expect(errors).toEqual([]);
});
