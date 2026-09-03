import {
  useEffect,
  useState,
  type ReactElement,
} from "react";
import "./App.css";
import { AppShell, type SectionKey } from "./components/AppShell";
import { AuthScreen } from "./components/AuthScreen";
import { DashboardOverview } from "./components/DashboardOverview";
import { LearningGoalForm } from "./components/LearningGoalForm";
import { LearningGoals } from "./components/LearningGoals";
import { ProjectForm } from "./components/ProjectForm";
import { ProjectsPanel } from "./components/ProjectsPanel";
import { requestJson } from "./lib/api";
import type {
  CreateProfileInput,
  LearningGoal,
  LearningGoalFormValues,
  LearningGoalsResponse,
  LoginCredentials,
  Project,
  ProjectFormValues,
  ProjectResponse,
  SingleLearningGoalResponse,
  SingleProjectResponse,
  User,
  UserResponse,
} from "./types";

// App owns authentication, remote collections, form dialogs, and API mutations.
const USER_STORAGE_KEY = "devtrack-user";

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function readStoredUser(): User | null {
  if (typeof window === "undefined") {
    return null;
  }

  const rawUser = window.sessionStorage.getItem(USER_STORAGE_KEY);

  if (!rawUser) {
    return null;
  }

  try {
    const parsedUser = JSON.parse(rawUser) as Partial<User>;

    return parsedUser && typeof parsedUser.id === "number" ? (parsedUser as User) : null;
  } catch {
    window.sessionStorage.removeItem(USER_STORAGE_KEY);
    return null;
  }
}

