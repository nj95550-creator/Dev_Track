// Shared frontend models mirror backend response fields and form contracts.
export type ProjectStatus =
  | "planned"
  | "in_progress"
  | "completed";

export type ProjectPriority =
  | "low"
  | "medium"
  | "high";

export type LearningGoalStatus =
  | "planned"
  | "in_progress"
  | "completed";

export interface User {
  id: number;
  username: string;
  name: string;
  email: string;
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
  username: string;
  password: string;
}

export interface CreateProfileInput extends LoginCredentials {
  name: string;
  email: string;
}

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

export interface LearningGoalFormValues {
  projectId: number | null;
  title: string;
  description: string;
  status: LearningGoalStatus;
  targetDate: string | null;
}

export interface UserResponse {
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