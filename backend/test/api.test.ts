// The suite imports the server only after test-environment safety checks pass.
import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";

if (process.env.NODE_ENV !== "test") {
  throw new Error("Tests must run with NODE_ENV=test");
}

if (process.env.DB_NAME !== "devtrack_test") {
  throw new Error("Tests must run with DB_NAME=devtrack_test");
}

let server: typeof import("../src/server.ts").server;
let databasePool: typeof import("../src/database.ts").databasePool;

let baseUrl = "";
let firstUserId = 0;
let secondUserId = 0;
let projectId = 0;
let goalId = 0;

// Guard every destructive test reset so production databases cannot be truncated.
function assertTestDatabase(): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Tests must run with NODE_ENV=test");
  }

  if (process.env.DB_NAME !== "devtrack_test") {
    throw new Error("Tests must run with DB_NAME=devtrack_test");
  }
}

async function resetTestDatabase(): Promise<void> {
  assertTestDatabase();
  await databasePool.query(
    "TRUNCATE TABLE learning_goals, projects, users RESTART IDENTITY CASCADE"
  );
}

async function startTestServer(): Promise<string> {
  // Port 0 delegates selection to the OS and prevents collisions with app ports.
  await once(server.listen(0, "127.0.0.1"), "listening");
  const address = server.address();

  if (address === null || typeof address === "string") {
    throw new Error("The test server did not expose an ephemeral port.");
  }

  return `http://127.0.0.1:${address.port}`;
}

async function request(
  path: string,
  options: RequestInit = {}
): Promise<{ response: Response; body: any }> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  return {
    response,
    body: await response.json(),
  };
}

async function createUser(suffix: string): Promise<any> {
  const result = await request("/users", {
    method: "POST",
    body: JSON.stringify({
      username: `test_${suffix}`,
      name: `Test ${suffix}`,
      email: `test_${suffix}@example.com`,
      password: "a-secure-test-password",
    }),
  });

  assert.equal(result.response.status, 201);
  return result.body.user;
}

test.before(async () => {
  // Dynamic imports keep the safety checks ahead of pool construction.
  assertTestDatabase();
  ({ server } = await import("../src/server.ts"));
  ({ databasePool } = await import("../src/database.ts"));
  baseUrl = await startTestServer();
  await resetTestDatabase();
});

test("GET / returns the API welcome message", async () => {
  const result = await request("/");
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.body, {
    message: "Welcome to the DevTrack API.",
  });
});

test("GET /health confirms the test database connection", async () => {
  const result = await request("/health");
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.body, {
    status: "ok",
    database: "connected",
  });
});

test("GET /openapi.json returns the OpenAPI document", async () => {
  const result = await request("/openapi.json");
  assert.equal(result.response.status, 200);
  assert.equal(typeof result.body.openapi, "string");
});

test("GET /api-docs returns Swagger UI HTML", async () => {
  const response = await fetch(`${baseUrl}/api-docs`);
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.match(body, /DevTrack API Documentation/);
});

test("creates a user without exposing password_hash", async () => {
  const user = await createUser("primary");
  firstUserId = user.id;
  assert.equal(user.username, "test_primary");
  assert.equal("password_hash" in user, false);
});

test("public user responses do not contain password_hash", async () => {
  const result = await request("/users");
  assert.equal(result.response.status, 200);
  assert.equal("password_hash" in result.body.users[0], false);
});

test("rejects a duplicate username", async () => {
  const result = await request("/users", {
    method: "POST",
    body: JSON.stringify({
      username: "TEST_PRIMARY",
      name: "Another User",
      email: "another@example.com",
      password: "a-secure-test-password",
    }),
  });
  assert.equal(result.response.status, 409);
  assert.equal(result.body.error, "That username or email is already being used.");
});

test("rejects a duplicate email", async () => {
  const result = await request("/users", {
    method: "POST",
    body: JSON.stringify({
      username: "test_duplicate_email",
      name: "Another User",
      email: "TEST_PRIMARY@example.com",
      password: "a-secure-test-password",
    }),
  });
  assert.equal(result.response.status, 409);
});