function App(): ReactElement {
  const [currentUser, setCurrentUser] = useState<User | null>(readStoredUser);
  const [projects, setProjects] = useState<Project[]>([]);
  const [goals, setGoals] = useState<LearningGoal[]>([]);
  const [activeSection, setActiveSection] = useState<SectionKey>("overview");
  const [authenticationError, setAuthenticationError] = useState("");
  const [projectError, setProjectError] = useState("");
  const [goalError, setGoalError] = useState("");
  const [goalActionError, setGoalActionError] = useState("");
  const [projectFormError, setProjectFormError] = useState("");
  const [goalFormError, setGoalFormError] = useState("");
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [isLoadingGoals, setIsLoadingGoals] = useState(false);
  const [isSubmittingProjectForm, setIsSubmittingProjectForm] = useState(false);
  const [isSubmittingGoalForm, setIsSubmittingGoalForm] = useState(false);
  const [projectRequestVersion, setProjectRequestVersion] = useState(0);
  const [goalRequestVersion, setGoalRequestVersion] = useState(0);
  const [projectFormProject, setProjectFormProject] = useState<Project | null>(null);
  const [isProjectFormOpen, setIsProjectFormOpen] = useState(false);
  const [goalFormGoal, setGoalFormGoal] = useState<LearningGoal | null>(null);
  const [isGoalFormOpen, setIsGoalFormOpen] = useState(false);
  const [pendingProjectActionIds, setPendingProjectActionIds] = useState<number[]>([]);
  const [pendingGoalActionIds, setPendingGoalActionIds] = useState<number[]>([]);

  useEffect(() => {
    // Session storage keeps the current profile across reloads without persisting credentials.
    if (currentUser === null) {
      window.sessionStorage.removeItem(USER_STORAGE_KEY);
      return;
    }

    window.sessionStorage.setItem(USER_STORAGE_KEY, JSON.stringify(currentUser));
  }, [currentUser]);

  useEffect(() => {
    // Each collection request is cancellable so unmounted views cannot receive stale updates.
    if (currentUser === null) {
      return;
    }

    const userId = currentUser.id;
    const requestController = new AbortController();

    async function loadProjects(): Promise<void> {
      setIsLoadingProjects(true);
      setProjectError("");

      try {
        const response = await requestJson<ProjectResponse>(
          `/api/projects?userId=${userId}`,
          { signal: requestController.signal }
        );

        setProjects(response.projects);
      } catch (error: unknown) {
        if (!requestController.signal.aborted) {
          setProjectError(
            getErrorMessage(error, "Projects could not be loaded.")
          );
        }
      } finally {
        if (!requestController.signal.aborted) {
          setIsLoadingProjects(false);
        }
      }
    }

    void loadProjects();

    return () => {
      requestController.abort();
    };
  }, [currentUser, projectRequestVersion]);

  useEffect(() => {
    // Goals use the same owner-scoped API flow as projects, with independent loading state.
    if (currentUser === null) {
      return;
    }

    const userId = currentUser.id;
    const requestController = new AbortController();

    async function loadGoals(): Promise<void> {
      setIsLoadingGoals(true);
      setGoalError("");

      try {
        const response = await requestJson<LearningGoalsResponse>(
          `/api/learning-goals?userId=${userId}`,
          { signal: requestController.signal }
        );

        setGoals(response.goals);
      } catch (error: unknown) {
        if (!requestController.signal.aborted) {
          setGoalError(getErrorMessage(error, "Learning goals could not be loaded."));
        }
      } finally {
        if (!requestController.signal.aborted) {
          setIsLoadingGoals(false);
        }
      }
    }

    void loadGoals();

    return () => {
      requestController.abort();
    };
  }, [currentUser, goalRequestVersion]);

  async function handleLogin(credentials: LoginCredentials): Promise<void> {
    // Authentication returns a public user record; the backend retains password hashes only.
    setIsAuthenticating(true);
    setAuthenticationError("");

    try {
      const response = await requestJson<UserResponse>("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });

      setCurrentUser(response.user);
      setActiveSection("overview");
    } catch (error: unknown) {
      setAuthenticationError(
        getErrorMessage(error, "Sign in could not be completed.")
      );
    } finally {
      setIsAuthenticating(false);
    }
  }

  async function handleCreateProfile(
    profile: CreateProfileInput
  ): Promise<void> {
    setIsAuthenticating(true);
    setAuthenticationError("");

    try {
      const response = await requestJson<UserResponse>("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });

      setCurrentUser(response.user);
      setActiveSection("overview");
    } catch (error: unknown) {
      setAuthenticationError(
        getErrorMessage(error, "The profile could not be created.")
      );
    } finally {
      setIsAuthenticating(false);
    }
  }

  function closeAllForms(): void {
    setProjectFormError("");
    setGoalFormError("");
    setProjectFormProject(null);
    setGoalFormGoal(null);
    setIsProjectFormOpen(false);
    setIsGoalFormOpen(false);
  }

  function handleLogout(): void {
    setCurrentUser(null);
    setProjects([]);
    setGoals([]);
    setProjectError("");
    setGoalError("");
    setGoalActionError("");
    closeAllForms();
    setAuthenticationError("");
    setIsLoadingProjects(false);
    setIsLoadingGoals(false);
    setActiveSection("overview");
  }

  function handleSectionChange(nextSection: SectionKey): void {
    setActiveSection(nextSection);

    if (nextSection === "overview") {
      closeAllForms();
      return;
    }

    if (nextSection === "projects") {
      setGoalFormError("");
      setGoalFormGoal(null);
      setIsGoalFormOpen(false);
      return;
    }

    setProjectFormError("");
    setProjectFormProject(null);
    setIsProjectFormOpen(false);
  }

  function beginProjectCreate(): void {
    setProjectFormError("");
    setProjectFormProject(null);
    setIsProjectFormOpen(true);
    setGoalFormError("");
    setGoalFormGoal(null);
    setIsGoalFormOpen(false);
  }

  function beginProjectEdit(project: Project): void {
    setProjectFormError("");
    setProjectFormProject(project);
    setIsProjectFormOpen(true);
    setGoalFormError("");
    setGoalFormGoal(null);
    setIsGoalFormOpen(false);
  }

  function closeProjectForm(): void {
    setProjectFormError("");
    setProjectFormProject(null);
    setIsProjectFormOpen(false);
  }

  function beginGoalCreate(): void {
    setGoalFormError("");
    setGoalFormGoal(null);
    setIsGoalFormOpen(true);
    setProjectFormError("");
    setProjectFormProject(null);
    setIsProjectFormOpen(false);
  }

  function beginGoalEdit(goal: LearningGoal): void {
    setGoalFormError("");
    setGoalFormGoal(goal);
    setIsGoalFormOpen(true);
    setProjectFormError("");
    setProjectFormProject(null);
    setIsProjectFormOpen(false);
  }

  function closeGoalForm(): void {
    setGoalFormError("");
    setGoalFormGoal(null);
    setIsGoalFormOpen(false);
  }

  async function saveProjectForm(values: ProjectFormValues): Promise<void> {
    // Form values are normalized into the backend's project request shape.
    if (currentUser === null) {
      return;
    }

    setIsSubmittingProjectForm(true);
    setProjectFormError("");

    try {
      const userId = currentUser.id;
      const requestBody = {
        userId,
        title: values.title,
        description: values.description,
        status: values.status,
        priority: values.priority,
        progress: values.progress,
        startDate: values.startDate || null,
        targetDate: values.targetDate || null,
        technologies: values.technologies.trim() || null,
        repositoryUrl: values.repositoryUrl.trim() || null,
        liveUrl: values.liveUrl.trim() || null,
      };

      const activeProject = projectFormProject;

      if (activeProject !== null) {
        const response = await requestJson<SingleProjectResponse>(`/api/projects/${activeProject.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });

        setProjects((previousProjects) =>
          previousProjects.map((project) =>
            project.id === response.project.id ? response.project : project
          )
        );
        closeProjectForm();
        return;
      }

      const response = await requestJson<SingleProjectResponse>("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      setProjects((previousProjects) => [response.project, ...previousProjects]);
      closeProjectForm();
      setProjectRequestVersion((version) => version + 1);
    } catch (error: unknown) {
      setProjectFormError(getErrorMessage(error, "The project could not be saved."));
    } finally {
      setIsSubmittingProjectForm(false);
    }
  }

  async function saveGoalForm(values: LearningGoalFormValues): Promise<void> {
    // Goal creation and edits use owner IDs and preserve optional project links.
    if (currentUser === null) {
      return;
    }

    setIsSubmittingGoalForm(true);
    setGoalFormError("");

    try {
      const userId = currentUser.id;
      const requestBase = {
        userId,
        projectId: values.projectId,
        title: values.title,
        description: values.description,
        targetDate: values.targetDate,
      };

      const activeGoal = goalFormGoal;

      if (activeGoal !== null) {
        const response = await requestJson<SingleLearningGoalResponse>(`/api/learning-goals/${activeGoal.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...requestBase, status: values.status }),
        });

        setGoals((previousGoals) =>
          previousGoals.map((goal) =>
            goal.id === response.goal.id ? response.goal : goal
          )
        );
        closeGoalForm();
        return;
      }

      let createdGoal: LearningGoal;

      if (values.status === "planned") {
        const response = await requestJson<SingleLearningGoalResponse>("/api/learning-goals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBase),
        });

        createdGoal = response.goal;
      } else {
        const createdResponse = await requestJson<SingleLearningGoalResponse>("/api/learning-goals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBase),
        });

        const patchedResponse = await requestJson<SingleLearningGoalResponse>(`/api/learning-goals/${createdResponse.goal.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId,
            projectId: values.projectId,
            title: values.title,
            description: values.description,
            status: values.status,
            targetDate: values.targetDate,
          }),
        });

        createdGoal = patchedResponse.goal;
      }

      setGoals((previousGoals) => [createdGoal, ...previousGoals]);
      closeGoalForm();
      setGoalRequestVersion((version) => version + 1);
    } catch (error: unknown) {
      setGoalFormError(getErrorMessage(error, "The learning goal could not be saved."));
    } finally {
      setIsSubmittingGoalForm(false);
    }
  }

  async function deleteProject(project: Project): Promise<void> {
    if (currentUser === null) {
      return;
    }

    if (!window.confirm(`Delete "${project.title}"? This cannot be undone.`)) {
      return;
    }

    setPendingProjectActionIds((previousIds) => [...previousIds, project.id]);

    try {
      await requestJson<{ message: string }>(`/api/projects/${project.id}?userId=${currentUser.id}`, {
        method: "DELETE",
      });

      setProjects((previousProjects) =>
        previousProjects.filter((item) => item.id !== project.id)
      );
    } catch (error: unknown) {
      setProjectError(getErrorMessage(error, "The project could not be deleted."));
    } finally {
      setPendingProjectActionIds((previousIds) =>
        previousIds.filter((item) => item !== project.id)
      );
    }
  }

  async function deleteGoal(goal: LearningGoal): Promise<void> {
    if (currentUser === null) {
      return;
    }

    if (!window.confirm(`Delete "${goal.title}"? This cannot be undone.`)) {
      return;
    }

    setGoalActionError("");
    setPendingGoalActionIds((previousIds) => [...previousIds, goal.id]);

    try {
      await requestJson<{ message: string }>(`/api/learning-goals/${goal.id}?userId=${currentUser.id}`, {
        method: "DELETE",
      });

      setGoals((previousGoals) =>
        previousGoals.filter((item) => item.id !== goal.id)
      );
    } catch (error: unknown) {
      setGoalActionError(getErrorMessage(error, "The learning goal could not be deleted."));
    } finally {
      setPendingGoalActionIds((previousIds) =>
        previousIds.filter((item) => item !== goal.id)
      );
    }
  }

  async function toggleGoalStatus(goal: LearningGoal): Promise<void> {
    if (currentUser === null) {
      return;
    }

    if (pendingGoalActionIds.includes(goal.id)) {
      return;
    }

    const nextStatus = goal.status === "completed" ? "in_progress" : "completed";

    setGoalActionError("");
    setPendingGoalActionIds((previousIds) => [...previousIds, goal.id]);

    try {
      const response = await requestJson<SingleLearningGoalResponse>(`/api/learning-goals/${goal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: currentUser.id,
          status: nextStatus,
        }),
      });

      setGoals((previousGoals) =>
        previousGoals.map((item) =>
          item.id === response.goal.id ? response.goal : item
        )
      );
    } catch (error: unknown) {
      setGoalActionError(
        getErrorMessage(error, "The learning goal status could not be updated.")
      );
    } finally {
      setPendingGoalActionIds((previousIds) =>
        previousIds.filter((item) => item !== goal.id)
      );
    }
  }

  const showProjectForm = activeSection === "projects" && isProjectFormOpen;
  const showGoalForm = activeSection === "learning-goals" && isGoalFormOpen;

  if (currentUser === null) {
    return (
      <AuthScreen
        error={authenticationError}
        isSubmitting={isAuthenticating}
        onClearError={() => setAuthenticationError("")}
        onCreateProfile={handleCreateProfile}
        onLogin={handleLogin}
      />
    );
  }

  return (
    <AppShell
      activeSection={activeSection}
      onSectionChange={handleSectionChange}
      onSignOut={handleLogout}
      user={currentUser}
    >
      {activeSection === "overview" && (
        <DashboardOverview
          error={projectError}
          goals={goals}
          isLoading={isLoadingProjects}
          onRetry={() => setProjectRequestVersion((version) => version + 1)}
          onViewAllProjects={() => setActiveSection("projects")}
          projects={projects}
          user={currentUser}
        />
      )}

      {activeSection === "projects" && (
        <div className="page-stack">
          <header className="page-intro">
            <div>
              <span className="eyebrow">Project workspace</span>
              <h2>Your projects</h2>
              <p>
                Review every project and see what is planned, active, or
                completed.
              </p>
            </div>
          </header>

          <ProjectsPanel
            action={
              <button
                className="primary-button action-button"
                onClick={beginProjectCreate}
                type="button"
              >
                New Project
              </button>
            }
            error={projectError}
            isLoading={isLoadingProjects}
            isProjectActionPending={(projectId) => pendingProjectActionIds.includes(projectId)}
            onDeleteProject={deleteProject}
            onEditProject={beginProjectEdit}
            onRetry={() => setProjectRequestVersion((version) => version + 1)}
            projects={projects}
            title="All projects"
          />
        </div>
      )}

      {activeSection === "learning-goals" && (
        <LearningGoals
          actionError={goalActionError}
          error={goalError}
          goals={goals}
          isLoading={isLoadingGoals}
          isGoalActionPending={(goalId) => pendingGoalActionIds.includes(goalId)}
          onClearActionError={() => setGoalActionError("")}
          onCreateGoal={beginGoalCreate}
          onDeleteGoal={deleteGoal}
          onEditGoal={beginGoalEdit}
          onRetry={() => setGoalRequestVersion((version) => version + 1)}
          onToggleGoalStatus={toggleGoalStatus}
          projects={projects}
        />
      )}

      {showProjectForm && (
        <ProjectForm
          key={projectFormProject ? `project-${projectFormProject.id}` : "project-create"}
          error={projectFormError}
          isSubmitting={isSubmittingProjectForm}
          onCancel={closeProjectForm}
          onSubmit={saveProjectForm}
          project={projectFormProject}
        />
      )}

      {showGoalForm && (
        <LearningGoalForm
          key={goalFormGoal ? `goal-${goalFormGoal.id}` : "goal-create"}
          error={goalFormError}
          goal={goalFormGoal}
          isSubmitting={isSubmittingGoalForm}
          onCancel={closeGoalForm}
          onSubmit={saveGoalForm}
          projects={projects}
        />
      )}
    </AppShell>
  );
}

export default App;
