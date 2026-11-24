BEGIN;

CREATE TABLE IF NOT EXISTS inquiry_categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(40) NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO inquiry_categories (name)
VALUES ('GENERAL'), ('TECHNICAL'), ('REPAIR'), ('BILLING')
ON CONFLICT (name) DO NOTHING;

INSERT INTO inquiry_categories (name)
SELECT DISTINCT UPPER(category)
FROM inquiries
WHERE category IS NOT NULL
ON CONFLICT (name) DO NOTHING;

ALTER TABLE inquiries DROP CONSTRAINT IF EXISTS inquiries_category_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'inquiries_category_fkey'
      AND conrelid = 'inquiries'::regclass
  ) THEN
    ALTER TABLE inquiries
      ADD CONSTRAINT inquiries_category_fkey
      FOREIGN KEY (category) REFERENCES inquiry_categories(name)
      ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS inquiries_assigned_to_idx ON inquiries(assigned_to);
CREATE INDEX IF NOT EXISTS users_role_is_active_idx ON users(role, is_active);

COMMIT;
