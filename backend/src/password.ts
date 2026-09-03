import {
  randomBytes,
  scrypt,
  timingSafeEqual,
} from "node:crypto";

const PASSWORD_MINIMUM_LENGTH = 15;
const PASSWORD_MAXIMUM_LENGTH = 128;
const SALT_LENGTH = 16;
const DERIVED_KEY_LENGTH = 64;

/*
 * These scrypt settings provide memory-hard password protection based
 * on the current OWASP password-storage recommendation.
 */
const SCRYPT_COST = 2 ** 17;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SCRYPT_MAX_MEMORY = 256 * 1024 * 1024;
const HASH_VERSION = "scrypt-v1";

/**
 * Validates password length without imposing unnecessary character rules.
 */
export function isValidPassword(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  const normalizedPassword = value.normalize("NFC");
  const characterCount = Array.from(normalizedPassword).length;

  return (
    characterCount >= PASSWORD_MINIMUM_LENGTH &&
    characterCount <= PASSWORD_MAXIMUM_LENGTH
  );
}

/**
 * Derives a memory-hard key from the password without blocking
 * the Node.js event loop.
 */
function derivePasswordKey(
  password: string,
  salt: Buffer
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password.normalize("NFC"),
      salt,
      DERIVED_KEY_LENGTH,
      {
        N: SCRYPT_COST,
        r: SCRYPT_BLOCK_SIZE,
        p: SCRYPT_PARALLELIZATION,
        maxmem: SCRYPT_MAX_MEMORY,
      },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(derivedKey);
      }
    );
  });
}

/**
 * Creates a unique salted password hash suitable for database storage.
 * The original password cannot be recovered from the stored value.
 */
export async function hashPassword(
  password: string
): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derivedKey = await derivePasswordKey(password, salt);

  return [
    HASH_VERSION,
    SCRYPT_COST,
    SCRYPT_BLOCK_SIZE,
    SCRYPT_PARALLELIZATION,
    salt.toString("base64"),
    derivedKey.toString("base64"),
  ].join("$");
}

/**
 * Compares a submitted password against its stored hash using a
 * timing-safe comparison to reduce information leakage.
 */
export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  const parts = storedHash.split("$");

  if (parts.length !== 6) {
    return false;
  }

  const [
    version,
    costValue,
    blockSizeValue,
    parallelizationValue,
    saltValue,
    derivedKeyValue,
  ] = parts;

  if (
    version !== HASH_VERSION ||
    Number(costValue) !== SCRYPT_COST ||
    Number(blockSizeValue) !== SCRYPT_BLOCK_SIZE ||
    Number(parallelizationValue) !== SCRYPT_PARALLELIZATION
  ) {
    return false;
  }

  const salt = Buffer.from(saltValue, "base64");
  const storedDerivedKey = Buffer.from(
    derivedKeyValue,
    "base64"
  );

  if (
    salt.length !== SALT_LENGTH ||
    storedDerivedKey.length !== DERIVED_KEY_LENGTH
  ) {
    return false;
  }

  const submittedDerivedKey = await derivePasswordKey(
    password,
    salt
  );

  return timingSafeEqual(
    submittedDerivedKey,
    storedDerivedKey
  );
}