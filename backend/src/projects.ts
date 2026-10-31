/**
 * SQL repository for projects. Parameterized values remain separate from SQL,
 * and owner-scoped predicates enforce account separation even for direct API calls.
 * Calendar dates are returned as date-only strings for browser date inputs.
 */
import type { QueryResultRow } from 'pg';
import { databasePool, type DatabaseQuery } from './database';

export type ProjectStatus = 'planned' | 'in_progress' | 'completed';

export type ProjectPriority = 'low' | 'medium' | 'high';

export interface Project extends QueryResultRow {
  id: number;
  userId: number;
  title: string;
  description: string;
  status: ProjectStatus;
  priority: ProjectPriority;
  progress: number;
  startDate: string | null;
  targetDate: string | null;
  technologies: string | null;
  repositoryUrl: string | null;
  liveUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateProjectInput {
  userId: number;
  title: string;
  description: string;
  status?: ProjectStatus;
  priority?: ProjectPriority;
  progress?: number;
  startDate?: string | null;
  targetDate?: string | null;
  technologies?: string | null;
  repositoryUrl?: string | null;
  liveUrl?: string | null;
}

export interface UpdateProjectInput {
  projectId: number;
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

/**
 * Return only the verified owner's projects, newest edits first. SQL aliases
 * map database snake_case columns to the camelCase API contract.
 */
export async function getProjectsForUser(userId: number): Promise<Project[]> {
  const result = await databasePool.query<Project>(
    `
      SELECT
        id,
        user_id AS "userId",
        title,
        description,
        status,
        priority,
        progress,
        start_date::text AS "startDate",
        target_date::text AS "targetDate",
        technologies,
        repository_url AS "repositoryUrl",
        live_url AS "liveUrl",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM projects
      WHERE user_id = $1
      ORDER BY updated_at DESC;
    `,
    [userId],
  );

  return result.rows;
}

/**
 * Return one owner-scoped project or null. forUpdate is used with a supplied
 * transaction query to hold the row lock while a partial edit is read and merged.
 */
export async function getProjectForUser(
  projectId: number,
  userId: number,
  query: DatabaseQuery = databasePool.query,
  forUpdate = false,
): Promise<Project | null> {
  const result = await query<Project>(
    `
      SELECT
        id,
        user_id AS "userId",
        title,
        description,
        status,
        priority,
        progress,
        start_date::text AS "startDate",
        target_date::text AS "targetDate",
        technologies,
        repository_url AS "repositoryUrl",
        live_url AS "liveUrl",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM projects
      WHERE id = $1
        AND user_id = $2
      LIMIT 1 ${forUpdate ? 'FOR UPDATE' : ''};
    `,
    [projectId, userId],
  );

  return result.rows[0] ?? null;
}

/**
 * Insert validated project fields under the verified owner ID and return
 * the stored record, including database-generated ID and timestamps.
 */
export async function createProject(project: CreateProjectInput): Promise<Project> {
  const result = await databasePool.query<Project>(
    `
      INSERT INTO projects (
        user_id,
        title,
        description,
        status,
        priority,
        progress,
        start_date,
        target_date,
        technologies,
        repository_url,
        live_url
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING
        id,
        user_id AS "userId",
        title,
        description,
        status,
        priority,
        progress,
        start_date::text AS "startDate",
        target_date::text AS "targetDate",
        technologies,
        repository_url AS "repositoryUrl",
        live_url AS "liveUrl",
        created_at AS "createdAt",
        updated_at AS "updatedAt";
    `,
    [
      project.userId,
      project.title,
      project.description,
      project.status ?? 'planned',
      project.priority ?? 'medium',
      project.progress ?? 0,
      project.startDate ?? null,
      project.targetDate ?? null,
      project.technologies ?? null,
      project.repositoryUrl ?? null,
      project.liveUrl ?? null,
    ],
  );

  const createdProject = result.rows[0];

  if (createdProject === undefined) {
    throw new Error('PostgreSQL did not return the created project.');
  }

  return createdProject;
}

/**
 * Write the complete record assembled by the route's locked read/merge.
 * This repository method is not a raw PATCH merger; omitted input values have
 * defaults, so callers must preserve unchanged fields before invoking it.
 */
export async function updateProject(
  project: UpdateProjectInput,
  query: DatabaseQuery = databasePool.query,
): Promise<Project | null> {
  const result = await query<Project>(
    `
      UPDATE projects
      SET
        title = $3,
        description = $4,
        status = $5,
        priority = $6,
        progress = $7,
        start_date = $8,
        target_date = $9,
        technologies = $10,
        repository_url = $11,
        live_url = $12,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
        AND user_id = $2
      RETURNING
        id,
        user_id AS "userId",
        title,
        description,
        status,
        priority,
        progress,
        start_date::text AS "startDate",
        target_date::text AS "targetDate",
        technologies,
        repository_url AS "repositoryUrl",
        live_url AS "liveUrl",
        created_at AS "createdAt",
        updated_at AS "updatedAt";
    `,
    [
      project.projectId,
      project.userId,
      project.title ?? '',
      project.description ?? '',
      project.status ?? 'planned',
      project.priority ?? 'medium',
      project.progress ?? 0,
      project.startDate ?? null,
      project.targetDate ?? null,
      project.technologies ?? null,
      project.repositoryUrl ?? null,
      project.liveUrl ?? null,
    ],
  );

  return result.rows[0] ?? null;
}

/**
 * Delete only the matching owner's project and report whether one row changed.
 * The foreign key keeps related goals and clears their project_id automatically.
 */
export async function deleteProject(projectId: number, userId: number): Promise<boolean> {
  const result = await databasePool.query(
    `
      DELETE FROM projects
      WHERE id = $1
        AND user_id = $2;
    `,
    [projectId, userId],
  );

  return result.rowCount === 1;
}
