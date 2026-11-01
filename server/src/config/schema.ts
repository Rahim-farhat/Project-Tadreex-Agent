// Applied on every start; every statement must stay idempotent.
// IDs are text so records migrated from MongoDB keep their ObjectId (and
// existing links keep working); new rows get a UUID.
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name        TEXT NOT NULL,
  username    TEXT,
  email       TEXT NOT NULL UNIQUE,
  password    TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'manager', 'user')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'username'
  ) THEN
    ALTER TABLE users ADD COLUMN username TEXT;
  END IF;

  UPDATE users SET username = LOWER(name) WHERE username IS NULL;

  ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
  ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'manager', 'user'));

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'settings' AND column_name = 'groq_api_key'
  ) THEN
    ALTER TABLE settings ADD COLUMN groq_api_key TEXT;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique_idx ON users (LOWER(username)) WHERE username IS NOT NULL;


CREATE TABLE IF NOT EXISTS chat_fields (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  label       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  type        TEXT NOT NULL DEFAULT 'text' CHECK (type IN ('text', 'radio', 'checkbox')),
  options     TEXT[] NOT NULL DEFAULT '{}',
  required    BOOLEAN NOT NULL DEFAULT true,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scenario_fields (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  key         TEXT NOT NULL,
  label       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  forbidden   TEXT NOT NULL DEFAULT '',
  type        TEXT NOT NULL DEFAULT 'text' CHECK (type IN ('text', 'radio', 'checkbox')),
  options     TEXT[] NOT NULL DEFAULT '{}',
  required    BOOLEAN NOT NULL DEFAULT true,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  id                     INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  groq_model_strong      TEXT NOT NULL DEFAULT 'openai/gpt-oss-120b',
  groq_model_fast        TEXT NOT NULL DEFAULT 'openai/gpt-oss-20b',
  groq_temperature       DOUBLE PRECISION NOT NULL DEFAULT 0.1,
  groq_fast_temperature  DOUBLE PRECISION NOT NULL DEFAULT 0.2,
  groq_api_key           TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  id                 TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title              TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_progress', 'completed')),
  client_token       TEXT NOT NULL UNIQUE,
  created_by         TEXT,
  phase              TEXT NOT NULL DEFAULT 'info' CHECK (phase IN ('info', 'review', 'scenario', 'completed')),
  current_step       INTEGER NOT NULL DEFAULT 0,
  info_chat_history  JSONB NOT NULL DEFAULT '[]',
  answers            JSONB NOT NULL DEFAULT '{"scenes": []}',
  scenarios          JSONB NOT NULL DEFAULT '[]',
  uploaded_files     JSONB NOT NULL DEFAULT '[]',
  sheet_url          TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS projects_created_at_idx ON projects (created_at DESC);
CREATE INDEX IF NOT EXISTS projects_created_by_idx ON projects (created_by);

-- Client modes (beginner / intermediate / expert). A NULL mode keeps the legacy step-by-step chat.
ALTER TABLE scenario_fields ADD COLUMN IF NOT EXISTS level TEXT NOT NULL DEFAULT 'expert';
ALTER TABLE scenario_fields DROP CONSTRAINT IF EXISTS scenario_fields_level_check;
ALTER TABLE scenario_fields ADD CONSTRAINT scenario_fields_level_check
  CHECK (level IN ('beginner', 'intermediate', 'expert'));

ALTER TABLE settings ADD COLUMN IF NOT EXISTS levels_initialized BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE projects ADD COLUMN IF NOT EXISTS mode TEXT;
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_mode_check;
ALTER TABLE projects ADD CONSTRAINT projects_mode_check
  CHECK (mode IS NULL OR mode IN ('beginner', 'intermediate', 'expert'));
ALTER TABLE projects ADD COLUMN IF NOT EXISTS brainstorm_text TEXT NOT NULL DEFAULT '';

ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_phase_check;
ALTER TABLE projects ADD CONSTRAINT projects_phase_check
  CHECK (phase IN ('info', 'review', 'scenario', 'brainstorm', 'refine', 'final', 'completed'));
`;
