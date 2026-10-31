/**
 * HTTP boundary helpers: read bounded JSON requests and send uncached JSON
 * responses. Parsing returns unknown; route-specific validation must narrow it.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { HttpError } from './security';
const MAX_REQUEST_BODY_SIZE = 32_768;

/**
 * Serialize one response and prevent browser/proxy caching of account data.
 * Content-Length counts UTF-8 bytes, not JavaScript string characters.
 */
export function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  const responseBody = JSON.stringify(payload);

  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(responseBody),
    'Cache-Control': 'no-store',
  });

  response.end(responseBody);
}

/**
 * Reads and parses JSON while limiting the request size.
 */
export async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  if (!request.headers['content-type']?.toLowerCase().startsWith('application/json'))
    throw new HttpError(415, 'Send this request as application/json.');
  const chunks: Buffer[] = [];
  let totalSize = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);

    totalSize += buffer.length;

    if (totalSize > MAX_REQUEST_BODY_SIZE) {
      throw new HttpError(413, 'The request body is too large.');
    }

    chunks.push(buffer);
  }

  const requestBody = Buffer.concat(chunks).toString('utf8').trim();

  if (requestBody.length === 0) {
    return {};
  }

  return JSON.parse(requestBody) as unknown;
}
