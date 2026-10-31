/**
 * Owner-only release command for fresh and populated PostgreSQL databases.
 * Serialize setup jobs, apply schema and restricted-role grants atomically, and
 * close connections without exposing credentials in provisioning error output.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { databasePool, embedded, transaction } from './database';
import { provisionRuntimeRole } from './databasePrivileges';

/**
 * Require external owner credentials, serialize release jobs and apply schema
 * plus restricted-role permissions through the same transaction connection.
 */
async function provision() {
  if (embedded) throw new Error('Role provisioning requires external PostgreSQL owner credentials.');
  const schema = await readFile(path.resolve(__dirname, '../../database/schema.sql'), 'utf8');
  await transaction(async (query) => {
    // Serialize repeat release jobs before schema changes or role creation.
    await query('SELECT pg_advisory_xact_lock(14723815)');
    await provisionRuntimeRole(query, process.env.APP_DB_USER || 'devtrack_app', process.env.APP_DB_PASSWORD || '', schema);
  });
  console.log('Schema updated; restricted runtime role ready. Existing data retained.');
}
void provision().catch(() => {
  // Connection errors can contain credentials; leave database details private.
  console.error('Database provisioning failed. Check owner access, a separate APP_DB_USER and APP_DB_PASSWORD (24+ characters). No user data is removed.');
  process.exitCode = 1;
}).finally(() => databasePool.end());
