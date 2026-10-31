/**
 * Reusable project cards for the overview and full grid/list. Cards render
 * status, progress, dates and external links; edit/delete buttons delegate
 * mutations to the parent, and loading/empty/error states share the same panel.
 */
import {
  ArrowUpRight,
  CalendarDays,
  Code2,
  Pencil,
  Trash2,
  Github,
  ExternalLink,
  FolderOpen,
  AlertCircle,
} from 'lucide-react';
import type { ReactElement } from 'react';
import type { Project } from '../types';
import { calendarDate, statusLabels, dateKey } from '../lib/format';
interface Props {
  action?: ReactElement;
  error: string;
  isLoading: boolean;
  isProjectActionPending: (id: number) => boolean;
  onDeleteProject: (p: Project) => void;
  onEditProject: (p: Project) => void;
  onRetry: () => void;
  projects: Project[];
  title: string;
  compact?: boolean;
  listView?: boolean;
}
/**
 * Render a supplied project subset as cards/list rows with shared feedback
 * states; compact mode changes presentation rather than stored records.
 */
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
  compact = false,
  listView = false,
}: Props) {
  // Loading placeholders take precedence over empty/error content. A populated
  // list remains readable alongside retry feedback if a later refresh fails.
  return (
    <section className={`projects-panel ${compact ? 'compact-panel' : ''}`} aria-busy={isLoading}>
      <div className="section-heading">
        <div className="heading-with-count">
          <h2>{title}</h2>
          <span className="count-badge">{isLoading ? '–' : projects.length}</span>
        </div>
        {action}
      </div>
      {error && (
        <div className="inline-error" role="alert">
          <AlertCircle size={17} />
          <span>{error}</span>
          <button className="text-button" onClick={onRetry}>
            Try again
          </button>
        </div>
      )}
      {isLoading ? (
        <div className="project-grid">
          {[0, 1, 2].map((i) => (
            <div className="project-card skeleton" key={i}>
              <span />
              <span />
              <span />
            </div>
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">
            <FolderOpen size={27} />
          </span>
          <h3>{error ? 'Projects couldn’t be loaded.' : 'Room for your next idea.'}</h3>
          <p>
            {error
              ? 'Try again when you’re ready.'
              : 'Create a project or adjust your filters to find what you’re looking for.'}
          </p>
        </div>
      ) : (
        <div className={`project-grid ${listView ? 'project-grid--list' : ''}`}>
          {projects.map((project, index) => (
            <article className={`project-card project-card--${index % 4}`} key={project.id}>
              <div className="project-card-top">
                <span className={`project-symbol project-symbol--${index % 4}`}>
                  <Code2 size={22} />
                </span>
                <div className="project-tags">
                  <span className={`status-badge status-badge--${project.status}`}>
                    <i />
                    {statusLabels[project.status]}
                  </span>
                  <span
                    className={`priority-indicator priority--${project.priority}`}
                    title={`${project.priority} priority`}
                    aria-label={`${project.priority} priority`}
                    role="img"
                  >
                    <span />
                    <span />
                    <span />
                  </span>
                </div>
              </div>
              <div className="project-copy">
                <h3>{project.title}</h3>
                <p>
                  {project.description ||
                    'Every great project starts with an idea. Add a description to tell its story.'}
                </p>
              </div>
              <div className="tech-tags">
                {(
                  project.technologies
                    ?.split(',')
                    .map((t) => t.trim())
                    .filter(Boolean) || []
                )
                  .slice(0, 3)
                  .map((t, i) => (
                    <span key={`${t}-${i}`}>{t}</span>
                  ))}
                {!project.technologies && <span className="muted-tag">Add your tech stack</span>}
              </div>
              <div className="project-progress">
                <div>
                  <span>Progress</span>
                  <strong>
                    {project.progress}
                    <small>%</small>
                  </strong>
                </div>
                <div
                  className={`progress-track ${project.status === 'completed' ? 'progress-track--complete' : ''}`}
                  role="progressbar"
                  aria-label={`${project.title} progress`}
                  aria-valuenow={project.progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <span style={{ width: `${project.progress}%` }} />
                </div>
              </div>
              <div className="project-card-bottom">
                <span
                  className={
                    project.targetDate &&
                    project.targetDate < dateKey() &&
                    project.status !== 'completed'
                      ? 'overdue'
                      : ''
                  }
                >
                  <CalendarDays size={14} />
                  {calendarDate(project.targetDate)}
                </span>
                <div className="project-links">
                  {project.repositoryUrl && (
                    <a
                      href={project.repositoryUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open ${project.title} repository`}
                    >
                      <Github size={16} />
                    </a>
                  )}
                  {project.liveUrl && (
                    <a
                      href={project.liveUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open ${project.title} live website`}
                    >
                      <ExternalLink size={16} />
                    </a>
                  )}
                </div>
              </div>
              <div className="project-actions">
                <button
                  disabled={isProjectActionPending(project.id)}
                  onClick={() => onEditProject(project)}
                >
                  <Pencil size={13} />
                  Edit project
                  <ArrowUpRight size={13} />
                </button>
                <button
                  disabled={isProjectActionPending(project.id)}
                  className="delete-action"
                  aria-label={`Delete ${project.title}`}
                  onClick={() => onDeleteProject(project)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
