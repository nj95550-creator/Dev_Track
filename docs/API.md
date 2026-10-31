# DevTrack API

Interactive Swagger UI is available at `/api-docs/` (`/swagger` redirects there). The Node quickstart proxies it on port 4173; Docker serves it on port 3000 by default. Sign in on the website in the same browser, or execute POST `/api/demo`. Swagger automatically sends the session cookie and fetches a current CSRF token before protected writes. Production requires `ENABLE_SWAGGER=true` to serve the UI and specification.

All frontend requests use `/api`. Protected routes require the server-issued session cookie. Mutating protected requests also require the `X-CSRF-Token` returned by `/api/session` or a successful authentication response. Send request bodies as `application/json`. Cookies, CSRF tokens, and passwords must not be logged or embedded in URLs.

| Method               | Route                     | Behavior                                                                                                         |
| -------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| GET                  | `/api/health`             | Database readiness.                                                                                              |
| GET                  | `/api/config`             | Whether SMTP recovery is configured.                                                                             |
| POST                 | `/api/users`              | Create an account and session: `{name,username,email,password}`.                                                 |
| POST                 | `/api/login`              | Sign in: `{username,password,remember?}`.                                                                        |
| POST                 | `/api/demo`               | Create an isolated sample workspace and session.                                                                 |
| GET                  | `/api/session`            | Current `{user,csrfToken}`; 401 when absent or expired.                                                          |
| POST                 | `/api/logout`             | Delete the current server session and clear its cookie.                                                          |
| PATCH                | `/api/me`                 | Update `{name,username}`. Email changes are not exposed.                                                         |
| POST                 | `/api/password`           | Change password: `{currentPassword,password}`. Invalidates all previous sessions and returns a fresh CSRF token. |
| POST                 | `/api/forgot-password`    | Request email recovery: `{email}`. Available with SMTP configuration.                                            |
| POST                 | `/api/reset-password`     | Consume reset link: `{token,password}`. Invalidates existing sessions.                                           |
| GET / POST           | `/api/projects`           | List/create the authenticated user's projects.                                                                   |
| GET / PATCH / DELETE | `/api/projects/:id`       | Read/update/delete only a project owned by the authenticated user.                                               |
| GET / POST           | `/api/learning-goals`     | List/create the authenticated user's learning goals.                                                             |
| GET / PATCH / DELETE | `/api/learning-goals/:id` | Read/update/delete only an owned learning goal.                                                                  |
| POST                 | `/api/sample-data`        | Add examples to an account with no projects. Returns 409 when projects already exist.                            |

`GET /api/users` is intentionally unavailable. There is no public account directory. Changing an HTTP verb is not an authorization mechanism; every read and mutation is checked on the server.

## Project input

`title` is required on create, maximum 150 characters. Other fields: `description` (maximum 5000), `status` (`planned`, `in_progress`, `completed`), `priority` (`low`, `medium`, `high`), integer `progress` (0–100), `startDate`, `targetDate`, `technologies` (maximum 500), `repositoryUrl`, `liveUrl` (HTTP/S only, maximum 2048). Dates are calendar strings `YYYY-MM-DD`, or null. The target must not precede the start. A completed project always has 100% progress. An omitted PATCH field retains its current value; null clears optional fields. Edits lock the owned record inside a database transaction, so simultaneous partial edits to different fields preserve both changes. Concurrent edits to the same field use the last committed value.

## Learning-goal input

`title` is required on create. Other fields: `description`, `status`, `targetDate`, `projectId`. An associated project must belong to the authenticated user. Deleting a project keeps its learning goals and sets their projectId to null. Creation includes status in one database insert.

## Responses and errors

Collections return `{projects:[...]}` or `{goals:[...]}`. Single records return `{project:{...}}` or `{goal:{...}}`. Authentication returns `{user:{...},csrfToken:"..."}` without password hashes. Public user records include `id`, `username`, `name`, `email`, `isDemo`, and `createdAt`. Only the server sets `isDemo`. The OpenAPI specification defines success response schemas and examples for every operation. Errors use `{error:"Readable explanation"}` and the appropriate 400, 401, 403, 404, 409, 413, 415, 429, or 500 status. Dates are returned as `YYYY-MM-DD`; timestamps use ISO date-time strings.

A successful login rotates the browser's current session. Sessions expire after 24 hours of inactivity, with an absolute limit of seven days (30 days with “keep me signed in”). “Keep me signed in” adds a persistent cookie; the inactivity limit still applies. Password-reset links expire in 20 minutes and work once.

Login rechecks the verified hash while holding the account's database lock and creates the session within that transaction. If a concurrent reset or password change replaced the hash, the stale login returns 401 and issues no session cookie. Password lengths are counted as 15–128 Unicode characters after NFC normalization in both the API and browser forms.

Recovery, owner resets and password changes lock the account before consuming or revoking recovery tokens. Recovery checks the token again after acquiring that lock, so a concurrent credential change can revoke it safely. A normal 401 response does not clear the browser cookie: the request may have carried an older session than the browser currently holds. Explicit successful logout and recovery still clear their cookie.

Calendar years must be 0001–9999. Null characters are rejected in stored text fields. Invalid input returns 400 rather than a database error.