test("logs in successfully", async () => {
  const result = await request("/login", {
    method: "POST",
    body: JSON.stringify({
      username: "test_primary",
      password: "a-secure-test-password",
    }),
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.user.id, firstUserId);
});

test("rejects an invalid login", async () => {
  const result = await request("/login", {
    method: "POST",
    body: JSON.stringify({
      username: "test_primary",
      password: "wrong-password-long-enough",
    }),
  });
  assert.equal(result.response.status, 401);
  assert.equal(result.body.error, "Invalid username or password.");
});

test("creates a project", async () => {
  const result = await request("/projects", {
    method: "POST",
    body: JSON.stringify({
      userId: firstUserId,
      title: "Integration project",
      description: "Initial project",
      priority: "high",
      progress: 10,
    }),
  });
  assert.equal(result.response.status, 201);
  projectId = result.body.project.id;
  assert.equal(result.body.project.title, "Integration project");
});

test("retrieves a project", async () => {
  const result = await request(`/projects/${projectId}?userId=${firstUserId}`);
  assert.equal(result.response.status, 200);
  assert.equal(result.body.project.id, projectId);
});

test("updates a project", async () => {
  const result = await request(`/projects/${projectId}`, {
    method: "PATCH",
    body: JSON.stringify({
      userId: firstUserId,
      title: "Updated integration project",
      status: "in_progress",
      progress: 50,
    }),
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.project.title, "Updated integration project");
  assert.equal(result.body.project.status, "in_progress");
});

test("validates project payloads", async () => {
  const result = await request("/projects", {
    method: "POST",
    body: JSON.stringify({
      userId: firstUserId,
      title: "",
    }),
  });
  assert.equal(result.response.status, 400);
  assert.equal(result.body.error, "A valid userId and project title are required.");
});

test("protects project ownership", async () => {
  const user = await createUser("secondary");
  secondUserId = user.id;
  const result = await request(`/projects/${projectId}?userId=${secondUserId}`);
  assert.equal(result.response.status, 404);
  assert.equal(result.body.error, "The requested project was not found.");
});

test("deletes a project", async () => {
  const result = await request(`/projects/${projectId}?userId=${firstUserId}`, {
    method: "DELETE",
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.message, "Project deleted successfully.");
});

test("creates a learning goal", async () => {
  const result = await request("/learning-goals", {
    method: "POST",
    body: JSON.stringify({
      userId: firstUserId,
      title: "Learn integration testing",
      description: "Cover the API",
      targetDate: "2026-12-31",
    }),
  });
  assert.equal(result.response.status, 201);
  goalId = result.body.goal.id;
});

test("links a learning goal to a project", async () => {
  const project = await request("/projects", {
    method: "POST",
    body: JSON.stringify({ userId: firstUserId, title: "Linked project" }),
  });
  assert.equal(project.response.status, 201);
  const result = await request(`/learning-goals/${goalId}`, {
    method: "PATCH",
    body: JSON.stringify({
      userId: firstUserId,
      projectId: project.body.project.id,
    }),
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.goal.projectId, project.body.project.id);
});

test("retrieves learning goals", async () => {
  const result = await request(`/learning-goals?userId=${firstUserId}`);
  assert.equal(result.response.status, 200);
  assert.equal(result.body.goals.some((goal: any) => goal.id === goalId), true);
});

test("updates a learning goal", async () => {
  const result = await request(`/learning-goals/${goalId}`, {
    method: "PATCH",
    body: JSON.stringify({
      userId: firstUserId,
      title: "Updated learning goal",
      description: "Updated description",
    }),
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.goal.title, "Updated learning goal");
});

test("marks a learning goal complete", async () => {
  const result = await request(`/learning-goals/${goalId}`, {
    method: "PATCH",
    body: JSON.stringify({ userId: firstUserId, status: "completed" }),
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.goal.status, "completed");
});

test("reopens a learning goal", async () => {
  const result = await request(`/learning-goals/${goalId}`, {
    method: "PATCH",
    body: JSON.stringify({ userId: firstUserId, status: "in_progress" }),
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.goal.status, "in_progress");
});

test("protects learning-goal ownership", async () => {
  const result = await request(`/learning-goals/${goalId}?userId=${secondUserId}`);
  assert.equal(result.response.status, 404);
  assert.equal(result.body.error, "The requested learning goal was not found.");
});

test("deletes a learning goal", async () => {
  const result = await request(`/learning-goals/${goalId}?userId=${firstUserId}`, {
    method: "DELETE",
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.message, "Learning goal deleted successfully.");
});

test("rejects invalid IDs, missing userId, and missing resources", async () => {
  const invalidProjectId = await request("/projects/not-a-number?userId=1");
  assert.equal(invalidProjectId.response.status, 404);
  assert.equal(invalidProjectId.body.error, "The requested endpoint does not exist.");

  const missingUserId = await request("/projects");
  assert.equal(missingUserId.response.status, 400);
  assert.equal(missingUserId.body.error, "A valid userId is required.");

  const missingProject = await request("/projects/999999?userId=1");
  assert.equal(missingProject.response.status, 404);
  assert.equal(missingProject.body.error, "The requested project was not found.");

  const missingGoal = await request("/learning-goals/999999?userId=1");
  assert.equal(missingGoal.response.status, 404);
  assert.equal(missingGoal.body.error, "The requested learning goal was not found.");
});

// Cleanup resets only devtrack_test, then closes the HTTP server and pool cleanly.
test.after(async () => {
  assertTestDatabase();
  await resetTestDatabase();
  await once(server.close(), "close");
  await databasePool.end();
});
