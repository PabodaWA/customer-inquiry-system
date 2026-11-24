BEGIN;

ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS customer_email VARCHAR(254);

CREATE TABLE IF NOT EXISTS inquiry_evidence (
  id SERIAL PRIMARY KEY,
  inquiry_id INTEGER NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_data BYTEA NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS inquiry_evidence_inquiry_id_idx ON inquiry_evidence(inquiry_id);

COMMIT;
