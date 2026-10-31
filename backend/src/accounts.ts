/**
 * Email password-recovery service. Reset tokens are random, stored as hashes,
 * and delivered through the configured SMTP transport using the trusted app origin.
 */
import nodemailer from 'nodemailer';
import { databasePool, transaction } from './database';
import { appOrigin, digest, opaqueToken, HttpError } from './security';
export const recoveryAvailable = Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
/**
 * Replace the account's previous reset token and email a 20-minute link.
 * Unknown addresses return quietly to avoid revealing registered accounts;
 * failed delivery removes the unusable token instead of leaving it active.
 */
export async function sendRecovery(email: string) {
  if (!recoveryAvailable)
    throw new HttpError(503, 'Password recovery is not configured. Contact the site owner.');
  const user = (
    await databasePool.query('SELECT id FROM users WHERE LOWER(email)=LOWER($1)', [email])
  ).rows[0];
  if (!user) return;
  const token = opaqueToken();
  await transaction(async (query) => {
    await query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [user.id]);
    await query('DELETE FROM password_resets WHERE user_id=$1', [user.id]);
    await query(
      "INSERT INTO password_resets(token_hash,user_id,expires_at) VALUES($1,$2,CURRENT_TIMESTAMP + INTERVAL '20 minutes')",
      [digest(token), user.id],
    );
  });
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_PORT === '465',
    requireTLS: process.env.NODE_ENV === 'production' && process.env.SMTP_PORT !== '465',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
  });
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: email,
      subject: 'Reset your DevTrack password',
      text: `Reset your DevTrack password using this link (valid for 20 minutes):\n${appOrigin}/?reset=${token}\n\nIf you did not request this, you can ignore this email.`,
    });
  } catch (error) {
    await databasePool.query('DELETE FROM password_resets WHERE token_hash=$1', [digest(token)]);
    throw error;
  }
}
