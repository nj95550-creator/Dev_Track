/**
 * Session cookies, CSRF/origin checks and shared database-backed request limits.
 * Browser cookies contain opaque tokens; only token hashes are stored for lookup.
 * The resolved session is the source of account ownership throughout the API.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { databasePool, type DatabaseQuery } from './database';
export const production = process.env.NODE_ENV === 'production';
export const appOrigin = new URL(process.env.APP_ORIGIN || `http://localhost:${process.env.PORT || '3000'}`).origin;
if (production && !appOrigin.startsWith('https://'))
  throw new Error('Production APP_ORIGIN must use HTTPS.');
const sessionNamespace =
  process.env.SESSION_NAMESPACE || (isolatedNamespace() ? 'test' : 'local');
/**
 * Use a test cookie namespace for explicitly isolated memory-database runs.
 */
function isolatedNamespace() {
  return process.env.DEVTRACK_TEST_DATABASE === 'memory';
}
if (!/^[a-z0-9_-]{1,32}$/.test(sessionNamespace)) throw new Error('Invalid SESSION_NAMESPACE.');
export const cookieName = production
  ? '__Host-devtrack'
  : `devtrack_${sessionNamespace}_session`;
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const opaqueToken = () => randomBytes(32).toString('hex');
/** Expected request failure with a safe message/status for the HTTP router. */
export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
/**
 * Read only the active namespace's opaque cookie and reject malformed tokens
 * before using them in a database lookup.
 */
export function cookieToken(request: IncomingMessage): string | null {
  const cookie = request.headers.cookie
    ?.split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${cookieName}=`));
  const value = cookie?.slice(cookieName.length + 1);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}
/**
 * Issue the opaque sign-in token with HttpOnly/SameSite attributes. Production
 * also requires Secure and the host-only cookie prefix; remember extends persistence.
 */
export function setSessionCookie(response: ServerResponse, value: string, remember = false) {
  response.setHeader(
    'Set-Cookie',
    `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Lax${production ? '; Secure' : ''}${remember ? '; Max-Age=2592000' : ''}`,
  );
}
/**
 * Expire this environment's cookie with the same path/security attributes used
 * at creation, without affecting another local launcher's namespace.
 */
export function clearSessionCookie(response: ServerResponse) {
  response.setHeader(
    'Set-Cookie',
    `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${production ? '; Secure' : ''}`,
  );
}
// Callers holding a user-row lock pass their transaction query. Issue the cookie
// only after that transaction commits, so a revoked password cannot gain access.
/**
 * Insert a hashed session token and its CSRF token on the supplied connection.
 * Return token material to the caller, which must commit before issuing its cookie.
 */
export async function createSession(
  userId: number,
  remember = false,
  query: DatabaseQuery = databasePool.query,
) {
  const token = opaqueToken();
  const csrfToken = opaqueToken();
  await query(
    "INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at) VALUES($1,$2,$3,CURRENT_TIMESTAMP + ($4 * INTERVAL '1 day'))",
    [digest(token), userId, csrfToken, remember ? 30 : 7],
  );
  return { token, csrfToken };
}
/**
 * Create a session and immediately attach its cookie for routes that are not
 * issuing credentials within a wider transaction.
 */
export async function newSession(response: ServerResponse, userId: number, remember = false) {
  const session = await createSession(userId, remember);
  setSessionCookie(response, session.token, remember);
  return session.csrfToken;
}
/**
 * Resolve account ownership from an unexpired hashed session token. Enforce
 * both absolute and idle expiry, then update activity for accepted sessions.
 */
export async function getSession(request: IncomingMessage) {
  const token = cookieToken(request);
  if (!token) return null;
  const result = await databasePool.query(
    'SELECT user_id AS "userId", csrf_token AS "csrfToken" FROM sessions WHERE token_hash=$1 AND expires_at>CURRENT_TIMESTAMP AND last_seen_at>CURRENT_TIMESTAMP - INTERVAL \'24 hours\'',
    [digest(token)],
  );
  if (!result.rows[0]) return null;
  await databasePool.query(
    'UPDATE sessions SET last_seen_at=CURRENT_TIMESTAMP WHERE token_hash=$1',
    [digest(token)],
  );
  return result.rows[0] as { userId: number; csrfToken: string };
}
/**
 * Reject cross-site writes and mismatched explicit origins using the configured
 * application origin rather than trusting a submitted Host header.
 */
export function checkOrigin(request: IncomingMessage) {
  if (
    request.headers['sec-fetch-site'] === 'cross-site' ||
    (request.headers.origin && request.headers.origin !== appOrigin)
  )
    throw new HttpError(403, 'This request came from an untrusted website.');
}
/**
 * Require a correctly shaped per-session token and compare it in constant time
 * after the origin check. Cookies alone do not authorize a protected write.
 */
export function checkCsrf(request: IncomingMessage, expected: string) {
  checkOrigin(request);
  const actual = request.headers['x-csrf-token'];
  if (
    typeof actual !== 'string' ||
    !/^[a-f0-9]{64}$/.test(actual) ||
    actual.length !== expected.length ||
    !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
  )
    throw new HttpError(403, 'Your security token expired. Refresh the page and try again.');
}
/**
 * Atomically count requests per action/IP bucket in the shared database.
 * Expired buckets restart; proxy headers are used only when explicitly trusted.
 */
export async function rateLimit(
  request: IncomingMessage,
  bucket: string,
  limit: number,
  minutes: number,
) {
  const ip =
    process.env.TRUST_PROXY === 'true'
      ? String(request.headers['x-forwarded-for'] || '')
          .split(',')
          .at(-1)
          ?.trim() || request.socket.remoteAddress
      : request.socket.remoteAddress;
  const key = digest(`${bucket}:${ip || 'unknown'}`);
  const result = await databasePool.query(
    `INSERT INTO rate_limits(key,count,expires_at) VALUES($1,1,CURRENT_TIMESTAMP + ($2 * INTERVAL '1 minute')) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rate_limits.expires_at<=CURRENT_TIMESTAMP THEN 1 ELSE rate_limits.count+1 END, expires_at=CASE WHEN rate_limits.expires_at<=CURRENT_TIMESTAMP THEN EXCLUDED.expires_at ELSE rate_limits.expires_at END RETURNING count`,
    [key, minutes],
  );
  if (Number(result.rows[0]?.count) > limit)
    throw new HttpError(
      429,
      'Too many attempts. Please wait a few minutes before trying again.',
    );
}
