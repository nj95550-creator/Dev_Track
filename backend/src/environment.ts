/**
 * Select test isolation before loading dotenv. This import must run before
 * database configuration so automated tests cannot inherit a saved user database.
 */
import dotenv from 'dotenv';

// A test database is selected explicitly before loading any application secrets.
export const isolatedTestDatabase = process.env.DEVTRACK_TEST_DATABASE === 'memory';
if (isolatedTestDatabase && process.env.NODE_ENV === 'production')
  throw new Error('An isolated test database cannot be used in production.');
if (!isolatedTestDatabase) dotenv.config({ quiet: true });
if (process.env.NODE_ENV === 'test' && !isolatedTestDatabase)
  throw new Error('Tests require DEVTRACK_TEST_DATABASE=memory; external databases are refused.');
