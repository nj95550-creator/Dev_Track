/**
 * Separate-process checks for environment isolation and local cookie/origin
 * defaults. Conflicting credentials/settings are fixtures; tests must not load
 * the developer's private dotenv file or connect to a saved database.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const backend = fileURLToPath(new URL('../../backend', import.meta.url));
/**
 * Start a separate TypeScript-enabled process so environment/module caches
 * from one isolation scenario cannot influence the next.
 */
function run(code, env) {
  return spawnSync(process.execPath, ['--import', 'tsx', '-e', code], {
    cwd: backend,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    timeout: 30_000,
  });
}
test('test mode ignores external database credentials and does not load dotenv', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'devtrack-env-'));
  const file = join(directory, '.env');
  try {
    await writeFile(file, 'NODE_ENV=production\nDB_HOST=unsafe.invalid\nDOTENV_SENTINEL=loaded\n');
    const result = run(
      `(async()=>{
      const db=require('./src/database.ts');
      if(!db.embedded || process.env.DOTENV_SENTINEL) throw new Error('Unsafe database selection');
      await db.migrateDatabase();
      if((await db.databasePool.query('SELECT COUNT(*)::int AS count FROM users')).rows[0].count!==0)
        throw new Error('Database is not empty');
      await db.databasePool.end();
    })().catch(e=>{console.error(e.message);process.exitCode=1});`,
      {
        NODE_ENV: 'test',
        DEVTRACK_TEST_DATABASE: 'memory',
        DATABASE_URL: 'postgresql://test:test@127.0.0.1:9/do_not_connect',
        DB_HOST: 'unsafe.invalid',
        DATA_DIR: join(directory, 'never-create'),
        DOTENV_CONFIG_PATH: file,
      },
    );
    assert.equal(result.status, 0, result.stderr);
    const unsafe = run("require('./src/database.ts')", {
      NODE_ENV: 'test',
      DEVTRACK_TEST_DATABASE: '',
    });
    assert.notEqual(unsafe.status, 0);
    assert.match(unsafe.stderr, /external databases are refused/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test('local launch modes use separate session cookie names', () => {
  for (const namespace of ['node', 'docker']) {
    const result = run(
      `(async()=>{
      const security=require('./src/security.ts');
      if(security.cookieName!=='devtrack_${namespace}_session') throw new Error('Wrong cookie name');
      if(security.cookieToken({headers:{cookie:'devtrack_other_session='+'a'.repeat(64)}})!==null)
        throw new Error('Other app cookie was accepted');
      await require('./src/database.ts').databasePool.end();
    })().catch(e=>{console.error(e.message);process.exitCode=1});`,
      {
        NODE_ENV: 'test',
        DEVTRACK_TEST_DATABASE: 'memory',
        SESSION_NAMESPACE: namespace,
      },
    );
    assert.equal(result.status, 0, result.stderr);
  }
});

test('built local server defaults to its own port when APP_ORIGIN is unset', () => {
  const result = run(`(async()=>{
    const assert=require('node:assert/strict');
    assert.equal(require('./src/security.ts').appOrigin, 'http://localhost:3000');
    await require('./src/database.ts').databasePool.end();
  })().catch(e=>{console.error(e.message);process.exitCode=1});`, {
    NODE_ENV: 'test', DEVTRACK_TEST_DATABASE: 'memory', APP_ORIGIN: '', PORT: '',
  });
  assert.equal(result.status, 0, result.stderr);
});
