import * as http from "node:http";
import type {
  IncomingMessage,
  ServerResponse,
} from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { QueryResultRow } from "pg";
import {
  databasePool,
  verifyDatabaseConnection,
} from "./database";
import { openApiDocument } from "./openapi";
import {
  createLearningGoal,
  deleteLearningGoal,
  getLearningGoalForUser,
  getLearningGoalsForUser,
  updateLearningGoal,
  type LearningGoalStatus,
} from "./learningGoals";
import {
  createProject,
  deleteProject,
  getProjectForUser,
  getProjectsForUser,
  updateProject,
  type ProjectPriority,
  type ProjectStatus,
} from "./projects";
import {
  hashPassword,
  isValidPassword,
  verifyPassword,
} from "./password";

// Keep local binding unchanged while allowing Docker to bind on all interfaces.
const HOST = process.env.HOST ?? "localhost";
const PORT = 3000;
const MAX_REQUEST_BODY_SIZE = 1_000_000;

// These records separate database-only authentication fields from public output.
interface UserRecord extends QueryResultRow {
  id: number;
  username: string;
  name: string;
  email: string;
  createdAt: Date;
}

interface AuthenticationUserRecord extends UserRecord {
  passwordHash: string | null;
}

interface CreateUserPayload {
  username: string;
  name: string;
  email: string;
  password: string;
}

interface LoginPayload {
  username: string;
  password: string;
}

interface CreateProjectPayload {
  userId: number;
  title: string;
  description?: string;
  status?: ProjectStatus;
  priority?: ProjectPriority;
  progress?: number;
  startDate?: string | null;
  targetDate?: string | null;
  technologies?: string | null;
  repositoryUrl?: string | null;
  liveUrl?: string | null;
}

interface UpdateProjectPayload {
  userId: number;
  title?: string;
  description?: string;
  status?: ProjectStatus;
  priority?: ProjectPriority;
  progress?: number;
  startDate?: string | null;
  targetDate?: string | null;
  technologies?: string | null;
  repositoryUrl?: string | null;
  liveUrl?: string | null;
}

interface CreateLearningGoalPayload {
  userId: number;
  projectId?: number | null;
  title: string;
  description?: string;
  targetDate?: string | null;
}

interface UpdateLearningGoalPayload {
  userId: number;
  projectId?: number | null;
  title?: string;
  description?: string;
  status?: LearningGoalStatus;
  targetDate?: string | null;
}

/**
 * Represents an expected request error returned to the client.
 */
class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/**
 * Sends a consistent JSON response from every API endpoint.
 */
function sendJson(
  response: ServerResponse,
  statusCode: number,
  payload: unknown
): void {
  const responseBody = JSON.stringify(payload);

  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(responseBody),
    "Cache-Control": "no-store",
  });

  response.end(responseBody);
}

/**
 * Reads and parses JSON while limiting the request size.
 */
async function readJsonBody(
  request: IncomingMessage
): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalSize = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk)
      ? chunk
      : Buffer.from(chunk);

    totalSize += buffer.length;

    if (totalSize > MAX_REQUEST_BODY_SIZE) {
      throw new HttpError(
        413,
        "The request body is too large."
      );
    }

    chunks.push(buffer);
  }

  const requestBody = Buffer.concat(chunks)
    .toString("utf8")
    .trim();

  if (requestBody.length === 0) {
    return {};
  }

  return JSON.parse(requestBody) as unknown;
}

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

const swaggerAssetAllowlist = new Set([
  "swagger-ui.css",
  "swagger-ui-bundle.js",
  "swagger-ui-standalone-preset.js",
]);

const swaggerAssetMimeTypes: Record<string, string> = {
  "swagger-ui.css": "text/css; charset=utf-8",
  "swagger-ui-bundle.js": "application/javascript; charset=utf-8",
  "swagger-ui-standalone-preset.js": "application/javascript; charset=utf-8",
};

