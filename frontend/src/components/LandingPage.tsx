/**
 * Public entry page for signed-out visitors. Screenshots are captured from
 * the working sample workspace; demo/account actions are supplied by App, and
 * source links open the build-generated source browser on this same website.
 */
import { ArrowRight, ArrowUpRight, Code2, FolderKanban, Moon, Target } from 'lucide-react';
import { Brand } from './Brand';

/**
 * Present the public project preview and delegate demo/sign-in/signup
 * actions; the source URL is local to this deployment.
 */
export function LandingPage({ busy, error, onDemo, onSignIn, onSignUp }: {
  busy: boolean; error: string; onDemo: () => void; onSignIn: () => void; onSignUp: () => void;
}) {
  return (
    <div className="landing-page">
      <a className="skip-link" href="#landing-content">Skip to content</a>
      <header className="landing-nav">
        <a href="/" aria-label="DevTrack home"><Brand /></a>
        <nav aria-label="Visitor navigation">
          <a href="/source/">View source <ArrowUpRight size={15} /></a>
          <button className="text-button" onClick={onSignIn}>Sign in</button>
          <button className="secondary-button" onClick={onSignUp}>Create account</button>
        </nav>
      </header>
      <main id="landing-content">
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-hero-copy">
            <span className="section-eyebrow"><span className="live-dot" /> A WORKSPACE FOR DEVELOPERS</span>
            <h1 id="landing-title">Less scattered.<br />More <span>shipped.</span></h1>
            <p>Keep your projects, progress, and learning goals in one place. DevTrack helps you see what’s moving and choose what to work on next.</p>
            <div className="landing-actions">
              <button className="primary-button" disabled={busy} onClick={onDemo}>
                {busy ? 'Opening your workspace…' : 'Try the demo'} <ArrowRight size={17} />
              </button>
              <a className="secondary-button" href="/source/">View source <Code2 size={17} /></a>
            </div>
            <p className="landing-demo-note">No signup needed. Your demo gets its own editable sample data.</p>
            {error && <p className="error-message" role="alert">{error}</p>}
            <p className="landing-stack">REACT + TYPESCRIPT <span>/</span> NODE.JS <span>/</span> POSTGRESQL</p>
          </div>
          <figure className="landing-main-shot">
            <div className="landing-browser-bar"><i /><i /><i /><span>DevTrack / Overview</span></div>
            <img src="/screenshots/dashboard-light.png" width="1440" height="1050" alt="DevTrack dashboard with project totals, status breakdown, recent projects, and learning goals in light mode" fetchPriority="high" />
            <figcaption>Real app. Sample workspace.</figcaption>
          </figure>
        </section>
        <section className="landing-workspace" aria-labelledby="workspace-preview-title">
          <div className="landing-section-heading">
            <span className="section-eyebrow">FROM IDEA TO DONE</span>
            <h2 id="workspace-preview-title">Your work, with a clear next step.</h2>
            <p>A working full-stack app with account-owned data, accessible controls, and a responsive workspace.</p>
          </div>
          <div className="landing-previews">
            <article>
              <img src="/screenshots/projects.png" width="1440" height="1050" alt="Project cards showing status, progress, priority, and technologies, with search and filters above" loading="lazy" />
              <h3><FolderKanban size={19} /> Projects with context</h3>
              <p>Track progress, set dates, filter your work, and keep repository links close.</p>
            </article>
            <article>
              <img src="/screenshots/dashboard-dark.png" width="1440" height="1050" alt="The same working dashboard in dark mode" loading="lazy" />
              <h3><Moon size={19} /> A workspace that adapts</h3>
              <p>Switch themes, use the keyboard, or pick up where you left off on mobile.</p>
            </article>
          </div>
        </section>
        <section className="landing-engineering" aria-label="About this project">
          <div><Target size={24} /><h2>Built to learn. Made to use.</h2><p>DevTrack connects a React interface to a Node API and PostgreSQL. It includes isolated demo accounts, learning goals, workspace export, and cookie-based sign-in with CSRF protection.</p></div>
          <div><Code2 size={24} /><h2>Explore the implementation.</h2><p>The source includes API and browser tests, accessibility checks, OpenAPI documentation, and Docker configuration. Open the code to see how the pieces connect.</p><a className="text-button" href="/source/">Browse the actual source <ArrowUpRight size={16} /></a></div>
        </section>
      </main>
      <footer className="landing-footer"><Brand compact /><p>Projects. Progress. A place to keep learning.</p><span>Essential sign-in cookies only. No analytics.</span></footer>
    </div>
  );
}
