# Retest this release

If updating an existing installation, stop the app, back up its folder, and follow the update instructions in README.md. Keep its database and private environment files. This ZIP has no saved accounts or sessions. A fresh extraction starts with an empty database.

## Node / Windows

1. Run `npm run setup` once after updating, then double-click `Start_DevTrack.cmd`. Open `http://localhost:4173`.
2. Create a personal account, create a project, edit its title/progress/dates, and reload. Check the changes remain.
3. Create a learning goal connected to that project. Edit it, complete it, and reopen it.
4. Delete the project. Check that its learning goal remains as an independent goal, then delete the goal.
5. Open Settings, change the theme, reload, and check the preference remains. Choose About this workspace from another page; it should open Settings and scroll to the privacy details.
6. Make the browser narrow and short. Open the menu, scroll down to Sign out, press Escape, and check focus returns to the menu button. Open an empty project form and press Escape; focus should return to the button that opened it.
7. Sign out and check the workspace is inaccessible. Try a wrong password, then sign in with your correct password. Your personal account should remain personal even if its username begins with `demo_`.
8. Use browser developer tools: the Node sign-in cookie is `devtrack_node_session`, marked HttpOnly and SameSite=Lax. Only theme/view preferences belong in local storage. Session storage should remain empty. Signing out should clear the sign-in cookie.
9. Open `http://localhost:4173/api-docs/` in the same browser. Try GET projects, create a throwaway project, then delete it. Response fields and examples should be visible. Refresh Swagger and repeat a protected request.
10. In Settings, change the test account's password, sign out, and confirm the new password works. When your SMTP provider is configured, obtain a recovery link, sign in, and open that link in the same browser. It should show the reset form; cancellation should retain the account, while completing recovery should require a new sign-in.

## Docker

1. Start Docker Desktop, then run `Start_DevTrack_Docker.cmd`. Confirm `docker compose ps` shows both services healthy.
2. Open `http://localhost:3000` and create a separate Docker test account/project. Docker and Node use different databases and cookies.
3. Check `http://localhost:3000/api-docs/`.
4. Run `docker compose down`, start again, and confirm the account/project remains. Do not add `--volumes` when stopping your own installation.
5. With both versions running, sign in to each. Signing out of Node should not sign you out of Docker.

## Automated checks

```bash
npm run check
npm run test:ui:install
npm run test:ui
```

The browser installation is needed once per machine. API and browser tests use disposable in-memory databases even when PostgreSQL credentials are configured. GitHub Actions additionally tests Docker image startup and data persistence against PostgreSQL; that job must run before claiming container verification.

The browser suite also delays project/goal loading while saving a new record, cancels pending work during sign-out, rejects an obsolete cookie without clearing the replacement, and loads the real Swagger UI to create/delete a project across refresh. Responsive checks cover 320–1020px widths, one/two-project dashboards, long URLs and connected-project names, plus About navigation while already in Settings. Each browser test has its own authentication-limit bucket in the isolated loopback test harness; production limits remain unchanged.

With Docker Desktop running and Node 24 installed, `npm run verify:docker` runs the separate disposable Docker/PostgreSQL/production checks and cleans up its test resources. For your own disposable PostgreSQL 17/18 service, set `DEVTRACK_POSTGRES_TEST_URL`, build, and run `npm run test:postgres`.

The automated checks also deliberately overlap login with password resets/changes, exercise recovery with and without an existing session, and type long Unicode passwords through the actual forms. No manual concurrency timing or unusual password is required for the normal retest above.

Before public deployment, verify your actual HTTPS domain, PostgreSQL service, backup/restore process, and SMTP provider. Local mail-fixture tests do not prove delivery to a real inbox. See DEPLOYMENT.md for those settings and the owner-assisted password reset command.
