# Reading the DevTrack code

This guide accompanies the commented 2.2.0 source. The comments explain each file’s responsibility, important function contracts, and the decisions behind authentication, asynchronous work, data access, accessibility and startup. Runtime behavior and dependency versions are unchanged by this documentation pass.

## Start with one real workflow

To understand a project save, follow these files in order:

1. [`ProjectForm.tsx`](../frontend/src/components/ProjectForm.tsx) holds a local draft. It trims text, reads native date fields and hands the submitted values to its parent. Closing a changed draft asks for confirmation.
2. [`App.tsx`](../frontend/src/App.tsx), in `saveProject`, chooses create or edit, tracks pending/error state, and calls the API client. The saved project returned by the server replaces the matching item in React state.
3. [`api.ts`](../frontend/src/lib/api.ts), in `requestJson`, sends JSON with the browser’s same-origin session cookie and current CSRF header. It waits for any password-token rotation before a protected write and keeps its deadline active until the response body arrives.
4. [`server.ts`](../backend/src/server.ts) resolves the signed-in account, enforces origin/CSRF rules, validates the payload and dispatches to the project repository. A submitted account ID never selects the owner.
5. [`validation.ts`](../backend/src/validation.ts) checks the actual incoming data. TypeScript’s compile-time types cannot validate a network request by themselves.
6. [`projects.ts`](../backend/src/projects.ts) executes parameterized SQL scoped to the verified owner. An edit first reads/merges the record under a transaction row lock in the route; the repository receives the complete merged values.
7. [`schema.sql`](../database/schema.sql) supplies persistent tables, relationships and constraints. The response travels back through the client to update the UI.

The same pattern applies to learning goals through `LearningGoalForm.tsx`, `saveGoal`, the goal routes and `learningGoals.ts`.

## Frontend responsibilities

`main.tsx` mounts React inside `index.html` and wraps App in an error boundary. `App.tsx` owns account state, loaded project/goal collections, screen selection, dialogs and persisted actions. Child components receive records and callbacks; display components do not choose database ownership.

`AppShell.tsx` owns the responsive navigation frame, drawer focus/scroll lifecycle, global search shortcut and About navigation. `DashboardOverview.tsx` derives totals/status proportions from loaded data. `ProjectsPanel.tsx` renders cards or list rows, while `LearningGoals.tsx` derives filters and completion totals. The form components keep unsaved drafts separate from stored records.

`AuthScreen.tsx` handles login, signup and recovery form modes. `Settings.tsx` handles profile drafts, preferences, workspace export and password form feedback. The public `LandingPage.tsx` delegates demo/account actions to App; its source link opens the generated source browser.

`types.ts` describes JSON and form contracts. `lib/format.ts` handles local calendar dates; date-only values should not silently shift because of UTC conversion. `lib/password.ts` matches the backend’s normalized Unicode password-length rule. `usePreferences.ts` persists only theme and grid/list display; accounts, password hashes and session cookies are not localStorage records.

`index.css` provides browser resets, fonts and keyboard focus. `App.css` defines theme tokens, desktop components and ordered responsive overrides. Its comments label the major component groups and explain the navigation and status-ring breakpoints. Preserve cascade order when editing it.

## Authentication and account boundaries

`password.ts` creates salted scrypt hashes and verifies passwords against the serialized hashing parameters. Normalization makes equivalent Unicode password input consistent. It does not store a readable password.

`security.ts` creates and resolves cookie-backed sessions, enforces origin/CSRF checks and counts rate-limited requests in the database. The browser cookie holds a random token; the session table stores its hash, account ID, CSRF token and expiry/activity timestamps. Production applies Secure host-only cookies and requires an HTTPS application origin.

`accountRoutes.ts` handles account creation, login/logout, profile/password changes, recovery and isolated demos. Credential-changing transactions revoke old sessions/reset links. Login performs the expensive password comparison before locking, then rechecks the verified hash under the account lock before creating a session.

`accounts.ts` sends recovery mail through the configured SMTP transport. Unknown email addresses do not reveal whether an account exists. `recoverAccount.ts` is a local installation-owner command with hidden terminal password input; it is not an HTTP administrator endpoint.

## Why the asynchronous guards exist

The application may receive replies in a different order from the actions that started them. A project load can arrive after an edit; an old account request can finish after a different login.

- App’s **account epoch** changes when the active account/session is replaced. Mutation handlers apply results only if the epoch they captured is still current.
- App’s **workspace version** changes after saved mutations. A load based on an older snapshot triggers a new read instead of overwriting recently saved records.
- The API client’s **session generation** prevents an old 401 response from expiring a newer session.
- The client’s **account generation** invalidates old password completions and queued writes when accounts change.
- Password synchronization is account-owned, above the Settings component lifecycle. Leaving Settings does not cancel the replacement token; later protected writes wait for it. A lost body triggers a cookie-backed session read before further changes proceed.

