ALTER TABLE users ADD COLUMN email TEXT;

CREATE TABLE IF NOT EXISTS calendar_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  starts_at TEXT NOT NULL,
  event_local_date TEXT NOT NULL,
  timezone TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_user_start
  ON calendar_events(user_id, starts_at);

CREATE TABLE IF NOT EXISTS calendar_reminder_deliveries (
  event_id TEXT NOT NULL,
  reminder_type TEXT NOT NULL CHECK (reminder_type IN ('day_before', 'event_day')),
  status TEXT NOT NULL CHECK (status IN ('sending', 'sent')),
  attempted_at TEXT NOT NULL,
  sent_at TEXT,
  PRIMARY KEY (event_id, reminder_type),
  FOREIGN KEY (event_id) REFERENCES calendar_events(id) ON DELETE CASCADE
);
