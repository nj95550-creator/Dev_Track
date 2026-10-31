/**
 * HTTP smoke checks for explicitly disposable Docker verification environments.
 * Prepare saves temporary credentials/record IDs for a later restart/upgrade
 * check; production mode verifies cookie/header/origin policy on the private port.
 */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
if (process.env.DEVTRACK_DOCKER_SMOKE !== 'true' || !process.env.SMOKE_STATE)
  throw new Error('This smoke check requires an explicitly disposable Docker test environment.');
const base = `http://localhost:${process.env.APP_PORT || 4300}`;
const mode = process.argv[2];
const production = mode === 'production';
const origin = production ? process.env.APP_ORIGIN : base;
if (production && !origin?.startsWith('https://')) throw new Error('Production checks require an HTTPS APP_ORIGIN.');
let cookie = '',
  csrf = '';
/**
 * Make one expected-success API call and update the fixture cookie/token.
 * Unexpected HTTP errors fail with the route/status before later assertions run.
 */
async function request(path, method = 'GET', body) {
  const response = await fetch(base + path, {
    method,
    headers: {
      Origin: origin,
      Cookie: cookie,
      'X-CSRF-Token': csrf,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const data = await response.json();
  assert.ok(response.ok, `${method} ${path}: ${response.status} ${data.error || ''}`);
  if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
  if (data.csrfToken) csrf = data.csrfToken;
  return data;
}
assert.equal((await request('/api/health')).status, 'ok');
const homepage = await fetch(base);
assert.equal(homepage.status, 200);
assert.match(homepage.headers.get('content-security-policy') || '', /script-src 'self'/);
assert.equal(homepage.headers.get('x-content-type-options'), 'nosniff');
for (const path of ['/api-docs/', '/api-docs/swagger-init.js', '/api-docs/swagger-ui-bundle.js'])
  assert.equal((await fetch(base + path)).status, production ? 404 : 200);
if (!production) {
  const spec = await request('/api-docs/openapi.json');
  assert.equal(spec.components.securitySchemes.sessionCookie.name, 'devtrack_docker_session');
}
if (mode === 'production') {
  assert.match(homepage.headers.get('strict-transport-security') || '', /max-age=31536000/);
  const username = `secure_${randomBytes(6).toString('hex')}`;
  const signup = await fetch(base + '/api/users', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, name: 'Production fixture', email: `${username}@example.test`, password: randomBytes(24).toString('hex') }),
  });
  assert.equal(signup.status, 201);
  const session = signup.headers.get('set-cookie') || '';
  assert.match(session, /^__Host-devtrack=/);
  for (const flag of ['Secure', 'HttpOnly', 'SameSite=Lax', 'Path=/']) assert.ok(session.includes(flag));
  cookie = session.split(';')[0];
  csrf = (await signup.json()).csrfToken;
  const { project } = await request('/api/projects', 'POST', { title: 'Production fixture project' });
  assert.equal((await request(`/api/projects/${project.id}`)).project.title, 'Production fixture project');
  const blocked = await fetch(base + '/api/projects', {
    method: 'POST', headers: { Origin: 'https://untrusted.example', Cookie: cookie, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Must be rejected' }),
  });
  assert.equal(blocked.status, 403);
  await request(`/api/projects/${project.id}`, 'DELETE');
  await request('/api/logout', 'POST');
  assert.equal((await fetch(base + '/api/projects')).status, 401);
  console.log('Production container migration, API, Secure cookies, headers, origin checks and hidden Swagger passed. Public TLS routing is a separate host check.');
} else if (mode === 'prepare') {
  const username = `smoke_${randomBytes(6).toString('hex')}`;
  const password = randomBytes(24).toString('hex');
  await request('/api/users', 'POST', {
    username,
    name: 'CI smoke test',
    email: `${username}@example.test`,
    password,
  });
  assert.match(cookie, /^devtrack_docker_session=/);
  const { project } = await request('/api/projects', 'POST', { title: 'Docker persisted project' });
  const { goal } = await request('/api/learning-goals', 'POST', {
    title: 'Docker goal',
    projectId: project.id,
  });
  for (const [collection, id] of [
    ['projects', project.id],
    ['learning-goals', goal.id],
  ]) {
    await Promise.all([
      request(`/api/${collection}/${id}`, 'PATCH', { title: 'Concurrent Docker edit' }),
      request(`/api/${collection}/${id}`, 'PATCH', { description: 'Preserved second edit' }),
    ]);
    const saved = await request(`/api/${collection}/${id}`);
    const item = saved.project || saved.goal;
    assert.equal(item.title, 'Concurrent Docker edit');
    assert.equal(item.description, 'Preserved second edit');
  }
  await request('/api/logout', 'POST');
  await writeFile(
    process.env.SMOKE_STATE,
    JSON.stringify({ username, password, projectId: project.id, goalId: goal.id }),
    { mode: 0o600 },
  );
  console.log('Container account, CRUD, concurrent edits and Swagger checks passed.');
} else if (mode === 'verify') {
  const state = JSON.parse(await readFile(process.env.SMOKE_STATE, 'utf8'));
  await request('/api/login', 'POST', { username: state.username, password: state.password });
  const { project } = await request(`/api/projects/${state.projectId}`);
  assert.equal(project.description, 'Preserved second edit');
  await request(`/api/projects/${state.projectId}`, 'DELETE');
  assert.equal((await request(`/api/learning-goals/${state.goalId}`)).goal.projectId, null);
  await request(`/api/learning-goals/${state.goalId}`, 'DELETE');
  await request('/api/logout', 'POST');
  console.log('Database volume survived container replacement; deletion and logout passed.');
} else throw new Error('Use prepare, verify or production.');
