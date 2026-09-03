// Defines the public API contract served by /openapi.json and Swagger UI.
type JsonObject = Record<string, unknown>;

type OpenApiSchema = {
  type?: string | string[];
  format?: string;
  description?: string;
  nullable?: boolean;
  example?: unknown;
  items?: JsonObject;
  properties?: Record<string, JsonObject>;
  required?: string[];
  enum?: string[];
  oneOf?: JsonObject[];
  allOf?: JsonObject[];
  additionalProperties?: boolean;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  pattern?: string;
};

type OpenApiOperation = {
  summary: string;
  description: string;
  parameters?: JsonObject[];
  requestBody?: JsonObject;
  responses: Record<string, JsonObject>;
};

type OpenApiDocument = {
  openapi: string;
  info: {
    title: string;
    version: string;
    description: string;
  };
  servers: Array<{ url: string; description: string }>;
  paths: Record<string, Record<string, OpenApiOperation>>;
  components: {
    schemas: Record<string, OpenApiSchema>;
  };
};

const publicUserSchema: OpenApiSchema = {
  type: "object",
  description: "User details returned by the API without password data.",
  properties: {
    id: {
      type: "integer",
      example: 1,
    },
    username: {
      type: "string",
      example: "dev_user",
    },
    name: {
      type: "string",
      example: "Dev User",
    },
    email: {
      type: "string",
      format: "email",
      example: "dev@example.com",
    },
    createdAt: {
      type: "string",
      format: "date-time",
      example: "2026-09-01T05:00:00.000Z",
    },
  },
  required: ["id", "username", "name", "email", "createdAt"],
};

// Shared error and resource schemas keep response documentation consistent.
const errorSchema: OpenApiSchema = {
  type: "object",
  properties: {
    error: {
      type: "string",
      example: "A valid userId is required.",
    },
  },
  required: ["error"],
};

const projectSchema: OpenApiSchema = {
  type: "object",
  description: "A DevTrack project record.",
  properties: {
    id: {
      type: "integer",
      example: 12,
    },
    userId: {
      type: "integer",
      example: 1,
    },
    title: {
      type: "string",
      example: "Portfolio refresh",
    },
    description: {
      type: "string",
      example: "Refresh the portfolio landing page and resume content.",
    },
    status: {
      type: "string",
      enum: ["planned", "in_progress", "completed"],
      example: "planned",
    },
    priority: {
      type: "string",
      enum: ["low", "medium", "high"],
      example: "medium",
    },
    progress: {
      type: "integer",
      minimum: 0,
      maximum: 100,
      example: 42,
    },
    startDate: {
      type: ["string", "null"],
      format: "date",
      nullable: true,
      example: "2026-09-01",
    },
    targetDate: {
      type: ["string", "null"],
      format: "date",
      nullable: true,
      example: "2026-10-15",
    },
    technologies: {
      type: ["string", "null"],
      nullable: true,
      example: "TypeScript, React, PostgreSQL",
    },
    repositoryUrl: {
      type: ["string", "null"],
      nullable: true,
      format: "uri",
      example: "https://github.com/example/project",
    },
    liveUrl: {
      type: ["string", "null"],
      nullable: true,
      format: "uri",
      example: "https://example.com",
    },
    createdAt: {
      type: "string",
      format: "date-time",
      example: "2026-09-01T05:00:00.000Z",
    },
    updatedAt: {
      type: "string",
      format: "date-time",
      example: "2026-09-01T05:00:00.000Z",
    },
  },
  required: [
    "id",
    "userId",
    "title",
    "description",
    "status",
    "priority",
    "progress",
    "startDate",
    "targetDate",
    "technologies",
    "repositoryUrl",
    "liveUrl",
    "createdAt",
    "updatedAt",
  ],
};

