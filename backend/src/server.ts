/**
 * Node HTTP application entry point and project/goal router. Requests pass
 * through security checks and runtime validation before owner-scoped SQL access;
 * the built React app and optional Swagger assets are served from the same origin.
 */
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import {
  production,
  appOrigin,
  HttpError,
  getSession,
  checkCsrf,
  checkOrigin,
  rateLimit,
} from './security';
import { recoveryAvailable } from './accounts';
import * as http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  databasePool,
  verifyDatabaseConnection,
  migrateDatabase,
  transaction,
  type DatabaseQuery,
} from './database';
import {
  createLearningGoal,
  deleteLearningGoal,
  getLearningGoalForUser,
  getLearningGoalsForUser,
  updateLearningGoal,
  type LearningGoalStatus,
} from './learningGoals';
import {
  createProject,
  deleteProject,
  getProjectForUser,
  getProjectsForUser,
  updateProject,
  type ProjectPriority,
  type ProjectStatus,
} from './projects';
import { handleAccountRoutes } from './accountRoutes';
import { sendJson, readJsonBody } from './http';
import {
  isRecord,
  isCreateProjectPayload,
  isUpdateProjectPayload,
  isCreateLearningGoalPayload,
  isUpdateLearningGoalPayload,
  parsePositiveInteger,
  normalizeOptionalText,
  normalizeOptionalUrl,
  getDatabaseErrorCode,
} from './validation';
import { serveSwagger } from './swagger';

const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 3000);
/**
 * Check that a linked project belongs to the signed-in account, using the
 * caller's transaction when the lookup is part of a goal edit.
 */
async function projectBelongsToUser(
  projectId: number,
  userId: number,
  query: DatabaseQuery = databasePool.query,
): Promise<boolean> {
  const project = await getProjectForUser(projectId, userId, query);

  return project !== null;
}

/**
 * Route one request through security headers, origin/session checks,
 * validation and owner-scoped repositories. Translate expected failures into
 * useful HTTP errors while keeping internal database failures out of responses.
 */