The comments next to those counters/effects explain which boundary each one protects. They are separate because a saved record and a replaced account are different events.

## Database access and upgrades

`environment.ts` chooses explicit test isolation before dotenv loads private settings and before database selection. `database.ts` provides a common query/transaction interface over PGlite for simple local use or `pg` for external PostgreSQL. Production requires the external database and restricted permissions.

The repositories scope lookups/updates/deletes by both record ID and owner ID. SQL parameters keep values separate from query text. The schema’s foreign key clears a goal’s project association when its project is deleted, retaining the goal itself.

`migrate.ts` applies the repeatable schema for deliberate owner/local use. `provisionDatabase.ts` is the external owner release job: it serializes setup and applies schema plus role changes in one transaction. `databasePrivileges.ts` grants a separate runtime login data access without ownership/administrative powers and checks the runtime role in production. Existing records are retained; provisioning does not depend on a fresh-volume initialization script.

The normal app never needs the owner password. Owner/setup and runtime credentials are separate environment settings. Docker’s named volume and Node’s PGlite directory are different stores; switching launch modes does not copy accounts between them.

## Development, documentation and packaging tools

- `scripts/setup.mjs` installs exact lockfile versions in all three packages.
- `scripts/dev.mjs` coordinates Vite and the Node API, selects compatible ports/origins, waits for health and cleans up both child trees.
- `scripts/check.mjs` orders tests, lint, source generation and builds, stopping on failure.
- `backend/src/swagger.ts`, `backend/public/swagger.html` and `swagger-init.js` serve the interactive API explorer. Its protected writes obtain the current session’s CSRF token; Swagger follows the same backend ownership rules.
- `scripts/source-preview.mjs` escapes allowlisted source for a public code browser. `scripts/release-files.mjs` defines the shared source allowlist/exclusions and rejects symlinks.
- `scripts/package.mjs` creates the clean source ZIP. Generated builds, source-browser copies, secrets, saved databases, dependencies and test reports are not distributed.
- `scripts/capture-portfolio.mjs` reproduces the intended screenshots using an isolated real demo, then shuts down its browser/server.

`Dockerfile` builds the app in one stage and copies runnable output/backend production packages to a non-root runtime stage. Compose starts PostgreSQL, the owner-only setup job and then the restricted app. The Windows launchers check prerequisites and preserve private settings/volumes.

## Reading the tests

`backend/test/integration.test.ts` uses real HTTP and a memory database for account isolation, validation, credentials and CRUD. `apiClient.test.ts` controls fetch completion order to reproduce stale-response/token races. `password.test.ts` compares frontend/backend Unicode boundaries. `smtpFixture.ts` captures real local SMTP conversations without sending external email.

`databasePrivileges.test.ts` checks embedded schema/table/role permissions and fixture retention. PGlite cannot apply database-level ACL changes; three statements are explicitly omitted there and covered by the separate external suites.

`scripts/test` covers launcher/environment isolation, package exclusions and compiled production guards. Playwright’s `tests/browser` files exercise actual desktop/mobile forms, navigation, Swagger, accessibility, source/demo flows and recovery. Its delayed-password test proxy forwards real response headers/cookies while holding the body; it does not fabricate an authentication result.

`postgres-test.mjs` creates its own random external test database. Its upgrade/concurrency children test full grants, saved-password login and real PostgreSQL locks. `verify-docker.mjs` uses a separate Compose project and volume for fresh, legacy-upgrade and production checks. Neither is a normal startup command for your saved installation.

## Configuration formats that cannot contain comments

Strict JSON is left valid. Its explanations belong here rather than inside the files:

| File(s) | Purpose |
| --- | --- |
| Root `package.json` | Project-level npm commands, Node engine requirement and test/ZIP tooling. |
| `backend/package.json` | Server/runtime dependencies, TypeScript build and database/account commands. |
| `frontend/package.json` | React/UI packages and the Vite, TypeScript and ESLint tools. |
| Three `package-lock.json` files | Machine-generated exact dependency resolution/integrity metadata used by npm ci. Edit dependencies through npm; do not hand-annotate these files. |
| `docs/openapi.json` | OpenAPI paths, schemas, examples and session/CSRF security descriptions used by Swagger. |

TypeScript configuration files support JSON with comments. The backend configuration emits compiled Node output into `dist`; the frontend configuration type-checks without emitting because Vite creates the browser bundle. The Vite/ESLint/Playwright configuration modules contain their own purpose comments.

## Comment maintenance

Keep comments aligned with behavior whenever code changes. Document responsibilities, ownership, side effects, units/null semantics and timing constraints. Test names state expected behavior; comments explain fixture isolation and why a controlled race or limit is necessary. Preserve vendor/library code and generated assets rather than inserting project comments into dependencies.

See [comment-pass coverage and verification](COMMENT_REVIEW.md) for the reviewed file inventory and actual checks.
