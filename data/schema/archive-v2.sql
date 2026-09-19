-- Generated from scripts/lib/archive-v2.mjs; schema only, no source records.
CREATE TABLE archive_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );

CREATE TABLE bryce_samples (
      id INTEGER PRIMARY KEY,
      snapshot_id INTEGER NOT NULL,
      checked_at TEXT NOT NULL,
      session_key TEXT NOT NULL,
      rank INTEGER,
      live_rank INTEGER,
      start_position INTEGER,
      laps TEXT,
      status TEXT,
      comment TEXT,
      gap TEXT,
      live_gap TEXT,
      diff TEXT,
      best_lap_time TEXT,
      best_lap TEXT,
      last_lap_time TEXT,
      best_speed TEXT,
      last_speed TEXT,
      average_speed TEXT,
      passes INTEGER,
      passed INTEGER,
      pit_stops INTEGER,
      last_pit_lap INTEGER,
      since_pit_lap INTEGER,
      tire TEXT,
      overtake_remain INTEGER,
      overtake_active TEXT,
      lap_distance REAL,
      live_diff_ahead TEXT,
      live_diff_behind TEXT,
      total_driver_points INTEGER,
      total_entrant_points INTEGER,
      running_driver_points INTEGER,
      radiofrequency TEXT
    );

CREATE TABLE snapshot_payload_refs (
      snapshot_id INTEGER NOT NULL,
      ordinal INTEGER NOT NULL,
      endpoint_id TEXT NOT NULL,
      payload_version_id INTEGER NOT NULL,
      PRIMARY KEY (snapshot_id, endpoint_id),
      FOREIGN KEY (snapshot_id) REFERENCES snapshots_v2(id),
      FOREIGN KEY (payload_version_id) REFERENCES source_payload_versions(id)
    );

CREATE TABLE snapshots_v2 (
      id INTEGER PRIMARY KEY,
      checked_at TEXT NOT NULL,
      session_key TEXT NOT NULL,
      event_id TEXT,
      event_session_id TEXT,
      event_name TEXT,
      session_name TEXT,
      flag TEXT,
      lap TEXT,
      total_laps TEXT,
      source_state TEXT NOT NULL,
      bryce_rank INTEGER,
      bryce_status TEXT,
      bryce_laps TEXT,
      bryce_gap TEXT,
      bryce_best_lap_time TEXT,
      summary_json TEXT NOT NULL
    );

CREATE TABLE source_payload_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      endpoint_id TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      is_null INTEGER NOT NULL DEFAULT 0,
      payload_bytes INTEGER NOT NULL,
      first_seen_at TEXT,
      last_seen_at TEXT,
      UNIQUE(endpoint_id, content_hash)
    );

CREATE TABLE source_probes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_id INTEGER NOT NULL,
      endpoint_id TEXT NOT NULL,
      url TEXT NOT NULL,
      ok INTEGER NOT NULL,
      status INTEGER NOT NULL,
      bytes INTEGER NOT NULL,
      last_modified TEXT,
      etag TEXT,
      note TEXT
    );

CREATE INDEX idx_bryce_samples_snapshot ON bryce_samples(snapshot_id);

CREATE INDEX idx_snapshot_payload_refs_version ON snapshot_payload_refs(payload_version_id);

CREATE INDEX idx_snapshots_v2_session_checked ON snapshots_v2(session_key, checked_at);
