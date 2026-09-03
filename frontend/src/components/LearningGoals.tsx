import { useMemo, useState, type ReactElement } from "react";
import type { LearningGoal, Project, ProjectStatus } from "../types";

// Displays owner-scoped goals, filters, linked projects, and status actions.
interface LearningGoalsProps {
  actionError: string;
  error: string;
  goals: LearningGoal[];
  isGoalActionPending: (goalId: number) => boolean;
  isLoading: boolean;
  onClearActionError: () => void;
  onCreateGoal: () => void;
  onDeleteGoal: (goal: LearningGoal) => void;
  onEditGoal: (goal: LearningGoal) => void;
  onRetry: () => void;
  onToggleGoalStatus: (goal: LearningGoal) => void;
  projects: Project[];
}

const goalStatusLabels: Record<ProjectStatus, string> = {
  planned: "Planned",
  in_progress: "In progress",
  completed: "Completed",
};

type GoalFilter = "active" | "completed" | "all";

function formatTargetDate(value: string | null): string {
  if (!value || value.length < 10) {
    return "No target date";
  }

  const dateText = value.slice(0, 10);
  const date = new Date(`${dateText}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime()) || !/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
    return "No target date";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

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
}: LearningGoalsProps): ReactElement {
  const [goalFilter, setGoalFilter] = useState<GoalFilter>("active");

  const counts = useMemo(() => {
    const activeCount = goals.filter(
      (goal) => goal.status === "planned" || goal.status === "in_progress"
    ).length;
    const completedCount = goals.filter((goal) => goal.status === "completed").length;

    return {
      active: activeCount,
      completed: completedCount,
      all: goals.length,
    };
  }, [goals]);

  const visibleGoals = useMemo(() => {
    if (goalFilter === "active") {
      return goals.filter(
        (goal) => goal.status === "planned" || goal.status === "in_progress"
      );
    }

    if (goalFilter === "completed") {
      return goals.filter((goal) => goal.status === "completed");
    }

    return goals;
  }, [goalFilter, goals]);

  const emptyStateMessage =
    goalFilter === "active"
      ? "No active learning goals."
      : goalFilter === "completed"
        ? "No completed learning goals yet."
        : "No learning goals yet.";

  return (
    <div className="page-stack">
      <header className="page-intro">
        <div>
          <span className="eyebrow">Growth planning</span>
          <h2>Learning goals</h2>
          <p>
            Shape the skills you want to build alongside the projects that put
            them into practice.
          </p>
        </div>

        <button
          className="primary-button action-button"
          onClick={onCreateGoal}
          type="button"
        >
          New Learning Goal
        </button>
      </header>

      <section className="goals-panel" aria-busy={isLoading}>
        <div aria-label="Learning goal filters" className="goal-filter-bar" role="tablist">
          {[
            { key: "active", label: "Active" },
            { key: "completed", label: "Completed" },
            { key: "all", label: "All" },
          ].map((filterOption) => {
            const optionKey = filterOption.key as GoalFilter;
            const isSelected = goalFilter === optionKey;
            const count = counts[optionKey];

            return (
              <button
                aria-selected={isSelected}
                className={`goal-filter-button${isSelected ? " goal-filter-button--active" : ""}`}
                key={optionKey}
                onClick={() => setGoalFilter(optionKey)}
                role="tab"
                type="button"
              >
                <span>{filterOption.label}</span>
                <span className="goal-filter-count">{count}</span>
              </button>
            );
          })}
        </div>

        {actionError && (
          <div className="state-panel state-panel--error" role="alert">
            <span className="state-icon" aria-hidden="true">
              !
            </span>
            <div>
              <h3>Goal update failed</h3>
              <p>{actionError}</p>
            </div>
            <button className="secondary-button" onClick={onClearActionError} type="button">
              Dismiss
            </button>
          </div>
        )}

        {isLoading && (
          <div className="goal-grid" aria-label="Loading learning goals">
            {[0, 1, 2].map((index) => (
              <div className="goal-card goal-card--loading" key={index}>
                <span />
                <span />
                <span />
                <span />
              </div>
            ))}
          </div>
        )}

        {!isLoading && error && (
          <div className="state-panel state-panel--error" role="alert">
            <span className="state-icon" aria-hidden="true">
              !
            </span>
            <div>
              <h3>Learning goals are unavailable</h3>
              <p>{error}</p>
            </div>
            <button className="secondary-button" onClick={onRetry} type="button">
              Try again
            </button>
          </div>
        )}

        {!isLoading && !error && visibleGoals.length === 0 && (
          <div className="state-panel state-panel--empty">
            <span className="empty-project-icon" aria-hidden="true">
              <span />
            </span>
            <div>
              <span className="empty-kicker">Intentional growth</span>
              <h3>{emptyStateMessage}</h3>
              <p>
                {goalFilter === "all"
                  ? "Create the skills you want to build and link each goal to the project it supports."
                  : "Adjust the filter or create a new goal to continue your progress."}
              </p>
            </div>
          </div>
        )}

        {!isLoading && !error && visibleGoals.length > 0 && (
          <div className="goal-grid">
            {visibleGoals.map((goal) => {
              const connectedProject = projects.find(
                (project) => project.id === goal.projectId
              );
              const isPending = isGoalActionPending(goal.id);

              return (
                <article
                  className={`goal-card${goal.status === "completed" ? " goal-card--completed" : ""}`}
                  key={goal.id}
                >
                  <div className="goal-card-header">
                    <span className={`status-badge status-badge--${goal.status}`}>
                      <span aria-hidden="true" />
                      {goalStatusLabels[goal.status]}
                    </span>
                    <span className="goal-id">#{String(goal.id).padStart(2, "0")}</span>
                  </div>

                  <div className="goal-card-copy">
                    <h3>{goal.title}</h3>
                    <p>{goal.description || "No description has been added yet."}</p>
                  </div>

                  <dl className="goal-meta">
                    <div>
                      <dt>Target date</dt>
                      <dd>{formatTargetDate(goal.targetDate)}</dd>
                    </div>
                    <div>
                      <dt>Connected project</dt>
                      <dd>{connectedProject ? connectedProject.title : "No connected project"}</dd>
                    </div>
                  </dl>

                  <div className="goal-card-actions">
                    <button
                      className="goal-action-button goal-action-button--secondary"
                      disabled={isPending}
                      onClick={() => onEditGoal(goal)}
                      type="button"
                    >
                      Edit
                    </button>
                    <button
                      className="goal-action-button goal-action-button--primary"
                      disabled={isPending}
                      onClick={() => onToggleGoalStatus(goal)}
                      type="button"
                    >
                      {goal.status === "completed" ? "Reopen" : "Mark Complete"}
                    </button>
                    <button
                      className="goal-action-button goal-action-button--danger"
                      disabled={isPending}
                      onClick={() => onDeleteGoal(goal)}
                      type="button"
                    >
                      Delete
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
