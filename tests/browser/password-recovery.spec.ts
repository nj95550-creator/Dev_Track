/**
 * Browser recovery/password-policy regressions on desktop and mobile. Cover
 * existing-session reset links, cancellation, expired/single-use links and
 * Unicode password boundaries using seeded disposable recovery fixtures.
 */
import { test, expect, type Page } from './fixtures';
import { recoveryFixture, recoveryFixturePassword } from '../fixtures/recovery.mjs';

/**
 * Type actual characters into a password control and assert none were
 * truncated, including emoji whose UTF-16 length differs from character count.
 */
async function typePassword(page: Page, label: string, value: string) {
  const input = page.getByLabel(label, { exact: true });
  await input.fill('');
  await input.pressSequentially(value);
  await expect(input).toHaveValue(value);
}
/**
 * Open the drawer when needed, then use the same visible navigation link
 * on desktop and mobile instead of bypassing the interface.
 */
async function navigate(page: Page, name: RegExp) {
  const menu = page.getByRole('button', {
    name: 'Open navigation',
    exact: true,
  });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('link', { name }).click();
}
test('reset links work with an existing session, cancellation, expired tokens and anonymous users', async ({
  page,
  context,
  browser,
  baseURL,
}, info) => {
  const fixture = recoveryFixture(info.project.name);
  await context.addCookies([
    {
      name: 'devtrack_browser_session',
      value: fixture.sessionToken,
      url: baseURL!,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  // Mobile also covers a recovery link for a different account than the cookie owner.
  const otherAccount = info.project.name === 'mobile';
  const resetUsername = otherAccount ? fixture.anonymousUsername : fixture.username;
  const resetToken = otherAccount ? fixture.anonymousToken : fixture.token;
  const anonymousUsername = otherAccount ? fixture.username : fixture.anonymousUsername;
  const anonymousToken = otherAccount ? fixture.token : fixture.anonymousToken;
  const resetURL = `/?reset=${resetToken}`;
  await page.goto(resetURL);
  await expect(page.getByRole('button', { name: 'Reset password', exact: true })).toBeVisible();
  await expect(page.locator('.app-shell')).toHaveCount(0);
  // Cancellation retains the existing session and workspace.
  await page.getByRole('button', { name: /Back to sign in/ }).click();
  await expect(page.locator('.app-shell')).toBeVisible();
  expect((await context.request.get('/api/session')).status()).toBe(200);
  expect(new URL(page.url()).search).toBe('');
  // Invalid links must not sign out the existing account.
  await page.goto('/?reset=' + 'a'.repeat(64));
  await typePassword(page, 'New password', recoveryFixturePassword);
  await typePassword(page, 'Confirm password', recoveryFixturePassword);
  await page.getByRole('button', { name: 'Reset password', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('expired or has already been used');
  expect((await context.request.get('/api/session')).status()).toBe(200);
  // A real reset clears the restored account and requires the new password.
  await page.goto(resetURL);
  const password = '🔒'.repeat(80);
  await typePassword(page, 'New password', password);
  await typePassword(page, 'Confirm password', password);
  await page.getByRole('button', { name: 'Reset password', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Your password has been reset');
  await expect(
    page.getByRole('button', {
      name: 'Sign in to your workspace',
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator('.app-shell')).toHaveCount(0);
  expect(new URL(page.url()).search).toBe('');
  expect(
    (await context.cookies()).find((cookie) => cookie.name === 'devtrack_browser_session'),
  ).toBeUndefined();
  expect(
    (
      await context.request.post('/api/login', {
        data: { username: resetUsername, password: recoveryFixturePassword },
      })
    ).status(),
  ).toBe(401);
  await page.getByLabel('Username', { exact: true }).fill(resetUsername);
  await typePassword(page, 'Password', password);
  await page.getByRole('button', { name: 'Sign in to your workspace', exact: true }).click();
  await expect(page.locator('.app-shell')).toBeVisible();
  const anonymous = await browser.newContext({ baseURL });
  try {
    const otherPage = await anonymous.newPage();
    await otherPage.goto('/?reset=' + fixture.expiredToken);
    await typePassword(otherPage, 'New password', recoveryFixturePassword);
    await typePassword(otherPage, 'Confirm password', recoveryFixturePassword);
    await otherPage.getByRole('button', { name: 'Reset password', exact: true }).click();
    await expect(otherPage.getByRole('alert')).toContainText(
      'expired or has already been used',
    );
    await otherPage.goto('/?reset=' + anonymousToken);
    const decomposed = 'e\u0301'.repeat(15);
    await typePassword(otherPage, 'New password', decomposed);
    await typePassword(otherPage, 'Confirm password', decomposed.normalize('NFC'));
    await otherPage.getByRole('button', { name: 'Reset password', exact: true }).click();
    await expect(otherPage.getByRole('status')).toContainText('Your password has been reset');
    await otherPage.getByLabel('Username', { exact: true }).fill(anonymousUsername);
    await typePassword(otherPage, 'Password', decomposed.normalize('NFC'));
    await otherPage
      .getByRole('button', { name: 'Sign in to your workspace', exact: true })
      .click();
    await expect(otherPage.locator('.app-shell')).toBeVisible();
  } finally {
    await anonymous.close();
  }
});
test('signup and Settings use normalized character limits without truncating emoji passwords', async ({
  page,
}, info) => {
  let signups = 0,
    changes = 0;
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (request.method() === 'POST' && path === '/api/users') signups++;
    if (request.method() === 'POST' && path === '/api/password') changes++;
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  const username = `unicode_${info.project.name}_${Date.now()}`;
  await page.getByLabel('Your name', { exact: true }).fill('Unicode Tester');
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Email address', { exact: true }).fill(`${username}@example.test`);
  await typePassword(page, 'Password', '🔒'.repeat(14));
  await typePassword(page, 'Confirm password', '🔒'.repeat(14));
  await page.getByRole('button', { name: 'Create your workspace', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('15–128 characters');
  expect(signups).toBe(0);
  const initialPassword = '🔒'.repeat(15);
  await typePassword(page, 'Password', initialPassword);
  await typePassword(page, 'Confirm password', initialPassword);
  await page.getByRole('button', { name: 'Create your workspace', exact: true }).click();
  await expect(page.locator('.app-shell')).toBeVisible();
  expect(signups).toBe(1);
  await navigate(page, /^Settings & preferences/);
  await typePassword(page, 'Current password', initialPassword);
  await typePassword(page, 'New password', '🔒'.repeat(129));
  await typePassword(page, 'Confirm new password', '🔒'.repeat(129));
  await page.getByRole('button', { name: 'Update password', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('15–128 characters');
  expect(changes).toBe(0);
  const newPassword = '🔒'.repeat(128);
  await typePassword(page, 'New password', newPassword);
  await typePassword(page, 'Confirm new password', newPassword);
  await page.getByRole('button', { name: 'Update password', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Password updated');
  expect(changes).toBe(1);
  const menu = page.getByRole('button', {
    name: 'Open navigation',
    exact: true,
  });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign in to your workspace', exact: true })).toBeVisible();
  await page.locator('.auth-form').getByLabel('Username', { exact: true }).fill(username);
  await typePassword(page, 'Password', newPassword);
  await page.getByRole('button', { name: 'Sign in to your workspace', exact: true }).click();
  await expect(page.locator('.app-shell')).toBeVisible();
});
