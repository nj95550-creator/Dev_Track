/**
 * Client-side password-length validation shared by authentication and Settings.
 * The server repeats the same NFC-normalized character checks before accepting data.
 */
// Match the API's NFC-normalized Unicode character count. Native HTML length
// limits count UTF-16 units and can silently truncate otherwise valid passwords.
export function isValidPassword(value: string): boolean {
  const length = Array.from(value.normalize('NFC')).length;
  return length >= 15 && length <= 128;
}
export const passwordLengthMessage = 'Use a password of 15–128 characters.';
