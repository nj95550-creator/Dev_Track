import {
  useState,
  type FormEvent,
  type ReactElement,
} from "react";
import type {
  CreateProfileInput,
  LoginCredentials,
} from "../types";
import { Brand } from "./Brand";

// Owns login and profile-creation form state before delegating API calls to App.
type AuthenticationMode = "login" | "signup";

interface AuthScreenProps {
  error: string;
  isSubmitting: boolean;
  onClearError: () => void;
  onCreateProfile: (profile: CreateProfileInput) => Promise<void>;
  onLogin: (credentials: LoginCredentials) => Promise<void>;
}

export function AuthScreen({
  error,
  isSubmitting,
  onClearError,
  onCreateProfile,
  onLogin,
}: AuthScreenProps): ReactElement {
  const [mode, setMode] = useState<AuthenticationMode>("login");
  const [localError, setLocalError] = useState("");
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [signupUsername, setSignupUsername] = useState("");
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupPasswordConfirmation, setSignupPasswordConfirmation] =
    useState("");

  function changeMode(nextMode: AuthenticationMode): void {
    setMode(nextMode);
    setLocalError("");
    onClearError();
    setLoginPassword("");
    setSignupPassword("");
    setSignupPasswordConfirmation("");
  }

  async function submitLogin(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setLocalError("");
    await onLogin({ username: loginUsername, password: loginPassword });
    setLoginPassword("");
  }

  async function submitProfile(
    event: FormEvent<HTMLFormElement>
  ): Promise<void> {
    event.preventDefault();
    onClearError();

    if (signupPassword !== signupPasswordConfirmation) {
      setLocalError("The password confirmation does not match.");
      return;
    }

    setLocalError("");
    await onCreateProfile({
      username: signupUsername,
      name: signupName,
      email: signupEmail,
      password: signupPassword,
    });
  }

  const displayedError = localError || error;

  return (
    <main className="auth-page" id="auth-content">
      <section className="auth-showcase" aria-labelledby="auth-title">
        <Brand />
        <div className="auth-showcase-content">
          <span className="eyebrow eyebrow--light">
            Project &amp; learning workspace
          </span>
          <h1 id="auth-title">Turn development work into visible progress.</h1>
          <p>
            Keep projects organized, understand what is moving, and build a
            clear record of what you learn along the way.
          </p>
        </div>

        <ul className="auth-benefits" aria-label="DevTrack benefits">
          <li>
            <span aria-hidden="true">01</span>
            <div>
              <strong>See the full picture</strong>
              <small>One workspace for planned, active, and finished work.</small>
            </div>
          </li>
          <li>
            <span aria-hidden="true">02</span>
            <div>
              <strong>Stay intentional</strong>
              <small>Keep learning goals connected to the work that matters.</small>
            </div>
          </li>
        </ul>
      </section>

      <section className="auth-panel" aria-label="DevTrack profile access">
        <div className="auth-panel-inner">
          <header className="auth-panel-heading">
            <span className="auth-kicker">Welcome to DevTrack</span>
            <h2>
              {mode === "login" ? "Sign in to continue" : "Create your profile"}
            </h2>
            <p>
              {mode === "login"
                ? "Enter your account details to open your workspace."
                : "Set up your account to start tracking development work."}
            </p>
          </header>

          <div className="auth-switch" role="tablist" aria-label="Profile access">
            <button
              aria-controls="login-panel"
              aria-selected={mode === "login"}
              className={mode === "login" ? "active" : ""}
              id="login-tab"
              onClick={() => changeMode("login")}
              role="tab"
              type="button"
            >
              Sign in
            </button>
            <button
              aria-controls="signup-panel"
              aria-selected={mode === "signup"}
              className={mode === "signup" ? "active" : ""}
              id="signup-tab"
              onClick={() => changeMode("signup")}
              role="tab"
              type="button"
            >
              Create profile
            </button>
          </div>

          {mode === "login" ? (
            <form
              aria-labelledby="login-tab"
              className="auth-form"
              id="login-panel"
              onSubmit={submitLogin}
              role="tabpanel"
            >
              <label htmlFor="login-username">Username</label>
              <input
                autoComplete="username"
                disabled={isSubmitting}
                id="login-username"
                maxLength={50}
                minLength={3}
                name="username"
                onChange={(event) => setLoginUsername(event.target.value)}
                placeholder="Enter your username"
                required
                type="text"
                value={loginUsername}
              />

              <div className="field-heading">
                <label htmlFor="login-password">Password</label>
                <span>15–128 characters</span>
              </div>
              <input
                autoComplete="current-password"
                disabled={isSubmitting}
                id="login-password"
                maxLength={128}
                minLength={15}
                name="password"
                onChange={(event) => setLoginPassword(event.target.value)}
                placeholder="Enter your password"
                required
                type="password"
                value={loginPassword}
              />

              {displayedError && (
                <p className="error-message" role="alert">
                  <span aria-hidden="true">!</span>
                  {displayedError}
                </p>
              )}

              <button
                className="primary-button"
                disabled={isSubmitting}
                type="submit"
              >
                {isSubmitting ? "Signing in…" : "Sign in"}
                {!isSubmitting && <span aria-hidden="true">→</span>}
              </button>
            </form>
          ) : (
            <form
              aria-labelledby="signup-tab"
              className="auth-form"
              id="signup-panel"
              onSubmit={submitProfile}
              role="tabpanel"
            >
              <div className="form-row">
                <div>
                  <label htmlFor="signup-name">Name</label>
                  <input
                    autoComplete="name"
                    disabled={isSubmitting}
                    id="signup-name"
                    maxLength={100}
                    name="name"
                    onChange={(event) => setSignupName(event.target.value)}
                    placeholder="Your name"
                    required
                    type="text"
                    value={signupName}
                  />
                </div>
                <div>
                  <label htmlFor="signup-username">Username</label>
                  <input
                    autoComplete="username"
                    disabled={isSubmitting}
                    id="signup-username"
                    maxLength={50}
                    minLength={3}
                    name="username"
                    onChange={(event) => setSignupUsername(event.target.value)}
                    placeholder="Choose a username"
                    required
                    type="text"
                    value={signupUsername}
                  />
                </div>
              </div>

              <label htmlFor="signup-email">Email</label>
              <input
                autoComplete="email"
                disabled={isSubmitting}
                id="signup-email"
                maxLength={255}
                name="email"
                onChange={(event) => setSignupEmail(event.target.value)}
                placeholder="you@example.com"
                required
                type="email"
                value={signupEmail}
              />

              <div className="field-heading">
                <label htmlFor="signup-password">Password</label>
                <span>15–128 characters</span>
              </div>
              <input
                autoComplete="new-password"
                disabled={isSubmitting}
                id="signup-password"
                maxLength={128}
                minLength={15}
                name="password"
                onChange={(event) => setSignupPassword(event.target.value)}
                placeholder="Create a secure password"
                required
                type="password"
                value={signupPassword}
              />

              <label htmlFor="signup-confirm-password">Confirm password</label>
              <input
                autoComplete="new-password"
                disabled={isSubmitting}
                id="signup-confirm-password"
                maxLength={128}
                minLength={15}
                name="passwordConfirmation"
                onChange={(event) =>
                  setSignupPasswordConfirmation(event.target.value)
                }
                placeholder="Repeat your password"
                required
                type="password"
                value={signupPasswordConfirmation}
              />

              {displayedError && (
                <p className="error-message" role="alert">
                  <span aria-hidden="true">!</span>
                  {displayedError}
                </p>
              )}

              <button
                className="primary-button"
                disabled={isSubmitting}
                type="submit"
              >
                {isSubmitting ? "Creating profile…" : "Create profile"}
                {!isSubmitting && <span aria-hidden="true">→</span>}
              </button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
