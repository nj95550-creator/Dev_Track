# DevTrack 2.2.0 — focused portfolio release

This is an implemented, locally tested release candidate. **It is not a verified public deployment.**

## Changes

- Password changes belong to the account session instead of the Settings component. Leaving Settings does not cancel session-token synchronization. Later writes and logout wait for synchronization; exiting an account cancels old requests and invalidates even a buffered late result. A lost response body triggers a cookie-backed session refresh. The next account cannot receive the old account’s token or success notification.
- The dev-only Zod dependency was updated compatibly to **4.6.7**. The current GitHub advisory GHSA-mrhx-c7xc-m3w5 identifies **4.6.6** as the patched boundary; npm resolved the newer compatible version. Frontend production code does not use Zod.
- Docker uses an owner-only `database-setup` job and a separate restricted runtime login. The job transactionally applies the existing idempotent schema and role grants without removing saved accounts, password hashes, projects, goals or sessions. It runs on both old and fresh volumes. The Windows launcher appends a missing runtime credential while retaining the old owner settings. Production refuses privileged/owner runtime logins.
- Signed-out visitors get a landing page with screenshots captured from the running sample workspace, a working isolated demo, a built-in actual-source browser, absolute sharing metadata using APP_ORIGIN, a real preview image and touch icon. No repository or public URL is invented.
- The ring shows project-status proportions with a total-project count. The false create-project shortcut icon is removed. Copy is shorter. A React error boundary offers reload/home recovery without deleting saved data.
- The README explains the project and actual setup, followed by deployment/upgrades. The clean ZIP contains source and intended assets, excluding generated builds and private data.

## Verification

Actual checks run in the editing environment:

| Command | Result |
| --- | --- |
| `npm run setup` | Passed; locked dependencies installed for all three packages. |
| `npm update zod` (inside `frontend/`) / `npm ls zod` | Compatible dev dependency resolved to 4.6.7; both toolchain consumers deduplicated. |
| `npm run check` | Passed: 5 environment/launcher/packaging tests, 34 backend/client/embedded upgrade tests, 4 production safety tests, frontend lint, and both builds. |
| `npm --prefix frontend run lint` and `npm run build` | Passed again after the final account guard. |
| `npm run test:ui` | 30 passed on desktop/mobile Chromium 143. Includes password navigation/logout/account-replacement races, landing/source/demo/metadata, error recovery, Swagger and accessibility. |
| `npm audit` | 0 known advisories, including dev dependencies. |
| `npm --prefix backend audit` | 0 known advisories, including dev dependencies. |
| `npm --prefix frontend audit` | 0 known advisories, including dev dependencies. |
| `node scripts/capture-portfolio.mjs` | Passed; actual dashboard/project screenshots, sharing cover and touch icon generated. |
| Node syntax checks for external upgrade/Docker scripts; YAML parsing | Passed syntax/structural checks only; no container execution implied. |
| `npm run package` | Passed; clean source archive with the required configuration, scripts, lockfiles, tests and intended screenshot/icon assets. ZIP CRC/inventory/privacy checks passed. |
| Fresh extraction: `npm run setup`, `npm run build`, compiled server startup and HTTP smoke | Passed: clean locked install/build, valid metadata/assets/source/Swagger, isolated demo, project/goal create/read/edit/delete and logout. |
| `npm run verify:docker` | Blocked, exit 1: Docker is unavailable in this environment. Fresh/legacy populated-volume execution is unverified. |
| `npm run test:postgres` | Blocked, exit 1: DEVTRACK_POSTGRES_TEST_URL is not configured and there is no separate PostgreSQL service. |

The browser run used the available Chromium 143 executable through `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`, with `PLAYWRIGHT_CHROMIUM_ARGS` for this container and `LD_LIBRARY_PATH` for its bundled libraries. The project’s normal browser-install command was not run in this release workflow. CI installs the matching Playwright Chromium; no CI run was available here.

The GitHub-reviewed advisory used for the Zod boundary is [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5). Audit results describe the dependency database at verification time, not a guarantee of complete security.

PGlite executes schema/role/table permissions and fixture retention but cannot update database-level ACLs. Its test adapter explicitly omits those three statements. The external PostgreSQL/Docker tests execute the full grants and real persisted-volume upgrades; they must actually run before those are marked verified.

## Infrastructure limits

This environment has no Docker engine or standalone PostgreSQL service. The verification commands report those missing prerequisites, rather than passing. No hosting destination, public domain, production database login or SMTP credentials were supplied. Public HTTPS operation and a live demo therefore remain unverified.
