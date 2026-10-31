/**
 * Runtime guards for untrusted request bodies and route IDs. TypeScript types
 * alone cannot validate network input; these checks enforce field limits,
 * calendar-date rules and allowed values before repository functions run.
 */
import type { QueryResultRow } from 'pg';
import type { ProjectPriority, ProjectStatus } from './projects';
import type { LearningGoalStatus } from './learningGoals';
import { isValidPassword } from './password';

export interface UserRecord extends QueryResultRow {
  id: number;
  username: string;
  name: string;
  email: string;
  isDemo: boolean;
  createdAt: Date;
}

export interface AuthenticationUserRecord extends UserRecord {
  passwordHash: string | null;
}

export interface CreateUserPayload {
  username: string;
  name: string;
  email: string;
  password: string;
}

export interface LoginPayload {
  username: string;
  password: string;
}

export interface CreateProjectPayload {
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

export interface UpdateProjectPayload {
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

export interface CreateLearningGoalPayload {
  userId: number;
  status?: LearningGoalStatus;
  projectId?: number | null;
  title: string;
  description?: string;
  targetDate?: string | null;
}

export interface UpdateLearningGoalPayload {
  userId: number;
  projectId?: number | null;
  title?: string;
  description?: string;
  status?: LearningGoalStatus;
  targetDate?: string | null;
}

/**
 * Narrow untrusted JSON to a non-null object; arrays are not payload records.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Accept only safe positive IDs representable by PostgreSQL INTEGER columns.
 */
export function isPositiveInteger(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isSafeInteger(value) && value <= 2147483647 && value > 0
  );
}

/**
 * Parse a decimal route ID without accepting signs, fractions or trailing text.
 * Return null so the router can issue a validation response instead of querying.
 */
export function parsePositiveInteger(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) {
    return null;
  }

  const parsedValue = Number(value);

  return Number.isSafeInteger(parsedValue) && parsedValue <= 2147483647 && parsedValue > 0
    ? parsedValue
    : null;
}

/**
 * Check the trimmed login identifier against the shared length/character policy.
 */
export function isValidUsername(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{3,50}$/.test(value.trim());
}

/**
 * Count trimmed Unicode code points and reject null bytes before database storage.
 */
export function isValidName(value: unknown): value is string {
  if (typeof value !== 'string' || value.includes('\0')) {
    return false;
  }

  const characterCount = Array.from(value.trim()).length;

  return characterCount >= 1 && characterCount <= 100;
}

/**
 * Apply a bounded email shape check; this does not verify mailbox ownership.
 */
export function isValidEmail(value: unknown): value is string {
  if (typeof value !== 'string' || value.includes('\0')) {
    return false;
  }

  const normalizedEmail = value.trim();

  return normalizedEmail.length <= 255 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
}

/**
 * Require a non-empty bounded title and reject null bytes that PostgreSQL text cannot store.
 */
export function isValidProjectTitle(value: unknown): value is string {
  return (
    typeof value === 'string' && !value.includes('\0') &&
    value.trim().length >= 1 && value.trim().length <= 150
  );
}

/**
 * Allow empty descriptions while bounding stored text and rejecting null bytes.
 */
export function isValidDescription(value: unknown): value is string {
  return typeof value === 'string' && !value.includes('\0') && value.length <= 5000;
}

/**
 * Restrict status values to the database/API enumeration.
 */
export function isValidProjectStatus(value: unknown): value is ProjectStatus {
  return value === 'planned' || value === 'in_progress' || value === 'completed';
}

/**
 * Restrict priority values to the database/API enumeration.
 */
export function isValidProjectPriority(value: unknown): value is ProjectPriority {
  return value === 'low' || value === 'medium' || value === 'high';
}

/**
 * Require a whole-number percentage between zero and one hundred.
 */
export function isValidProjectProgress(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100;
}

/**
 * Permit bounded HTTP(S) links with a hostname and no embedded credentials.
 * Reject executable URL schemes before links reach the interface.
 */
