import {
  useEffect,
  useState,
  type FormEvent,
  type ReactElement,
} from "react";
import type {
  LearningGoal,
  LearningGoalFormValues,
  LearningGoalStatus,
  Project,
} from "../types";

interface LearningGoalFormProps {
  error: string;
  goal: LearningGoal | null;
  isSubmitting: boolean;
  onCancel: () => void;
  onSubmit: (
    values: LearningGoalFormValues
  ) => Promise<void>;
  projects: Project[];
}

// Keeps editable goal fields local until the parent submits a validated request.
/**
 * Provides one form for creating and editing learning goals.
 */
export function LearningGoalForm({
  error,
  goal,
  isSubmitting,
  onCancel,
  onSubmit,
  projects,
}: LearningGoalFormProps): ReactElement {
  const [title, setTitle] = useState(
    goal?.title ?? ""
  );
  const [description, setDescription] = useState(
    goal?.description ?? ""
  );
  const [status, setStatus] =
    useState<LearningGoalStatus>(
      goal?.status ?? "planned"
    );
  const [projectId, setProjectId] = useState<
    number | null
  >(goal?.projectId ?? null);
  const [targetDate, setTargetDate] = useState(
    goal?.targetDate ?? ""
  );

  const isEditing = goal !== null;

  /*
   * Allows the dialog to be closed with the Escape key.
   */
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent): void {
      if (event.key === "Escape" && !isSubmitting) {
        onCancel();
      }
    }

    window.addEventListener("keydown", closeOnEscape);

    return () => {
      window.removeEventListener(
        "keydown",
        closeOnEscape
      );
    };
  }, [isSubmitting, onCancel]);

  async function submitGoal(
    event: FormEvent<HTMLFormElement>
  ): Promise<void> {
    event.preventDefault();

    await onSubmit({
      projectId,
      title: title.trim(),
      description: description.trim(),
      status,
      targetDate: targetDate || null,
    });
  }

  return (
    <div className="dialog-backdrop">
      <section
        aria-labelledby="goal-form-title"
        aria-modal="true"
        className="form-dialog"
        role="dialog"
      >
        <header className="dialog-header">
          <div>
            <span className="eyebrow">
              {isEditing
                ? "Goal management"
                : "New learning target"}
            </span>
            <h2 id="goal-form-title">
              {isEditing
                ? "Edit learning goal"
                : "Create learning goal"}
            </h2>
          </div>

          <button
            aria-label="Close learning goal form"
            className="dialog-close"
            disabled={isSubmitting}
            onClick={onCancel}
            type="button"
          >
            ×
          </button>
        </header>

        <form
          className="workspace-form"
          onSubmit={submitGoal}
        >
          <label htmlFor="goal-title">
            Goal title
          </label>
          <input
            autoFocus
            disabled={isSubmitting}
            id="goal-title"
            maxLength={150}
            onChange={(event) =>
              setTitle(event.target.value)
            }
            placeholder="Enter a learning goal"
            required
            type="text"
            value={title}
          />

          <label htmlFor="goal-description">
            Description
          </label>
          <textarea
            disabled={isSubmitting}
            id="goal-description"
            maxLength={5000}
            onChange={(event) =>
              setDescription(event.target.value)
            }
            placeholder="Describe what you want to learn"
            rows={5}
            value={description}
          />

          <label htmlFor="goal-project">
            Connected project
          </label>
          <select
            disabled={isSubmitting}
            id="goal-project"
            onChange={(event) => {
              const selectedValue = event.target.value;

              setProjectId(
                selectedValue === ""
                  ? null
                  : Number(selectedValue)
              );
            }}
            value={projectId ?? ""}
          >
            <option value="">
              No connected project
            </option>

            {projects.map((project) => (
              <option
                key={project.id}
                value={project.id}
              >
                {project.title}
              </option>
            ))}
          </select>

          <div className="form-row">
            <div>
              <label htmlFor="goal-status">
                Status
              </label>
              <select
                disabled={isSubmitting}
                id="goal-status"
                onChange={(event) =>
                  setStatus(
                    event.target
                      .value as LearningGoalStatus
                  )
                }
                value={status}
              >
                <option value="planned">
                  Planned
                </option>
                <option value="in_progress">
                  In progress
                </option>
                <option value="completed">
                  Completed
                </option>
              </select>
            </div>

            <div>
              <label htmlFor="goal-target-date">
                Target date
              </label>
              <input
                disabled={isSubmitting}
                id="goal-target-date"
                onChange={(event) =>
                  setTargetDate(event.target.value)
                }
                type="date"
                value={targetDate}
              />
            </div>
          </div>

          {error && (
            <p className="error-message" role="alert">
              <span aria-hidden="true">!</span>
              {error}
            </p>
          )}

          <footer className="dialog-actions">
            <button
              className="secondary-button"
              disabled={isSubmitting}
              onClick={onCancel}
              type="button"
            >
              Cancel
            </button>

            <button
              className="primary-button"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting
                ? "Saving…"
                : isEditing
                  ? "Save changes"
                  : "Create goal"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}