CREATE TABLE IF NOT EXISTS daycoin_events (
  session TEXT NOT NULL,
  step INTEGER NOT NULL,
  event TEXT NOT NULL,
  page TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (session, step)
);
CREATE INDEX IF NOT EXISTS daycoin_events_received_at ON daycoin_events(received_at);
