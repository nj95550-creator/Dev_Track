-- Repeatable application schema for fresh installations and in-place upgrades.
-- Existing rows are retained; additions use IF NOT EXISTS and targeted backfills.
-- Runtime role grants are managed separately by the owner provisioning command.
-- SQL constraints protect stored values even when a caller bypasses the browser.
-- Stores each DevTrack profile and its authentication information.
CREATE TABLE IF NOT EXISTS users (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username VARCHAR(50),
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Adds authentication fields to databases created before login was introduced.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS username VARCHAR(50);

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Existing accounts stay personal unless explicitly marked by the owner.
-- Never infer a destructive cleanup flag from an email address or username.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE;

-- Assigns usernames to profiles created before usernames were required.
UPDATE users
SET username =
    CASE
        WHEN id = 1 THEN 'testuser'
        ELSE 'user' || id
    END
WHERE username IS NULL OR BTRIM(username) = '';

ALTER TABLE users
    ALTER COLUMN username SET NOT NULL;

-- Prevents duplicate usernames regardless of letter casing.
CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique_index
    ON users (LOWER(username));

-- Stores projects created and managed by a DevTrack user.
CREATE TABLE IF NOT EXISTS projects (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(150) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status VARCHAR(20) NOT NULL DEFAULT 'planned',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Adds the expanded project fields to existing databases.
-- IF NOT EXISTS keeps this migration safe to run repeatedly.
ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS priority VARCHAR(20) NOT NULL DEFAULT 'medium',
    ADD COLUMN IF NOT EXISTS progress INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS start_date DATE,
    ADD COLUMN IF NOT EXISTS target_date DATE,
    ADD COLUMN IF NOT EXISTS technologies TEXT,
    ADD COLUMN IF NOT EXISTS repository_url TEXT,
    ADD COLUMN IF NOT EXISTS live_url TEXT;

-- Add named constraints only once so the same migration can be applied again.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'projects_status_check'
    ) THEN
        ALTER TABLE projects
            ADD CONSTRAINT projects_status_check
                CHECK (status IN ('planned', 'in_progress', 'completed'));
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'projects_priority_check'
    ) THEN
        ALTER TABLE projects
            ADD CONSTRAINT projects_priority_check
                CHECK (priority IN ('low', 'medium', 'high'));
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'projects_progress_check'
    ) THEN
        ALTER TABLE projects
            ADD CONSTRAINT projects_progress_check
                CHECK (progress >= 0 AND progress <= 100);
    END IF;
END $$;

UPDATE projects
SET priority = 'medium'
WHERE priority IS NULL OR BTRIM(priority) = '';

UPDATE projects
SET progress = 0
WHERE progress IS NULL;

-- Improves project lookup performance for each user.
CREATE INDEX IF NOT EXISTS projects_user_id_index
    ON projects (user_id);

-- Stores personal learning goals belonging to a DevTrack user.
-- A project deletion removes only the association; the learning goal survives.
CREATE TABLE IF NOT EXISTS learning_goals (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
    title VARCHAR(150) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status VARCHAR(20) NOT NULL DEFAULT 'planned',
    target_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT learning_goals_status_check
        CHECK (status IN ('planned', 'in_progress', 'completed'))
);

-- Improves learning-goal lookup performance for each user.
CREATE INDEX IF NOT EXISTS learning_goals_user_id_index
    ON learning_goals (user_id);

-- Improves lookup performance when goals are connected to projects.
CREATE INDEX IF NOT EXISTS learning_goals_project_id_index
    ON learning_goals (project_id);
-- Cookie values and recovery tokens are stored only as SHA-256 hashes.
-- Expiry/activity are server-side; the browser receives only the raw opaque cookie token.
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    csrf_token TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS sessions_user_index ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_index ON sessions(expires_at);
-- Reset tokens are single-use by transactional deletion in accountRoutes.ts.
CREATE TABLE IF NOT EXISTS password_resets (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS password_resets_user_index ON password_resets(user_id);
-- Shared counters let multiple app processes enforce the same request limits.
CREATE TABLE IF NOT EXISTS rate_limits (
    key TEXT PRIMARY KEY,
    count INTEGER NOT NULL DEFAULT 1,
    expires_at TIMESTAMPTZ NOT NULL
);
