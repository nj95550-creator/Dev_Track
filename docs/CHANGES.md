# Version 2.2.0 focused portfolio release

See [release changes, test results and infrastructure limits](RELEASE-2.2.0.md). This release adds account-bound password synchronization, a compatible patched Zod dependency, restricted runtime database access with repeat populated-database upgrades, a public landing page using real screenshots, a source browser, sharing assets, a consistent status ring and crash recovery. The clean ZIP now contains source and intended assets, with generated builds excluded.

Earlier release history follows; old verification counts describe those versions, not the current release.

# Version 2.1.2 review fixes

- **Stale workspace loads:** version pending snapshots against successful saves, then fetch a fresh snapshot when they overlap. Both existing records and the new save remain visible. Account epochs also guard workspace loads.
- **Session replacement:** cancel pending protected requests when leaving an account and ignore expired-session responses from older credentials. Ordinary 401 responses no longer erase a newer browser cookie. Request cancellation/deadlines remain active while reading response bodies.
- **Swagger startup:** treat an omitted request method as GET so the OpenAPI definition loads. Real Chromium checks open Swagger, create a project, refresh and delete it with automatic cookie/CSRF handling.
- **Responsive UI:** keep one/two recent-project cards visible on tablet screens, wrap long goal descriptions/project labels, and close mobile navigation before scrolling to About when Settings is already open.
- **Validation:** reject year 0000 and null characters in stored text before SQL. Invalid input returns 400.
- **Credential concurrency:** recovery and recovery-token creation now use the same account-first locking order as password changes and owner recovery. Recovery rechecks and consumes its token within that lock.
- **Verification:** fix the logout/login selector race; add delayed-load/session regression cases, tablet/mobile checks, real Swagger checks, production guards/headers/cookies checks, explicit external PostgreSQL concurrency tests, and one disposable Docker verification command. CI covers PostgreSQL 17/18 and local/production container configurations.

Passed in the editing environment: 28 backend/client tests, four isolation/launcher/packaging checks, three production/safety checks, lint, both builds and 20 Chromium desktop/mobile browser checks. Browser tests used Chromium 143. The editing environment has no Docker engine or separate PostgreSQL server: the new Docker and external concurrency checks are included but cannot be marked passed here. Public HTTPS routing, provider SMTP delivery and backup restoration require the actual deployment environment. Earlier verification history follows.

# Version 2.1.1 authentication fixes

- **Password-reset race:** login now locks the account, rechecks the verified password hash and inserts the session in one transaction. Password changes also create their replacement session before committing. Cookies are issued only after commit. Controlled overlap tests cover email reset, owner reset and password change; stale logins receive 401 without a new cookie or session.
- **Reset-link navigation:** a recovery link opens the reset form even when a browser session is already valid. Cancelling retains the existing session. Successful recovery clears the restored account state and requires a new sign-in, including when the recovery link belongs to another account.
- **Unicode passwords:** all password forms now use the API's NFC-normalized Unicode character count. Removed native HTML length caps that cut off valid emoji passwords. Signup, login, recovery and Settings accept the same 15–128-character policy; confirmation also treats canonically equivalent text consistently.
- **Regression checks:** added API overlap checks, owner-recovery Unicode login, shared password-boundary cases, and browser recovery/password workflows on desktop and mobile. Recovery fixtures are seeded only by the isolated test server; no test-only HTTP endpoint or production seed was added.

Verification: 24 backend checks and four launcher/isolation/packaging checks passed, together with frontend lint, both builds, and ten Chromium desktop/mobile checks. The browser suite covers recovery while signed in, cancellation, invalid/expired links, a link for a different account, anonymous recovery, and password lengths of 14, 15, 80, 128 and 129 normalized characters. The existing project/goal, accessibility, navigation, cookie and logout workflows also pass. Docker engine and external SMTP/HTTPS limitations remain as documented below.

# Version 2.1 review fixes

## Fixed in this release

- **Release privacy:** an allowlisted packaging command creates a source/build ZIP without private environment files, installed dependencies, saved accounts, password hashes, sessions or database directories. A regression test checks those exclusions and rejects symbolic links.
- **Demo-account data safety:** cleanup uses a server-owned database flag instead of an email pattern. Signup rejects the reserved demo domain. Existing accounts default to personal accounts during migration, and active demos are retained. Regression checks preserve an older personal account and its project even when its name/email looks like a demo.
- **Test isolation:** API, launcher and browser tests explicitly use memory databases, bypass dotenv loading, and refuse external databases in test mode. A separate process check supplies conflicting shell and `.env` credentials to verify isolation.
- **Concurrent edits:** project and goal PATCH operations now read, merge and write under a transaction with a row lock, preserving unrelated fields changed at the same time. Tests cover both record types.
- **Local cookies:** Node and Docker use separate development cookie names. Production retains the Secure, HttpOnly `__Host-devtrack` cookie. The new names require a fresh sign-in once after updating.
- **Frontend accessibility:** improved button, navigation, muted-text, chart-label and status-badge contrast in both themes; corrected priority-icon semantics for screen readers. Kept sidebar scrolling, responsive layout and native dialog keyboard/focus behavior.
- **About navigation:** waits for Settings to mount before scrolling to its privacy section and respects reduced motion.
- **Password recovery:** Docker now receives SMTP settings. Local SMTP delivery tests verify the real recovery email/link, expiration, single use and session revocation. Added an owner-only terminal reset command with hidden password entry for installations without email delivery. No public administrator endpoint is exposed.
- **Swagger:** every success response now has a schema and example, including complete project/goal records, public user fields and response envelopes. Request inputs remain separate from server-owned response fields.
- **Maintainability:** separated account routes, HTTP body/response handling, validation, environment loading and browser preferences into focused modules; replaced stale user-ID error instructions.
- **Verification:** `npm run check` includes frontend lint. Added six Chromium desktop/mobile checks covering complete account and project/goal workflows, preferences, storage, accessibility, About navigation, sidebar scrolling, modal focus and logout. GitHub Actions also includes Docker build, PostgreSQL workflow/concurrency, health and volume-persistence checks.