const learningGoalSchema: OpenApiSchema = {
  type: "object",
  description: "A DevTrack learning goal associated with a user and optional project.",
  properties: {
    id: {
      type: "integer",
      example: 27,
    },
    userId: {
      type: "integer",
      example: 1,
    },
    projectId: {
      type: ["integer", "null"],
      nullable: true,
      example: 12,
    },
    title: {
      type: "string",
      example: "Strengthen TypeScript patterns",
    },
    description: {
      type: "string",
      example: "Review advanced utility types and generics before next sprint.",
    },
    status: {
      type: "string",
      enum: ["planned", "in_progress", "completed"],
      example: "in_progress",
    },
    targetDate: {
      type: ["string", "null"],
      format: "date",
      nullable: true,
      example: "2026-09-15",
    },
    createdAt: {
      type: "string",
      format: "date-time",
      example: "2026-09-01T05:00:00.000Z",
    },
    updatedAt: {
      type: "string",
      format: "date-time",
      example: "2026-09-01T05:00:00.000Z",
    },
  },
  required: [
    "id",
    "userId",
    "projectId",
    "title",
    "description",
    "status",
    "targetDate",
    "createdAt",
    "updatedAt",
  ],
};

// Request schemas mirror the server validators for create and update payloads.
const createUserRequestSchema: OpenApiSchema = {
  type: "object",
  required: ["username", "name", "email", "password"],
  properties: {
    username: {
      type: "string",
      pattern: "^[A-Za-z0-9_-]{3,50}$",
      example: "dev_user",
    },
    name: {
      type: "string",
      minLength: 1,
      maxLength: 100,
      example: "Dev User",
    },
    email: {
      type: "string",
      format: "email",
      example: "dev@example.com",
    },
    password: {
      type: "string",
      minLength: 15,
      maxLength: 128,
      example: "StrongPassword123!",
    },
  },
};

const loginRequestSchema: OpenApiSchema = {
  type: "object",
  required: ["username", "password"],
  properties: {
    username: {
      type: "string",
      example: "dev_user",
    },
    password: {
      type: "string",
      example: "StrongPassword123!",
    },
  },
};

const projectCreateRequestSchema: OpenApiSchema = {
  type: "object",
  required: ["userId", "title"],
  properties: {
    userId: {
      type: "integer",
      minimum: 1,
      example: 1,
    },
    title: {
      type: "string",
      minLength: 1,
      maxLength: 150,
      example: "Portfolio refresh",
    },
    description: {
      type: "string",
      maxLength: 5000,
      example: "Refine the portfolio design and content.",
    },
    status: {
      type: "string",
      enum: ["planned", "in_progress", "completed"],
      example: "planned",
    },
    priority: {
      type: "string",
      enum: ["low", "medium", "high"],
      example: "medium",
    },
    progress: {
      type: "integer",
      minimum: 0,
      maximum: 100,
      example: 25,
    },
    startDate: {
      type: ["string", "null"],
      format: "date",
      nullable: true,
      example: "2026-09-01",
    },
    targetDate: {
      type: ["string", "null"],
      format: "date",
      nullable: true,
      example: "2026-10-15",
    },
    technologies: {
      type: ["string", "null"],
      nullable: true,
      example: "TypeScript, React, PostgreSQL",
    },
    repositoryUrl: {
      type: ["string", "null"],
      nullable: true,
      format: "uri",
      example: "https://github.com/example/project",
    },
    liveUrl: {
      type: ["string", "null"],
      nullable: true,
      format: "uri",
      example: "https://example.com",
    },
  },
};

