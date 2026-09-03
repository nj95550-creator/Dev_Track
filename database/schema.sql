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