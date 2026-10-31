/**
 * Runtime-container permission check used only by disposable Docker verification.
 * Inspect the app login through its real database connection and confirm schema,
 * role and destructive DDL operations are rejected without modifying saved records.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
if (process.env.DEVTRACK_DOCKER_SMOKE !== 'true') throw new Error('Disposable Docker verification only.');
const require = createRequire('/app/backend/package.json');
const { databasePool: db } = require('./dist/database.js');
const { assertRestrictedRuntime } = require('./dist/databasePrivileges.js');
try {
  await assertRestrictedRuntime(db.query);
  assert.notEqual((await db.query('SELECT current_user AS name')).rows[0].name, 'devtrack');
  for (const sql of ['CREATE TABLE public.forbidden(id int)', 'TRUNCATE users CASCADE', 'ALTER TABLE users ADD COLUMN forbidden int', 'CREATE ROLE forbidden'])
    await assert.rejects(db.query(sql), (error) => error.code === '42501');
  console.log('Container app uses a restricted data-only database login; DDL denied.');
} finally { await db.end(); }
