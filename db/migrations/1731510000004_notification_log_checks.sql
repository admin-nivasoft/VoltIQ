-- Up Migration
-- An alert-kind log row must name its alert; a test-kind row has none. Attempts start at 1.
-- Without these, one malformed row would make the whole log page fail to render.
ALTER TABLE notification_log
  ADD CONSTRAINT notification_log_kind_alert_chk CHECK ((kind = 'alert') = (alert_id IS NOT NULL)),
  ADD CONSTRAINT notification_log_attempt_chk CHECK (attempt >= 1);

-- Down Migration
-- Forward-only: applied migrations are immutable (CLAUDE.md non-negotiable 10).
