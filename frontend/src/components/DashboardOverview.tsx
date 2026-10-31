/**
 * Read-only workspace summary derived from the projects/goals supplied by App.
 * Status counts drive the ring; its center shows total projects, while recent
 * project and goal actions are delegated back to the application controller.
 */
import {
  ArrowRight,
  ArrowUpRight,
  Plus,
  FolderKanban,
  Flame,
  CircleCheck,
  Target,
  CalendarDays,
  Sparkles,
  Check,
} from 'lucide-react';
import type { LearningGoal, Project, User } from '../types';
import { ProjectsPanel } from './ProjectsPanel';
import { dueLabel } from '../lib/format';
interface Props {
  error: string;
  goals: LearningGoal[];
  isLoading: boolean;
  onRetry: () => void;
  onViewAllProjects: () => void;
  projects: Project[];
  user: User;
  onNewProject: () => void;
  onNewGoal: () => void;
  onViewGoals: () => void;
  onEditProject: (p: Project) => void;
  onDeleteProject: (p: Project) => void;
  isPending: (id: number) => boolean;
  onToggleGoal: (g: LearningGoal) => void;
  onSamples: () => void;
}
/**
 * Derive counts and upcoming work from supplied records and expose actions
 * through callbacks; do not fetch or duplicate the stored workspace here.
 */
