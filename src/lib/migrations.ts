import type Database from "better-sqlite3";

type TableInfo = { name: string };

export function addColumnIfMissing(
  database: Database.Database,
  table: string,
  column: string,
  definition: string
): void {
  const columns = database
    .prepare(`PRAGMA table_info(${table})`)
    .all() as TableInfo[];
  if (!columns.some((c) => c.name === column)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function runSchemaMigrations(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS sites (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      domain TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      pathname TEXT NOT NULL,
      hostname TEXT NOT NULL,
      referrer_hostname TEXT,
      visitor_hash TEXT NOT NULL,
      browser TEXT NOT NULL,
      os TEXT NOT NULL,
      device TEXT NOT NULL,
      screen_class TEXT NOT NULL,
      is_new_visitor INTEGER NOT NULL,
      is_new_session INTEGER NOT NULL,
      FOREIGN KEY (site_id) REFERENCES sites(id)
    );

    CREATE TABLE IF NOT EXISTS salts (
      date TEXT PRIMARY KEY,
      salt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_events_site_timestamp
      ON events(site_id, timestamp);

    CREATE INDEX IF NOT EXISTS idx_events_site_visitor_timestamp
      ON events(site_id, visitor_hash, timestamp);
  `);

  addColumnIfMissing(database, "sites", "retention_days", "INTEGER NOT NULL DEFAULT 90");
  addColumnIfMissing(
    database,
    "sites",
    "path_exclusions",
    "TEXT NOT NULL DEFAULT '[]'"
  );

  addColumnIfMissing(
    database,
    "events",
    "event_type",
    "TEXT NOT NULL DEFAULT 'pageview'"
  );
  addColumnIfMissing(database, "events", "event_name", "TEXT");
  addColumnIfMissing(database, "events", "utm_source", "TEXT");
  addColumnIfMissing(database, "events", "utm_medium", "TEXT");
  addColumnIfMissing(database, "events", "utm_campaign", "TEXT");

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_events_site_type_timestamp
      ON events(site_id, event_type, timestamp);
  `);
}
