import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import path from "path";
import { runSchemaMigrations } from "./migrations";
import { runRetentionPurge } from "./retention";

const DB_PATH = path.join(process.cwd(), "data", "analytics.db");

let db: Database.Database | null = null;

export interface SiteRow {
  id: string;
  name: string;
  domain: string;
  created_at: number;
  retention_days: number;
  path_exclusions: string;
}

function seedDemoSite(database: Database.Database): void {
  const siteCount = database
    .prepare("SELECT COUNT(*) as count FROM sites")
    .get() as { count: number };

  if (siteCount.count === 0) {
    database
      .prepare(
        `INSERT INTO sites (id, name, domain, created_at, retention_days, path_exclusions)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run("abc123", "Demo Site", "localhost", Date.now(), 90, '["/admin","/preview"]');
  } else {
    database
      .prepare(
        `UPDATE sites SET path_exclusions = ?
         WHERE id = 'abc123' AND path_exclusions = '[]'`
      )
      .run('["/admin","/preview"]');
  }
}

function migrate(database: Database.Database): void {
  runSchemaMigrations(database);
  seedDemoSite(database);
  runRetentionPurge(database);
}

export function getDb(): Database.Database {
  if (!db) {
    mkdirSync(path.dirname(DB_PATH), { recursive: true });
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    migrate(db);
  }
  return db;
}

export function parsePathExclusions(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p): p is string => typeof p === "string" && p.length > 0);
  } catch {
    return [];
  }
}
