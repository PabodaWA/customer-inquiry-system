BEGIN;

ALTER TABLE inquiries
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS decline_reason TEXT;

-- Keep current assignment state and immutable assignment events separately.
CREATE TABLE IF NOT EXISTS inquiry_assignments (
  id BIGSERIAL PRIMARY KEY,
  inquiry_id INTEGER NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,
  handler_id INTEGER NOT NULL REFERENCES users(id),
  assigned_by INTEGER REFERENCES users(id),
  status VARCHAR(24) NOT NULL CHECK (status IN ('PENDING_ACCEPTANCE', 'ACCEPTED', 'DECLINED', 'REASSIGNED', 'RESOLVED')),
  decline_reason TEXT,
  assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  accepted_at TIMESTAMP,
  declined_at TIMESTAMP,
  resolved_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS inquiry_assignments_inquiry_idx ON inquiry_assignments(inquiry_id, assigned_at DESC);
CREATE INDEX IF NOT EXISTS inquiries_handler_status_idx ON inquiries(assigned_to, status, handler_response_status);

CREATE TABLE IF NOT EXISTS user_notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  inquiry_id INTEGER REFERENCES inquiries(id) ON DELETE CASCADE,
  kind VARCHAR(40) NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS user_notifications_user_idx ON user_notifications(user_id, created_at DESC);

-- Backfill the current assignment as the first durable assignment event.
INSERT INTO inquiry_assignments (inquiry_id, handler_id, assigned_by, status, assigned_at)
SELECT i.id, i.assigned_to, i.created_by,
       CASE WHEN i.handler_response_status = 'ACCEPTED' THEN 'ACCEPTED' ELSE 'PENDING_ACCEPTANCE' END,
       i.created_at
FROM inquiries i
WHERE i.assigned_to IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM inquiry_assignments a WHERE a.inquiry_id = i.id);

COMMIT;
