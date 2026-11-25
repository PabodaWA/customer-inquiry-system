BEGIN;

ALTER TABLE inquiry_history
  DROP CONSTRAINT IF EXISTS inquiry_history_action_check;

ALTER TABLE inquiry_history
  ADD CONSTRAINT inquiry_history_action_check
  CHECK (action IN (
    'CREATED',
    'ASSIGNED',
    'STATUS_CHANGED',
    'ACCEPTED',
    'DECLINED',
    'REASSIGNED',
    'CATEGORY_CHANGED',
    'RESOLVED'
  ));

COMMIT;
