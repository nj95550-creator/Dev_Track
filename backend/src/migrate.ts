/**
 * Schema-only command-line entry point for the configured database. Apply the
 * repeatable schema, report success, and close the database connection on exit.
 * Production runtime accounts use the separate owner provisioning job for DDL.
 */
import { migrateDatabase, databasePool } from './database';
void migrateDatabase()
  .then(() => console.log('Database migrations applied.'))
  .finally(() => databasePool.end());