export function isValidHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.includes('\0')) {
    return false;
  }

  const trimmed = value.trim();
  if (trimmed.length > 2048) return false;
  try {
    const parsed = new URL(trimmed);
    return (
      ['http:', 'https:'].includes(parsed.protocol) &&
      Boolean(parsed.hostname) &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
}

/**
 * Bound the optional technology list as plain text and reject null bytes.
 */
export function isValidTechnologies(value: unknown): value is string {
  return typeof value === 'string' && !value.includes('\0') && value.trim().length <= 500;
}

/**
 * Convert omitted, null or whitespace-only optional text to the database null value.
 */
export function normalizeOptionalText(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Normalize an already-validated optional link for storage; validation is the caller's job.
 */
export function normalizeOptionalUrl(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Apply the same planned/in-progress/completed enumeration to learning goals.
 */
export function isValidLearningGoalStatus(value: unknown): value is LearningGoalStatus {
  return value === 'planned' || value === 'in_progress' || value === 'completed';
}

/**
 * Accept null or a real YYYY-MM-DD calendar date, excluding year zero.
 * Round-tripping through ISO rejects impossible dates that JavaScript normalizes.
 */
export function isValidTargetDate(value: unknown): value is string | null {
  if (value === null) {
    return true;
  }

  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value.startsWith('0000-')
  ) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * Validate personal signup fields and reserve the demo-only email domain.
 * Uniqueness and password hashing are enforced later by the account route/database.
 */
export function isCreateUserPayload(value: unknown): value is CreateUserPayload {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isValidUsername(value.username) &&
    isValidName(value.name) &&
    isValidEmail(value.email) &&
    !value.email.trim().toLowerCase().endsWith('@demo.invalid') &&
    isValidPassword(value.password)
  );
}

/**
 * Validate credential shapes before running the expensive password comparison.
 */
export function isLoginPayload(value: unknown): value is LoginPayload {
  if (!isRecord(value)) {
    return false;
  }

  return isValidUsername(value.username) && isValidPassword(value.password);
}

/**
 * Validate required create fields and all supplied optional fields. The router
 * injects userId from the verified session before calling this guard.
 */
export function isCreateProjectPayload(value: unknown): value is CreateProjectPayload {
  if (!isRecord(value)) {
    return false;
  }

  const descriptionIsValid =
    value.description === undefined || isValidDescription(value.description);

  const statusIsValid = value.status === undefined || isValidProjectStatus(value.status);

  const priorityIsValid = value.priority === undefined || isValidProjectPriority(value.priority);

  const progressIsValid = value.progress === undefined || isValidProjectProgress(value.progress);

  const startDateIsValid =
    value.startDate === undefined || value.startDate === null || isValidTargetDate(value.startDate);

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
    value.repositoryUrl === '' ||
    isValidHttpUrl(value.repositoryUrl);

  const liveUrlIsValid =
    value.liveUrl === undefined ||
    value.liveUrl === null ||
    value.liveUrl === '' ||
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

/**
 * Validate a partial project edit and require at least one recognized field.
 * Omitted fields stay unchanged; explicit nulls can clear nullable fields.
 */
export function isUpdateProjectPayload(value: unknown): value is UpdateProjectPayload {
  if (!isRecord(value) || !isPositiveInteger(value.userId)) {
    return false;
  }

  const titleIsValid = value.title === undefined || isValidProjectTitle(value.title);

  const descriptionIsValid =
    value.description === undefined || isValidDescription(value.description);

  const statusIsValid = value.status === undefined || isValidProjectStatus(value.status);

  const priorityIsValid = value.priority === undefined || isValidProjectPriority(value.priority);

  const progressIsValid = value.progress === undefined || isValidProjectProgress(value.progress);

  const startDateIsValid =
    value.startDate === undefined || value.startDate === null || isValidTargetDate(value.startDate);

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
    value.repositoryUrl === '' ||
    isValidHttpUrl(value.repositoryUrl);

  const liveUrlIsValid =
    value.liveUrl === undefined ||
    value.liveUrl === null ||
    value.liveUrl === '' ||
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

/**
 * Validate a new goal with an optional project ID; project ownership is checked
 * separately in the route before insertion.
 */
export function isCreateLearningGoalPayload(value: unknown): value is CreateLearningGoalPayload {
  if (!isRecord(value)) {
    return false;
  }

  const projectIdIsValid =
    value.projectId === undefined || value.projectId === null || isPositiveInteger(value.projectId);

  const descriptionIsValid =
    value.description === undefined || isValidDescription(value.description);

  const targetDateIsValid = value.targetDate === undefined || isValidTargetDate(value.targetDate);

  return (
    isPositiveInteger(value.userId) &&
    isValidProjectTitle(value.title) &&
    projectIdIsValid &&
    descriptionIsValid &&
    targetDateIsValid &&
    (value.status === undefined || isValidLearningGoalStatus(value.status))
  );
}

/**
 * Validate a partial goal edit, including explicit removal of a project link.
 * At least one recognized change is required; omitted fields remain unchanged.
 */
export function isUpdateLearningGoalPayload(value: unknown): value is UpdateLearningGoalPayload {
  if (!isRecord(value) || !isPositiveInteger(value.userId)) {
    return false;
  }

  const projectIdIsValid =
    value.projectId === undefined || value.projectId === null || isPositiveInteger(value.projectId);

  const titleIsValid = value.title === undefined || isValidProjectTitle(value.title);

  const descriptionIsValid =
    value.description === undefined || isValidDescription(value.description);

  const statusIsValid = value.status === undefined || isValidLearningGoalStatus(value.status);

  const targetDateIsValid = value.targetDate === undefined || isValidTargetDate(value.targetDate);

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

/**
 * Extract a database error code without assuming the thrown value is an Error instance.
 */
export function getDatabaseErrorCode(error: unknown): string | undefined {
  if (!isRecord(error)) {
    return undefined;
  }

  return typeof error.code === 'string' ? error.code : undefined;
}
