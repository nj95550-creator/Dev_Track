import type { ReactElement } from "react";
import type { LearningGoal, Project } from "../types";

// Derives compact workspace metrics from the two API-backed collections.
interface SummaryCardsProps {
  goals: LearningGoal[];
  projects: Project[];
}

export function SummaryCards({ goals, projects }: SummaryCardsProps): ReactElement {
  const summaries = [
    {
      key: "total",
      label: "Total projects",
      value: projects.length,
      detail: "Across your workspace",
      glyph: "Σ",
    },
    {
      key: "planned",
      label: "Planned projects",
      value: projects.filter((project) => project.status === "planned").length,
      detail: "Ready to be started",
      glyph: "◇",
    },
    {
      key: "goals",
      label: "Learning goals",
      value: goals.length,
      detail: "Active growth tracks",
      glyph: "◎",
    },
    {
      key: "completed",
      label: "Completed items",
      value:
        projects.filter((project) => project.status === "completed").length +
        goals.filter((goal) => goal.status === "completed").length,
      detail: "Finished milestones",
      glyph: "✓",
    },
  ];

  return (
    <section className="summary-grid" aria-label="Project summary">
      {summaries.map((summary) => (
        <article
          className={`summary-card summary-card--${summary.key}`}
          key={summary.key}
        >
          <div className="summary-card-heading">
            <span className="summary-icon" aria-hidden="true">
              {summary.glyph}
            </span>
            <span className="summary-trend" aria-hidden="true">
              •••
            </span>
          </div>
          <strong>{summary.value}</strong>
          <h3>{summary.label}</h3>
          <p>{summary.detail}</p>
        </article>
      ))}
    </section>
  );
}
