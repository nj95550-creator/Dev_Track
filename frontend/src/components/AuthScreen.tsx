/**
 * Authentication and recovery forms with local validation and accessible feedback.
 * Login/signup/demo actions are delegated to App; recovery calls use the same API
 * client and notify App when a completed reset invalidates the current session.
 */
import { useState, type FormEvent } from 'react';
import {
  ArrowUpRight,
  ArrowRight,
  Check,
  Code2,
  FolderKanban,
  Target,
  Eye,
  EyeOff,
  ShieldCheck,
  Layers2,
  Sparkles,
} from 'lucide-react';
import { Brand } from './Brand';
import { Dialog } from './Dialog';
import { requestJson } from '../lib/api';
import { isValidPassword, passwordLengthMessage } from '../lib/password';
import type { LoginCredentials, CreateProfileInput } from '../types';
type Mode = 'login' | 'signup' | 'forgot' | 'reset';
/**
 * Render the selected authentication/recovery form and keep password drafts
 * local to this screen; authenticated account state stays in App.
 */
export function AuthScreen({
  initialMode = 'login',
  error,
  isSubmitting,
  onClearError,
  onCreateProfile,
  onLogin,
  onDemo,
  recoveryAvailable,
  resetToken,
  onExitReset,
}: {
  initialMode?: 'login' | 'signup';
  error: string;
  isSubmitting: boolean;
  onClearError: () => void;
  onCreateProfile: (p: CreateProfileInput) => Promise<void>;
  onLogin: (p: LoginCredentials) => Promise<void>;
  onDemo: () => void;
  recoveryAvailable: boolean;
  resetToken: string | null;
  onExitReset: (completed: boolean) => void;
}) {
  const [mode, setMode] = useState<Mode>(resetToken ? 'reset' : initialMode);
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState('');
  const [message, setMessage] = useState('');
  const [working, setWorking] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const busy = isSubmitting || working;
  /**
   * Clear secret/error fields when switching forms. Exiting reset mode removes
   * the token from the URL and lets App distinguish cancellation from completion.
   */
  function changeMode(next: Mode, resetCompleted = false) {
    setMode(next);
    setPassword('');
    setConfirmation('');
    setLocalError('');
    setMessage('');
    onClearError();
    if (next !== 'reset' && resetToken) {
      history.replaceState(null, '', '/');
      onExitReset(resetCompleted);
    }
  }
  /**
   * Apply the shared Unicode password policy, then dispatch the selected
   * authentication/recovery workflow. Login/signup session state is owned by App;
   * forgot/reset responses are shown locally in this form.
   */
  async function submit(e: FormEvent) {
    e.preventDefault();
    setLocalError('');
    setMessage('');
    onClearError();
    if (mode !== 'forgot' && !isValidPassword(password)) {
      setLocalError(passwordLengthMessage);
      return;
    }
    if (
      (mode === 'signup' || mode === 'reset') &&
      password.normalize('NFC') !== confirmation.normalize('NFC')
    ) {
      setLocalError('The passwords don’t match. Please check them and try again.');
      return;
    }
    if (mode === 'login') {
      await onLogin({ username, password, remember });
      setPassword('');
      return;
    }
    if (mode === 'signup') {
      await onCreateProfile({ username, name, email, password });
      return;
    }
    setWorking(true);
    try {
      if (mode === 'forgot') {
        const result = await requestJson<{ message: string }>('/api/forgot-password', {
          method: 'POST',
          body: JSON.stringify({ email }),
        });
        setMessage(result.message);
      } else {
        await requestJson('/api/reset-password', {
          method: 'POST',
          body: JSON.stringify({ token: resetToken, password }),
        });
        changeMode('login', true);
        setMessage('Your password has been reset. Sign in with your new password.');
      }
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : 'Something went wrong. Please try again.',
      );
    } finally {
      setWorking(false);
    }
  }
  return (
    <div className="auth-layout">
      <section className="auth-story">
        <Brand compact />
        <div className="auth-story-content">
          <span className="section-eyebrow">
            <span className="live-dot" /> YOUR NEXT CHAPTER STARTS HERE
          </span>
          <h1>
            Good ideas deserve
            <br />
            to get <em>built.</em>
          </h1>
          <p>
            A little more focus. A lot more forward.
            <br />
            Your projects and learning, together in one workspace.
          </p>
          <div className="auth-preview" aria-hidden="true">
            <div className="preview-top">
              <span>
                <Layers2 size={14} /> YOUR WORKSPACE
              </span>
              <span className="preview-dots">•••</span>
            </div>
            <div className="preview-greeting">
              Less scattered.
              <br />
              <strong>More shipped.</strong>
            </div>
            <div className="preview-stat-row">
              <div>
                <FolderKanban size={18} />
                <strong>06</strong>
                <span>Projects in motion</span>
              </div>
              <div>
                <Target size={18} />
                <strong>04</strong>
                <span>Skills to unlock</span>
              </div>
            </div>
            <div className="preview-project">
              <span className="preview-project-icon">
                <Code2 size={20} />
              </span>
              <div>
                <strong>Your next big idea</strong>
                <small>One step closer, every day</small>
              </div>
              <span className="preview-check">
                <Check size={15} />
              </span>
            </div>
            <div className="preview-line">
              <span />
            </div>
            <span className="preview-caption">A preview of what you can build</span>
          </div>
          <div className="auth-proof">
            <span>
              <Check size={15} /> Built for developers
            </span>
            <span>
              <Check size={15} /> Progress at your pace
            </span>
          </div>
        </div>
        <div className="auth-story-footer">
          <span>BUILD. LEARN. REPEAT.</span>
          <span>© {new Date().getFullYear()} DevTrack</span>
        </div>
      </section>
      <main className="auth-panel">
        <div className="auth-panel-inner">
          <div className="auth-top-note">
            <span>Your space to make things happen</span>
            <ArrowUpRight size={16} />
          </div>
          <div className="auth-heading">
            <span className="section-eyebrow">LET’S GET TO WORK</span>
            <h2>
              {mode === 'login'
                ? 'Welcome back.'
                : mode === 'signup'
                  ? 'Start something great.'
                  : mode === 'forgot'
                    ? 'Let’s get you back in.'
                    : 'A fresh start.'}
            </h2>
            <p>
              {mode === 'login'
                ? 'Pick up where your ideas left off.'
                : mode === 'signup'
                  ? 'Create your account. Make a little progress.'
                  : mode === 'forgot'
                    ? 'We’ll send a link to reset your password.'
                    : 'Choose a new password for your account.'}
            </p>
          </div>
          {(mode === 'login' || mode === 'signup') && (
            <div className="auth-switch" aria-label="Account access">
              <button
                disabled={busy}
                type="button"
                aria-pressed={mode === 'login'}
                className={mode === 'login' ? 'active' : ''}
                onClick={() => changeMode('login')}
              >
                Sign in
              </button>
              <button
                disabled={busy}
                type="button"
                aria-pressed={mode === 'signup'}
                className={mode === 'signup' ? 'active' : ''}
                onClick={() => changeMode('signup')}
              >
                Create account
              </button>
            </div>
          )}
          <form className="auth-form" onSubmit={(e) => void submit(e)}>
            <fieldset disabled={busy}>
              {mode === 'signup' && (
                <>
                  <label htmlFor="signup-name">Your name</label>
                  <input
                    id="signup-name"
                    autoComplete="name"
                    maxLength={100}
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Alex Morgan"
                  />
                </>
              )}
              {(mode === 'login' || mode === 'signup') && (
                <>
                  <label htmlFor="auth-username">Username</label>
                  <input
                    id="auth-username"
                    name="username"
                    autoComplete="username"
                    required
                    minLength={3}
                    maxLength={50}
                    pattern="[A-Za-z0-9_\-]{3,50}"
                    title="3–50 letters, numbers, underscores, or hyphens"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={mode === 'signup' ? 'Choose a username' : 'Your username'}
                  />
                </>
              )}
              {(mode === 'signup' || mode === 'forgot') && (
                <>
                  <label htmlFor="auth-email">Email address</label>
                  <input
                    id="auth-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    maxLength={255}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </>
              )}
              {mode !== 'forgot' && (
                <>
                  <div className="field-heading">
                    <label htmlFor="auth-password">
                      {mode === 'reset' ? 'New password' : 'Password'}
                    </label>
                    {mode === 'login' && recoveryAvailable && (
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => changeMode('forgot')}
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <div className="password-input">
                    <input
                      id="auth-password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={
                        mode === 'login' ? 'Enter your password' : 'At least 15 characters'
                      }
                      aria-describedby={mode !== 'login' ? 'password-help' : undefined}
                    />
                    <button
                      className="icon-button"
                      type="button"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                  {mode !== 'login' && (
                    <p className="field-help" id="password-help">
                      Use 15–128 characters. A memorable passphrase works well.
                    </p>
                  )}
                </>
              )}
              {(mode === 'signup' || mode === 'reset') && (
                <>
                  <label htmlFor="auth-confirm">Confirm password</label>
                  <input
                    id="auth-confirm"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                    placeholder="One more time"
                  />
                </>
              )}
              {mode === 'login' && (
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                  />{' '}
                  Keep me signed in
                </label>
              )}
              {(localError || error) && (
                <p className="error-message" role="alert">
                  {localError || error}
                </p>
              )}
              {message && (
                <p className="success-message" role="status">
                  {message}
                </p>
              )}
              <button className="primary-button auth-submit" type="submit">
                {busy
                  ? 'One moment…'
                  : mode === 'login'
                    ? 'Sign in to your workspace'
                    : mode === 'signup'
                      ? 'Create your workspace'
                      : mode === 'forgot'
                        ? 'Send reset link'
                        : 'Reset password'}
                <ArrowRight size={18} />
              </button>
            </fieldset>
          </form>
          {mode === 'login' || mode === 'signup' ? (
            <>
              <div className="auth-divider">
                <span>just looking around?</span>
              </div>
              <button className="demo-button" disabled={busy} onClick={onDemo}>
                <Sparkles size={17} /> Explore a demo workspace <ArrowUpRight size={16} />
              </button>
              <p className="demo-description">
                Your own space to try it out. No signup needed.
              </p>
            </>
          ) : (
            <button
              disabled={busy}
              className="text-button back-login"
              onClick={() => changeMode('login')}
            >
              ← Back to sign in
            </button>
          )}
          <div className="auth-privacy">
            <ShieldCheck size={15} />
            <span>
              Only essential cookies. Your workspace stays yours.
              <br />
              <button className="text-button" onClick={() => setPrivacy(true)}>
                Privacy & storage details
              </button>
            </span>
          </div>
        </div>
      </main>
      {privacy && (
        <Dialog labelId="privacy-title" onClose={() => setPrivacy(false)}>
          <div className="dialog-header">
            <h2 id="privacy-title">Your workspace, your data.</h2>
          </div>
          <div className="dialog-content">
            <p>
              DevTrack uses an essential, HTTP-only cookie to keep you signed in. Your projects
              and goals are saved in the application database under your account.
            </p>
            <p>
              Theme and view preferences can be saved in this browser. There are no advertising
              cookies, trackers, or third-party analytics in this app.
            </p>
            <p>
              Demo accounts are temporary, isolated workspaces. Do not enter sensitive
              information in a demo.
            </p>
            <button className="primary-button" onClick={() => setPrivacy(false)}>
              Got it
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
