import "dotenv/config";
import { Pool } from "pg";

/**
 * Reads a required environment variable and stops startup with a clear
 * error when database configuration is incomplete.
 */
function getRequiredEnvironmentVariable(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

const databasePort = Number(getRequiredEnvironmentVariable("DB_PORT"));

if (!Number.isInteger(databasePort)) {
  throw new Error("DB_PORT must contain a valid whole number.");
}

if (
  process.env.NODE_ENV === "test" &&
  process.env.DB_NAME !== "devtrack_test"
) {
  throw new Error("Test mode requires DB_NAME=devtrack_test");
}

/**
 * Maintains reusable PostgreSQL connections so each API request does not
 * need to create a completely new database connection.
 */
export const databasePool = new Pool({
  host: getRequiredEnvironmentVariable("DB_HOST"),
  port: databasePort,
  database: getRequiredEnvironmentVariable("DB_NAME"),
  user: getRequiredEnvironmentVariable("DB_USER"),
  password: getRequiredEnvironmentVariable("DB_PASSWORD"),
});

/**
 * Confirms that PostgreSQL is reachable before the API begins handling
 * requests.
 */
export async function verifyDatabaseConnection(): Promise<void> {
  const client = await databasePool.connect();

  try {
    await client.query("SELECT 1");
  } finally {
    client.release();
  }
}