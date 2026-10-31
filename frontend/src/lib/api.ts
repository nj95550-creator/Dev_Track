/**
 * Browser JSON client shared by authentication and workspace actions. It sends
 * same-origin cookies, attaches CSRF tokens, bounds response time and coordinates
 * password rotation with account changes; session tokens never enter localStorage.
 */
let csrfToken = '';
let sessionGeneration = 0;
let accountGeneration = 0;
let passwordSync: { account: number; promise: Promise<boolean> } | null = null;
const sessionRequests = new Set<AbortController>();
// Changing the CSRF token also changes response-generation tracking. Only the
// current session may turn a protected 401 into a global sign-out event.
export const setCsrfToken = (token: string) => {
  if (token !== csrfToken) sessionGeneration++;
  csrfToken = token;
};
// A response from a signed-out account must never affect its replacement.
/**
 * Invalidate account-bound completions, abort active requests and detach the
 * old password barrier. A newly signed-in account starts with independent work.
 */
export function cancelSessionRequests() {
  sessionGeneration++;
  accountGeneration++;
  passwordSync = null;
  for (const controller of sessionRequests) controller.abort();
  sessionRequests.clear();
}
/**
 * Preserve the HTTP status alongside the safe API message so callers can
 * distinguish an expected anonymous session from a network or service failure.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
/**
 * Send/parse one same-origin JSON request with a deadline through body receipt.
 * Protected writes wait for password synchronization; only a current-session
 * 401 announces expiry, preventing late failures from clearing a newer account.
 */
export async function requestJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  const mutation = !['GET', 'HEAD'].includes((options.method || 'GET').toUpperCase());
  const path = url.split(/[?#]/)[0];
  const sessionBound = ![
    '/api/config',
    '/api/login',
    '/api/users',
    '/api/demo',
    '/api/forgot-password',
    '/api/reset-password',
  ].includes(path);
  // Writes, including logout, wait for a pending password rotation to deliver
  // its replacement CSRF token. A different account never waits on that work.
  if (mutation && sessionBound && path !== '/api/password' && passwordSync) {
    const account = accountGeneration;
    await passwordSync.promise;
    if (account !== accountGeneration)
      throw new DOMException('The account changed.', 'AbortError');
  }
  const generation = sessionGeneration;
  const headers = new Headers(options.headers);
  if (mutation) {
    headers.set('Content-Type', 'application/json');
    if (csrfToken) headers.set('X-CSRF-Token', csrfToken);
  }
  let response: Response;
  let text: string;
  const controller = new AbortController();
  if (sessionBound) sessionRequests.add(controller);
  const timer = window.setTimeout(() => controller.abort(), 20_000);
  const cancel = () => controller.abort();
  options.signal?.addEventListener('abort', cancel, { once: true });
  if (options.signal?.aborted) controller.abort();
  try {
    response = await fetch(url, {
      ...options,
      headers,
      credentials: 'same-origin',
      signal: controller.signal,
    });
    // Keep cancellation and the deadline active until the body has arrived too.
    text = await response.text();
  } catch (error) {
    if (
      options.signal?.aborted ||
      (controller.signal.aborted && generation !== sessionGeneration)
    )
      throw error;
    throw new Error(
      controller.signal.aborted
        ? 'That request took too long. Please try again.'
        : 'We couldn’t reach DevTrack. Check your connection and try again.',
      { cause: error },
    );
  } finally {
    clearTimeout(timer);
    sessionRequests.delete(controller);
    options.signal?.removeEventListener('abort', cancel);
  }
  let payload: Record<string, unknown>;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error('The service is temporarily unavailable. Please try again.');
  }
  if (!response.ok) {
    if (
      response.status === 401 &&
      sessionBound &&
      path !== '/api/session' &&
      generation === sessionGeneration
    )
      window.dispatchEvent(new Event('devtrack:expired'));
    throw new ApiError(
      typeof payload.error === 'string' ? payload.error : 'The request could not be completed.',
      response.status,
    );
  }
  return payload as T;
}

/**
 * Release only the password barrier owned by this account generation. An
 * old completion must not clear a replacement account's in-progress operation.
 */
function finishPasswordSync(account: number) {
  if (passwordSync?.account === account) passwordSync = null;
}

// Owned by the account session, not by a screen's mounting/unmounting lifecycle.
/**
 * Rotate credentials independently of screen unmounting. Commit the returned
 * CSRF token only for the initiating account; if the body is lost, re-read the
 * cookie-backed session before another protected write can proceed.
 */
export function changeAccountPassword(currentPassword: string, password: string): Promise<boolean> {
  if (passwordSync) return Promise.reject(new Error('A password change is already in progress.'));
  const account = accountGeneration;
  const current = () => account === accountGeneration;
  const promise = (async () => {
    try {
      const result = await requestJson<{ csrfToken: string }>('/api/password', {
        method: 'POST', body: JSON.stringify({ currentPassword, password }),
      });
      if (!current()) return false;
      setCsrfToken(result.csrfToken);
      return true;
    } catch (error) {
      if (!current()) return false;
      // A lost body can follow a committed password change. Re-read this
      // account's cookie-backed session before allowing another write.
      try {
        const session = await requestJson<{ csrfToken: string }>('/api/session');
        if (current()) setCsrfToken(session.csrfToken);
      } catch {
        if (current()) window.dispatchEvent(new Event('devtrack:expired'));
      }
      if (!current()) return false;
      throw error;
    } finally {
      finishPasswordSync(account);
    }
  })();
  passwordSync = { account, promise };
  return promise;
}
