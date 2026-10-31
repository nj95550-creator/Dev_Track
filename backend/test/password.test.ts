/**
 * Shared password-policy cases for server and browser helpers. Include ASCII,
 * emoji and decomposed accents so both sides count normalized Unicode characters
 * consistently at the accepted-length boundaries.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidPassword as apiPassword } from '../src/password';
import { isValidPassword as browserPassword } from '../../frontend/src/lib/password';

test('password length rules agree for ASCII, emoji and canonically equivalent Unicode', () => {
  for (const character of ['a', '🔒', 'e\u0301']) {
    for (const [length, valid] of [
      [14, false],
      [15, true],
      [80, true],
      [128, true],
      [129, false],
    ] as const) {
      const password = character.repeat(length);
      assert.equal(apiPassword(password), valid, `API: ${length} normalized characters`);
      assert.equal(
        browserPassword(password),
        valid,
        `Browser: ${length} normalized characters`,
      );
    }
  }
});