async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    const method = request.method ?? 'GET';
    const requestUrl = new URL(
      request.url ?? '/',
      `http://${request.headers.host ?? `${HOST}:${PORT}`}`,
    );
    const rawPath = requestUrl.pathname;
    const path = rawPath.replace(/^\/api(?=\/|$)/, '') || '/';
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (production)
      response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(method);
    if (isMutation) checkOrigin(request);

    if (await serveSwagger(rawPath, method, response)) return;

    // Production serves the built frontend and API from the same origin.
    if (
      !rawPath.startsWith('/api') &&
      process.env.SERVE_FRONTEND !== 'false' &&
      ['GET', 'HEAD'].includes(method) &&
      !['/health'].includes(path)
    ) {
      const root = resolve(__dirname, '../../frontend/dist');
      let filePath: string;
      try {
        filePath = resolve(root, '.' + decodeURIComponent(rawPath));
      } catch {
        throw new HttpError(400, 'Invalid URL.');
      }
      if (filePath !== root && !filePath.startsWith(root + sep))
        throw new HttpError(404, 'Page not found.');
      try {
        if ((await stat(filePath)).isDirectory()) filePath = resolve(filePath, 'index.html');
      } catch {
        if (extname(rawPath)) throw new HttpError(404, 'File not found.');
        filePath = resolve(root, 'index.html');
      }
      let contents = await readFile(filePath);
      if (filePath === resolve(root, 'index.html')) {
        // Use the configured origin, never an untrusted Host header, in sharing tags.
        const origin = appOrigin.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
        contents = Buffer.from(contents.toString('utf8').replaceAll('__DEVTRACK_ORIGIN__', origin));
      }
      const contentTypes: Record<string, string> = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.ico': 'image/x-icon',
        '.txt': 'text/plain; charset=utf-8',
      };
      response.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
      );
      response.writeHead(200, {
        'Content-Type': contentTypes[extname(filePath)] || 'application/octet-stream',
        'Cache-Control': filePath.includes(sep + 'assets' + sep)
          ? 'public, max-age=31536000, immutable'
          : 'no-cache',
      });
      response.end(method === 'HEAD' ? undefined : contents);
      return;
    }
    if (method === 'GET' && path === '/config') {
      sendJson(response, 200, { recoveryAvailable });
      return;
    }
    // Resolve ownership once per API request. Supplied userId fields are replaced
    // with this session identity before create/update payload validation.
    const session = await getSession(request);
    const publicRoute = [
      '/',
      '/health',
      '/login',
      '/users',
      '/demo',
      '/forgot-password',
      '/reset-password',
    ].includes(path);
    if (!publicRoute && !session) {
      // This request may carry an older cookie than the browser now holds.
      // Only explicit logout/reset actions clear cookies; a late 401 must not
      // erase a session established while this request was in flight.
      throw new HttpError(401, 'Your session has ended. Please sign in again.');
    }
    if (
      session &&
      isMutation &&
      !['/login', '/users', '/demo', '/forgot-password', '/reset-password'].includes(path)
    )
      checkCsrf(request, session.csrfToken);
    // Credential/public routes have their own checks; protected writes above
    // require both the cookie-backed session and its matching CSRF token.
    const sessionUserId = session?.userId;
    if (
      ['/login', '/users', '/demo', '/forgot-password', '/reset-password'].includes(path) &&
      isMutation
    ) {
      await rateLimit(request, 'auth', 30, 15);
      await databasePool.query('DELETE FROM rate_limits WHERE expires_at<CURRENT_TIMESTAMP');
      await databasePool.query(
        "DELETE FROM sessions WHERE expires_at<CURRENT_TIMESTAMP OR last_seen_at<CURRENT_TIMESTAMP - INTERVAL '24 hours'",
      );
    }
    if (await handleAccountRoutes(request, response, path, session)) return;

    /*
     * Project collection routes.
     */
    if (method === 'GET' && path === '/projects') {
      const userId = sessionUserId ?? null;

      if (userId === null) {
        sendJson(response, 401, {
          error: 'Your session has ended. Please sign in again.',
        });
        return;
      }

      const projects = await getProjectsForUser(userId);

      sendJson(response, 200, {
        projects,
      });
      return;
    }

    if (method === 'POST' && path === '/projects') {
      const raw = await readJsonBody(request);
      const payload = isRecord(raw) ? { ...raw, userId: sessionUserId } : raw;

      if (!isCreateProjectPayload(payload)) {
        sendJson(response, 400, {
          error: 'Enter a valid project title and project details.',
        });
        return;
      }

      if (payload.startDate && payload.targetDate && payload.startDate > payload.targetDate)
        throw new HttpError(400, 'Target date must be on or after the start date.');
      const project = await createProject({
        userId: payload.userId,
        title: payload.title.trim(),
        description: payload.description?.trim() ?? '',
        status: payload.status ?? 'planned',
        priority: payload.priority ?? 'medium',
        progress: payload.status === 'completed' ? 100 : (payload.progress ?? 0),
        startDate: payload.startDate ?? null,
        targetDate: payload.targetDate ?? null,
        technologies: normalizeOptionalText(payload.technologies),
        repositoryUrl: normalizeOptionalUrl(payload.repositoryUrl),
        liveUrl: normalizeOptionalUrl(payload.liveUrl),
      });

      sendJson(response, 201, {
        project,
      });
      return;
    }

    /*
     * Individual project routes use /projects/:projectId.
     */
    const projectRouteMatch = /^\/projects\/(\d+)$/.exec(path);

    if (projectRouteMatch !== null) {
      const projectId = parsePositiveInteger(projectRouteMatch[1] ?? null);

      if (projectId === null) {
        sendJson(response, 400, {
          error: 'A valid project ID is required.',
        });
        return;
      }

      if (method === 'GET') {
        const userId = sessionUserId ?? null;

        if (userId === null) {
          sendJson(response, 401, {
            error: 'Your session has ended. Please sign in again.',
          });
          return;
        }

        const project = await getProjectForUser(projectId, userId);

        if (project === null) {
          sendJson(response, 404, {
            error: 'The requested project was not found.',
          });
          return;
        }

        sendJson(response, 200, {
          project,
        });
        return;
      }

      // Read/merge the current record under a row lock to preserve concurrent
      // edits to fields omitted from this partial update.
      if (method === 'PATCH') {
        const raw = await readJsonBody(request);
        const payload = isRecord(raw) ? { ...raw, userId: sessionUserId } : raw;

        if (!isUpdateProjectPayload(payload)) {
          sendJson(response, 400, {
            error: 'Provide at least one valid project field to update.',
          });
          return;
        }

        const project = await transaction(async (query) => {
          const existingProject = await getProjectForUser(projectId, payload.userId, query, true);

          if (existingProject === null)
            throw new HttpError(404, 'The requested project was not found.');

          const nextStart =
            payload.startDate !== undefined ? payload.startDate : existingProject.startDate;
          const nextTarget =
            payload.targetDate !== undefined ? payload.targetDate : existingProject.targetDate;
          if (nextStart && nextTarget && nextStart > nextTarget)
            throw new HttpError(400, 'Target date must be on or after the start date.');
          return updateProject(
            {
              projectId,
              userId: payload.userId,
              title: payload.title?.trim() ?? existingProject.title,
              description: payload.description?.trim() ?? existingProject.description,
              status: payload.status ?? existingProject.status,
              priority: payload.priority ?? existingProject.priority,
              progress:
                (payload.status ?? existingProject.status) === 'completed'
                  ? 100
                  : (payload.progress ?? existingProject.progress),
              startDate:
                payload.startDate !== undefined
                  ? payload.startDate === null || payload.startDate === ''
                    ? null
                    : payload.startDate
                  : existingProject.startDate,
              targetDate:
                payload.targetDate !== undefined
                  ? payload.targetDate === null || payload.targetDate === ''
                    ? null
                    : payload.targetDate
                  : existingProject.targetDate,
              technologies:
                payload.technologies !== undefined
                  ? normalizeOptionalText(payload.technologies)
                  : existingProject.technologies,
              repositoryUrl:
                payload.repositoryUrl !== undefined
                  ? normalizeOptionalUrl(payload.repositoryUrl)
                  : existingProject.repositoryUrl,
              liveUrl:
                payload.liveUrl !== undefined
                  ? normalizeOptionalUrl(payload.liveUrl)
                  : existingProject.liveUrl,
            },
            query,
          );
        });

        if (project === null) {
          sendJson(response, 404, {
            error: 'The requested project was not found.',
          });
          return;
        }

        sendJson(response, 200, {
          project,
        });
        return;
      }

      if (method === 'DELETE') {
        const userId = sessionUserId ?? null;

        if (userId === null) {
          sendJson(response, 401, {
            error: 'Your session has ended. Please sign in again.',
          });
          return;
        }

        const projectWasDeleted = await deleteProject(projectId, userId);

        if (!projectWasDeleted) {
          sendJson(response, 404, {
            error: 'The requested project was not found.',
          });
          return;
        }

        sendJson(response, 200, {
          message: 'Project deleted successfully.',
        });
        return;
      }
    }

    /*
     * Learning-goal collection routes.
     */
    if (method === 'GET' && path === '/learning-goals') {
      const userId = sessionUserId ?? null;

      if (userId === null) {
        sendJson(response, 401, {
          error: 'Your session has ended. Please sign in again.',
        });
        return;
      }

      const goals = await getLearningGoalsForUser(userId);

      sendJson(response, 200, {
        goals,
      });
      return;
    }

    if (method === 'POST' && path === '/learning-goals') {
      const raw = await readJsonBody(request);
      const payload = isRecord(raw) ? { ...raw, userId: sessionUserId } : raw;

      if (!isCreateLearningGoalPayload(payload)) {
        sendJson(response, 400, {
          error: 'Enter a valid goal title and goal details.',
        });
        return;
      }

      const projectId = payload.projectId ?? null;

      if (projectId !== null && !(await projectBelongsToUser(projectId, payload.userId))) {
        sendJson(response, 400, {
          error: 'The selected project does not belong to this user.',
        });
        return;
      }

      const goal = await createLearningGoal({
        userId: payload.userId,
        projectId,
        title: payload.title.trim(),
        description: payload.description?.trim() ?? '',
        status: payload.status ?? 'planned',
        targetDate: payload.targetDate ?? null,
      });

      sendJson(response, 201, {
        goal,
      });
      return;
    }

    /*
     * Individual goal routes use /learning-goals/:goalId.
     */
    const goalRouteMatch = /^\/learning-goals\/(\d+)$/.exec(path);

    if (goalRouteMatch !== null) {
      const goalId = parsePositiveInteger(goalRouteMatch[1] ?? null);

      if (goalId === null) {
        sendJson(response, 400, {
          error: 'A valid learning-goal ID is required.',
        });
        return;
      }

      if (method === 'GET') {
        const userId = sessionUserId ?? null;

        if (userId === null) {
          sendJson(response, 401, {
            error: 'Your session has ended. Please sign in again.',
          });
          return;
        }

        const goal = await getLearningGoalForUser(goalId, userId);

        if (goal === null) {
          sendJson(response, 404, {
            error: 'The requested learning goal was not found.',
          });
          return;
        }

        sendJson(response, 200, {
          goal,
        });
        return;
      }

      // Read/merge the current record under a row lock to preserve concurrent
      // edits to fields omitted from this partial update.
      if (method === 'PATCH') {
        const raw = await readJsonBody(request);
        const payload = isRecord(raw) ? { ...raw, userId: sessionUserId } : raw;

        if (!isUpdateLearningGoalPayload(payload)) {
          sendJson(response, 400, {
            error: 'Provide at least one valid learning-goal field to update.',
          });
          return;
        }

        const goal = await transaction(async (query) => {
          const existingGoal = await getLearningGoalForUser(goalId, payload.userId, query, true);

          if (existingGoal === null)
            throw new HttpError(404, 'The requested learning goal was not found.');

          const projectId =
            payload.projectId !== undefined ? payload.projectId : existingGoal.projectId;

          if (projectId !== null && !(await projectBelongsToUser(projectId, payload.userId, query)))
            throw new HttpError(400, 'The selected project does not belong to this user.');

          return updateLearningGoal(
            {
              goalId,
              userId: payload.userId,
              projectId,
              title: payload.title?.trim() ?? existingGoal.title,
              description: payload.description?.trim() ?? existingGoal.description,
              status: payload.status ?? existingGoal.status,
              targetDate:
                payload.targetDate !== undefined ? payload.targetDate : existingGoal.targetDate,
            },
            query,
          );
        });

        if (goal === null) {
          sendJson(response, 404, {
            error: 'The requested learning goal was not found.',
          });
          return;
        }

        sendJson(response, 200, {
          goal,
        });
        return;
      }

      if (method === 'DELETE') {
        const userId = sessionUserId ?? null;

        if (userId === null) {
          sendJson(response, 401, {
            error: 'Your session has ended. Please sign in again.',
          });
          return;
        }

        const goalWasDeleted = await deleteLearningGoal(goalId, userId);

        if (!goalWasDeleted) {
          sendJson(response, 404, {
            error: 'The requested learning goal was not found.',
          });
          return;
        }

        sendJson(response, 200, {
          message: 'Learning goal deleted successfully.',
        });
        return;
      }
    }

    sendJson(response, 404, {
      error: 'The requested endpoint does not exist.',
    });
  } catch (error: unknown) {
    if (error instanceof HttpError) {
      sendJson(response, error.statusCode, {
        error: error.message,
      });
      return;
    }

    if (error instanceof SyntaxError) {
      sendJson(response, 400, {
        error: 'The request body must contain valid JSON.',
      });
      return;
    }

    // Map known uniqueness/foreign-key failures to useful HTTP messages;
    // unexpected failures are logged server-side and return a generic response.
    const databaseErrorCode = getDatabaseErrorCode(error);

    if (databaseErrorCode === '23505') {
      sendJson(response, 409, {
        error: 'That username or email is already being used.',
      });
      return;
    }

    if (databaseErrorCode === '23503') {
      sendJson(response, 400, {
        error: 'The selected user or project does not exist.',
      });
      return;
    }

    console.error('DevTrack could not complete the request.', error);

    sendJson(response, 500, {
      error: 'The server could not complete the request.',
    });
  }
}

export const server = http.createServer((request: IncomingMessage, response: ServerResponse) => {
  void handleRequest(request, response);
});

/**
 * Require owner-managed production migrations and verify database access
 * before opening the listening socket. Local startup can apply the schema
 * automatically after connectivity has been established.
 */
async function startServer(): Promise<void> {
  try {
    if (production && process.env.AUTO_MIGRATE !== 'false')
      throw new Error('Production requires AUTO_MIGRATE=false; run the owner-only setup job first.');
    await verifyDatabaseConnection();
    if (process.env.AUTO_MIGRATE !== 'false') await migrateDatabase();

    server.listen(PORT, HOST, () => {
      console.log('Connected to PostgreSQL.');
      console.log(`DevTrack API running at http://${HOST}:${PORT}`);
    });
  } catch (error: unknown) {
    console.error('DevTrack API could not connect to PostgreSQL.', error);
    process.exit(1);
  }
}

if (require.main === module) void startServer();
server.requestTimeout = 30_000;
server.headersTimeout = 15_000;
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.on(signal, () => {
    server.close(() => {
      void databasePool.end().then(() => process.exit(0));
    });
  });
