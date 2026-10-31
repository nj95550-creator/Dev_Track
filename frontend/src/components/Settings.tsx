/**
 * Profile, appearance, export and password settings for the current account.
 * Profile requests are screen-scoped; password rotation is deliberately owned
 * by App so leaving Settings cannot lose the replacement security token.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  UserRound,
  ShieldCheck,
  Download,
  Sun,
  Moon,
  Monitor,
  Check,
  Cookie,
  LockKeyhole,
} from 'lucide-react';
import { requestJson } from '../lib/api';
import { isValidPassword, passwordLengthMessage } from '../lib/password';
import type { User, Project, LearningGoal } from '../types';
export type Theme = 'light' | 'dark' | 'system';
/**
 * Render the current account's editable profile, preferences, export and
 * password forms, keeping credential synchronization in the parent.
 */
export function Settings({
  user,
  projects,
  goals,
  onUser,
  onNotify,
  theme,
  onTheme,
  recoveryAvailable,
  dataReady,
  onChangePassword,
  passwordBusy,
}: {
  user: User;
  projects: Project[];
  goals: LearningGoal[];
  onUser: (u: User) => void;
  onNotify: (s: string) => void;
  theme: Theme;
  onTheme: (t: Theme) => void;
  recoveryAvailable: boolean;
  dataReady: boolean;
  onChangePassword: (currentPassword: string, password: string) => Promise<boolean>;
  passwordBusy: boolean;
}) {
  // Only screen-owned profile requests use this controller. Password requests
  // must finish their session-token work even after Settings unmounts.
  const controller = useRef(new AbortController());
  useEffect(() => {
    controller.current = new AbortController();
    return () => controller.current.abort();
  }, []);
  const [name, setName] = useState(user.name);
  const [username, setUsername] = useState(user.username);
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState('');
  const [profileError, setProfileError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  /**
   * Save editable profile fields for the current account and publish the
   * server-returned user only while this Settings instance is still mounted.
   */
  async function profile(e: FormEvent) {
    e.preventDefault();
    setBusy('profile');
    setProfileError('');
    try {
      const result = await requestJson<{ user: User }>('/api/me', {
        method: 'PATCH',
        signal: controller.current.signal,
        body: JSON.stringify({ name, username }),
      });
      if (controller.current.signal.aborted) return;
      onUser(result.user);
      onNotify('Profile updated. Looking good.');
    } catch (err) {
      setProfileError(
        err instanceof Error ? err.message : 'Your profile could not be updated.',
      );
    } finally {
      if (!controller.current.signal.aborted) setBusy('');
    }
  }
  /**
   * Validate the draft and delegate credential rotation to App. The local
   * abort signal controls form feedback only; it never cancels token synchronization.
   */
  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setPasswordError('');
    if (!isValidPassword(password)) {
      setPasswordError(passwordLengthMessage);
      return;
    }
    if (password.normalize('NFC') !== confirmation.normalize('NFC')) {
      setPasswordError('Your new passwords don’t match.');
      return;
    }
    setBusy('password');
    try {
      const changed = await onChangePassword(currentPassword, password);
      if (controller.current.signal.aborted || !changed) return;
      setPassword('');
      setConfirmation('');
      setCurrentPassword('');

    } catch (err) {
      if (controller.current.signal.aborted) return;
      setPasswordError(
        err instanceof Error ? err.message : 'Your password could not be updated.',
      );
    } finally {
      if (!controller.current.signal.aborted) setBusy('');
    }
  }
  /**
   * Download the currently loaded public profile/projects/goals as JSON. This
   * convenience export contains no password/session secrets and is not a database backup.
   */
  function exportData() {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              exportedAt: new Date().toISOString(),
              user,
              projects,
              learningGoals: goals,
            },
            null,
            2,
          ),
        ],
        { type: 'application/json' },
      ),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `devtrack-workspace-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    onNotify('Your workspace export is ready.');
  }
  return (
    <div className="page-stack">
      <header className="page-intro">
        <div>
          <span className="section-eyebrow">MAKE YOURSELF AT HOME</span>
          <h1>
            A workspace that feels like you<span>.</span>
          </h1>
          <p>Your profile, preferences, and a little peace of mind.</p>
        </div>
      </header>
      <div className="settings-grid">
        <section className="settings-card">
          <div className="settings-title">
            <UserRound size={20} />
            <div>
              <h2>Your profile</h2>
              <p>The person behind the progress.</p>
            </div>
          </div>
          <form className="workspace-form" onSubmit={(e) => void profile(e)}>
            <fieldset disabled={Boolean(busy) || passwordBusy}>
              <label htmlFor="profile-name">Name</label>
              <input
                id="profile-name"
                autoComplete="name"
                required
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <label htmlFor="profile-username">Username</label>
              <input
                id="profile-username"
                autoComplete="username"
                required
                minLength={3}
                maxLength={50}
                pattern="[A-Za-z0-9_\-]{3,50}"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
              <label htmlFor="profile-email">Email address</label>
              <input id="profile-email" type="email" value={user.email} readOnly />
              <p className="field-help">Email changes are managed by the site owner.</p>
              {profileError && (
                <p className="error-message" role="alert">
                  {profileError}
                </p>
              )}
              <button className="primary-button" type="submit">
                {busy === 'profile' ? 'Saving…' : 'Save profile'}
                <Check size={16} />
              </button>
            </fieldset>
          </form>
        </section>
        <div className="settings-column">
          <section className="settings-card">
            <div className="settings-title">
              <Sun size={20} />
              <div>
                <h2>A change of scenery</h2>
                <p>Choose your preferred appearance.</p>
              </div>
            </div>
            <div className="theme-options">
              {(
                [
                  { key: 'light', label: 'Light', icon: Sun },
                  { key: 'dark', label: 'Dark', icon: Moon },
                  { key: 'system', label: 'System', icon: Monitor },
                ] as const
              ).map(({ key, label, icon: Icon }) => (
                <button
                  className={theme === key ? 'selected' : ''}
                  key={key}
                  aria-pressed={theme === key}
                  onClick={() => onTheme(key)}
                >
                  <Icon size={20} />
                  {label}
                  {theme === key && <Check size={13} />}
                </button>
              ))}
            </div>
          </section>
          <section className="settings-card">
            <div className="settings-title">
              <Download size={20} />
              <div>
                <h2>Take your work with you</h2>
                <p>Export your projects and goals as JSON.</p>
              </div>
            </div>
            <button className="secondary-button" onClick={exportData} disabled={!dataReady}>
              <Download size={15} />
              Export workspace
            </button>
            <p className="field-help">A personal copy of your current workspace data.</p>
          </section>
        </div>
        {!user.isDemo && (
          <section className="settings-card">
            <div className="settings-title">
              <LockKeyhole size={20} />
              <div>
                <h2>Keep your account secure</h2>
                <p>Changing your password signs out other sessions.</p>
              </div>
            </div>
            <form className="workspace-form" onSubmit={(e) => void changePassword(e)}>
              <fieldset disabled={Boolean(busy) || passwordBusy}>
                <label htmlFor="current-password">Current password</label>
                <input
                  id="current-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
                <label htmlFor="new-password">New password</label>
                <input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <p className="field-help">Use a passphrase of 15–128 characters.</p>
                <label htmlFor="confirm-new-password">Confirm new password</label>
                <input
                  id="confirm-new-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                />
                {passwordError && (
                  <p className="error-message" role="alert">
                    {passwordError}
                  </p>
                )}
                <button className="primary-button" type="submit">
                  {passwordBusy ? 'Updating…' : 'Update password'}
                  <ShieldCheck size={16} />
                </button>
              </fieldset>
            </form>
          </section>
        )}
        <section className="settings-card privacy-card" id="privacy-note">
          <div className="settings-title">
            <Cookie size={20} />
            <div>
              <h2>Simple by design. Private by default.</h2>
              <p>Here’s what this workspace stores.</p>
            </div>
          </div>
          <p>
            An essential HTTP-only cookie keeps you signed in. Projects and goals live in the
            application database and belong to your account. Your appearance and project-view
            preferences are saved in this browser.
          </p>
          <p>No advertising cookies. No third-party analytics. No tracking pixels.</p>
          <div className="security-note">
            <ShieldCheck size={17} />
            <span>
              Sessions expire after 24 hours of inactivity.{' '}
              {recoveryAvailable
                ? 'Email password recovery is available from the sign-in screen.'
                : 'Email password recovery has not been enabled by the site owner.'}
            </span>
          </div>
          {user.isDemo && (
            <p className="field-help">
              You’re exploring an isolated demo account. Sign out and create a personal account
              to start your own workspace.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
