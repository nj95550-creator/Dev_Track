/**
 * Modal editor shared by project creation and editing. The draft is normalized
 * for submission while saved state remains in App; unsaved edits are protected
 * by a close confirmation and inputs are disabled during a pending save.
 */
import { Dialog } from './Dialog';
import { useState, type FormEvent, type ReactElement } from 'react';
import type { Project, ProjectFormValues, ProjectPriority, ProjectStatus } from '../types';

interface ProjectFormProps {
  error: string;
  isSubmitting: boolean;
  onCancel: () => void;
  onSubmit: (values: ProjectFormValues) => Promise<void>;
  project: Project | null;
}

/**
 * Initialize a local draft from a project or create defaults, track unsaved
 * changes, and delegate the normalized payload to App without mutating props.
 */
export function ProjectForm({
  error,
  isSubmitting,
  onCancel,
  onSubmit,
  project,
}: ProjectFormProps): ReactElement {
  const [title, setTitle] = useState(project?.title ?? '');
  const [description, setDescription] = useState(project?.description ?? '');
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? 'planned');
  const [priority, setPriority] = useState<ProjectPriority>(project?.priority ?? 'medium');
  const [progress, setProgress] = useState<number>(project?.progress ?? 0);
  const [startDate, setStartDate] = useState(project?.startDate?.slice(0, 10) ?? '');
  const [targetDate, setTargetDate] = useState(project?.targetDate?.slice(0, 10) ?? '');
  const [technologies, setTechnologies] = useState(project?.technologies ?? '');
  const [repositoryUrl, setRepositoryUrl] = useState(project?.repositoryUrl ?? '');
  const [liveUrl, setLiveUrl] = useState(project?.liveUrl ?? '');

  const isDirty =
    JSON.stringify([
      title,
      description,
      status,
      priority,
      progress,
      startDate,
      targetDate,
      technologies,
      repositoryUrl,
      liveUrl,
    ]) !==
    JSON.stringify([
      project?.title ?? '',
      project?.description ?? '',
      project?.status ?? 'planned',
      project?.priority ?? 'medium',
      project?.progress ?? 0,
      project?.startDate ?? '',
      project?.targetDate ?? '',
      project?.technologies ?? '',
      project?.repositoryUrl ?? '',
      project?.liveUrl ?? '',
    ]);
  /**
   * Ignore close requests while saving and ask before discarding a changed draft.
   */
  function requestClose() {
    if (!isSubmitting && (!isDirty || window.confirm('Discard your unsaved changes?'))) onCancel();
  }

  const isEditing = project !== null;

  /**
   * Read native date inputs from the submitted form, trim text and bound the
   * progress value. Completion always submits 100; the backend repeats validation.
   */
  async function submitProject(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    const normalizedProgress = Number.isFinite(progress) ? Math.min(100, Math.max(0, progress)) : 0;

    await onSubmit({
      title: title.trim(),
      description: description.trim(),
      status,
      priority,
      progress: status === 'completed' ? 100 : normalizedProgress,
      startDate: String(formData.get('startDate') || ''),
      targetDate: String(formData.get('targetDate') || ''),
      technologies: technologies.trim(),
      repositoryUrl: repositoryUrl.trim(),
      liveUrl: liveUrl.trim(),
    });
  }

  return (
    <Dialog labelId="project-form-title" onClose={requestClose} busy={isSubmitting}>
      <header className="dialog-header">
        <div>
          <span className="eyebrow">{isEditing ? 'Project management' : 'New workspace item'}</span>
          <h2 id="project-form-title">{isEditing ? 'Edit project' : 'Create project'}</h2>
        </div>

        <button
          aria-label="Close project form"
          className="dialog-close"
          disabled={isSubmitting}
          onClick={requestClose}
          type="button"
        >
          ×
        </button>
      </header>

      <form className="workspace-form" onSubmit={submitProject}>
        <label htmlFor="project-title">Project title</label>
        <input
          autoFocus
          disabled={isSubmitting}
          id="project-title"
          maxLength={150}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Enter a project title"
          required
          type="text"
          value={title}
        />

        <label htmlFor="project-description">Description</label>
        <textarea
          disabled={isSubmitting}
          id="project-description"
          maxLength={5000}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Describe the purpose of this project"
          rows={6}
          value={description}
        />

        <div className="form-row">
          <div>
            <label htmlFor="project-status">Status</label>
            <select
              disabled={isSubmitting}
              id="project-status"
              onChange={(event) => setStatus(event.target.value as ProjectStatus)}
              value={status}
            >
              <option value="planned">Planned</option>
              <option value="in_progress">In progress</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          <div>
            <label htmlFor="project-priority">Priority</label>
            <select
              disabled={isSubmitting}
              id="project-priority"
              onChange={(event) => setPriority(event.target.value as ProjectPriority)}
              value={priority}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
        </div>

        <div className="field-heading">
          <label htmlFor="project-progress">Progress</label>
          <span>{progress}%</span>
        </div>
        <div className="project-progress-control">
          <input
            disabled={isSubmitting}
            id="project-progress"
            max={100}
            min={0}
            onChange={(event) => {
              const nextValue = Number(event.target.value);
              setProgress(Number.isFinite(nextValue) ? nextValue : 0);
            }}
            type="range"
            value={progress}
          />
          <input
            aria-label="Progress percentage"
            className="progress-number-input"
            disabled={isSubmitting}
            max={100}
            min={0}
            onChange={(event) => {
              const nextValue = Number(event.target.value);
              setProgress(Number.isFinite(nextValue) ? Math.min(100, Math.max(0, nextValue)) : 0);
            }}
            type="number"
            value={progress}
          />
        </div>

        <div className="form-row">
          <div>
            <label htmlFor="project-start-date">Start date</label>
            <input
              disabled={isSubmitting}
              name="startDate"
              id="project-start-date"
              onInput={(event) => setStartDate(event.currentTarget.value)}
              type="date"
              defaultValue={project?.startDate?.slice(0, 10) ?? ''}
            />
          </div>

          <div>
            <label htmlFor="project-target-date">Target date</label>
            <input
              disabled={isSubmitting}
              min={startDate || undefined}
              name="targetDate"
              id="project-target-date"
              onInput={(event) => setTargetDate(event.currentTarget.value)}
              type="date"
              defaultValue={project?.targetDate?.slice(0, 10) ?? ''}
            />
          </div>
        </div>

        <label htmlFor="project-technologies">
          Technologies
          <span className="inline-optional">Optional</span>
        </label>
        <input
          disabled={isSubmitting}
          maxLength={500}
          id="project-technologies"
          onChange={(event) => setTechnologies(event.target.value)}
          placeholder="TypeScript, React, PostgreSQL"
          type="text"
          value={technologies}
        />

        <label htmlFor="project-repository-url">
          Repository URL
          <span className="inline-optional">Optional</span>
        </label>
        <input
          disabled={isSubmitting}
          maxLength={2048}
          id="project-repository-url"
          onChange={(event) => setRepositoryUrl(event.target.value)}
          placeholder="https://github.com/example/project"
          type="url"
          value={repositoryUrl}
        />

        <label htmlFor="project-live-url">
          Live website URL
          <span className="inline-optional">Optional</span>
        </label>
        <input
          disabled={isSubmitting}
          maxLength={2048}
          id="project-live-url"
          onChange={(event) => setLiveUrl(event.target.value)}
          placeholder="https://example.com"
          type="url"
          value={liveUrl}
        />

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
            {isSubmitting ? 'Saving…' : isEditing ? 'Save changes' : 'Create project'}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
