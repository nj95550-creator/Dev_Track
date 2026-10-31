/**
 * Disposable browser-test server using an in-memory database and seeded
 * recovery fixtures. Test isolation is selected before backend imports; no user
 * environment file, on-disk database or real SMTP service is used.
 */
import { createRequire } from 'node:module';
import { recoveryFixture, recoveryFixturePassword } from '../tests/fixtures/recovery.mjs';
// Isolate before importing app code: never load dotenv, an external database,
// or on-disk data. Seed recovery cases here without adding public test endpoints.
Object.assign(process.env, {
  NODE_ENV: 'test',
  DEVTRACK_TEST_DATABASE: 'memory',
  HOST: '127.0.0.1',
  PORT: process.env.UI_TEST_PORT || '4189',
  APP_ORIGIN: `http://localhost:${process.env.UI_TEST_PORT || '4189'}`,
  AUTO_MIGRATE: 'false',
  SERVE_FRONTEND: 'true',
  ENABLE_SWAGGER: 'true',
  SESSION_NAMESPACE: 'browser',
  TRUST_PROXY: 'true',
  SMTP_HOST: '',
  SMTP_FROM: '',
});
const require = createRequire(new URL('../backend/package.json', import.meta.url));
const { databasePool: db, migrateDatabase } = require('./dist/database.js');
try {
  await migrateDatabase();
  const { hashPassword } = require('./dist/password.js');
  const { digest } = require('./dist/security.js');
  const passwordHash = await hashPassword(recoveryFixturePassword);
  for (const project of ['desktop', 'mobile']) {
    const fixture = recoveryFixture(project);
    for (const [username, token] of [
      [fixture.username, fixture.token],
      [fixture.anonymousUsername, fixture.anonymousToken],
    ]) {
      const {
        rows: [user],
      } = await db.query(
        'INSERT INTO users(username,name,email,password_hash) VALUES($1,$2,$3,$4) RETURNING id',
        [username, 'Recovery Tester', `${username}@example.test`, passwordHash],
      );
      await db.query(
        "INSERT INTO password_resets(token_hash,user_id,expires_at) VALUES($1,$2,CURRENT_TIMESTAMP + INTERVAL '20 minutes')",
        [digest(token), user.id],
      );
      if (username === fixture.username) {
        await db.query(
          "INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at) VALUES($1,$2,$3,CURRENT_TIMESTAMP + INTERVAL '7 days')",
          [digest(fixture.sessionToken), user.id, fixture.csrfToken],
        );
      } else {
        await db.query(
          "INSERT INTO password_resets(token_hash,user_id,expires_at) VALUES($1,$2,CURRENT_TIMESTAMP - INTERVAL '1 minute')",
          [digest(fixture.expiredToken), user.id],
        );
      }
    }
  }
  const { server } = require('./dist/server.js');
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(Number(process.env.PORT), process.env.HOST, resolve);
  });
  console.log('Disposable browser-test server ready.');
} catch (error) {
  console.error(error);
  await db.end();
  process.exitCode = 1;
}
