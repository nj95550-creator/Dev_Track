/**
 * Modal editor shared by new and existing learning goals. Local draft fields
 * remain separate from saved records until App confirms the API mutation;
 * closing a dirty form requires confirmation.
 */
import { Dialog } from './Dialog';
import { useState, type FormEvent, type ReactElement } from 'react';
import type { LearningGoal, LearningGoalFormValues, LearningGoalStatus, Project } from '../types';

interface LearningGoalFormProps {
  error: string;
  goal: LearningGoal | null;
  isSubmitting: boolean;
  onCancel: () => void;
  onSubmit: (values: LearningGoalFormValues) => Promise<void>;
  projects: Project[];
}

/**
 * Initialize an independent create/edit draft with an optional project link.
 * The parent supplies only the current account's projects and performs persistence.
 */
export function LearningGoalForm({
  error,
  goal,
  isSubmitting,
  onCancel,
  onSubmit,
  projects,
}: LearningGoalFormProps): ReactElement {
  const [title, setTitle] = useState(goal?.title ?? '');
  const [description, setDescription] = useState(goal?.description ?? '');
  const [status, setStatus] = useState<LearningGoalStatus>(goal?.status ?? 'planned');
  const [projectId, setProjectId] = useState<number | null>(goal?.projectId ?? null);
  const [targetDate, setTargetDate] = useState(goal?.targetDate?.slice(0, 10) ?? '');

  const isDirty =
    JSON.stringify([title, description, status, projectId, targetDate]) !==
    JSON.stringify([
      goal?.title ?? '',
      goal?.description ?? '',
      goal?.status ?? 'planned',
      goal?.projectId ?? null,
      goal?.targetDate ?? '',
    ]);
  /**
   * Protect a pending save and confirm before discarding unsaved goal fields.
   */
  function requestClose() {
    if (!isSubmitting && (!isDirty || window.confirm('Discard your unsaved changes?'))) onCancel();
  }

  const isEditing = goal !== null;

  /**
   * Normalize the draft for the API; a cleared native date becomes null, and
   * a null projectId explicitly represents an independent learning goal.
   */
  async function submitGoal(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    await onSubmit({
      projectId,
      title: title.trim(),
      description: description.trim(),
      status,
      targetDate: String(formData.get('targetDate') || '') || null,
    });
  }

  return (
    <Dialog labelId="goal-form-title" onClose={requestClose} busy={isSubmitting}>
      <header className="dialog-header">
        <div>
          <span className="eyebrow">{isEditing ? 'Goal management' : 'New learning target'}</span>
          <h2 id="goal-form-title">{isEditing ? 'Edit learning goal' : 'Create learning goal'}</h2>
        </div>

        <button
          aria-label="Close learning goal form"
          className="dialog-close"
          disabled={isSubmitting}
          onClick={requestClose}
          type="button"
        >
          ×
        </button>
      </header>

      <form className="workspace-form" onSubmit={submitGoal}>
        <label htmlFor="goal-title">Goal title</label>
        <input
          autoFocus
          disabled={isSubmitting}
          id="goal-title"
          maxLength={150}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Enter a learning goal"
          required
          type="text"
          value={title}
        />

        <label htmlFor="goal-description">Description</label>
        <textarea
          disabled={isSubmitting}
          id="goal-description"
          maxLength={5000}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Describe what you want to learn"
          rows={5}
          value={description}
        />

        <label htmlFor="goal-project">Connected project</label>
        <select
          disabled={isSubmitting}
          id="goal-project"
          onChange={(event) => {
            const selectedValue = event.target.value;

            setProjectId(selectedValue === '' ? null : Number(selectedValue));
          }}
          value={projectId ?? ''}
        >
          <option value="">No connected project</option>

          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.title}
            </option>
          ))}
        </select>

        <div className="form-row">
          <div>
            <label htmlFor="goal-status">Status</label>
            <select
              disabled={isSubmitting}
              id="goal-status"
              onChange={(event) => setStatus(event.target.value as LearningGoalStatus)}
              value={status}
            >
              <option value="planned">Planned</option>
              <option value="in_progress">In progress</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          <div>
            <label htmlFor="goal-target-date">Target date</label>
            <input
              disabled={isSubmitting}
              name="targetDate"
              id="goal-target-date"
              onInput={(event) => setTargetDate(event.currentTarget.value)}
              type="date"
              defaultValue={goal?.targetDate?.slice(0, 10) ?? ''}
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
            onClick={requestClose}
            type="button"
          >
            Cancel
          </button>

          <button className="primary-button" disabled={isSubmitting} type="submit">
            {isSubmitting ? 'Saving…' : isEditing ? 'Save changes' : 'Create goal'}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
