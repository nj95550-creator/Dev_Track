import type { QueryResultRow } from "pg";
import { databasePool } from "./database";

// Provides learning-goal persistence, including optional project links.
export type LearningGoalStatus =
  | "planned"
  | "in_progress"
  | "completed";

export interface LearningGoal extends QueryResultRow {
  id: number;
  userId: number;
  projectId: number | null;
  title: string;
  description: string;
  status: LearningGoalStatus;
  targetDate: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateLearningGoalInput {
  userId: number;
  projectId: number | null;
  title: string;
  description: string;
  targetDate: string | null;
}

export interface UpdateLearningGoalInput {
  goalId: number;
  userId: number;
  projectId: number | null;
  title: string;
  description: string;
  status: LearningGoalStatus;
  targetDate: string | null;
}

// Query projections keep database column names consistent with API responses.
/**
 * Loads every learning goal belonging to a specific DevTrack user.
 */
export async function getLearningGoalsForUser(
  userId: number
): Promise<LearningGoal[]> {
  const result = await databasePool.query<LearningGoal>(
    `
      SELECT
        id,
        user_id AS "userId",
        project_id AS "projectId",
        title,
        description,
        status,
        target_date AS "targetDate",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM learning_goals
      WHERE user_id = $1
      ORDER BY updated_at DESC;
    `,
    [userId]
  );

  return result.rows;
}

/**
 * Loads one learning goal while confirming ownership.
 */
export async function getLearningGoalForUser(
  goalId: number,
  userId: number
): Promise<LearningGoal | null> {
  const result = await databasePool.query<LearningGoal>(
    `
      SELECT
        id,
        user_id AS "userId",
        project_id AS "projectId",
        title,
        description,
        status,
        target_date AS "targetDate",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM learning_goals
      WHERE id = $1
        AND user_id = $2
      LIMIT 1;
    `,
    [goalId, userId]
  );

  return result.rows[0] ?? null;
}

/**
 * Creates a learning goal for a DevTrack user.
 */
export async function createLearningGoal(
  goal: CreateLearningGoalInput
): Promise<LearningGoal> {
  const result = await databasePool.query<LearningGoal>(
    `
      INSERT INTO learning_goals (
        user_id,
        project_id,
        title,
        description,
        target_date
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING
        id,
        user_id AS "userId",
        project_id AS "projectId",
        title,
        description,
        status,
        target_date AS "targetDate",
        created_at AS "createdAt",
        updated_at AS "updatedAt";
    `,
    [
      goal.userId,
      goal.projectId,
      goal.title,
      goal.description,
      goal.targetDate,
    ]
  );

  const createdGoal = result.rows[0];

  if (createdGoal === undefined) {
    throw new Error(
      "PostgreSQL did not return the created learning goal."
    );
  }

  return createdGoal;
}

/**
 * Updates a learning goal only when it belongs to the submitted user.
 */
export async function updateLearningGoal(
  goal: UpdateLearningGoalInput
): Promise<LearningGoal | null> {
  const result = await databasePool.query<LearningGoal>(
    `
      UPDATE learning_goals
      SET
        project_id = $3,
        title = $4,
        description = $5,
        status = $6,
        target_date = $7,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
        AND user_id = $2
      RETURNING
        id,
        user_id AS "userId",
        project_id AS "projectId",
        title,
        description,
        status,
        target_date AS "targetDate",
        created_at AS "createdAt",
        updated_at AS "updatedAt";
    `,
    [
      goal.goalId,
      goal.userId,
      goal.projectId,
      goal.title,
      goal.description,
      goal.status,
      goal.targetDate,
    ]
  );

  return result.rows[0] ?? null;
}

/**
 * Deletes a learning goal only when it belongs to the submitted user.
 */
export async function deleteLearningGoal(
  goalId: number,
  userId: number
): Promise<boolean> {
  const result = await databasePool.query(
    `
      DELETE FROM learning_goals
      WHERE id = $1
        AND user_id = $2;
    `,
    [goalId, userId]
  );

  return result.rowCount === 1;
}