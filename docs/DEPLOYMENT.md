# Hosting DevTrack

Deploy the existing Node.js/PostgreSQL application to a host that supports a persistent Node HTTP process or Docker and an external PostgreSQL database. The backend serves the built React app and `/api` on one origin. Static-only hosting and Cloudflare Workers cannot run this application unchanged.

No hosting account, database credentials, domain, or source repository URL was supplied for this release. The landing page’s working **View source** link opens the build-generated, sanitized source browser at `/source/`. It does not imply that a public repository exists.

## Production environment and roles

Keep secrets in the host’s environment, never in the repository or frontend:

```text
NODE_ENV=production
APP_ORIGIN=https://your-actual-domain.example
DATABASE_URL=<restricted-runtime-connection-url>
DB_SSL=true
HOST=0.0.0.0
PORT=3000
AUTO_MIGRATE=false
ENABLE_SWAGGER=false
TRUST_PROXY=false
```

`APP_ORIGIN` must be the exact public HTTPS origin, with no path. Sharing tags and the canonical URL use that configured origin rather than a visitor-controlled Host header. Production refuses HTTP origins, embedded databases, and database logins with administrative/DDL privileges. `DB_SSL=true` verifies the database certificate. Use your provider’s documented private-network/TLS settings; do not bypass certificate verification to silence an error.

Use **two separate database logins**:

- **Owner/setup login:** can manage roles and owns this app’s database/schema. Used only for schema changes and role provisioning. Docker retains the existing `devtrack` owner and `DB_PASSWORD` so old volumes remain accessible.
- **Runtime login:** defaults to `devtrack_app`. It has login/connect, schema usage, SELECT/INSERT/UPDATE/DELETE permissions on app tables, and identity-sequence access. It cannot create roles/databases/tables, alter tables, truncate data, bypass row security, or inherit another role. The app never receives the owner password.

For a non-Docker host, run `npm run db:provision` in a **separate owner-only release environment**, configured with the owner’s `DATABASE_URL` (or `DB_*` settings), `APP_DB_USER`, and a separate random `APP_DB_PASSWORD` of at least 24 characters. Role-management permissions are required; managed providers may require their administrator to run this job or provision an equivalent role. Then configure the running app’s connection with only the restricted login. If that role already owns database objects or inherits another role, provisioning stops rather than taking over or deleting those objects; choose a distinct runtime role.

The provisioning job runs an idempotent schema/permissions upgrade inside a transaction, serialized by a database advisory lock. It never drops tables, removes accounts, resets passwords, or guesses which saved data is disposable. It runs against fresh **and already populated** databases. Database/schema CREATE privileges for PUBLIC are removed in this dedicated app database. Do not use a shared database for unrelated applications that depend on PUBLIC creation rights.

## Build and run

1. Install Node 24 and run `npm run setup`.
2. Run `npm run check` and the browser checks below.
3. Back up an existing database and run the owner-only provisioning job described above.
4. Configure the app’s restricted runtime connection and production environment, then run `npm start` after building. Put the persistent database outside the app container/filesystem.
5. Route the real HTTPS domain to the app port and verify the public deployment checks below.

The clean source ZIP contains no compiled output. `npm run build` creates the backend/frontend builds and a public source-code snapshot. The multi-stage Dockerfile builds those assets and ships only backend production dependencies to the runtime image. The process runs as non-root, the app filesystem is read-only in Compose, and the health check queries the API/database.

## Local Docker and existing-volume upgrades

The default `compose.yaml` is for local HTTP at **http://localhost:3000**, with Swagger at **http://localhost:3000/api-docs/**. The app binds to loopback and PostgreSQL has no published port. The database is persisted in the existing `devtrack-db` named volume.

On Windows, open Docker Desktop and run `Start_DevTrack_Docker.cmd`. It creates random owner/runtime credentials for a new install. For an existing install, it keeps the old `.env` and **DB_PASSWORD**, adding only a missing runtime password. For manual startup, copy `.env.example` to a private `.env`, choose separate random `DB_PASSWORD` and `APP_DB_PASSWORD` values, and run:

```bash
docker compose up -d --build --wait
```

For an upgrade: back up, stop the old app, copy the new files into the existing project folder, retain root `.env` and the named volume, and add the new `APP_DB_PASSWORD` if missing. Keep the same Compose project name/directory; changing it creates a different volume and can look like data loss. `APP_DB_USER` defaults to `devtrack_app`.

The `database-setup` service connects with owner access, migrates the schema, and grants restricted access. The app depends on that job completing successfully and uses the restricted credentials. This process works on old volumes because it runs as a regular release job, not only as `/docker-entrypoint-initdb.d` initialization. To rerun the job explicitly:

```bash
docker compose stop app
docker compose run --rm database-setup
docker compose up -d --wait
```

Inspect `docker compose ps -a` and `docker compose logs --tail 100 database-setup app` if startup fails. **Do not remove the volume to fix a failed upgrade.** `docker compose down` stops containers and retains data. Adding `--volumes` deletes it. Keep DB_PASSWORD unchanged unless you deliberately rotate that owner role’s password inside PostgreSQL too. Changing the environment alone does not change credentials in an existing volume.

Docker’s external PostgreSQL and the local Node/PGlite database are separate. Keep `backend/data/` for the Node installation; switching environments does not copy accounts between them.

## Production Docker

Create a private `.env.production` with the existing owner **DB_PASSWORD**, a separate **APP_DB_PASSWORD** (24+ random characters), **APP_ORIGIN** set to the real HTTPS origin, and optionally **APP_DB_USER**, **APP_PORT**, and SMTP settings. Put a reverse proxy on the same host in front of the loopback app port.

