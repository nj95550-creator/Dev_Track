/**
 * Application controller for account state, workspace data and screen selection.
 * Components delegate API mutations here; account and workspace versions prevent
 * late asynchronous responses from replacing a newer account or saved record.
 */
import { useEffect, useRef, useState } from 'react';
import {
  Plus,
  Search,
  SlidersHorizontal,
  LayoutGrid,
  List,
  ChevronLeft,
  ChevronRight,
  X,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import './App.css';
import { usePreferences } from './hooks/usePreferences';
import { AppShell, type SectionKey } from './components/AppShell';
import { LandingPage } from './components/LandingPage';
import { AuthScreen } from './components/AuthScreen';
import { DashboardOverview } from './components/DashboardOverview';
import { LearningGoals } from './components/LearningGoals';
import { ProjectForm } from './components/ProjectForm';
import { LearningGoalForm } from './components/LearningGoalForm';
import { ProjectsPanel } from './components/ProjectsPanel';
import { Dialog } from './components/Dialog';
import { Settings } from './components/Settings';
import { Brand } from './components/Brand';
import { ApiError, cancelSessionRequests, changeAccountPassword, requestJson, setCsrfToken } from './lib/api';
import type {
  User,
  UserResponse,
  Project,
  LearningGoal,
  LoginCredentials,
  CreateProfileInput,
  ProjectFormValues,
  LearningGoalFormValues,
} from './types';
const byUpdated = <T extends { updatedAt: string; id: number }>(a: T, b: T) =>
  b.updatedAt.localeCompare(a.updatedAt) || b.id - a.id;
const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : 'Something went wrong. Please try again.';
const getSection = (): SectionKey =>
  ['overview', 'projects', 'learning-goals', 'settings'].includes(location.hash.slice(1))
    ? (location.hash.slice(1) as SectionKey)
    : 'overview';
/**
 * Own the signed-in workspace and coordinate child screens through callbacks.
 * Account changes invalidate pending work; saves update local state only after
 * the API returns the record that was actually persisted.
 */
export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [resetToken, setResetToken] = useState(() =>
    new URLSearchParams(location.search).get('reset'),
  );
  const [initializing, setInitializing] = useState(true);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>(location.hash === '#signup' ? 'signup' : 'login');
  const [showAuth, setShowAuth] = useState(['#login', '#signup'].includes(location.hash));
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [section, setSection] = useState<SectionKey>(getSection);
  const [projects, setProjects] = useState<Project[]>([]);
  const [goals, setGoals] = useState<LearningGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [revision, setRevision] = useState(0);
  // Editor state has three meanings: undefined closes, null creates, a record edits.
  const [projectForm, setProjectForm] = useState<Project | null | undefined>();
  const [goalForm, setGoalForm] = useState<LearningGoal | null | undefined>();
  const [formError, setFormError] = useState('');
  const [pending, setPending] = useState<string[]>([]);
  const [confirmation, setConfirmation] = useState<{
    kind: 'project' | 'goal';
    item: Project | LearningGoal;
  } | null>(null);
  const [actionError, setActionError] = useState('');
  const [toast, setToast] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [priority, setPriority] = useState('all');
  const [sort, setSort] = useState('updated');
  const [page, setPage] = useState(1);
  const { view, setView, theme, setTheme } = usePreferences();
  // Account epoch changes on session replacement; workspace version changes
  // after saves so an older load cannot overwrite more recent local records.
  const accountEpoch = useRef(0);
  const workspaceVersion = useRef(0);
  const titleRef = useRef(section);
  /**
   * Invalidate the loaded workspace snapshot and let the data-loading effect
   * fetch projects/goals together; a revision change is also the retry trigger.
   */
  function reloadWorkspace() {
    setLoading(true);
    setLoadError('');
    setRevision((r) => r + 1);
  }
  /**
   * Publish transient success feedback; the toast effect clears it after a delay.
   */
  function notify(message: string) {
    setToast(message);
  }
  /**
   * Keep section state and the URL hash aligned so browser history remains useful.
   */
  function navigate(next: SectionKey) {
    setSection(next);
    if (location.hash !== `#${next}`) location.hash = next;
  }
  /**
   * Clear both modal editors and their shared error state after cancel/save.
   */
  function closeForms() {
    setProjectForm(undefined);
    setGoalForm(undefined);
    setFormError('');
  }
  /**
   * Open one project draft and close the goal editor. Null means create; an
   * existing record means edit, while undefined represents a closed editor.
   */
  function openProject(project: Project | null) {
    setGoalForm(undefined);
    setProjectForm(project);
    setFormError('');
  }
  /**
   * Open a new or existing goal draft while ensuring only one editor is active.
   */
  function openGoal(goal: LearningGoal | null) {
    setProjectForm(undefined);
    setGoalForm(goal);
    setFormError('');
  }
  // Listen for browser Back/Forward hash changes as well as sidebar navigation.
  useEffect(() => {
    const change = () => setSection(getSection());
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  // Restore a useful focus target on screen changes and maintain a descriptive
  // page title without stealing focus from the global search input.
  useEffect(() => {
    if (titleRef.current !== section) {
      if (document.activeElement?.id !== 'workspace-search')
        document.getElementById('main-content')?.focus({ preventScroll: true });
      window.scrollTo({ top: 0 });
      titleRef.current = section;
    }
    document.title = !user
      ? (resetToken ? 'Reset password · DevTrack' : showAuth ? 'Sign in · DevTrack' : 'DevTrack · Projects, progress, and learning goals')
      : `${{ overview: 'Overview', projects: 'My projects', 'learning-goals': 'Learning goals', settings: 'Settings' }[section]} · DevTrack`;
  }, [section, user, resetToken, showAuth]);
  // Expire transient success feedback and cancel the previous timer on replacement.
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  // Restore the server-verified session before selecting a public/authenticated
  // screen; optional recovery configuration is fetched independently.
  useEffect(() => {
    const controller = new AbortController();
    void requestJson<{ recoveryAvailable: boolean }>('/api/config', {
      signal: controller.signal,
    })
      .then((r) => setRecovery(r.recoveryAvailable))
      .catch(() => {});
    void requestJson<UserResponse>('/api/session', {
      signal: controller.signal,
    })
      .then((r) => {
        if (!controller.signal.aborted) {
          setCsrfToken(r.csrfToken || '');
          setUser(r.user);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted && !(e instanceof ApiError && e.status === 401))
          setAuthError(errorMessage(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setInitializing(false);
      });
    return () => controller.abort();
  }, []);
  // Treat current-session expiry as an account boundary: hide stale data and
  // prevent any pending response from repopulating the signed-out workspace.
  useEffect(() => {
    const expired = () => {
      accountEpoch.current++;
      setPasswordBusy(false);
      cancelSessionRequests();
      setUser(null);
      setProjects([]);
      setGoals([]);
      setCsrfToken('');
      setPending([]);
      setProjectForm(undefined);
      setGoalForm(undefined);
      setConfirmation(null);
      setShowAuth(true);
      setAuthError('Your session has ended. Sign in to continue.');
    };
    window.addEventListener('devtrack:expired', expired);
    return () => window.removeEventListener('devtrack:expired', expired);
  }, []);
  const userId = user?.id;
  // Load both collections for one account/snapshot. Cleanup cancels a superseded
  // load; version checks below decide when a fresh read is needed after a save.
  useEffect(() => {
    if (!userId || resetToken) return;
    const controller = new AbortController();
    const epoch = accountEpoch.current;
    const version = workspaceVersion.current;
    const current = () => !controller.signal.aborted && epoch === accountEpoch.current;
    void Promise.all([
      requestJson<{ projects: Project[] }>('/api/projects', {
        signal: controller.signal,
      }),
      requestJson<{ goals: LearningGoal[] }>('/api/learning-goals', {
        signal: controller.signal,
      }),
    ])
      .then(([p, g]) => {
        if (current()) {
          // A save may finish after this snapshot was read. Fetch a new snapshot
          // instead of replacing the saved change or dropping older records.
          if (version !== workspaceVersion.current) {
            reloadWorkspace();
            return;
          }
          setProjects(p.projects.sort(byUpdated));
          setGoals(g.goals.sort(byUpdated));
        }
      })
      .catch((e) => {
        if (current()) {
          if (version !== workspaceVersion.current) reloadWorkspace();
          else setLoadError(errorMessage(e));
        }
      })
      .finally(() => {
        if (current() && version === workspaceVersion.current) setLoading(false);
      });
    return () => controller.abort();
  }, [userId, revision, resetToken]);
  /**
   * Remove reset mode; a completed reset also discards the prior account UI
   * because the recovery token may have belonged to a different account.
   */
  function exitPasswordReset(completed: boolean) {
    setResetToken(null);
    setShowAuth(true);
    if (!completed) return;
    // The reset endpoint clears the browser cookie. Discard the previously
    // restored account too; a recovery token may belong to a different account.
    accountEpoch.current++;
    setPasswordBusy(false);
    cancelSessionRequests();
    setUser(null);
    setCsrfToken('');
    setProjects([]);
    setGoals([]);
    setPending([]);
    closeForms();
    setConfirmation(null);
    setAuthError('');
    setToast('');
    setSection('overview');
  }
  /**
   * Share signup/login/demo completion handling and replace all account-bound
   * state only after the server has established the new session cookie.
   */
  async function authenticate(path: string, body: unknown) {
    if (authBusy) return;
    setAuthBusy(true);
    setAuthError('');
    try {
      const result = await requestJson<UserResponse>(`/api/${path}`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      accountEpoch.current++;
      setPasswordBusy(false);
      cancelSessionRequests();
      setCsrfToken(result.csrfToken || '');
      setProjects([]);
      setGoals([]);
      setLoadError('');
      setLoading(true);
      setUser(result.user);
      navigate('overview');
    } catch (e) {
      setAuthError(errorMessage(e));
    } finally {
      setAuthBusy(false);
    }
  }
  /**
   * Revoke the server session before clearing the current account. A response
   * that belongs to an older account generation must not sign out its replacement.
   */
  async function logout() {
    const key = 'logout';
    if (pending.includes(key)) return;
    const epoch = accountEpoch.current;
    setPending((p) => [...p, key]);
    try {
      await requestJson('/api/logout', { method: 'POST', body: '{}' });
      if (epoch !== accountEpoch.current) return;
      accountEpoch.current++;
      setPasswordBusy(false);
      cancelSessionRequests();
      setCsrfToken('');
      setUser(null);
      setProjects([]);
      setGoals([]);
      setPending([]);
      closeForms();
      setConfirmation(null);
      setAuthError('');
      setToast('');
      setShowAuth(true);
      setAuthMode('login');
      history.replaceState(null, '', '/');
      setSection('overview');
    } catch (e) {
      if (epoch !== accountEpoch.current) return;
      setActionError(errorMessage(e));
      setPending((p) => p.filter((k) => k !== key));
    }
  }
  /**
   * Keep password completion above the Settings lifecycle and show feedback
   * only for the account that initiated the operation. API synchronization owns
   * the replacement token even if this screen is no longer visible.
   */
  async function changePassword(currentPassword: string, password: string) {
    const epoch = accountEpoch.current;
    setPasswordBusy(true);
    try {
      const changed = await changeAccountPassword(currentPassword, password);
      if (epoch !== accountEpoch.current || !changed) return false;
      notify('Password updated. Other sessions have been signed out.');
      return true;
    } finally {
      if (epoch === accountEpoch.current) setPasswordBusy(false);
    }
  }
  /**
   * Create or edit through the API, then replace the matching local record with
   * the server response. The account/version checks protect against stale replies
   * and snapshots while pending state prevents repeated form submissions.
   */
  async function saveProject(values: ProjectFormValues) {
    if (pending.includes('form')) return;
    const epoch = accountEpoch.current;
    const current = projectForm;
    setPending((p) => [...p, 'form']);
    setFormError('');
    try {
      const body = {
        ...values,
        startDate: values.startDate || null,
        targetDate: values.targetDate || null,
      };
      const result = await requestJson<{ project: Project }>(
        current ? `/api/projects/${current.id}` : '/api/projects',
        { method: current ? 'PATCH' : 'POST', body: JSON.stringify(body) },
      );
      if (epoch !== accountEpoch.current) return;
      workspaceVersion.current++;
      setProjects((p) =>
        [result.project, ...p.filter((x) => x.id !== result.project.id)].sort(byUpdated),
      );
      closeForms();
      notify(
        current ? 'Project updated.' : 'Project created.',
      );
    } catch (e) {
      if (epoch === accountEpoch.current) setFormError(errorMessage(e));
    } finally {
      if (epoch === accountEpoch.current) setPending((p) => p.filter((k) => k !== 'form'));
    }
  }
  /**
   * Persist a new/edited goal and update the current account's cached list only
   * after success; leave the editor open with feedback when the request fails.
   */
  async function saveGoal(values: LearningGoalFormValues) {
    if (pending.includes('form')) return;
    const epoch = accountEpoch.current;
    const current = goalForm;
    setPending((p) => [...p, 'form']);
    setFormError('');
    try {
      const result = await requestJson<{ goal: LearningGoal }>(
        current ? `/api/learning-goals/${current.id}` : '/api/learning-goals',
        { method: current ? 'PATCH' : 'POST', body: JSON.stringify(values) },
      );
      if (epoch !== accountEpoch.current) return;
      workspaceVersion.current++;
      setGoals((g) =>
        [result.goal, ...g.filter((x) => x.id !== result.goal.id)].sort(byUpdated),
      );
      closeForms();
      notify(current ? 'Learning goal updated.' : 'Learning goal created.');
    } catch (e) {
      if (epoch === accountEpoch.current) setFormError(errorMessage(e));
    } finally {
      if (epoch === accountEpoch.current) setPending((p) => p.filter((k) => k !== 'form'));
    }
  }
  /**
   * Toggle completion through a partial update. Track pending state per goal
   * so other goal actions stay usable while this row is being saved.
   */
  async function toggleGoal(goal: LearningGoal) {
    const key = `goal-${goal.id}`;
    if (pending.includes(key)) return;
    const epoch = accountEpoch.current;
    setPending((p) => [...p, key]);
    setActionError('');
    try {
      const result = await requestJson<{ goal: LearningGoal }>(
        `/api/learning-goals/${goal.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            status: goal.status === 'completed' ? 'in_progress' : 'completed',
          }),
        },
      );
      if (epoch !== accountEpoch.current) return;
      workspaceVersion.current++;
      setGoals((g) => [result.goal, ...g.filter((x) => x.id !== goal.id)].sort(byUpdated));
      notify(
        result.goal.status === 'completed'
          ? 'Goal completed.'
          : 'Goal reopened.',
      );
    } catch (e) {
      if (epoch === accountEpoch.current) setActionError(errorMessage(e));
    } finally {
      if (epoch === accountEpoch.current) setPending((p) => p.filter((k) => k !== key));
    }
  }
  /**
   * Delete the confirmed record and mirror database relationship behavior:
   * removing a project keeps its goals and clears their project association.
   */
  async function removeItem() {
    if (!confirmation || pending.includes('delete')) return;
    const epoch = accountEpoch.current;
    const { kind, item } = confirmation;
    setPending((p) => [...p, 'delete']);
    setActionError('');
    try {
      await requestJson(
        `/api/${kind === 'project' ? 'projects' : 'learning-goals'}/${item.id}`,
        {
          method: 'DELETE',
          body: '{}',
        },
      );
      if (epoch !== accountEpoch.current) return;
      workspaceVersion.current++;
      if (kind === 'project') {
        setProjects((p) => p.filter((x) => x.id !== item.id));
        setGoals((g) =>
          g.map((x) => (x.projectId === item.id ? { ...x, projectId: null } : x)),
        );
      } else setGoals((g) => g.filter((x) => x.id !== item.id));
      setConfirmation(null);
      notify(`${kind === 'project' ? 'Project' : 'Learning goal'} deleted.`);
    } catch (e) {
      if (epoch === accountEpoch.current) setActionError(errorMessage(e));
    } finally {
      if (epoch === accountEpoch.current) setPending((p) => p.filter((k) => k !== 'delete'));
    }
  }
  /**
   * Ask the backend to seed an empty workspace, then reload both collections
   * so server-assigned IDs and project/goal relationships remain authoritative.
   */
  async function samples() {
    if (pending.includes('samples')) return;
    const epoch = accountEpoch.current;
    setPending((p) => [...p, 'samples']);
    try {
      await requestJson('/api/sample-data', { method: 'POST', body: '{}' });
      if (epoch !== accountEpoch.current) return;
      workspaceVersion.current++;
      reloadWorkspace();
      notify('Sample projects and goals added.');
    } catch (e) {
      if (epoch === accountEpoch.current) setActionError(errorMessage(e));
    } finally {
      if (epoch === accountEpoch.current) setPending((p) => p.filter((k) => k !== 'samples'));
    }
  }
  // Session restoration must finish before showing a visitor page or private data.
  if (initializing)
    return (
      <div className="app-loading">
        <Brand compact />
        <span className="loading-spinner" />
        <p>Getting your workspace ready…</p>
      </div>
    );
  if (!user && !resetToken && !showAuth)
    return <LandingPage busy={authBusy} error={authError}
      onDemo={() => void authenticate('demo', {})}
      onSignIn={() => { setAuthMode('login'); setShowAuth(true); }}
      onSignUp={() => { setAuthMode('signup'); setShowAuth(true); }} />;
  if (!user || resetToken)
    return (<>
      {!resetToken && <button className="text-button auth-home" onClick={() => { setShowAuth(false); setAuthError(''); }}>← Back to DevTrack</button>}
      <AuthScreen
        initialMode={authMode}
        error={authError}
        isSubmitting={authBusy}
        onClearError={() => setAuthError('')}
        onCreateProfile={(p: CreateProfileInput) => authenticate('users', p)}
        onLogin={(p: LoginCredentials) => authenticate('login', p)}
        onDemo={() => void authenticate('demo', {})}
        recoveryAvailable={recovery}
        resetToken={resetToken}
        onExitReset={exitPasswordReset}
      />
    </>);
  // Filters, ordering and pagination are derived from saved records; they do
  // not change the stored project list or issue mutations.
  const filtered = projects
    .filter(
      (p) =>
        (status === 'all' || p.status === status) &&
        (priority === 'all' || p.priority === priority) &&
        `${p.title} ${p.description} ${p.technologies || ''}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === 'title'
        ? a.title.localeCompare(b.title)
        : sort === 'progress'
          ? b.progress - a.progress
          : sort === 'due'
            ? (a.targetDate || '9999').localeCompare(b.targetDate || '9999')
            : byUpdated(a, b),
    );
  const totalPages = Math.max(1, Math.ceil(filtered.length / 9));
  const visiblePage = Math.min(page, totalPages);
  const visible = filtered.slice((visiblePage - 1) * 9, visiblePage * 9);
  const average = projects.length
    ? Math.round(projects.reduce((n, p) => n + p.progress, 0) / projects.length)
    : 0;
  /**
   * Open the confirmation with the exact selected record and clear unrelated
   * action feedback before the user chooses whether to delete it.
   */
  function askDelete(kind: 'project' | 'goal', item: Project | LearningGoal) {
    setActionError('');
    setConfirmation({ kind, item });
  }
  return (
    <>
      <AppShell
        activeSection={section}
        onSectionChange={navigate}
        onSignOut={() => void logout()}
        user={user}
        projectCount={projects.length}
        goalCount={goals.filter((g) => g.status !== 'completed').length}
        averageProgress={average}
        onNewProject={() => openProject(null)}
        searchValue={query}
        onSearch={(q) => {
          setQuery(q);
          setStatus('all');
          setPriority('all');
          setPage(1);
          navigate('projects');
        }}
      >
        {actionError && !confirmation && (
          <div className="inline-error" role="alert">
            <span>{actionError}</span>
            <button
              className="icon-button"
              aria-label="Dismiss error"
              onClick={() => setActionError('')}
            >
              <X size={15} />
            </button>
          </div>
        )}
        {user.isDemo && (
          <div className="demo-banner">
            <span>
              <span className="live-dot" /> DEMO WORKSPACE
            </span>
            <p>Try everything. This workspace belongs only to your demo session.</p>
          </div>
        )}
        {section === 'overview' && (
          <DashboardOverview
            error={loadError}
            goals={goals}
            isLoading={loading}
            onRetry={reloadWorkspace}
            onViewAllProjects={() => navigate('projects')}
            projects={projects}
            user={user}
            onNewProject={() => openProject(null)}
            onNewGoal={() => openGoal(null)}
            onViewGoals={() => navigate('learning-goals')}
            onEditProject={openProject}
            onDeleteProject={(p) => askDelete('project', p)}
            isPending={(id) => pending.includes(`project-${id}`)}
            onToggleGoal={(g) => void toggleGoal(g)}
            onSamples={() => void samples()}
          />
        )}
        {section === 'projects' && (
          <div className="page-stack">
            <header className="page-intro">
              <div>
                <span className="section-eyebrow">FROM IDEA TO SOMETHING REAL</span>
                <h1>
                  Good work starts here<span>.</span>
                </h1>
                <p>A home for your ideas, experiments, and everything you’re building.</p>
              </div>
              <button className="primary-button" onClick={() => openProject(null)}>
                <Plus size={17} /> New project
              </button>
            </header>
            <div className="projects-controls">
              <div className="filter-tabs" aria-label="Project status">
                {[
                  { key: 'all', label: 'All projects' },
                  { key: 'in_progress', label: 'In progress' },
                  { key: 'planned', label: 'Planned' },
                  { key: 'completed', label: 'Completed' },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    aria-pressed={status === key}
                    className={status === key ? 'active' : ''}
                    onClick={() => {
                      setStatus(key);
                      setPage(1);
                    }}
                  >
                    {label}
                    <span>
                      {projects.filter((p) => key === 'all' || p.status === key).length}
                    </span>
                  </button>
                ))}
              </div>
              <div className="filter-toolbar">
                <div className="input-with-icon">
                  <Search size={16} />
                  <input
                    type="search"
                    aria-label="Search projects"
                    placeholder="Search by name or technology…"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setPage(1);
                    }}
                  />
                </div>
                <div className="filter-actions">
                  <label className="select-with-icon">
                    <SlidersHorizontal size={14} />
                    <select
                      aria-label="Filter by priority"
                      value={priority}
                      onChange={(e) => {
                        setPriority(e.target.value);
                        setPage(1);
                      }}
                    >
                      <option value="all">All priorities</option>
                      <option value="high">High priority</option>
                      <option value="medium">Medium priority</option>
                      <option value="low">Low priority</option>
                    </select>
                  </label>
                  <select
                    className="sort-select"
                    aria-label="Sort projects"
                    value={sort}
                    onChange={(e) => {
                      setSort(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="updated">Recently updated</option>
                    <option value="title">Name A–Z</option>
                    <option value="due">Due date</option>
                    <option value="progress">Progress</option>
                  </select>
                  <div className="view-toggle">
                    <button
                      aria-label="Grid view"
                      aria-pressed={view === 'grid'}
                      className={view === 'grid' ? 'active' : ''}
                      onClick={() => setView('grid')}
                    >
                      <LayoutGrid size={16} />
                    </button>
                    <button
                      aria-label="List view"
                      aria-pressed={view === 'list'}
                      className={view === 'list' ? 'active' : ''}
                      onClick={() => setView('list')}
                    >
                      <List size={17} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <ProjectsPanel
              title={query ? `Results for “${query}”` : 'Your project collection'}
              projects={visible}
              listView={view === 'list'}
              error={loadError}
              isLoading={loading}
              isProjectActionPending={(id) => pending.includes(`project-${id}`)}
              onEditProject={openProject}
              onDeleteProject={(p) => askDelete('project', p)}
              onRetry={reloadWorkspace}
            />
            {!loading && filtered.length > 0 && (
              <div className="pagination">
                <span>
                  Showing {(visiblePage - 1) * 9 + 1}–
                  {Math.min(visiblePage * 9, filtered.length)} of {filtered.length} projects
                </span>
                <div>
                  <button
                    className="icon-button"
                    aria-label="Previous page"
                    disabled={visiblePage === 1}
                    onClick={() => setPage(visiblePage - 1)}
                  >
                    <ChevronLeft size={17} />
                  </button>
                  <span>
                    {visiblePage} / {totalPages}
                  </span>
                  <button
                    className="icon-button"
                    aria-label="Next page"
                    disabled={visiblePage === totalPages}
                    onClick={() => setPage(visiblePage + 1)}
                  >
                    <ChevronRight size={17} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        {section === 'learning-goals' && (
          <LearningGoals
            actionError=""
            error={loadError}
            goals={goals}
            isGoalActionPending={(id) => pending.includes(`goal-${id}`)}
            isLoading={loading}
            onClearActionError={() => setActionError('')}
            onCreateGoal={() => openGoal(null)}
            onDeleteGoal={(g) => askDelete('goal', g)}
            onEditGoal={openGoal}
            onRetry={reloadWorkspace}
            onToggleGoalStatus={(g) => void toggleGoal(g)}
            projects={projects}
          />
        )}
        {section === 'settings' && (
          <Settings
            key={user.id}
            user={user}
            projects={projects}
            goals={goals}
            onUser={setUser}
            onNotify={notify}
            theme={theme}
            onTheme={setTheme}
            recoveryAvailable={recovery}
            dataReady={!loading && !loadError}
            onChangePassword={changePassword}
            passwordBusy={passwordBusy}
          />
        )}
        {projectForm !== undefined && (
          <ProjectForm
            key={projectForm?.id || 'new'}
            error={formError}
            isSubmitting={pending.includes('form')}
            onCancel={closeForms}
            onSubmit={saveProject}
            project={projectForm}
          />
        )}
        {goalForm !== undefined && (
          <LearningGoalForm
            key={goalForm?.id || 'new'}
            error={formError}
            goal={goalForm}
            isSubmitting={pending.includes('form')}
            onCancel={closeForms}
            onSubmit={saveGoal}
            projects={projects}
          />
        )}
        {confirmation && (
          <Dialog
            labelId="delete-title"
            className="confirm-dialog"
            onClose={() => {
              setConfirmation(null);
              setActionError('');
            }}
            busy={pending.includes('delete')}
          >
            <div className="confirm-icon">
              <AlertTriangle size={23} />
            </div>
            <h2 id="delete-title">
              Delete this {confirmation.kind === 'project' ? 'project' : 'learning goal'}?
            </h2>
            <p>
              <strong>{confirmation.item.title}</strong> will be permanently deleted.
              {confirmation.kind === 'project'
                ? ' Connected learning goals will stay in your workspace.'
                : ''}
            </p>
            {actionError && (
              <p className="error-message" role="alert">
                {actionError}
              </p>
            )}
            <div className="dialog-actions">
              <button
                className="secondary-button"
                disabled={pending.includes('delete')}
                onClick={() => setConfirmation(null)}
              >
                Keep it
              </button>
              <button
                className="danger-button"
                disabled={pending.includes('delete')}
                onClick={() => void removeItem()}
              >
                {pending.includes('delete') ? 'Deleting…' : 'Delete permanently'}
              </button>
            </div>
          </Dialog>
        )}
      </AppShell>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          <span>{toast}</span>
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setToast('')}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </>
  );
}
