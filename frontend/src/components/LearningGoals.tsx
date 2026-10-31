/**
 * Learning-goal screen with derived completion totals and active/completed
 * filters. The component displays loading, retry and empty states and delegates
 * all persisted changes to App through callbacks.
 */
import { useState, type ReactElement } from 'react';
import {
  Plus,
  Check,
  Target,
  Pencil,
  Trash2,
  CalendarDays,
  Link2,
  Circle,
  ArrowUpRight,
} from 'lucide-react';
import { dueLabel, calendarDate, dateKey, statusLabels } from '../lib/format';
import type { LearningGoal, Project } from '../types';
interface Props {
  actionError: string;
  error: string;
  goals: LearningGoal[];
  isGoalActionPending: (id: number) => boolean;
  isLoading: boolean;
  onClearActionError: () => void;
  onCreateGoal: () => void;
  onDeleteGoal: (g: LearningGoal) => void;
  onEditGoal: (g: LearningGoal) => void;
  onRetry: () => void;
  onToggleGoalStatus: (g: LearningGoal) => void;
  projects: Project[];
}
/**
 * Render filtered goal rows and completion summaries while the parent owns
 * loading, retry and all create/edit/delete/status mutations.
 */
export function LearningGoals({
  actionError,
  error,
  goals,
  isGoalActionPending,
  isLoading,
  onClearActionError,
  onCreateGoal,
  onDeleteGoal,
  onEditGoal,
  onRetry,
  onToggleGoalStatus,
  projects,
}: Props): ReactElement {
  const [filter, setFilter] = useState('active');
  const [query, setQuery] = useState('');
  // Search/status filtering changes only the displayed subset; completion totals
  // below still describe the entire loaded goal collection.
  const visible = goals.filter(
    (g) =>
      (filter === 'all' ||
        (filter === 'completed' ? g.status === 'completed' : g.status !== 'completed')) &&
      `${g.title} ${g.description}`.toLowerCase().includes(query.toLowerCase()),
  );
  const completed = goals.filter((g) => g.status === 'completed').length;
  return (
    <div className="page-stack">
      <header className="page-intro">
        <div>
          <span className="section-eyebrow">A LITTLE BETTER, EVERY DAY</span>
          <h1>
            Keep your curiosity moving<span>.</span>
          </h1>
          <p>Turn “I want to learn” into “look what I can do.”</p>
        </div>
        <button className="primary-button" onClick={onCreateGoal}>
          <Plus size={17} /> New learning goal
        </button>
      </header>
      <div className="goal-summary">
        <span className="goal-summary-icon">
          <Target size={28} />
        </span>
        <div>
          <strong>{isLoading ? '—' : `${completed} of ${goals.length} goals completed`}</strong>
          <p>Every skill starts with showing up.</p>
        </div>
        <div className="goal-summary-progress">
          <div className="progress-track">
            <span style={{ width: `${goals.length ? (completed / goals.length) * 100 : 0}%` }} />
          </div>
          <span>
            {goals.length ? Math.round((completed / goals.length) * 100) : 0}% of the way there{' '}
            <ArrowUpRight size={14} />
          </span>
        </div>
      </div>
      <div className="filter-toolbar">
        <div className="filter-tabs" aria-label="Goal status">
          {['active', 'completed', 'all'].map((f) => (
            <button
              key={f}
              aria-pressed={filter === f}
              className={filter === f ? 'active' : ''}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'All goals' : f[0].toUpperCase() + f.slice(1)}
              <span>
                {
                  goals.filter(
                    (g) =>
                      f === 'all' ||
                      (f === 'completed' ? g.status === 'completed' : g.status !== 'completed'),
                  ).length
                }
              </span>
            </button>
          ))}
        </div>
        <input
          className="search-input"
          type="search"
          placeholder="Search goals…"
          aria-label="Search learning goals"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {(error || actionError) && (
        <div className="inline-error" role="alert">
          <span>{actionError || error}</span>
          <button className="text-button" onClick={actionError ? onClearActionError : onRetry}>
            {actionError ? 'Dismiss' : 'Try again'}
          </button>
        </div>
      )}
      {isLoading ? (
        <div className="goal-list">
          {[0, 1, 2].map((i) => (
            <div className="goal-row skeleton" key={i}>
              <span />
            </div>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">
            <Target size={28} />
          </span>
          <h3>{query ? 'No matching goals.' : 'What will you learn next?'}</h3>
          <p>
            {query
              ? 'Try another search or filter.'
              : 'Start small. Pick a skill and make it a goal.'}
          </p>
          <button className="secondary-button" onClick={onCreateGoal}>
            <Plus size={15} />
            Create a goal
          </button>
        </div>
      ) : (
        <div className="goal-list">
          {visible.map((goal) => (
            <article
              className={`goal-row ${goal.status === 'completed' ? 'goal-row--complete' : ''}`}
              key={goal.id}
            >
              <button
                className="goal-check"
                disabled={isGoalActionPending(goal.id)}
                aria-label={
                  goal.status === 'completed' ? `Reopen ${goal.title}` : `Complete ${goal.title}`
                }
                onClick={() => onToggleGoalStatus(goal)}
              >
                {goal.status === 'completed' ? <Check size={18} /> : <Circle size={22} />}
              </button>
              <div className="goal-row-copy">
                <h3>{goal.title}</h3>
                <p>{goal.description || 'A new opportunity to grow.'}</p>
                <div className="goal-row-meta">
                  <span>
                    <Link2 size={13} />
                    {projects.find((p) => p.id === goal.projectId)?.title || 'Independent goal'}
                  </span>
                  <span
                    className={
                      goal.targetDate && goal.targetDate < dateKey() && goal.status !== 'completed'
                        ? 'overdue'
                        : ''
                    }
                  >
                    <CalendarDays size={13} />
                    {goal.status === 'completed'
                      ? calendarDate(goal.targetDate)
                      : dueLabel(goal.targetDate)}
                  </span>
                </div>
              </div>
              <span className={`status-badge status-badge--${goal.status}`}>
                <i />
                {statusLabels[goal.status]}
              </span>
              <div className="goal-row-actions">
                <button
                  className="icon-button"
                  aria-label={`Edit ${goal.title}`}
                  disabled={isGoalActionPending(goal.id)}
                  onClick={() => onEditGoal(goal)}
                >
                  <Pencil size={16} />
                </button>
                <button
                  className="icon-button delete-action"
                  aria-label={`Delete ${goal.title}`}
                  disabled={isGoalActionPending(goal.id)}
                  onClick={() => onDeleteGoal(goal)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