const projectUpdateRequestSchema: OpenApiSchema = {
  type: "object",
  required: ["userId"],
  properties: {
    userId: {
      type: "integer",
      minimum: 1,
      example: 1,
    },
    title: {
      type: "string",
      minLength: 1,
      maxLength: 150,
      example: "Portfolio refresh",
    },
    description: {
      type: "string",
      maxLength: 5000,
      example: "Updated portfolio and design system notes.",
    },
    status: {
      type: "string",
      enum: ["planned", "in_progress", "completed"],
      example: "in_progress",
    },
    priority: {
      type: "string",
      enum: ["low", "medium", "high"],
      example: "high",
    },
    progress: {
      type: "integer",
      minimum: 0,
      maximum: 100,
      example: 60,
    },
    startDate: {
      type: ["string", "null"],
      format: "date",
      nullable: true,
      example: "2026-09-01",
    },
    targetDate: {
      type: ["string", "null"],
      format: "date",
      nullable: true,
      example: "2026-10-15",
    },
    technologies: {
      type: ["string", "null"],
      nullable: true,
      example: "TypeScript, React",
    },
    repositoryUrl: {
      type: ["string", "null"],
      nullable: true,
      format: "uri",
      example: "https://github.com/example/project",
    },
    liveUrl: {
      type: ["string", "null"],
      nullable: true,
      format: "uri",
      example: "https://example.com",
    },
  },
};

const learningGoalCreateRequestSchema: OpenApiSchema = {
  type: "object",
  required: ["userId", "title", "targetDate"],
  properties: {
    userId: {
      type: "integer",
      minimum: 1,
      example: 1,
    },
    projectId: {
      type: ["integer", "null"],
      nullable: true,
      example: 12,
    },
    title: {
      type: "string",
      minLength: 1,
      maxLength: 150,
      example: "Strengthen TypeScript patterns",
    },
    description: {
      type: "string",
      maxLength: 5000,
      example: "Review utility types and generic constraints.",
    },
    targetDate: {
      type: ["string", "null"],
      format: "date",
      nullable: true,
      example: "2026-09-15",
    },
  },
};

const learningGoalUpdateRequestSchema: OpenApiSchema = {
  type: "object",
  required: ["userId"],
  properties: {
    userId: {
      type: "integer",
      minimum: 1,
      example: 1,
    },
    projectId: {
      type: ["integer", "null"],
      nullable: true,
      example: 12,
    },
    title: {
      type: "string",
      minLength: 1,
      maxLength: 150,
      example: "Strengthen TypeScript patterns",
    },
    description: {
      type: "string",
      maxLength: 5000,
      example: "Add practical generics exercises to the next sprint backlog.",
    },
    status: {
      type: "string",
      enum: ["planned", "in_progress", "completed"],
      example: "completed",
    },
    targetDate: {
      type: ["string", "null"],
      format: "date",
      nullable: true,
      example: "2026-09-15",
    },
  },
};

