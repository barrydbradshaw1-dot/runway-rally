-- Pilot schema. Student state is stored as one JSONB document per student, which keeps the
-- pilot simple. Split into relational tables once the shape of the data settles.
-- No real names, emails or locations are collected: only a class code and a nickname.

CREATE TABLE IF NOT EXISTS students (
  id          uuid PRIMARY KEY,
  class_code  text NOT NULL,
  token_hash  text NOT NULL UNIQUE,
  data        jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS students_class_idx ON students (class_code);

CREATE TABLE IF NOT EXISTS tasks (
  id          uuid PRIMARY KEY,
  student_id  uuid NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  data        jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tasks_student_idx ON tasks (student_id, created_at DESC);

CREATE TABLE IF NOT EXISTS events (
  id          bigserial PRIMARY KEY,
  student_id  uuid NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  type        text NOT NULL,
  payload     jsonb NOT NULL DEFAULT '{}',
  at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_student_idx ON events (student_id, at DESC);

-- LTI (Brightspace and other LMS launches)
-- A student can have several sign-in tokens (one per device or launch).
CREATE TABLE IF NOT EXISTS student_tokens (
  token_hash  text PRIMARY KEY,
  student_id  uuid NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS student_tokens_student_idx ON student_tokens (student_id);

-- One row per LMS course (class code derived from platform, deployment and course id).
CREATE TABLE IF NOT EXISTS classes (
  code        text PRIMARY KEY,
  data        jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS students_lti_idx ON students ((data->'lti'->>'ltiKey'));

-- Recovery codes (sign back in on a new device) and family progress links. Only hashes are stored,
-- and each student has at most one of each kind: making a new one replaces the old one.
CREATE TABLE IF NOT EXISTS student_keys (
  key_hash    text PRIMARY KEY,
  student_id  uuid NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('recovery', 'progress')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS student_keys_student_idx ON student_keys (student_id, kind);
