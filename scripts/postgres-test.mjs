/**
 * External PostgreSQL verification runner requiring an explicit test connection.
 * It creates a randomly named database, runs upgrade/concurrency checks there,
 * and drops only that generated database after the child checks finish.
 */
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const backend = process.env.DEVTRACK_TEST_BACKEND_DIR || resolve(root, 'backend');
const connection = process.env.DEVTRACK_POSTGRES_TEST_URL;
if (!connection)
  throw new Error(
    'Set DEVTRACK_POSTGRES_TEST_URL to a disposable PostgreSQL service. This check creates its own temporary database.',
  );
const url = new URL(connection);
if (!['postgres:', 'postgresql:'].includes(url.protocol))
  throw new Error('Use a PostgreSQL connection URL.');
const require = createRequire(resolve(backend, 'package.json'));
const { Client } = require('pg');
const admin = new Client({ connectionString: connection, connectionTimeoutMillis: 10_000 });
const name = `devtrack_verify_${randomBytes(12).toString('hex')}`;
let created = false;
try {
  await admin.connect();
  // This generated identifier is never taken from user input. Never drop or
  // migrate the database supplied in the connection URL.
  await admin.query(`CREATE DATABASE "${name}"`);
  created = true;
  url.pathname = `/${name}`;
  const env = {
    ...process.env,
    NODE_ENV: 'development',
    DEVTRACK_TEST_DATABASE: '',
    DEVTRACK_POSTGRES_TEST_DATABASE: name,
    DATABASE_URL: url.href,
    DB_SSL: 'false',
    APP_ORIGIN: 'http://localhost:4173',
    HOST: '127.0.0.1',
    AUTO_MIGRATE: 'false',
    SERVE_FRONTEND: 'false',
    SESSION_NAMESPACE: 'postgres_check',
    TRUST_PROXY: 'false',
    SMTP_HOST: '',
    SMTP_FROM: '',
  };
// The upgrade child first verifies full grants/runtime login; the second child
  // tests locking and partial edits against the same disposable database.
  for (const script of ['postgres-upgrade.mjs', 'postgres-concurrency.mjs']) {
    const child = spawn(process.execPath, [resolve(root, 'backend/test', script)], {
      cwd: backend, env, stdio: 'inherit',
    });
    const code = await new Promise((accept, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => accept(code ?? (signal ? 1 : 0)));
    });
    if (code !== 0) { process.exitCode = code; break; }
  }
} finally {
  if (created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  await admin.end();
}
