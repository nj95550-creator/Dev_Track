/**
 * Deterministic credentials/tokens for the isolated browser recovery server.
 * These fixtures are seeded only in disposable test databases and are not
 * production accounts, public recovery endpoints or a shared demo password.
 */
// Only the isolated browser-test server imports these disposable accounts.
export const recoveryFixturePassword = 'Browser recovery fixture passphrase 2026!';
/**
 * Return distinct desktop/mobile token sets so browser projects can consume
 * single-use reset links without invalidating the other project's fixtures.
 */
export function recoveryFixture(project) {
  const value = project === 'desktop' ? 1 : 2;
  return {
    username: `recovery_${project}`,
    anonymousUsername: `recovery_anon_${project}`,
    token: String(value).repeat(64),
    anonymousToken: String(value + 2).repeat(64),
    expiredToken: String(value + 4).repeat(64),
    sessionToken: String(value + 6).repeat(64),
    csrfToken: (value === 1 ? '9' : 'a').repeat(64),
  };
}
