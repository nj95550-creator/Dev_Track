/**
 * Account and service endpoints used by the main HTTP router.
 * The caller supplies a verified session; authentication responses expose public
 * profile fields and issue cookies only after credential transactions commit.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { databasePool, transaction, verifyDatabaseConnection } from './database';
import {
  HttpError,
  newSession,
  createSession,
  setSessionCookie,
  rateLimit,
  cookieToken,
  clearSessionCookie,
  digest,
  opaqueToken,
} from './security';
import { hashPassword, isValidPassword, verifyPassword } from './password';
import { sendRecovery } from './accounts';
import { addSamples } from './samples';
import {
  isRecord,
  isValidName,
  isValidUsername,
  isValidEmail,
  isCreateUserPayload,
  isLoginPayload,
  type UserRecord,
  type AuthenticationUserRecord,
} from './validation';
import { readJsonBody, sendJson } from './http';
const dummyPasswordHash = hashPassword(opaqueToken());

/**
 * Project a database user record to the public response contract. Explicitly
 * selecting fields keeps password hashes out of signup and login responses.
 */
function getPublicUser(user: UserRecord): {
  id: number;
  username: string;
  name: string;
  email: string;
  isDemo: boolean;
  createdAt: Date;
} {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    email: user.email,
    isDemo: user.isDemo,
    createdAt: user.createdAt,
  };
}

/**
 * Handle account/service routes after the main router has applied session,
 * origin and CSRF requirements. Return false only for routes owned elsewhere.
 */
