import type { ReactElement } from "react";
import type { Project, ProjectPriority, ProjectStatus } from "../types";

// Renders project loading, error, empty, and action states from parent-owned data.
interface ProjectsPanelProps {
  action?: ReactElement;
  error: string;
  isLoading: boolean;
  isProjectActionPending: (projectId: number) => boolean;
  onDeleteProject: (project: Project) => void;
  onEditProject: (project: Project) => void;
  onRetry: () => void;
  projects: Project[];
  title: string;
}

const projectStatusLabels: Record<ProjectStatus, string> = {
  planned: "Planned",
  in_progress: "In progress",
  completed: "Completed",
};

const projectPriorityLabels: Record<ProjectPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

function formatProjectCalendarDate(value: string | null): string {
  if (!value) {
    return "Not set";
  }

  const candidate = value.slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) {
    return "Not set";
  }

  const date = new Date(`${candidate}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatUpdatedDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Recently updated";
  }

  return `Updated ${new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date)}`;
}

function ProjectCard({
  isPending,
  onDeleteProject,
  onEditProject,
  project,
}: {
  isPending: boolean;
  onDeleteProject: (project: Project) => void;
  onEditProject: (project: Project) => void;
  project: Project;
}): ReactElement {
  // Card links and actions are derived from the already owner-scoped project record.
  const hasRepositoryLink = Boolean(project.repositoryUrl && project.repositoryUrl.trim());
  const hasLiveLink = Boolean(project.liveUrl && project.liveUrl.trim());
  const technologies = project.technologies?.trim() || "No technology stack added yet.";

  return (
    <article className="project-card">
      <div className="project-card-topline">
        <span className={`status-badge status-badge--${project.status}`}>
          <span aria-hidden="true" />
          {projectStatusLabels[project.status]}
        </span>
        <span className={`priority-badge priority-badge--${project.priority}`}>
          {projectPriorityLabels[project.priority]}
        </span>
      </div>

      <div className="project-card-copy">
        <span className="project-id">#{String(project.id).padStart(2, "0")}</span>
        <h3>{project.title}</h3>
        <p>{project.description || "No description has been added yet."}</p>
      </div>

      <div className="project-progress">
        <div className="project-progress-meta">
          <span>Progress</span>
          <strong>{project.progress}%</strong>
        </div>
        <div className="project-progress-bar" aria-label={`Project progress ${project.progress}%`}>
          <span style={{ width: `${project.progress}%` }} />
        </div>
      </div>

      <dl className="project-meta-list">
        <div>
          <dt>Start</dt>
          <dd>{formatProjectCalendarDate(project.startDate)}</dd>
        </div>
        <div>
          <dt>Target</dt>
          <dd>{formatProjectCalendarDate(project.targetDate)}</dd>
        </div>
        <div>
          <dt>Stack</dt>
          <dd>{technologies}</dd>
        </div>
      </dl>

      {(hasRepositoryLink || hasLiveLink) && (
        <div className="project-link-list">
          {hasRepositoryLink && (
            <a
              className="project-link-button"
              href={project.repositoryUrl ?? "#"}
              rel="noreferrer noopener"
              target="_blank"
            >
              Repository
            </a>
          )}
          {hasLiveLink && (
            <a
              className="project-link-button"
              href={project.liveUrl ?? "#"}
              rel="noreferrer noopener"
              target="_blank"
            >
              Live site
            </a>
          )}
        </div>
      )}

      <div className="project-card-actions">
        <button
          className="project-action-button project-action-button--secondary"
          disabled={isPending}
          onClick={() => onEditProject(project)}
          type="button"
        >
          Edit
        </button>
        <button
          className="project-action-button project-action-button--danger"
          disabled={isPending}
          onClick={() => onDeleteProject(project)}
          type="button"
        >
          Delete
        </button>
      </div>

      <footer>
        <span className="project-calendar" aria-hidden="true">
          □
        </span>
        <time dateTime={project.updatedAt}>{formatUpdatedDate(project.updatedAt)}</time>
      </footer>
    </article>
  );
}

function LoadingProjects(): ReactElement {
  return (
    <div className="project-grid" aria-label="Loading projects">
      {[0, 1, 2].map((item) => (
        <div className="project-card project-card--loading" key={item}>
          <span />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}

export function ProjectsPanel({
  action,
  error,
  isLoading,
  isProjectActionPending,
  onDeleteProject,
  onEditProject,
  onRetry,
  projects,
  title,
}: ProjectsPanelProps): ReactElement {
  return (
    <section
      className="projects-panel"
      aria-busy={isLoading}
      aria-labelledby="projects-title"
    >
      <header className="section-heading">
        <div>
          <span className="section-kicker">Project library</span>
          <div className="section-title-line">
            <h2 id="projects-title">{title}</h2>
            <span className="count-badge">{projects.length}</span>
          </div>
        </div>
        {action}
      </header>

      {isLoading && <LoadingProjects />}

      {!isLoading && error && (
        <div className="state-panel state-panel--error" role="alert">
          <span className="state-icon" aria-hidden="true">
            !
          </span>
          <div>
            <h3>Projects are unavailable</h3>
            <p>{error}</p>
          </div>
          <button className="secondary-button" onClick={onRetry} type="button">
            Try again
          </button>
        </div>
      )}

      {!isLoading && !error && projects.length === 0 && (
        <div className="state-panel state-panel--empty">
          <span className="empty-project-icon" aria-hidden="true">
            <span />
          </span>
          <div>
            <span className="empty-kicker">A clean slate</span>
            <h3>No projects yet</h3>
            <p>
              Your project workspace is ready. New projects will appear here
              with their status and latest update.
            </p>
          </div>
        </div>
      )}

      {!isLoading && !error && projects.length > 0 && (
        <div className="project-grid">
          {projects.map((project) => (
            <ProjectCard
              isPending={isProjectActionPending(project.id)}
              key={project.id}
              onDeleteProject={onDeleteProject}
              onEditProject={onEditProject}
              project={project}
            />
          ))}
        </div>
      )}
    </section>
  );
}
