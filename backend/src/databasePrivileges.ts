/**
 * Owner-only schema and runtime-role provisioning, plus the production permission
 * guard. This module accepts a query function so the owner job can apply all changes
 * in one transaction without giving schema-management access to the running app.
 */
import type { DatabaseQuery } from './database';

// DDL cannot bind role/database identifiers as query parameters. Escape
// identifiers and password literals separately before constructing owner-only DDL.
const identifier = (value: string) => '"' + value.replaceAll('"', '""') + '"';
const literal = (value: string) => "E'" + value.replaceAll('\\', '\\\\').replaceAll("'", "''") + "'";
const tables = ['users', 'projects', 'learning_goals', 'sessions', 'password_resets', 'rate_limits'];

/**
 * Apply schema and grant a separate runtime login only data-access privileges.
 * The caller must provide an owner connection inside a transaction. Existing
 * role ownership/membership conflicts stop setup instead of taking over objects.
 */
export async function provisionRuntimeRole(
  query: DatabaseQuery,
  username: string,
  password: string,
  schema: string,
) {
  if (!/^[a-z][a-z0-9_]{2,62}$/.test(username))
    throw new Error('APP_DB_USER must be a lowercase PostgreSQL role name (3–63 characters).');
  if (password.length < 24 || password.includes('\0'))
    throw new Error('APP_DB_PASSWORD must contain at least 24 characters and no null bytes.');
  const { rows: [owner] } = await query<{ name: string; database: string }>(
    'SELECT current_user AS name, current_database() AS database',
  );
  if (owner.name === username) throw new Error('The runtime role must differ from the migration owner.');
  // Refuse to reuse an owner/member role rather than destructively reassigning
  // existing objects or accidentally inheriting broader permissions.
  const { rows: [conflict] } = await query<{ unsafe: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM pg_database WHERE datdba=(SELECT oid FROM pg_roles WHERE rolname=$1))
      OR EXISTS(SELECT 1 FROM pg_class WHERE relowner=(SELECT oid FROM pg_roles WHERE rolname=$1) AND relnamespace='public'::regnamespace)
      OR EXISTS(SELECT 1 FROM pg_namespace WHERE nspowner=(SELECT oid FROM pg_roles WHERE rolname=$1))
      OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=$1)) AS unsafe`,
    [username],
  );
  if (conflict.unsafe)
    throw new Error('APP_DB_USER already owns database objects or inherits another role. Choose a separate runtime role.');
  await query(schema);
  const role = identifier(username);
  const { rows } = await query('SELECT 1 FROM pg_roles WHERE rolname=$1', [username]);
  if (!rows.length) await query(`CREATE ROLE ${role}`);
  await query(`ALTER ROLE ${role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT PASSWORD ${literal(password)}`);
  // Older PostgreSQL installations may grant schema creation to PUBLIC.
  const database = identifier(owner.database);
  await query(`REVOKE CREATE, TEMPORARY ON DATABASE ${database} FROM PUBLIC`);
  await query(`REVOKE ALL ON DATABASE ${database} FROM ${role}`);
  await query(`GRANT CONNECT ON DATABASE ${database} TO ${role}`);
  await query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
  await query(`REVOKE ALL ON SCHEMA public FROM ${role}`);
  await query(`GRANT USAGE ON SCHEMA public TO ${role}`);
  await query(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${role}`);
  await query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${tables.map(identifier).join(', ')} TO ${role}`);
  await query(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ${role}`);
  await query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role}`);
  // Future objects created by this migration owner need the same runtime grants;
  // existing objects receive explicit grants above.
  await query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${identifier(owner.name)} IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${role}`);
  await query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${identifier(owner.name)} IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${role}`);
}

/**
 * Reject elevated role flags, object ownership, schema/database creation and
 * role memberships before production serves requests. This checks effective
 * access, including privileges inherited from PUBLIC.
 */
export async function assertRestrictedRuntime(query: DatabaseQuery) {
  const { rows: [role] } = await query<{ unsafe: boolean }>(
    `SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls
      OR has_schema_privilege(current_user, 'public', 'CREATE')
      OR has_database_privilege(current_user, current_database(), 'CREATE')
      OR EXISTS(SELECT 1 FROM pg_class WHERE relowner=pg_roles.oid AND relnamespace='public'::regnamespace)
      OR EXISTS(SELECT 1 FROM pg_namespace WHERE nspowner=pg_roles.oid)
      OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member=pg_roles.oid) AS unsafe
      FROM pg_roles WHERE rolname=current_user`,
  );
  if (!role || role.unsafe)
    throw new Error('Production requires a restricted runtime database role. Run the owner-only database provisioning step first.');
}