## Verification for this release

Passed locally: 18 backend checks, four launcher/isolation/packaging checks, frontend lint, backend/frontend compilation, and six Chromium browser checks. Automated accessibility scans passed on the tested sign-in, empty/populated dashboard, project list/form, goals and Settings states in desktop/mobile layouts. Local and production Compose configurations pass validation. Dependency audits reported no known vulnerabilities in the root tools and production frontend/backend dependencies at the time of this release.

The packaged ZIP also passed a fresh locked installation and compiled-app smoke check with only production backend dependencies: frontend/assets, security headers, Swagger, signup, project/goal changes, goal preservation and logout. Production session-cookie flags were checked separately. The owner recovery command was exercised in a terminal against disposable data; password entry stayed hidden and the new hash verified successfully.

The browser run used an available Chromium 143 binary because the normal Playwright browser download was unavailable in the editing environment. CI installs Playwright's matching Chromium version. The Docker engine was unavailable here: its build, container startup and PostgreSQL-volume checks are provided but have not run here. Public HTTPS routing, managed PostgreSQL connections, SMTP-provider authentication/inbox delivery and backups require checks in the actual deployment environment. The tests use disposable data and a local mail fixture, never the uploaded account database or a real user's mailbox.

Run the checks described in README.md and DEPLOYMENT.md again after applying this release. The earlier changes below are retained history.

# Version 2 upgrade history

## Local login startup fix

- The Node launcher now gives both servers the same local website origin, overriding stale `.env` or inherited shell address settings that could block local login with an “untrusted website” error.
- It binds both servers locally, opens the exact expected website address, and selects another API port automatically when Docker or another application occupies port 3000.
- An already-running frontend produces a clear startup error instead of opening a second copy against an unrelated API.
- A real launcher/Vite/API regression check covers conflicting shell and `.env` settings, an occupied API port, signup, invalid-password rejection, logout/login, a protected write, Swagger access, and foreign-origin rejection.

## Swagger and Docker update

- Added same-origin Swagger UI at `/api-docs/` with `/swagger` redirect, local assets, served OpenAPI JSON, automatic cookie/CSRF handling, and a production enable switch.
- Added a Windows Docker launcher, a working local HTTP Compose configuration, a separate HTTPS production override, persistent PostgreSQL, and app/database health checks.
- The sign-in alignment and sidebar scrolling fixes are retained.
- Docker engine execution remains a local smoke check; see DEPLOYMENT.md for validation and limitations.

## Preserved

React, TypeScript, Node, PostgreSQL, scrypt password hashes, existing project/goal fields, and existing account/project/goal records when migrating the original database.

## Fixed

- Replaced browser-trusted user IDs and sessionStorage authentication with server sessions, hashed session IDs, ownership checks, CSRF and same-origin enforcement.
- Removed the unauthenticated user directory, including its email disclosure.
- Added real logout, session rotation and expiry, password change, and expiring single-use recovery tokens.
- Made calendar dates explicit SQL text values, eliminating date-input and timezone serialization bugs.
- Made new-goal status part of one insert, eliminating partially successful two-request creates.
- Connected overview Edit/Delete actions to the same working dialogs as the project list.
- Kept goals synchronized when their project is deleted; retained goal records.
- Re-sorted edited projects and goals by update timestamp.
- Added clear loading, retry, empty, error, and success states; mutation errors keep existing records visible.
- Added date ordering, URL scheme, field-length and numeric validation.
- Added account-bound async updates so pending responses don't populate a different user's workspace after logout.
- Added an API proxy in development and same-origin static frontend serving for production.

## Added

A new responsive visual system, locally hosted fonts, icon set, dashboard, real status distribution, project search/filters/sort/pagination, grid/list preference, learning-goal filters/search, account settings, password update, light/dark/system themes, workspace data export, essential-cookie privacy explanations, isolated demo workspaces, and optional example records for new personal accounts.

Native modal dialogs contain keyboard focus and restore focus on close. Forms protect unsaved edits. Destructive actions use a named confirmation dialog. Motion effects respect the OS reduced-motion preference.

## Verification

The automated integration suite exercises a real in-memory PostgreSQL engine (PGlite) through HTTP requests, rather than mocking ownership decisions. It covers unauthenticated access, owner isolation, spoofed IDs, cookie flags and hashed sessions, CSRF and foreign origins, content types, project/goal create/read/update/delete, calendar dates, partial updates, progress and URL validation, goal detachment, profile edits, password changes, session rotation/logout/idle expiry, atomic single-use password reset, isolated demo data, and authentication limits.

TypeScript compilation and the Vite production build are required by `npm run check`. Frontend lint checks also pass. Desktop and 375px-wide browser checks verified demo startup, project creation and overview editing, date persistence, completed-goal creation, project search, theme changes, and mobile navigation. A compiled-application smoke check also passed for homepage/assets, API readiness, missing-file handling, path containment, security headers, and production Secure/HttpOnly/SameSite cookie attributes. Tests do not send real email or provision third-party hosting. SMTP delivery, an external managed PostgreSQL connection, Docker orchestration, TLS/domain routing, and backup/restore must be verified on the chosen deployment infrastructure.
