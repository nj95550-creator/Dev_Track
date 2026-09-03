import type { ReactElement } from "react";
import type { LearningGoal, Project, User } from "../types";
import { ProjectsPanel } from "./ProjectsPanel";
import { SummaryCards } from "./SummaryCards";

// Composes the read-only overview from aggregate metrics and recent projects.
interface DashboardOverviewProps {
  error: string;
  goals: LearningGoal[];
  isLoading: boolean;
  onRetry: () => void;
  onViewAllProjects: () => void;
  projects: Project[];
  user: User;
}

export function DashboardOverview({
  error,
  goals,
  isLoading,
  onRetry,
  onViewAllProjects,
  projects,
  user,
}: DashboardOverviewProps): ReactElement {
  const firstName = user.name.trim().split(/\s+/)[0] || user.name;

  return (
    <div className="page-stack">
      <header className="overview-intro">
        <div>
          <span className="eyebrow">Workspace overview</span>
          <h2>Welcome back, {firstName}.</h2>
          <p>Here is the current shape of your development work.</p>
        </div>
        <div className="overview-accent" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </header>

      <SummaryCards goals={goals} projects={projects} />

      <ProjectsPanel
        action={
          <button
            className="text-button"
            onClick={onViewAllProjects}
            type="button"
          >
            View all projects <span aria-hidden="true">→</span>
          </button>
        }
        error={error}
        isLoading={isLoading}
        isProjectActionPending={() => false}
        onDeleteProject={() => undefined}
        onEditProject={() => undefined}
        onRetry={onRetry}
        projects={projects.slice(0, 6)}
        title="Recent projects"
      />
    </div>
  );
}
