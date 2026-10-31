/**
 * Shared Playwright fixture for the disposable trusted-proxy test server.
 * Each test receives a documentation-only client address to keep unrelated
 * authentication attempts from sharing one rate-limit bucket.
 */
import { test as base } from '@playwright/test';
import { createHash } from 'node:crypto';
export { expect, type Page } from '@playwright/test';

// The disposable, loopback-only test server models a trusted proxy. Give each
// test its own client address so unrelated tests do not spend one auth bucket.
// Production limits and the backend's dedicated rate-limit tests stay intact.
export const test = base.extend({
  extraHTTPHeaders: async ({ extraHTTPHeaders }, use, info) => {
    const address = createHash('sha256').update(info.testId).digest('hex');
    await use({
      ...extraHTTPHeaders,
      'X-Forwarded-For': `2001:db8:${address.slice(0, 4)}:${address.slice(4, 8)}::1`,
    });
  },
});