// Swagger HTML is generated locally so the API can document itself without a separate server.
function getSwaggerUiHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>DevTrack API Documentation</title>
    <link rel="stylesheet" href="/api-docs/swagger-ui.css" />
    <style>
      html {
        box-sizing: border-box;
        overflow-y: scroll;
      }
      *, *:before, *:after {
        box-sizing: inherit;
      }
      body {
        margin: 0;
        background: #f5f7fb;
        font-family: Arial, sans-serif;
      }
      #swagger-ui {
        max-width: 1200px;
        margin: 0 auto;
        padding: 2rem 1rem 3rem;
      }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="/api-docs/swagger-ui-bundle.js"></script>
    <script src="/api-docs/swagger-ui-standalone-preset.js"></script>
    <script>
      window.onload = function () {
        SwaggerUIBundle({
          url: "/openapi.json",
          dom_id: "#swagger-ui",
          deepLinking: true,
          presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
          layout: "BaseLayout",
          docExpansion: "list",
          persistAuthorization: false,
          defaultModelsExpandDepth: 1,
        });
      };
    </script>
  </body>
</html>`;
}

async function serveSwaggerAsset(
  response: ServerResponse,
  assetName: string
): Promise<boolean> {
  if (
    assetName.includes("..") ||
    assetName.includes("/") ||
    assetName.includes("\\") ||
    !swaggerAssetAllowlist.has(assetName)
  ) {
    sendJson(response, 404, {
      error: "The requested Swagger asset does not exist.",
    });
    return true;
  }

  const swaggerUiDistPath = join(
    require.resolve("swagger-ui-dist/package.json"),
    ".."
  );

  const assetPath = join(swaggerUiDistPath, assetName);
  const assetContents = await readFile(assetPath);

  response.writeHead(200, {
    "Content-Type": swaggerAssetMimeTypes[assetName],
    "Content-Length": assetContents.length,
    "Cache-Control": "no-store",
  });
  response.end(assetContents);

  return true;
}

function isPositiveInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0
  );
}

// Request validators reject malformed or out-of-range values before database access.
function parsePositiveInteger(
  value: string | null
): number | null {
  if (value === null || !/^\d+$/.test(value)) {
    return null;
  }

  const parsedValue = Number(value);

  return Number.isSafeInteger(parsedValue) &&
    parsedValue > 0
    ? parsedValue
    : null;
}

function isValidUsername(
  value: unknown
): value is string {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9_-]{3,50}$/.test(value.trim())
  );
}

function isValidName(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  const characterCount = Array.from(value.trim()).length;

  return characterCount >= 1 && characterCount <= 100;
}

function isValidEmail(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  const normalizedEmail = value.trim();

  return (
    normalizedEmail.length <= 255 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      normalizedEmail
    )
  );
}

function isValidProjectTitle(
  value: unknown
): value is string {
  return (
    typeof value === "string" &&
    value.trim().length >= 1 &&
    value.trim().length <= 150
  );
}

function isValidDescription(
  value: unknown
): value is string {
  return (
    typeof value === "string" &&
    value.length <= 5000
  );
}

function isValidProjectStatus(
  value: unknown
): value is ProjectStatus {
  return (
    value === "planned" ||
    value === "in_progress" ||
    value === "completed"
  );
}

function isValidProjectPriority(
  value: unknown
): value is ProjectPriority {
  return (
    value === "low" ||
    value === "medium" ||
    value === "high"
  );
}

function isValidProjectProgress(
  value: unknown
): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 100
  );
}

function isValidHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  const trimmed = value.trim();

  return (
    trimmed.length > 0 &&
    trimmed.length <= 2048 &&
    /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(trimmed)
  );
}

function isValidTechnologies(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length <= 500
  );
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

function normalizeOptionalUrl(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

function isValidLearningGoalStatus(
  value: unknown
): value is LearningGoalStatus {
  return (
    value === "planned" ||
    value === "in_progress" ||
    value === "completed"
  );
}

/**
 * Accepts a calendar date using the YYYY-MM-DD format.
 */
function isValidTargetDate(
  value: unknown
): value is string | null {
  if (value === null) {
    return true;
  }

  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

function isCreateUserPayload(
  value: unknown
): value is CreateUserPayload {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isValidUsername(value.username) &&
    isValidName(value.name) &&
    isValidEmail(value.email) &&
    isValidPassword(value.password)
  );
}

function isLoginPayload(
  value: unknown
): value is LoginPayload {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isValidUsername(value.username) &&
    isValidPassword(value.password)
  );
}

function isCreateProjectPayload(
  value: unknown
): value is CreateProjectPayload {
  if (!isRecord(value)) {
    return false;
  }

  const descriptionIsValid =
    value.description === undefined ||
    isValidDescription(value.description);

  const statusIsValid =
    value.status === undefined ||
    isValidProjectStatus(value.status);

  const priorityIsValid =
    value.priority === undefined ||
    isValidProjectPriority(value.priority);

  const progressIsValid =
    value.progress === undefined ||
    isValidProjectProgress(value.progress);

  const startDateIsValid =
    value.startDate === undefined ||
    value.startDate === null ||
    isValidTargetDate(value.startDate);

  const targetDateIsValid =
    value.targetDate === undefined ||
    value.targetDate === null ||
    isValidTargetDate(value.targetDate);

  const technologiesIsValid =
    value.technologies === undefined ||
    value.technologies === null ||
    isValidTechnologies(value.technologies);

  const repositoryUrlIsValid =
    value.repositoryUrl === undefined ||
    value.repositoryUrl === null ||
    value.repositoryUrl === "" ||
    isValidHttpUrl(value.repositoryUrl);

  const liveUrlIsValid =
    value.liveUrl === undefined ||
    value.liveUrl === null ||
    value.liveUrl === "" ||
    isValidHttpUrl(value.liveUrl);

  return (
    isPositiveInteger(value.userId) &&
    isValidProjectTitle(value.title) &&
    descriptionIsValid &&
    statusIsValid &&
    priorityIsValid &&
    progressIsValid &&
    startDateIsValid &&
    targetDateIsValid &&
    technologiesIsValid &&
    repositoryUrlIsValid &&
    liveUrlIsValid
  );
}

function isUpdateProjectPayload(
  value: unknown
): value is UpdateProjectPayload {
  if (!isRecord(value) || !isPositiveInteger(value.userId)) {
    return false;
  }

  const titleIsValid =
    value.title === undefined ||
    isValidProjectTitle(value.title);

  const descriptionIsValid =
    value.description === undefined ||
    isValidDescription(value.description);

  const statusIsValid =
    value.status === undefined ||
    isValidProjectStatus(value.status);

  const priorityIsValid =
    value.priority === undefined ||
    isValidProjectPriority(value.priority);

  const progressIsValid =
    value.progress === undefined ||
    isValidProjectProgress(value.progress);

  const startDateIsValid =
    value.startDate === undefined ||
    value.startDate === null ||
    isValidTargetDate(value.startDate);

  const targetDateIsValid =
    value.targetDate === undefined ||
    value.targetDate === null ||
    isValidTargetDate(value.targetDate);

  const technologiesIsValid =
    value.technologies === undefined ||
    value.technologies === null ||
    isValidTechnologies(value.technologies);

  const repositoryUrlIsValid =
    value.repositoryUrl === undefined ||
    value.repositoryUrl === null ||
    value.repositoryUrl === "" ||
    isValidHttpUrl(value.repositoryUrl);

  const liveUrlIsValid =
    value.liveUrl === undefined ||
    value.liveUrl === null ||
    value.liveUrl === "" ||
    isValidHttpUrl(value.liveUrl);

  const containsUpdate =
    value.title !== undefined ||
    value.description !== undefined ||
    value.status !== undefined ||
    value.priority !== undefined ||
    value.progress !== undefined ||
    value.startDate !== undefined ||
    value.targetDate !== undefined ||
    value.technologies !== undefined ||
    value.repositoryUrl !== undefined ||
    value.liveUrl !== undefined;

  return (
    titleIsValid &&
    descriptionIsValid &&
    statusIsValid &&
    priorityIsValid &&
    progressIsValid &&
    startDateIsValid &&
    targetDateIsValid &&
    technologiesIsValid &&
    repositoryUrlIsValid &&
    liveUrlIsValid &&
    containsUpdate
  );
}

function isCreateLearningGoalPayload(
  value: unknown
): value is CreateLearningGoalPayload {
  if (!isRecord(value)) {
    return false;
  }

  const projectIdIsValid =
    value.projectId === undefined ||
    value.projectId === null ||
    isPositiveInteger(value.projectId);

  const descriptionIsValid =
    value.description === undefined ||
    isValidDescription(value.description);

  const targetDateIsValid =
    value.targetDate === undefined ||
    isValidTargetDate(value.targetDate);

  return (
    isPositiveInteger(value.userId) &&
    isValidProjectTitle(value.title) &&
    projectIdIsValid &&
    descriptionIsValid &&
    targetDateIsValid
  );
}

function isUpdateLearningGoalPayload(
  value: unknown
): value is UpdateLearningGoalPayload {
  if (!isRecord(value) || !isPositiveInteger(value.userId)) {
    return false;
  }

  const projectIdIsValid =
    value.projectId === undefined ||
    value.projectId === null ||
    isPositiveInteger(value.projectId);

  const titleIsValid =
    value.title === undefined ||
    isValidProjectTitle(value.title);

  const descriptionIsValid =
    value.description === undefined ||
    isValidDescription(value.description);

  const statusIsValid =
    value.status === undefined ||
    isValidLearningGoalStatus(value.status);

  const targetDateIsValid =
    value.targetDate === undefined ||
    isValidTargetDate(value.targetDate);

  const containsUpdate =
    value.projectId !== undefined ||
    value.title !== undefined ||
    value.description !== undefined ||
    value.status !== undefined ||
    value.targetDate !== undefined;

  return (
    projectIdIsValid &&
    titleIsValid &&
    descriptionIsValid &&
    statusIsValid &&
    targetDateIsValid &&
    containsUpdate
  );
}

function getDatabaseErrorCode(
  error: unknown
): string | undefined {
  if (!isRecord(error)) {
    return undefined;
  }

  return typeof error.code === "string"
    ? error.code
    : undefined;
}

/**
 * Removes authentication data before returning a user.
 */
function getPublicUser(user: UserRecord): {
  id: number;
  username: string;
  name: string;
  email: string;
  createdAt: Date;
} {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
  };
}

/**
 * Confirms that a selected project belongs to the submitted user.
 */
async function projectBelongsToUser(
  projectId: number,
  userId: number
): Promise<boolean> {
  const project = await getProjectForUser(
    projectId,
    userId
  );

  return project !== null;
}

/**
 * Handles DevTrack API requests and database operations.
 */
async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  try {
    const method = request.method ?? "GET";
    const requestUrl = new URL(
      request.url ?? "/",
      `http://${request.headers.host ?? `${HOST}:${PORT}`}`
    );
    const path = requestUrl.pathname;

    // Service routes expose health, the welcome payload, and API documentation.
    if (method === "GET" && path === "/") {
      sendJson(response, 200, {
        message: "Welcome to the DevTrack API.",
      });
      return;
    }

    if (method === "GET" && path === "/health") {
      await verifyDatabaseConnection();

      sendJson(response, 200, {
        status: "ok",
        database: "connected",
      });
      return;
    }

    if (method === "GET" && path === "/openapi.json") {
      sendJson(response, 200, openApiDocument);
      return;
    }

    if (
      method === "GET" &&
      (path === "/api-docs" || path === "/api-docs/")
    ) {
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Length": Buffer.byteLength(
          getSwaggerUiHtml()
        ),
        "Cache-Control": "no-store",
      });
      response.end(getSwaggerUiHtml());
      return;
    }

    if (
      method === "GET" &&
      /^\/api-docs\/(swagger-ui\.css|swagger-ui-bundle\.js|swagger-ui-standalone-preset\.js)$/.test(path)
    ) {
      const assetName = path.slice("/api-docs/".length);
      await serveSwaggerAsset(response, assetName);
      return;
    }

    // Profile and authentication routes hash passwords and never return password data.
    if (method === "GET" && path === "/users") {
      const result = await databasePool.query<UserRecord>(
        `
          SELECT
            id,
            username,
            name,
            email,
            created_at AS "createdAt"
          FROM users
          ORDER BY id;
        `
      );

      sendJson(response, 200, {
        users: result.rows.map(getPublicUser),
      });
      return;
    }

    if (method === "POST" && path === "/users") {
      const payload = await readJsonBody(request);

      if (!isCreateUserPayload(payload)) {
        sendJson(response, 400, {
          error:
            "Enter a valid username, name, email, and password. Passwords must be between 15 and 128 characters.",
        });
        return;
      }

      const passwordHash = await hashPassword(
        payload.password
      );

      const result = await databasePool.query<UserRecord>(
        `
          INSERT INTO users (
            username,
            name,
            email,
            password_hash
          )
          VALUES ($1, $2, $3, $4)
          RETURNING
            id,
            username,
            name,
            email,
            created_at AS "createdAt";
        `,
        [
          payload.username.trim(),
          payload.name.trim(),
          payload.email.trim().toLowerCase(),
          passwordHash,
        ]
      );

      const createdUser = result.rows[0];

      if (createdUser === undefined) {
        throw new Error(
          "PostgreSQL did not return the created user."
        );
      }

      sendJson(response, 201, {
        user: getPublicUser(createdUser),
      });
      return;
    }

    if (method === "POST" && path === "/login") {
      const payload = await readJsonBody(request);

      if (!isLoginPayload(payload)) {
        sendJson(response, 400, {
          error: "Enter a valid username and password.",
        });
        return;
      }

      const result =
        await databasePool.query<AuthenticationUserRecord>(
          `
            SELECT
              id,
              username,
              name,
              email,
              password_hash AS "passwordHash",
              created_at AS "createdAt"
            FROM users
            WHERE LOWER(username) = LOWER($1)
            LIMIT 1;
          `,
          [payload.username.trim()]
        );

      const user = result.rows[0];

      if (
        user === undefined ||
        user.passwordHash === null ||
        !(await verifyPassword(
          payload.password,
          user.passwordHash
        ))
      ) {
        sendJson(response, 401, {
          error: "Invalid username or password.",
        });
        return;
      }

      sendJson(response, 200, {
        user: getPublicUser(user),
      });
      return;
    }

    // Project collection routes validate the owner before reading or writing records.
    if (method === "GET" && path === "/projects") {
      const userId = parsePositiveInteger(
        requestUrl.searchParams.get("userId")
      );

      if (userId === null) {
        sendJson(response, 400, {
          error: "A valid userId is required.",
        });
        return;
      }

      const projects = await getProjectsForUser(userId);

      sendJson(response, 200, {
        projects,
      });
      return;
    }

    if (method === "POST" && path === "/projects") {
      const payload = await readJsonBody(request);

      if (!isCreateProjectPayload(payload)) {
        sendJson(response, 400, {
          error:
            "A valid userId and project title are required.",
        });
        return;
      }

      const project = await createProject({
        userId: payload.userId,
        title: payload.title.trim(),
        description: payload.description?.trim() ?? "",
        status: payload.status ?? "planned",
        priority: payload.priority ?? "medium",
        progress: payload.progress ?? 0,
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

    // Individual project routes use /projects/:projectId and enforce ownership in queries.
    const projectRouteMatch =
      /^\/projects\/(\d+)$/.exec(path);

    if (projectRouteMatch !== null) {
      const projectId = parsePositiveInteger(
        projectRouteMatch[1] ?? null
      );

      if (projectId === null) {
        sendJson(response, 400, {
          error: "A valid project ID is required.",
        });
        return;
      }

      if (method === "GET") {
        const userId = parsePositiveInteger(
          requestUrl.searchParams.get("userId")
        );

        if (userId === null) {
          sendJson(response, 400, {
            error: "A valid userId is required.",
          });
          return;
        }

        const project = await getProjectForUser(
          projectId,
          userId
        );

        if (project === null) {
          sendJson(response, 404, {
            error: "The requested project was not found.",
          });
          return;
        }

        sendJson(response, 200, {
          project,
        });
        return;
      }

      if (method === "PATCH") {
        const payload = await readJsonBody(request);

        if (!isUpdateProjectPayload(payload)) {
          sendJson(response, 400, {
            error:
              "Provide a valid userId and at least one project field to update.",
          });
          return;
        }

        const existingProject = await getProjectForUser(
          projectId,
          payload.userId
        );

        if (existingProject === null) {
          sendJson(response, 404, {
            error: "The requested project was not found.",
          });
          return;
        }

        const project = await updateProject({
          projectId,
          userId: payload.userId,
          title:
            payload.title?.trim() ??
            existingProject.title,
          description:
            payload.description?.trim() ??
            existingProject.description,
          status:
            payload.status ??
            existingProject.status,
          priority:
            payload.priority ??
            existingProject.priority,
          progress:
            payload.progress ??
            existingProject.progress,
          startDate:
            payload.startDate !== undefined
              ? (payload.startDate === null || payload.startDate === ""
                  ? null
                  : payload.startDate)
              : existingProject.startDate,
          targetDate:
            payload.targetDate !== undefined
              ? (payload.targetDate === null || payload.targetDate === ""
                  ? null
                  : payload.targetDate)
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
        });

        if (project === null) {
          sendJson(response, 404, {
            error: "The requested project was not found.",
          });
          return;
        }

        sendJson(response, 200, {
          project,
        });
        return;
      }

      if (method === "DELETE") {
        const userId = parsePositiveInteger(
          requestUrl.searchParams.get("userId")
        );

        if (userId === null) {
          sendJson(response, 400, {
            error: "A valid userId is required.",
          });
          return;
        }

        const projectWasDeleted = await deleteProject(
          projectId,
          userId
        );

        if (!projectWasDeleted) {
          sendJson(response, 404, {
            error: "The requested project was not found.",
          });
          return;
        }

        sendJson(response, 200, {
          message: "Project deleted successfully.",
        });
        return;
      }
    }

    /*
     * Learning-goal collection routes.
     */
    if (
      method === "GET" &&
      path === "/learning-goals"
    ) {
      const userId = parsePositiveInteger(
        requestUrl.searchParams.get("userId")
      );

      if (userId === null) {
        sendJson(response, 400, {
          error: "A valid userId is required.",
        });
        return;
      }

      const goals = await getLearningGoalsForUser(userId);

      sendJson(response, 200, {
        goals,
      });
      return;
    }

    if (
      method === "POST" &&
      path === "/learning-goals"
    ) {
      const payload = await readJsonBody(request);

      if (!isCreateLearningGoalPayload(payload)) {
        sendJson(response, 400, {
          error:
            "A valid userId, title, and target date are required.",
        });
        return;
      }

      const projectId = payload.projectId ?? null;

      if (
        projectId !== null &&
        !(await projectBelongsToUser(
          projectId,
          payload.userId
        ))
      ) {
        sendJson(response, 400, {
          error:
            "The selected project does not belong to this user.",
        });
        return;
      }

      const goal = await createLearningGoal({
        userId: payload.userId,
        projectId,
        title: payload.title.trim(),
        description: payload.description?.trim() ?? "",
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
    const goalRouteMatch =
      /^\/learning-goals\/(\d+)$/.exec(path);

    if (goalRouteMatch !== null) {
      const goalId = parsePositiveInteger(
        goalRouteMatch[1] ?? null
      );

      if (goalId === null) {
        sendJson(response, 400, {
          error: "A valid learning-goal ID is required.",
        });
        return;
      }

      if (method === "GET") {
        const userId = parsePositiveInteger(
          requestUrl.searchParams.get("userId")
        );

        if (userId === null) {
          sendJson(response, 400, {
            error: "A valid userId is required.",
          });
          return;
        }

        const goal = await getLearningGoalForUser(
          goalId,
          userId
        );

        if (goal === null) {
          sendJson(response, 404, {
            error:
              "The requested learning goal was not found.",
          });
          return;
        }

        sendJson(response, 200, {
          goal,
        });
        return;
      }

      if (method === "PATCH") {
        const payload = await readJsonBody(request);

        if (!isUpdateLearningGoalPayload(payload)) {
          sendJson(response, 400, {
            error:
              "Provide a valid userId and at least one learning-goal field to update.",
          });
          return;
        }

        const existingGoal =
          await getLearningGoalForUser(
            goalId,
            payload.userId
          );

        if (existingGoal === null) {
          sendJson(response, 404, {
            error:
              "The requested learning goal was not found.",
          });
          return;
        }

        const projectId =
          payload.projectId !== undefined
            ? payload.projectId
            : existingGoal.projectId;

        if (
          projectId !== null &&
          !(await projectBelongsToUser(
            projectId,
            payload.userId
          ))
        ) {
          sendJson(response, 400, {
            error:
              "The selected project does not belong to this user.",
          });
          return;
        }

        const goal = await updateLearningGoal({
          goalId,
          userId: payload.userId,
          projectId,
          title:
            payload.title?.trim() ??
            existingGoal.title,
          description:
            payload.description?.trim() ??
            existingGoal.description,
          status:
            payload.status ??
            existingGoal.status,
          targetDate:
            payload.targetDate !== undefined
              ? payload.targetDate
              : existingGoal.targetDate,
        });

        if (goal === null) {
          sendJson(response, 404, {
            error:
              "The requested learning goal was not found.",
          });
          return;
        }

        sendJson(response, 200, {
          goal,
        });
        return;
      }

      if (method === "DELETE") {
        const userId = parsePositiveInteger(
          requestUrl.searchParams.get("userId")
        );

        if (userId === null) {
          sendJson(response, 400, {
            error: "A valid userId is required.",
          });
          return;
        }

        const goalWasDeleted =
          await deleteLearningGoal(goalId, userId);

        if (!goalWasDeleted) {
          sendJson(response, 404, {
            error:
              "The requested learning goal was not found.",
          });
          return;
        }

        sendJson(response, 200, {
          message:
            "Learning goal deleted successfully.",
        });
        return;
      }
    }

    sendJson(response, 404, {
      error: "The requested endpoint does not exist.",
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
        error:
          "The request body must contain valid JSON.",
      });
      return;
    }

    const databaseErrorCode =
      getDatabaseErrorCode(error);

    if (databaseErrorCode === "23505") {
      sendJson(response, 409, {
        error:
          "That username or email is already being used.",
      });
      return;
    }

    if (databaseErrorCode === "23503") {
      sendJson(response, 400, {
        error:
          "The selected user or project does not exist.",
      });
      return;
    }

    console.error(
      "DevTrack could not complete the request.",
      error
    );

    sendJson(response, 500, {
      error:
        "The server could not complete the request.",
    });
  }
}

export const server = http.createServer(
  (
    request: IncomingMessage,
    response: ServerResponse
  ) => {
    void handleRequest(request, response);
  }
);

/**
 * Verifies PostgreSQL before accepting API traffic.
 */
export async function startServer(): Promise<void> {
  try {
    await verifyDatabaseConnection();

    server.listen(PORT, HOST, () => {
      console.log("Connected to PostgreSQL.");
      console.log(
        `DevTrack API running at http://${HOST}:${PORT}`
      );
    });
  } catch (error: unknown) {
    console.error(
      "DevTrack API could not connect to PostgreSQL.",
      error
    );
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== "test") {
  void startServer();
}