export const openApiDocument: OpenApiDocument = {
  // The document groups service, authentication, project, and goal operations.
  openapi: "3.0.3",
  info: {
    title: "DevTrack API",
    version: "1.0.0",
    description:
      "API documentation for the DevTrack project workspace, built against the current native Node HTTP backend.",
  },
  servers: [{
    url: "http://localhost:3000",
    description: "Local DevTrack backend",
  }],
  paths: {
    "/": {
      get: {
        summary: "API welcome message",
        description: "Returns a simple welcome payload for the DevTrack API.",
        responses: {
          "200": {
            description: "Welcome response",
            content: {
              "application/json": {
                example: {
                  message: "Welcome to the DevTrack API.",
                },
              },
            },
          },
        },
      },
    },
    "/health": {
      get: {
        summary: "Database health check",
        description: "Verifies PostgreSQL connectivity before accepting API traffic.",
        responses: {
          "200": {
            description: "Database is connected",
            content: {
              "application/json": {
                example: {
                  status: "ok",
                  database: "connected",
                },
              },
            },
          },
          "500": {
            description: "Server or database error",
            content: {
              "application/json": {
                example: {
                  error: "The server could not complete the request.",
                },
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/users": {
      get: {
        summary: "List all users",
        description: "Returns the public user records for all DevTrack users.",
        responses: {
          "200": {
            description: "All public users.",
            content: {
              "application/json": {
                example: {
                  users: [
                    {
                      id: 1,
                      username: "dev_user",
                      name: "Dev User",
                      email: "dev@example.com",
                      createdAt: "2026-09-01T05:00:00.000Z",
                    },
                  ],
                },
              },
            },
          },
        },
      },
      post: {
        summary: "Create a user",
        description: "Creates a new DevTrack account using a username, name, email, and password.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateUserRequest" },
            },
          },
        },
        responses: {
          "201": {
            description: "User created successfully.",
            content: {
              "application/json": {
                example: {
                  user: {
                    id: 1,
                    username: "dev_user",
                    name: "Dev User",
                    email: "dev@example.com",
                    createdAt: "2026-09-01T05:00:00.000Z",
                  },
                },
              },
            },
          },
          "400": {
            description: "Invalid request body or validation failure.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          "409": {
            description: "Username or email already exists.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/login": {
      post: {
        summary: "Authenticate a user",
        description: "Validates a username and password and returns the public user record when successful.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/LoginRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "Authentication succeeded.",
            content: {
              "application/json": {
                example: {
                  user: {
                    id: 1,
                    username: "dev_user",
                    name: "Dev User",
                    email: "dev@example.com",
                    createdAt: "2026-09-01T05:00:00.000Z",
                  },
                },
              },
            },
          },
          "400": {
            description: "Invalid request payload.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          "401": {
            description: "Invalid username or password.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/projects": {
      get: {
        summary: "List a user's projects",
        description: "Returns every project for the selected user. The userId query parameter is required and must be a positive integer.",
        parameters: [{
          in: "query",
          name: "userId",
          required: true,
          schema: { type: "integer", minimum: 1 },
          description: "Positive integer user identifier for the project owner.",
        }],
        responses: {
          "200": {
            description: "Projects for the selected user.",
            content: {
              "application/json": {
                example: {
                  projects: [
                    {
                      id: 12,
                      userId: 1,
                      title: "Portfolio refresh",
                      description: "Refine the portfolio design and content.",
                      status: "planned",
                      priority: "medium",
                      progress: 25,
                      startDate: "2026-09-01",
                      targetDate: "2026-10-15",
                      technologies: "TypeScript, React, PostgreSQL",
                      repositoryUrl: "https://github.com/example/project",
                      liveUrl: "https://example.com",
                      createdAt: "2026-09-01T05:00:00.000Z",
                      updatedAt: "2026-09-01T05:00:00.000Z",
                    },
                  ],
                },
              },
            },
          },
          "400": {
            description: "Missing or invalid userId.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
      post: {
        summary: "Create a project",
        description: "Creates a project that belongs to a specific user.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateProjectRequest" },
            },
          },
        },
        responses: {
          "201": {
            description: "Project created successfully.",
            content: {
              "application/json": {
                example: {
                  project: {
                    id: 12,
                    userId: 1,
                    title: "Portfolio refresh",
                    description: "Refine the portfolio design and content.",
                    status: "planned",
                    priority: "medium",
                    progress: 25,
                    startDate: "2026-09-01",
                    targetDate: "2026-10-15",
                    technologies: "TypeScript, React, PostgreSQL",
                    repositoryUrl: "https://github.com/example/project",
                    liveUrl: "https://example.com",
                    createdAt: "2026-09-01T05:00:00.000Z",
                    updatedAt: "2026-09-01T05:00:00.000Z",
                  },
                },
              },
            },
          },
          "400": {
            description: "Invalid request or missing userId/title.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/projects/{projectId}": {
      get: {
        summary: "Fetch one project",
        description: "Returns one project when it belongs to the supplied userId.",
        parameters: [{
          in: "path",
          name: "projectId",
          required: true,
          schema: { type: "integer", minimum: 1 },
          description: "Positive integer project identifier.",
        }, {
          in: "query",
          name: "userId",
          required: true,
          schema: { type: "integer", minimum: 1 },
          description: "Positive integer user identifier for the owner of the project.",
        }],
        responses: {
          "200": {
            description: "The selected project.",
            content: {
              "application/json": {
                example: {
                  project: {
                    id: 12,
                    userId: 1,
                    title: "Portfolio refresh",
                    description: "Refine the portfolio design and content.",
                    status: "planned",
                    priority: "medium",
                    progress: 25,
                    startDate: "2026-09-01",
                    targetDate: "2026-10-15",
                    technologies: "TypeScript, React, PostgreSQL",
                    repositoryUrl: "https://github.com/example/project",
                    liveUrl: "https://example.com",
                    createdAt: "2026-09-01T05:00:00.000Z",
                    updatedAt: "2026-09-01T05:00:00.000Z",
                  },
                },
              },
            },
          },
          "400": {
            description: "Missing or invalid userId or projectId.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          "404": {
            description: "Project not found for this user.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
      patch: {
        summary: "Update one project",
        description: "Updates a project when it belongs to the supplied userId. A valid userId and at least one project field are required.",
        parameters: [{
          in: "path",
          name: "projectId",
          required: true,
          schema: { type: "integer", minimum: 1 },
          description: "Positive integer project identifier.",
        }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdateProjectRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "Project updated successfully.",
            content: {
              "application/json": {
                example: {
                  project: {
                    id: 12,
                    userId: 1,
                    title: "Portfolio refresh",
                    description: "Updated portfolio and content plan.",
                    status: "in_progress",
                    priority: "high",
                    progress: 60,
                    startDate: "2026-09-01",
                    targetDate: "2026-10-15",
                    technologies: "TypeScript, React",
                    repositoryUrl: "https://github.com/example/project",
                    liveUrl: "https://example.com",
                    createdAt: "2026-09-01T05:00:00.000Z",
                    updatedAt: "2026-09-01T05:00:00.000Z",
                  },
                },
              },
            },
          },
          "400": {
            description: "Invalid update payload.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          "404": {
            description: "Project not found for this user.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
      delete: {
        summary: "Delete one project",
        description: "Deletes a project when it belongs to the supplied userId.",
        parameters: [{
          in: "path",
          name: "projectId",
          required: true,
          schema: { type: "integer", minimum: 1 },
          description: "Positive integer project identifier.",
        }, {
          in: "query",
          name: "userId",
          required: true,
          schema: { type: "integer", minimum: 1 },
          description: "Positive integer user identifier for the owner of the project.",
        }],
        responses: {
          "200": {
            description: "Project deleted successfully.",
            content: {
              "application/json": {
                example: {
                  message: "Project deleted successfully.",
                },
              },
            },
          },
          "400": {
            description: "Missing or invalid userId.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          "404": {
            description: "Project not found for this user.",
            content: {
              "application/json": {
                example: {
                  error: "The requested project was not found.",
                },
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/learning-goals": {
      get: {
        summary: "List a user's learning goals",
        description: "Returns every learning goal for the selected user. The userId query parameter is required and must be a positive integer.",
        parameters: [{
          in: "query",
          name: "userId",
          required: true,
          schema: { type: "integer", minimum: 1 },
          description: "Positive integer user identifier for the goal owner.",
        }],
        responses: {
          "200": {
            description: "Learning goals for the selected user.",
            content: {
              "application/json": {
                example: {
                  goals: [
                    {
                      id: 27,
                      userId: 1,
                      projectId: 12,
                      title: "Strengthen TypeScript patterns",
                      description: "Review advanced utilities and generics",
                      status: "in_progress",
                      targetDate: "2026-09-15",
                      createdAt: "2026-09-01T05:00:00.000Z",
                      updatedAt: "2026-09-01T05:00:00.000Z",
                    },
                  ],
                },
              },
            },
          },
          "400": {
            description: "Missing or invalid userId.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
      post: {
        summary: "Create a learning goal",
        description: "Creates a learning goal for the selected user and optionally associates it with an owned project.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateLearningGoalRequest" },
            },
          },
        },
        responses: {
          "201": {
            description: "Learning goal created successfully.",
            content: {
              "application/json": {
                example: {
                  goal: {
                    id: 27,
                    userId: 1,
                    projectId: 12,
                    title: "Strengthen TypeScript patterns",
                    description: "Review advanced utilities and generics",
                    status: "in_progress",
                    targetDate: "2026-09-15",
                    createdAt: "2026-09-01T05:00:00.000Z",
                    updatedAt: "2026-09-01T05:00:00.000Z",
                  },
                },
              },
            },
          },
          "400": {
            description: "Invalid request payload or project ownership mismatch.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/learning-goals/{goalId}": {
      get: {
        summary: "Fetch one learning goal",
        description: "Returns one learning goal when it belongs to the supplied userId.",
        parameters: [{
          in: "path",
          name: "goalId",
          required: true,
          schema: { type: "integer", minimum: 1 },
          description: "Positive integer learning-goal identifier.",
        }, {
          in: "query",
          name: "userId",
          required: true,
          schema: { type: "integer", minimum: 1 },
          description: "Positive integer user identifier for the goal owner.",
        }],
        responses: {
          "200": {
            description: "The selected learning goal.",
            content: {
              "application/json": {
                example: {
                  goal: {
                    id: 27,
                    userId: 1,
                    projectId: 12,
                    title: "Strengthen TypeScript patterns",
                    description: "Review advanced utilities and generics",
                    status: "in_progress",
                    targetDate: "2026-09-15",
                    createdAt: "2026-09-01T05:00:00.000Z",
                    updatedAt: "2026-09-01T05:00:00.000Z",
                  },
                },
              },
            },
          },
          "400": {
            description: "Missing or invalid userId or goalId.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          "404": {
            description: "Learning goal not found for this user.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
      patch: {
        summary: "Update one learning goal",
        description: "Updates a learning goal when it belongs to the supplied userId. A valid userId and at least one learning-goal field are required.",
        parameters: [{
          in: "path",
          name: "goalId",
          required: true,
          schema: { type: "integer", minimum: 1 },
          description: "Positive integer learning-goal identifier.",
        }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdateLearningGoalRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "Learning goal updated successfully.",
            content: {
              "application/json": {
                example: {
                  goal: {
                    id: 27,
                    userId: 1,
                    projectId: 12,
                    title: "Strengthen TypeScript patterns",
                    description: "Updated notes and next sprint focus.",
                    status: "completed",
                    targetDate: "2026-09-15",
                    createdAt: "2026-09-01T05:00:00.000Z",
                    updatedAt: "2026-09-01T05:00:00.000Z",
                  },
                },
              },
            },
          },
          "400": {
            description: "Invalid update payload or project ownership mismatch.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          "404": {
            description: "Learning goal not found for this user.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
      delete: {
        summary: "Delete one learning goal",
        description: "Deletes a learning goal when it belongs to the supplied userId.",
        parameters: [{
          in: "path",
          name: "goalId",
          required: true,
          schema: { type: "integer", minimum: 1 },
          description: "Positive integer learning-goal identifier.",
        }, {
          in: "query",
          name: "userId",
          required: true,
          schema: { type: "integer", minimum: 1 },
          description: "Positive integer user identifier for the goal owner.",
        }],
        responses: {
          "200": {
            description: "Learning goal deleted successfully.",
            content: {
              "application/json": {
                example: {
                  message: "Learning goal deleted successfully.",
                },
              },
            },
          },
          "400": {
            description: "Missing or invalid userId.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          "404": {
            description: "Learning goal not found for this user.",
            content: {
              "application/json": {
                example: {
                  error: "The requested learning goal was not found.",
                },
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      PublicUser: publicUserSchema,
      ErrorResponse: errorSchema,
      Project: projectSchema,
      LearningGoal: learningGoalSchema,
      CreateUserRequest: createUserRequestSchema,
      LoginRequest: loginRequestSchema,
      CreateProjectRequest: projectCreateRequestSchema,
      UpdateProjectRequest: projectUpdateRequestSchema,
      CreateLearningGoalRequest: learningGoalCreateRequestSchema,
      UpdateLearningGoalRequest: learningGoalUpdateRequestSchema,
    },
  },
};
