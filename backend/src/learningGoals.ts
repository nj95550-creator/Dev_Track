/**
 * SQL repository for learning goals. Every lookup and mutation includes the
 * verified owner ID; optional query functions let callers keep related edits
 * and row locks on the same transaction connection.
 */
import type { QueryResultRow } from 'pg';
import { databasePool, type DatabaseQuery } from './database';

export type LearningGoalStatus = 'planned' | 'in_progress' | 'completed';

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
  status?: LearningGoalStatus;
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

/**
 * Return the verified owner's goals with nullable project links and date-only
 * strings, using SQL aliases that match the frontend response contract.
 */
export async function getLearningGoalsForUser(userId: number): Promise<LearningGoal[]> {
  const result = await databasePool.query<LearningGoal>(
    `
      SELECT
        id,
        user_id AS "userId",
        project_id AS "projectId",
        title,
        description,
        status,
        target_date::text AS "targetDate",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM learning_goals
      WHERE user_id = $1
      ORDER BY updated_at DESC;
    `,
    [userId],
  );

  return result.rows;
}

/**
 * Read one owner-scoped goal or null. A transaction-scoped forUpdate lookup
 * holds the row while the route merges a concurrent-safe partial edit.
 */
export async function getLearningGoalForUser(
  goalId: number,
  userId: number,
  query: DatabaseQuery = databasePool.query,
  forUpdate = false,
): Promise<LearningGoal | null> {
  const result = await query<LearningGoal>(
    `
      SELECT
        id,
        user_id AS "userId",
        project_id AS "projectId",
        title,
        description,
        status,
        target_date::text AS "targetDate",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM learning_goals
      WHERE id = $1
        AND user_id = $2
      LIMIT 1 ${forUpdate ? 'FOR UPDATE' : ''};
    `,
    [goalId, userId],
  );

  return result.rows[0] ?? null;
}

/**
 * Insert validated goal fields and return the stored record. The route must
 * verify that a non-null projectId belongs to the same account before calling.
 */
export async function createLearningGoal(goal: CreateLearningGoalInput): Promise<LearningGoal> {
  const result = await databasePool.query<LearningGoal>(
    `
      INSERT INTO learning_goals (
        user_id,
        project_id,
        title,
        description,
        target_date,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING
        id,
        user_id AS "userId",
        project_id AS "projectId",
        title,
        description,
        status,
        target_date::text AS "targetDate",
        created_at AS "createdAt",
        updated_at AS "updatedAt";
    `,
    [
      goal.userId,
      goal.projectId,
      goal.title,
      goal.description,
      goal.targetDate,
      goal.status ?? 'planned',
    ],
  );

  const createdGoal = result.rows[0];

  if (createdGoal === undefined) {
    throw new Error('PostgreSQL did not return the created learning goal.');
  }

  return createdGoal;
}

/**
 * Write the complete goal assembled by the route's locked merge, including
 * explicit nulls that remove a project link or date. Ownership remains part
 * of the UPDATE predicate even after the route's earlier lookup.
 */
export async function updateLearningGoal(
  goal: UpdateLearningGoalInput,
  query: DatabaseQuery = databasePool.query,
): Promise<LearningGoal | null> {
  const result = await query<LearningGoal>(
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
        target_date::text AS "targetDate",
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
    ],
  );

  return result.rows[0] ?? null;
}

/**
 * Delete only the owner's matching goal and report whether a row was removed.
 */
export async function deleteLearningGoal(goalId: number, userId: number): Promise<boolean> {
  const result = await databasePool.query(
    `
      DELETE FROM learning_goals
      WHERE id = $1
        AND user_id = $2;
    `,
    [goalId, userId],
  );

  return result.rowCount === 1;
}
