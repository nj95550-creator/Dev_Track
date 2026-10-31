/**
 * Shared database adapter for external PostgreSQL and the local PGlite engine.
 * Application repositories use the same query/transaction interface in both modes;
 * production requires an external database with restricted runtime permissions.
 */
import { isolatedTestDatabase } from './environment';
import { assertRestrictedRuntime } from './databasePrivileges';
import { Pool, types, type QueryResult, type QueryResultRow } from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

// Calendar dates are not instants: preserve YYYY-MM-DD across every timezone.
types.setTypeParser(1082, (value) => value);
const useEmbedded = isolatedTestDatabase || (!process.env.DATABASE_URL && !process.env.DB_HOST);
if (useEmbedded && process.env.NODE_ENV === 'production')
  throw new Error('Production requires DATABASE_URL or PostgreSQL DB_HOST settings.');
const dataDirectory = isolatedTestDatabase
  ? 'memory://'
  : process.env.DATA_DIR || './data/devtrack';
if (useEmbedded && !dataDirectory.startsWith('memory://'))
  mkdirSync(path.dirname(path.resolve(dataDirectory)), { recursive: true });
export const embedded = useEmbedded ? new PGlite(dataDirectory) : null;
// Use one bounded external connection pool per process. TLS verification is
// opt-in through deployment configuration and never disables certificate checking.
const pool = useEmbedded
  ? null
  : new Pool(
      process.env.DATABASE_URL
        ? {
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
            max: 10,
            connectionTimeoutMillis: 10_000,
          }
        : {
            host: process.env.DB_HOST,
            port: Number(process.env.DB_PORT || 5432),
            database: process.env.DB_NAME,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
            max: 10,
            connectionTimeoutMillis: 10_000,
          },
    );
// Normalize both driver result shapes so repositories can share parameterized
// queries without depending on an embedded/external engine distinction.
export const databasePool = {
  /**
   * Execute a parameterized query and normalize row-count metadata for callers.
   */
  async query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params: unknown[] = [],
  ): Promise<QueryResult<T>> {
    if (pool) return pool.query<T>(sql, params);
    const result = await embedded!.query<T>(sql, params);
    return {
      rows: result.rows,
      rowCount: result.affectedRows ?? result.rows.length,
      command: '',
      oid: 0,
      fields: [],
    };
  },
  /**
   * Close the external pool or embedded engine during command/test shutdown.
   */
  async end() {
    if (pool) await pool.end();
    else await embedded!.close();
  },
};
/**
 * Check connectivity and, in production, refuse an administrative/owner login.
 * Health checks repeat the guard so a privilege change cannot go unnoticed.
 */
export async function verifyDatabaseConnection() {
  await databasePool.query('SELECT 1');
  if (process.env.NODE_ENV === 'production') await assertRestrictedRuntime(databasePool.query);
}
/**
 * Apply the repeatable schema to the configured database. This is used by
 * local startup/tests and explicit owner release jobs, not the production app.
 */
export async function migrateDatabase() {
  const schema = await readFile(path.resolve(__dirname, '../../database/schema.sql'), 'utf8');
  if (pool) await pool.query(schema);
  else await embedded!.exec(schema);
}
export type DatabaseQuery = <T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params?: unknown[],
) => Promise<{ rows: T[]; rowCount: number | null }>;
/**
 * Run related queries on one connection and commit them together. Any thrown
 * error rolls back all changes; callers must use the supplied query function
 * for every operation that belongs to this transaction.
 */
export async function transaction<T>(work: (query: DatabaseQuery) => Promise<T>): Promise<T> {
  if (embedded)
    return embedded.transaction((tx) => {
      /**
       * Adapt the embedded transaction result to the shared transaction query contract.
       */
      async function query<R extends QueryResultRow = QueryResultRow>(
        sql: string,
        params: unknown[] = [],
      ) {
        const result = await tx.query<R>(sql, params);
        return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
      }
      return work(query);
    });
  const client = await pool!.connect();
  try {
    await client.query('BEGIN');
    const result = await work((sql, params = []) => client.query(sql, params));
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
