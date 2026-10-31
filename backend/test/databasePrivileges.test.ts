/**
 * Embedded checks for repeatable schema/role upgrades and saved-record retention.
 * PGlite executes table/schema permissions but cannot update database-level ACLs;
 * those three grants are explicitly left to the external PostgreSQL/Docker suite.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { provisionRuntimeRole, assertRestrictedRuntime } from '../src/databasePrivileges';
import type { DatabaseQuery } from '../src/database';

const password = "A disposable database testing credential 2026! ' \\";
for (const existing of [false, true]) {
  test(`embedded schema/role upgrade preserves ${existing ? 'an existing populated' : 'a fresh'} database and is repeatable`, async () => {
    const db = new PGlite('memory://');
    const schema = await readFile(path.resolve(__dirname, '../../database/schema.sql'), 'utf8');
    const query: DatabaseQuery = async (sql, params = []) => {
      if (sql === schema) { await db.exec(sql); return { rows: [], rowCount: 0 }; }
      // PGlite cannot update pg_database ACLs (XX000 tuple concurrently deleted).
      // Exercise real role/table/schema permissions here; the external PostgreSQL
      // suite executes these three database-level grants and real login checks.
      if (/^(REVOKE|GRANT).* ON DATABASE /.test(sql)) return { rows: [], rowCount: 0 };
      const result = await db.query(sql, params);
      return { rows: result.rows as never[], rowCount: result.affectedRows ?? result.rows.length };
    };
    try {
      if (existing) {
        await db.exec(schema);
        await query("INSERT INTO users(username,name,email,password_hash) VALUES ('existing_user','Saved User','saved@example.test','unchanged-password-hash')");
        await query("INSERT INTO projects(user_id,title,progress) VALUES (1,'Saved project',42)");
        await query("INSERT INTO learning_goals(user_id,project_id,title) VALUES (1,1,'Saved goal')");
        await query("INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at) VALUES ('saved-token',1,'saved-csrf',CURRENT_TIMESTAMP + INTERVAL '7 days')");
      }
      const snapshot = existing ? (await query('SELECT row_to_json(u) AS user FROM users u')).rows : [];
      await provisionRuntimeRole(query, 'devtrack_app', password, schema);
      await provisionRuntimeRole(query, 'devtrack_app', password, schema);
      await assert.rejects(() => assertRestrictedRuntime(query), /restricted runtime/);
      await query('SET ROLE devtrack_app');
      await assertRestrictedRuntime(query);
      if (existing) {
        assert.deepEqual((await query('SELECT row_to_json(u) AS user FROM users u')).rows, snapshot);
        assert.equal((await query('SELECT title,progress FROM projects')).rows[0].progress, 42);
        assert.equal((await query('SELECT project_id FROM learning_goals')).rows[0].project_id, 1);
        assert.equal((await query('SELECT csrf_token FROM sessions')).rows[0].csrf_token, 'saved-csrf');
      }
      const { rows: [user] } = await query("INSERT INTO users(username,name,email,password_hash) VALUES ('new_user','Runtime User','runtime@example.test','test-hash') RETURNING id");
      const { rows: [project] } = await query("INSERT INTO projects(user_id,title) VALUES ($1,'Runtime project') RETURNING id", [user.id]);
      await query('UPDATE projects SET progress=75 WHERE id=$1', [project.id]);
      assert.equal((await query('SELECT progress FROM projects WHERE id=$1', [project.id])).rows[0].progress, 75);
      await query('DELETE FROM projects WHERE id=$1', [project.id]);
      for (const ddl of ['CREATE TABLE public.forbidden(id int)', 'TRUNCATE users CASCADE', 'ALTER TABLE users ADD COLUMN forbidden int', 'CREATE ROLE forbidden'])
        await assert.rejects(() => query(ddl), (error: unknown) => (error as {code: string}).code === '42501');
      await query('RESET ROLE');
      await assert.rejects(() => provisionRuntimeRole(query, 'postgres', password, schema), /differ|already owns/);
    } finally { await db.close(); }
  });
}
