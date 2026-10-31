/**
 * Initialize the self-hosted API explorer. Cookie credentials stay on this
 * origin, and protected writes obtain a current CSRF token immediately before
 * execution instead of persisting an old token in the Swagger interface.
 */
/* Swagger uses the same origin and HttpOnly session cookie as the website. */
window.addEventListener('load', () => {
  const publicMutations = new Set([
    '/api/login',
    '/api/users',
    '/api/demo',
    '/api/forgot-password',
    '/api/reset-password',
  ]);
  window.ui = SwaggerUIBundle({
    url: './openapi.json',
    dom_id: '#swagger-ui',
    deepLinking: true,
    filter: true,
    displayRequestDuration: true,
    validatorUrl: null,
    persistAuthorization: false,
    withCredentials: true,
    requestInterceptor: async (request) => {
      const target = new URL(request.url, window.location.href);
      if (target.origin !== window.location.origin) {
        throw new Error('DevTrack API requests must use this website’s origin.');
      }
      request.credentials = 'same-origin';
      // Swagger omits method when fetching the initial OpenAPI definition.
      const mutation = !['GET', 'HEAD', 'OPTIONS'].includes((request.method || 'GET').toUpperCase());
      if (
        mutation &&
        target.pathname.startsWith('/api/') &&
        !publicMutations.has(target.pathname)
      ) {
        // Fetch afresh so login, logout, refresh, and password changes cannot leave a stale token.
        const session = await fetch('/api/session', {
          credentials: 'same-origin',
          cache: 'no-store',
        });
        if (session.ok) {
          const data = await session.json();
          request.headers = request.headers || {};
          request.headers['X-CSRF-Token'] = data.csrfToken;
        }
      }
      return request;
    },
  });
});
