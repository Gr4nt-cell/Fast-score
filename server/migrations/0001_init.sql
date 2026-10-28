-- One row per competition and ESPN scoreboard day (UTC yyyymmdd)
CREATE TABLE IF NOT EXISTS boards (
  key TEXT PRIMARY KEY,          -- sport/league/day
  sport TEXT NOT NULL,
  league TEXT NOT NULL,
  day TEXT NOT NULL,
  hash TEXT,
  checked_at INTEGER,            -- ms
  changed_at INTEGER,
  live INTEGER DEFAULT 0,        -- events in play
  next_ko INTEGER,               -- next kick-off still to come (ms)
  pending INTEGER DEFAULT 0,     -- events not finished
  league_name TEXT,
  league_logo TEXT
);
CREATE INDEX IF NOT EXISTS boards_day ON boards(day);

-- One row per event, stored as ESPN's own JSON so the app parses it as usual.
-- Finished events are kept: this is the history the prediction model can learn from.
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,           -- sport/league/eventId
  sport TEXT NOT NULL,
  league TEXT NOT NULL,
  start_ts INTEGER NOT NULL,
  end_ts INTEGER,
  state TEXT,                    -- pre | in | post
  hash TEXT,
  updated INTEGER,
  data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_sport_start ON events(sport, start_ts);
CREATE INDEX IF NOT EXISTS events_league_start ON events(sport, league, start_ts);
CREATE INDEX IF NOT EXISTS events_state ON events(state, start_ts);

-- Latest table per competition, raw ESPN JSON
CREATE TABLE IF NOT EXISTS standings (
  key TEXT PRIMARY KEY,          -- sport/league
  updated INTEGER,
  data TEXT
);
