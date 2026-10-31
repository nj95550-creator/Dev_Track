/**
 * Catch descendant render failures and provide reload/home recovery. The
 * fallback does not modify database records; reloading discards only unsaved UI
 * state and lets App restore the cookie-backed session.
 */
import { Component, type ReactNode } from 'react';
import { Brand } from './Brand';

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  /**
   * Switch to recovery UI when a descendant throws during rendering. Resetting
   * the boundary requires reload/navigation so the application can reinitialize.
   */
  static getDerivedStateFromError() { return { failed: true }; }
  /**
   * Render children until a descendant fails, then offer recovery without
   * clearing cookies, preferences or persisted workspace records.
   */
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="crash-recovery">
        <Brand />
        <div role="alert">
          <h1>This page couldn’t be displayed.</h1>
          <p>Reload to reconnect to your saved workspace. Unsaved form entries may need to be entered again.</p>
        </div>
        <button className="primary-button" onClick={() => window.location.reload()}>Reload workspace</button>
        <a className="secondary-button" href="/">Open the home page</a>
      </main>
    );
  }
}