export async function handleAccountRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  path: string,
  session: { userId: number; csrfToken: string } | null,
): Promise<boolean> {
  const method = request.method ?? 'GET';
  const sessionUserId = session?.userId;
  // Session lookup exposes public account fields and the write token; the
  // main router has already rejected an absent or expired session.
  if (method === 'GET' && path === '/session') {
    const user = (
      await databasePool.query(
        'SELECT id,username,name,email,is_demo AS "isDemo",created_at AS "createdAt" FROM users WHERE id=$1',
        [sessionUserId],
      )
    ).rows[0];
    sendJson(response, 200, { user, csrfToken: session!.csrfToken });
    return true;
  }
  if (method === 'POST' && path === '/logout') {
    await databasePool.query('DELETE FROM sessions WHERE token_hash=$1', [
      digest(cookieToken(request)!),
    ]);
    clearSessionCookie(response);
    sendJson(response, 200, { message: 'Signed out successfully.' });
    return true;
  }
  if (method === 'PATCH' && path === '/me') {
    const payload = await readJsonBody(request);
    if (!isRecord(payload) || !isValidName(payload.name) || !isValidUsername(payload.username))
      throw new HttpError(400, 'Enter a valid name and username.');
    const result = await databasePool.query(
      'UPDATE users SET name=$2,username=$3 WHERE id=$1 RETURNING id,username,name,email,is_demo AS "isDemo",created_at AS "createdAt"',
      [sessionUserId, payload.name.trim(), payload.username.trim()],
    );
    sendJson(response, 200, { user: result.rows[0] });
    return true;
  }
  // Verify current credentials first, then replace the hash, revoke prior
  // credentials and create the replacement session within one transaction.
  if (method === 'POST' && path === '/password') {
    const payload = await readJsonBody(request);
    if (
      !isRecord(payload) ||
      typeof payload.currentPassword !== 'string' ||
      !isValidPassword(payload.password)
    )
      throw new HttpError(
        400,
        'Enter your current password and a new password of 15–128 characters.',
      );
    await rateLimit(request, 'password', 10, 15);
    const record = (
      await databasePool.query('SELECT password_hash FROM users WHERE id=$1', [sessionUserId])
    ).rows[0];
    if (!record || !(await verifyPassword(payload.currentPassword, record.password_hash)))
      throw new HttpError(400, 'Your current password is incorrect.');
    const hash = await hashPassword(payload.password);
    const credentials = await transaction(async (query) => {
      const updated = await query(
        'UPDATE users SET password_hash=$2 WHERE id=$1 AND password_hash=$3 RETURNING id',
        [sessionUserId, hash, record.password_hash],
      );
      if (!updated.rows.length)
        throw new HttpError(409, 'Your password changed in another session. Sign in again.');
      await query('DELETE FROM sessions WHERE user_id=$1', [sessionUserId]);
      await query('DELETE FROM password_resets WHERE user_id=$1', [sessionUserId]);
      return createSession(sessionUserId!, false, query);
    });
    setSessionCookie(response, credentials.token);
    sendJson(response, 200, {
      message: 'Password updated. Other sessions have been signed out.',
      csrfToken: credentials.csrfToken,
    });
    return true;
  }
  if (method === 'POST' && path === '/forgot-password') {
    const payload = await readJsonBody(request);
    if (!isRecord(payload) || !isValidEmail(payload.email))
      throw new HttpError(400, 'Enter a valid email address.');
    await rateLimit(request, 'recovery', 5, 15);
    await sendRecovery(payload.email.trim().toLowerCase());
    sendJson(response, 200, {
      message: 'If an account matches that email, a reset link is on its way.',
    });
    return true;
  }
  // Recovery accepts a single-use expiring token instead of an active session.
  // All credential paths lock the account before consuming/revoking reset tokens.
  if (method === 'POST' && path === '/reset-password') {
    const payload = await readJsonBody(request);
    if (
      !isRecord(payload) ||
      typeof payload.token !== 'string' ||
      !/^[a-f0-9]{64}$/.test(payload.token) ||
      !isValidPassword(payload.password)
    )
      throw new HttpError(400, 'Use a valid reset link and a password of 15–128 characters.');
    const tokenHash = digest(payload.token);
    // Look up the account without locking the token. All credential operations
    // lock the account first, then consume/revoke tokens inside the transaction.
    const candidate = (
      await databasePool.query(
        'SELECT user_id FROM password_resets WHERE token_hash=$1 AND expires_at>CURRENT_TIMESTAMP',
        [tokenHash],
      )
    ).rows[0];
    if (!candidate)
      throw new HttpError(400, 'That reset link has expired or has already been used.');
    const hash = await hashPassword(payload.password);
    await transaction(async (query) => {
      await query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [candidate.user_id]);
      const reset = (
        await query(
          'DELETE FROM password_resets WHERE token_hash=$1 AND user_id=$2 AND expires_at>CURRENT_TIMESTAMP RETURNING user_id',
          [tokenHash, candidate.user_id],
        )
      ).rows[0];
      if (!reset)
        throw new HttpError(400, 'That reset link has expired or has already been used.');
      await query('UPDATE users SET password_hash=$2 WHERE id=$1', [reset.user_id, hash]);
      await query('DELETE FROM sessions WHERE user_id=$1', [reset.user_id]);
      await query('DELETE FROM password_resets WHERE user_id=$1', [reset.user_id]);
    });
    clearSessionCookie(response);
    sendJson(response, 200, {
      message: 'Password reset. You can now sign in.',
    });
    return true;
  }
  // Each demo gets its own explicitly marked account and editable sample data.
  // Cleanup targets only eligible flagged demos, never guessed personal accounts.
  if (method === 'POST' && path === '/demo') {
    await databasePool.query(
      "DELETE FROM users WHERE is_demo=TRUE AND created_at<CURRENT_TIMESTAMP - INTERVAL '7 days' AND NOT EXISTS(SELECT 1 FROM sessions WHERE sessions.user_id=users.id AND expires_at>CURRENT_TIMESTAMP AND last_seen_at>CURRENT_TIMESTAMP - INTERVAL '24 hours')",
    );
    const id = opaqueToken().slice(0, 16);
    const user = (
      await databasePool.query(
        'INSERT INTO users(username,name,email,password_hash,is_demo) VALUES($1,$2,$3,$4,TRUE) RETURNING id,username,name,email,is_demo AS "isDemo",created_at AS "createdAt"',
        [`demo_${id}`, 'Alex Morgan', `${id}@demo.invalid`, await hashPassword(opaqueToken())],
      )
    ).rows[0];
    try {
      await addSamples(user.id);
    } catch (error) {
      await databasePool.query('DELETE FROM users WHERE id=$1', [user.id]);
      throw error;
    }
    if (cookieToken(request))
      await databasePool.query('DELETE FROM sessions WHERE token_hash=$1', [
        digest(cookieToken(request)!),
      ]);
    const csrfToken = await newSession(response, user.id);
    sendJson(response, 201, { user, csrfToken });
    return true;
  }
  if (method === 'POST' && path === '/sample-data') {
    if (!(await addSamples(sessionUserId!)))
      throw new HttpError(409, 'Examples can only be added to an empty project workspace.');
    sendJson(response, 201, { message: 'Example workspace added.' });
    return true;
  }

  /*
   * Service routes.
   */
  if (method === 'GET' && path === '/') {
    sendJson(response, 200, {
      message: 'Welcome to the DevTrack API.',
    });
    return true;
  }

  if (method === 'GET' && path === '/health') {
    await verifyDatabaseConnection();

    sendJson(response, 200, {
      status: 'ok',
      database: 'connected',
    });
    return true;
  }

  /*
   * Profile and authentication routes.
   */
  if (method === 'GET' && path === '/users') {
    throw new HttpError(404, 'The requested endpoint does not exist.');
  }

  // Signup validates public input and stores a password hash; uniqueness is
  // enforced by the database and mapped to a safe conflict response by the router.
  if (method === 'POST' && path === '/users') {
    const payload = await readJsonBody(request);

    if (
      isRecord(payload) &&
      typeof payload.email === 'string' &&
      payload.email.trim().toLowerCase().endsWith('@demo.invalid')
    )
      throw new HttpError(
        400,
        'That email domain is reserved for temporary demos. Use your personal email address.',
      );

    if (!isCreateUserPayload(payload)) {
      sendJson(response, 400, {
        error:
          'Enter a valid username, name, email, and password. Passwords must be between 15 and 128 characters.',
      });
      return true;
    }

    const passwordHash = await hashPassword(payload.password);

    const result = await databasePool.query<UserRecord>(
      `
          INSERT INTO users (
            username,
            name,
            email,
            password_hash
          )
          VALUES ($1, $2, $3, $4)
          RETURNING
            id,
            username,
            name,
            email,
            is_demo AS "isDemo",
            created_at AS "createdAt";
        `,
      [
        payload.username.trim(),
        payload.name.trim(),
        payload.email.trim().toLowerCase(),
        passwordHash,
      ],
    );

    const createdUser = result.rows[0];

    if (createdUser === undefined) {
      throw new Error('PostgreSQL did not return the created user.');
    }

    if (cookieToken(request))
      await databasePool.query('DELETE FROM sessions WHERE token_hash=$1', [
        digest(cookieToken(request)!),
      ]);
    const csrfToken = await newSession(response, createdUser.id);
    sendJson(response, 201, {
      csrfToken,
      user: getPublicUser(createdUser),
    });
    return true;
  }

  if (method === 'POST' && path === '/login') {
    const payload = await readJsonBody(request);

    if (!isLoginPayload(payload)) {
      sendJson(response, 400, {
        error: 'Enter a valid username and password.',
      });
      return true;
    }

    const result = await databasePool.query<AuthenticationUserRecord>(
      `
            SELECT
              id,
              username,
              name,
              email,
              is_demo AS "isDemo",
              password_hash AS "passwordHash",
              created_at AS "createdAt"
            FROM users
            WHERE LOWER(username) = LOWER($1)
            LIMIT 1;
          `,
      [payload.username.trim()],
    );

    const user = result.rows[0];

    // Use a real dummy hash when no account matches, keeping the password-check
    // path expensive for both existing and nonexistent usernames.
    const passwordMatches = await verifyPassword(
      payload.password,
      user?.passwordHash || (await dummyPasswordHash),
    );
    if (!user || !user.passwordHash || !passwordMatches)
      throw new HttpError(401, 'Invalid username or password.');
    const remember = isRecord(payload) && payload.remember === true;
    const login = await transaction(async (query) => {
      const current = (
        await query<AuthenticationUserRecord>(
          `SELECT id,username,name,email,is_demo AS "isDemo",password_hash AS "passwordHash",created_at AS "createdAt"
         FROM users WHERE id=$1 FOR UPDATE`,
          [user.id],
        )
      ).rows[0];
      // Verification runs outside the lock because scrypt is expensive. Confirm
      // the verified hash is still current while creating the session atomically.
      if (!current || current.passwordHash !== user.passwordHash)
        throw new HttpError(401, 'Invalid username or password.');
      const previousToken = cookieToken(request);
      if (previousToken)
        await query('DELETE FROM sessions WHERE token_hash=$1', [digest(previousToken)]);
      return {
        ...(await createSession(current.id, remember, query)),
        user: current,
      };
    });
    setSessionCookie(response, login.token, remember);
    sendJson(response, 200, {
      csrfToken: login.csrfToken,
      user: getPublicUser(login.user),
    });
    return true;
  }

  return false;
}
