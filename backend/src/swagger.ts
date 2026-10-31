/**
 * Serve the local Swagger UI, its allowlisted assets and the OpenAPI document.
 * Documentation is opt-in in production and uses the active session-cookie name
 * so examples follow the same authentication model as the website.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { ServerResponse } from 'node:http';
import { cookieName, production } from './security';

const assets: Record<string, [string, string]> = {
  '/api-docs/': [resolve(__dirname, '../public/swagger.html'), 'text/html; charset=utf-8'],
  '/api-docs/swagger-init.js': [
    resolve(__dirname, '../public/swagger-init.js'),
    'text/javascript; charset=utf-8',
  ],
  '/api-docs/swagger-ui.css': [
    require.resolve('swagger-ui-dist/swagger-ui.css'),
    'text/css; charset=utf-8',
  ],
  '/api-docs/swagger-ui-bundle.js': [
    require.resolve('swagger-ui-dist/swagger-ui-bundle.js'),
    'text/javascript; charset=utf-8',
  ],
};

// Keep documentation private by default in production; local development enables it.
/**
 * Handle documentation requests and report whether this router consumed them.
 * Only known local assets are served; the live cookie name is inserted into
 * the specification so Node, Docker and production examples authenticate correctly.
 */
export async function serveSwagger(path: string, method: string, response: ServerResponse) {
  if (!['/swagger', '/swagger/', '/api-docs'].includes(path) && !path.startsWith('/api-docs/'))
    return false;
  const enabled =
    process.env.ENABLE_SWAGGER === 'true' ||
    (!production && process.env.ENABLE_SWAGGER !== 'false');
  response.setHeader('Cache-Control', 'no-store');
  if (!enabled) {
    response.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(
      method === 'HEAD' ? undefined : JSON.stringify({ error: 'API documentation is disabled.' }),
    );
    return true;
  }
  if (!['GET', 'HEAD'].includes(method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end();
    return true;
  }
  if (['/swagger', '/swagger/', '/api-docs'].includes(path)) {
    response.writeHead(302, { Location: '/api-docs/' });
    response.end();
    return true;
  }
  response.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
  );
  if (path === '/api-docs/openapi.json') {
    const spec = JSON.parse(await readFile(resolve(__dirname, '../../docs/openapi.json'), 'utf8'));
    spec.components.securitySchemes.sessionCookie.name = cookieName;
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(method === 'HEAD' ? undefined : JSON.stringify(spec));
    return true;
  }
  const asset = assets[path];
  if (!asset) {
    response.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(
      method === 'HEAD' ? undefined : JSON.stringify({ error: 'Documentation asset not found.' }),
    );
    return true;
  }
  const contents = await readFile(asset[0]);
  response.writeHead(200, { 'Content-Type': asset[1], 'Content-Length': contents.length });
  response.end(method === 'HEAD' ? undefined : contents);
  return true;
}
