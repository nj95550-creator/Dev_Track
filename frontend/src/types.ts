/**
 * Frontend contracts for JSON responses, persisted workspace records and form
 * submissions. API dates are strings; form types distinguish cleared inputs from
 * the nullable dates/project links stored by the backend.
 */
export type ProjectStatus = 'planned' | 'in_progress' | 'completed';

export type ProjectPriority = 'low' | 'medium' | 'high';

export type LearningGoalStatus = 'planned' | 'in_progress' | 'completed';

// Public profile contract; password hashes and cookie values are never fields here.
export interface User {
  id: number;
  username: string;
  name: string;
  email: string;
  isDemo: boolean;
  createdAt: string;
}

export interface Project {
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
  createdAt: string;
  updatedAt: string;
}

export interface LearningGoal {
  id: number;
  userId: number;
  projectId: number | null;
  title: string;
  description: string;
  status: LearningGoalStatus;
  targetDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LoginCredentials {
  remember?: boolean;
  username: string;
  password: string;
}

export interface CreateProfileInput extends LoginCredentials {
  name: string;
  email: string;
}

// Native form fields use empty strings for unset dates/links. App converts
// nullable values before sending them to the API.
export interface ProjectFormValues {
  title: string;
  description: string;
  status: ProjectStatus;
  priority: ProjectPriority;
  progress: number;
  startDate: string;
  targetDate: string;
  technologies: string;
  repositoryUrl: string;
  liveUrl: string;
}

// A null project link/date explicitly clears that optional association/value.
export interface LearningGoalFormValues {
  projectId: number | null;
  title: string;
  description: string;
  status: LearningGoalStatus;
  targetDate: string | null;
}

export interface UserResponse {
  csrfToken?: string;
  user: User;
}

export interface ProjectResponse {
  projects: Project[];
}

export interface SingleProjectResponse {
  project: Project;
}

export interface LearningGoalsResponse {
  goals: LearningGoal[];
}

export interface SingleLearningGoalResponse {
  goal: LearningGoal;
}

export interface MessageResponse {
  message: string;
}
