/**
 * Client-session regression tests with a minimal browser event/timer fixture.
 * Controlled fetch completions model buffered replies, aborts and password
 * rotation so account changes cannot leak old tokens or queued writes.
 */
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  ApiError,
  changeAccountPassword,
  cancelSessionRequests,
  requestJson,
  setCsrfToken,
} from '../../frontend/src/lib/api';

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
let browser: EventTarget & { setTimeout: typeof setTimeout };
let expirations = 0;
beforeEach(() => {
  browser = Object.assign(new EventTarget(), { setTimeout });
  Object.assign(globalThis, { window: browser });
  expirations = 0;
  browser.addEventListener('devtrack:expired', () => expirations++);
  setCsrfToken('a'.repeat(64));
});
afterEach(() => {
  cancelSessionRequests();
  setCsrfToken('');
  globalThis.fetch = originalFetch;
  Object.assign(globalThis, { window: originalWindow });
});
test('a buffered 401 from an older session does not expire its replacement', async () => {
  let release!: (response: Response) => void;
  // Model an already-buffered response: aborting a network stream cannot undo
  // this completion, so the session generation must still be checked.
  globalThis.fetch = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const pending = requestJson('/api/projects');
  setCsrfToken('b'.repeat(64));
  release(new Response(JSON.stringify({ error: 'Old session expired' }), { status: 401 }));
  await assert.rejects(pending, (e: unknown) => e instanceof ApiError && e.status === 401);
  assert.equal(expirations, 0);
});
test('sign-out cancels pending protected requests without expiring a new account', async () => {
  globalThis.fetch = (_url, options) =>
    new Promise((_resolve, reject) => {
      options?.signal?.addEventListener(
        'abort',
        () => reject(new DOMException('Cancelled', 'AbortError')),
        { once: true },
      );
    });
  const pending = requestJson('/api/learning-goals');
  cancelSessionRequests();
  setCsrfToken('c'.repeat(64));
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(expirations, 0);
});
test('a current protected 401 still expires the current account', async () => {
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: 'Session expired' }), { status: 401 });
  await assert.rejects(
    requestJson('/api/projects'),
    (e: unknown) => e instanceof ApiError && e.status === 401,
  );
  assert.equal(expirations, 1);
});

test('password completion survives navigation and queued writes use the new token', async () => {
  let release!: (value: Response) => void;
  let sentToken = '';
  globalThis.fetch = async (url, options) => {
    if (url === '/api/password') return new Promise<Response>((resolve) => { release = resolve; });
    sentToken = new Headers(options?.headers).get('X-CSRF-Token') || '';
    return new Response('{}');
  };
  const password = changeAccountPassword('old password', 'new password');
  const saving = requestJson('/api/projects', { method: 'POST', body: '{}' });
  assert.equal(sentToken, '', 'writes must wait for the rotation');
  release(new Response(JSON.stringify({ csrfToken: 'new-token' })));
  assert.equal(await password, true);
  await saving;
  assert.equal(sentToken, 'new-token');
});
test('an uncancellable old password body cannot change a replacement account token', async () => {
  let release!: (value: Response) => void;
  globalThis.fetch = () => new Promise<Response>((resolve) => { release = resolve; });
  const old = changeAccountPassword('old password', 'new password');
  cancelSessionRequests();
  setCsrfToken('replacement-account-token');
  // Deliberately ignore abort, modeling a body already buffered by the browser.
  release(new Response(JSON.stringify({ csrfToken: 'old-account-rotated-token' })));
  assert.equal(await old, false);
  globalThis.fetch = async (_url, options) => {
    assert.equal(new Headers(options?.headers).get('X-CSRF-Token'), 'replacement-account-token');
    return new Response('{}');
  };
  await requestJson('/api/projects', { method: 'POST', body: '{}' });
});
test('a lost password response body resynchronizes the committed session before saving', async () => {
  globalThis.fetch = async (url, options) => {
    if (url === '/api/password') throw new Error('Lost response body');
    if (url === '/api/session') return new Response(JSON.stringify({ csrfToken: 'recovered-token' }));
    assert.equal(new Headers(options?.headers).get('X-CSRF-Token'), 'recovered-token');
    return new Response('{}');
  };
  await assert.rejects(changeAccountPassword('old password', 'new password'), /reach DevTrack/);
  await requestJson('/api/projects', { method: 'POST', body: '{}' });
});

test('a write queued by an exited account never executes with replacement credentials', async () => {
  let release!: (value: Response) => void;
  let writes = 0;
  globalThis.fetch = async (url) => {
    if (url === '/api/password') return new Promise<Response>((resolve) => { release = resolve; });
    writes++;
    return new Response('{}');
  };
  const password = changeAccountPassword('old password', 'new password');
  const queued = requestJson('/api/projects', { method: 'POST', body: '{}' });
  cancelSessionRequests();
  setCsrfToken('replacement-account-token');
  release(new Response(JSON.stringify({ csrfToken: 'obsolete-token' })));
  assert.equal(await password, false);
  await assert.rejects(queued, { name: 'AbortError' });
  assert.equal(writes, 0);
});
