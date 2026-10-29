CREATE TABLE IF NOT EXISTS catan_rooms (
  code TEXT PRIMARY KEY NOT NULL,
  body TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  expires_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS catan_rooms_expiry ON catan_rooms(expires_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS catan_presence (
  room_code TEXT NOT NULL REFERENCES catan_rooms(code) ON DELETE CASCADE,
  seat INTEGER NOT NULL,
  connection_id TEXT NOT NULL,
  last_seen INTEGER NOT NULL,
  PRIMARY KEY(room_code, seat, connection_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS catan_presence_seen ON catan_presence(last_seen);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS catan_limits (
  key TEXT PRIMARY KEY NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  expires_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS catan_limits_expiry ON catan_limits(expires_at);