export function DashboardOverview({
  error,
  goals,
  isLoading,
  onRetry,
  onViewAllProjects,
  projects,
  user,
  onNewProject,
  onNewGoal,
  onViewGoals,
  onEditProject,
  onDeleteProject,
  isPending,
  onToggleGoal,
  onSamples,
}: Props) {
  // All summaries come from the current loaded records. The ring represents
  // status proportions, while the separate sidebar metric averages progress values.
  const active = projects.filter((p) => p.status === 'in_progress');
  const completed = projects.filter((p) => p.status === 'completed');
  const planned = projects.filter((p) => p.status === 'planned');
  const activeGoals = goals
    .filter((g) => g.status !== 'completed')
    .sort((a, b) => (a.targetDate || '9999').localeCompare(b.targetDate || '9999'))
    .slice(0, 3);
  const stats = [
    {
      label: 'Total projects',
      value: projects.length,
      note: 'Across all statuses',
      icon: FolderKanban,
      color: 'orange',
    },
    {
      label: 'In progress',
      value: active.length,
      note: 'Currently active',
      icon: Flame,
      color: 'blue',
    },
    {
      label: 'Completed',
      value: completed.length,
      note: 'Finished projects',
      icon: CircleCheck,
      color: 'green',
    },
    {
      label: 'Learning goals',
      value: goals.filter((g) => g.status !== 'completed').length,
      note: 'Not yet completed',
      icon: Target,
      color: 'purple',
    },
  ];
  return (
    <div className="page-stack">
      <header className="page-intro">
        <div>
          <span className="section-eyebrow">
            <span className="live-dot" /> YOUR PERSONAL WORKSPACE
          </span>
          <h1>
            Let’s make progress, {user.name.trim().split(/\s+/)[0]}
            <span>.</span>
          </h1>
          <p>Your projects and learning goals at a glance.</p>
        </div>
        <button className="primary-button" onClick={onNewProject}>
          <Plus size={17} /> New project
        </button>
      </header>
      {error && (
        <div className="inline-error" role="alert">
          <span>{error}</span>
          <button className="text-button" onClick={onRetry}>
            Try again
          </button>
        </div>
      )}
      <section className="summary-grid" aria-label="Workspace summary" aria-busy={isLoading}>
        {stats.map(({ label, value, note, icon: Icon, color }) => (
          <article className="summary-card" key={label}>
            <div className="summary-card-heading">
              <span>{label}</span>
              <span className={`stat-icon stat-icon--${color}`}>
                <Icon size={18} />
              </span>
            </div>
            <strong>
              {isLoading ? (
                <span className="stat-placeholder">—</span>
              ) : (
                String(value).padStart(2, '0')
              )}
            </strong>
            <p>{note}</p>
          </article>
        ))}
      </section>
      <div className="overview-middle">
        <section className="momentum-card">
          <div className="momentum-copy">
            <span className="section-eyebrow">THE BIG PICTURE</span>
            <h2>Project status breakdown.</h2>
            <p>
              {projects.length
                ? `${active.length} active ${active.length === 1 ? 'project' : 'projects'}, ${completed.length} finished ${completed.length === 1 ? 'idea' : 'ideas'}, and plenty of room for what’s next.`
                : 'Create a project to see its status here.'}
            </p>
            <button className="text-button" onClick={onViewAllProjects}>
              View projects <ArrowRight size={15} />
            </button>
            <div className="chart-legend">
              <span>
                <i className="legend-active" />
                In progress <b>{active.length}</b>
              </span>
              <span>
                <i className="legend-complete" />
                Completed <b>{completed.length}</b>
              </span>
              <span>
                <i className="legend-planned" />
                Planned <b>{planned.length}</b>
              </span>
            </div>
          </div>
          <div
            className="progress-ring"
            role="img"
            aria-label={`Project status breakdown: ${active.length} in progress, ${completed.length} completed, ${planned.length} planned`}
            style={{
              background: `conic-gradient(var(--accent) 0 ${projects.length ? (active.length / projects.length) * 100 : 0}%, #63977b ${projects.length ? (active.length / projects.length) * 100 : 0}% ${projects.length ? ((active.length + completed.length) / projects.length) * 100 : 0}%, var(--ring-rest) 0)`,
            }}
          >
            <div>
              <span className="ring-label">TOTAL PROJECTS</span>
              <strong>
                {isLoading ? '—' : projects.length}
              </strong>
              <span>
                Across all statuses
              </span>
            </div>
          </div>
        </section>
        <section className="next-steps-card">
          <div className="section-heading">
            <h2>On your horizon</h2>
            <button
              className="icon-button"
              onClick={onViewGoals}
              aria-label="View all learning goals"
            >
              <ArrowUpRight size={18} />
            </button>
          </div>
          {isLoading ? (
            <p className="loading-note">Finding your next steps…</p>
          ) : activeGoals.length ? (
            activeGoals.map((goal) => (
              <div className="horizon-row" key={goal.id}>
                <button
                  className="horizon-check"
                  aria-label={`Complete ${goal.title}`}
                  onClick={() => onToggleGoal(goal)}
                >
                  <Check size={12} />
                </button>
                <div>
                  <strong>{goal.title}</strong>
                  <span>
                    <CalendarDays size={12} />
                    {dueLabel(goal.targetDate)}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="horizon-empty">
              <Target size={25} />
              <p>A new skill is a good next step.</p>
              <button className="text-button" onClick={onNewGoal}>
                Set a learning goal <Plus size={14} />
              </button>
            </div>
          )}
        </section>
      </div>
      <ProjectsPanel
        title="Recent projects"
        projects={projects.slice(0, 3)}
        compact
        error=""
        isLoading={isLoading}
        onRetry={onRetry}
        isProjectActionPending={isPending}
        onEditProject={onEditProject}
        onDeleteProject={onDeleteProject}
        action={
          <button className="text-button" onClick={onViewAllProjects}>
            View all projects <ArrowRight size={15} />
          </button>
        }
      />
      {!isLoading && !projects.length && !error && (
        <div className="sample-banner">
          <span className="sample-icon">
            <Sparkles size={22} />
          </span>
          <div>
            <strong>Want a little inspiration?</strong>
            <p>
              Start with a few example projects and learning goals. You can change or delete them.
            </p>
          </div>
          <button className="secondary-button" onClick={onSamples}>
            Add examples <ArrowUpRight size={15} />
          </button>
        </div>
      )}
      <div className="workspace-quote">
        <span>“</span>
        <p>You don’t have to see the whole staircase. Just take the next step.</p>
        <span>”</span>
      </div>
    </div>
  );
}
