/**
 * Installation-owner recovery through an interactive terminal. The command
 * updates one personal account and revokes its credentials without removing
 * projects or goals; hidden prompts keep the new password out of command history.
 */
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { databasePool, migrateDatabase, transaction } from './database';
import { hashPassword, isValidPassword } from './password';

// An owner-only terminal command, never an HTTP endpoint. Passwords are not
// accepted in command arguments, environment variables, or log messages.
/**
 * Lock one exact personal account, replace its password hash and revoke its
 * sessions/reset links in one transaction. Username matching is case-insensitive;
 * demo accounts cannot be converted through this recovery command.
 */
export async function resetOwnedAccountPassword(username: string, password: string) {
  if (!username.trim()) throw new Error('An exact username is required.');
  if (!isValidPassword(password)) throw new Error('Use a password of 15–128 characters.');
  const passwordHash = await hashPassword(password);
  return transaction(async (query) => {
    const user = (
      await query(
        'SELECT id,username,is_demo FROM users WHERE LOWER(username)=LOWER($1) FOR UPDATE',
        [username.trim()],
      )
    ).rows[0];
    if (!user) throw new Error('That username was not found in this database.');
    if (user.is_demo) throw new Error('Demo accounts are temporary. Create a personal account.');
    await query('UPDATE users SET password_hash=$2 WHERE id=$1', [user.id, passwordHash]);
    await query('DELETE FROM sessions WHERE user_id=$1', [user.id]);
    await query('DELETE FROM password_resets WHERE user_id=$1', [user.id]);
    return user.username as string;
  });
}

/**
 * Read one terminal password with echo suppressed and restore terminal output
 * after completion or Ctrl+C. The value is returned only in process memory.
 */
async function hiddenPassword(prompt: string) {
  process.stdout.write(prompt);
  const silent = new Writable({
    /**
     * Discard readline echo output while still acknowledging each stream write.
     */
    write(_chunk, _encoding, done) {
      done();
    },
  });
  const input = createInterface({ input: process.stdin, output: silent, terminal: true });
  const abort = new AbortController();
  input.once('SIGINT', () => abort.abort());
  try {
    return await input.question('', { signal: abort.signal });
  } finally {
    input.close();
    process.stdout.write('\n');
  }
}

/**
 * Validate terminal usage, prompt for confirmation and run owner recovery.
 * Always close the configured database, including on validation or input errors.
 */
async function main() {
  try {
    const username = process.argv[2];
    if (!username || process.argv.length !== 3)
      throw new Error('Usage: npm run account:reset -- your_username');
    if (!process.stdin.isTTY || !process.stdout.isTTY)
      throw new Error('Run this command in an interactive terminal. Password input is hidden.');
    if (process.env.AUTO_MIGRATE !== 'false') await migrateDatabase();
    console.log('Reset a personal account in the database configured for this command.');
    const password = await hiddenPassword('New password (15–128 characters): ');
    const confirmation = await hiddenPassword('Confirm new password: ');
    if (password !== confirmation) throw new Error('The passwords do not match. Nothing changed.');
    const recovered = await resetOwnedAccountPassword(username, password);
    console.log(
      `Password reset for ${recovered}. All previous sessions and reset links were revoked.`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Account recovery failed.');
    process.exitCode = 1;
  } finally {
    await databasePool.end();
  }
}
if (require.main === module) void main();