```bash
docker compose --env-file .env.production -f compose.yaml -f compose.production.yaml config --quiet
docker compose --env-file .env.production -f compose.yaml -f compose.production.yaml build
docker compose --env-file .env.production -f compose.yaml -f compose.production.yaml up -d --wait database
docker compose --env-file .env.production -f compose.yaml -f compose.production.yaml run --rm --no-deps database-setup
docker compose --env-file .env.production -f compose.yaml -f compose.production.yaml up -d --wait
```

For upgrades, stop the app before the owner setup job and retain its volume. The production override sets production cookies/security headers, disables app-side migration, and hides Swagger by default. Do not run `node dist/migrate.js` in the runtime app: its restricted role intentionally cannot change the schema. Keep `AUTO_MIGRATE=false`. Only the owner job migrates.

If `ENABLE_SWAGGER=true` is deliberately configured, `/api-docs/` uses the same session, CSRF, and ownership rules as the website. The production default remains false. For normal local use, open the website, sign in or try the demo, then open Swagger in the same browser.

## Reverse proxies and HTTPS

`TRUST_PROXY=false` uses the TCP peer for rate limits. Enable it only when a trusted proxy overwrites `X-Forwarded-For` and public access to the raw app port is blocked. The app uses the rightmost forwarded address. Keep APP_ORIGIN aligned with the public hostname. Production cookies are Secure, HttpOnly, SameSite=Lax, with the `__Host-` prefix; they need real HTTPS in the browser.

## Email recovery

Set SMTP_HOST, SMTP_PORT, SMTP_FROM and, if required, SMTP_USER/SMTP_PASSWORD. Port 465 uses implicit TLS; other ports require STARTTLS in production. Use a verified sender. Without SMTP_HOST and SMTP_FROM, email recovery is hidden and its endpoint returns 503. Both Compose configurations pass SMTP settings to the app. Provider authentication and inbox delivery need testing against the chosen provider; the automated SMTP test uses a local fixture.

### Owner-assisted password recovery

Passwords cannot be read back. In the existing Node installation, stop the app and run:

```bash
npm run account:reset -- your_username
```

For Docker, with the same Compose files/environment file used for normal startup:

```bash
docker compose exec app node dist/recoverAccount.js your_username
```

For production, include `--env-file .env.production -f compose.yaml -f compose.production.yaml` before `exec`. The command’s account updates require only the runtime role’s data permissions. An interactive terminal prompts twice with hidden input. Do not put passwords in command arguments, scripts, or shell history. It updates one account, revokes its sessions/reset links, and keeps projects/goals. There is no public administrator endpoint or shared master password.

## Verification and repeatable checks

```bash
npm run check
npm run test:ui:install
npm run test:ui
npm audit
npm --prefix backend audit
npm --prefix frontend audit
```

`check` includes API/client/password-race checks, fresh/populated embedded schema/role upgrades, packaging and launcher isolation, frontend lint, both builds, and compiled production safety checks. Browser tests use an isolated memory database and real Chromium, including delayed password response bodies, account replacement, visitor screenshots/source/demo, error recovery, Swagger execution and accessibility at desktop/mobile sizes.

PGlite cannot update database-level ACLs; the embedded upgrade tests explicitly omit those three grants while executing role/table/schema permissions. They do **not** establish external login permissions or Docker persistence. With a disposable administrative PostgreSQL test connection in `DEVTRACK_POSTGRES_TEST_URL`, run:

```bash
npm run build
npm run test:postgres
```

This runner creates/removes its own random database and role. It executes the full grants on external PostgreSQL, tests fresh/repeat populated upgrades, retained password hashes and login, runtime API CRUD, denied DDL, concurrent credential changes and partial edits. It never migrates the maintenance database supplied in the URL.

With Node 24 and a running Docker engine:

```bash
npm run verify:docker
```

This uses its own random Compose project/credentials/volume and a free port. It validates both configurations, builds the image, tests a fresh restricted-role install, API/Swagger, real PostgreSQL upgrade/concurrency checks, and container replacement. Then it starts the previous release’s owner-login configuration, populates it with an account/project/goal, replaces the configuration while preserving the volume, and verifies the old password/login/data and new restricted permissions. It repeats provisioning and tests production configuration. Cleanup removes only its own test resources.

GitHub Actions defines these checks, including PostgreSQL 17/18 jobs. No external CI execution is implied. [Release results](RELEASE-2.2.0.md) distinguish actual local runs from unavailable infrastructure checks.

## Public deployment acceptance

Once hosting access is provided, configure the real domain, restricted runtime database, owner release job, and secrets; deploy the built app and verify **on its actual HTTPS URL**:

1. Landing page, three real screenshots, source link, absolute sharing image/canonical URL, and touch icon.
2. Try the demo, mobile navigation, and an edit that survives reload.
3. Personal signup/login, project/goal create/edit/delete, password change while leaving Settings, logout and fresh login.
4. Secure cookie flags and HTTPS certificate/redirects, rejected foreign-origin writes, and production Swagger disabled unless intentionally enabled.
5. Restart persistence, SMTP delivery if configured, and restoration of a database backup.

The public live demo remains **unverified** until this happens. A passing private HTTP container check does not verify public TLS, DNS, certificates, mail delivery, or backups.

## Clean release packaging

`npm run package` builds for verification and creates `release/DevTrack-fixed.zip` from a source allowlist. The ZIP contains source, lockfiles, docs, tests, configuration examples, Docker files, scripts, and the intended screenshots/icons. It excludes compiled `dist/` output, generated source-browser copies, dependencies, `.env` secrets, data directories, logs, reports, Git history and prior archives. Another developer runs `npm run setup` and `npm run build` to recreate output. Symbolic links are rejected.
