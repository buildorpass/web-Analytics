import type Database from "better-sqlite3";

const DEFAULT_RETENTION_DAYS = 90;

/** Delete events older than each site's retention window; prune orphaned salts. */
export function runRetentionPurge(database: Database.Database): void {
  const sites = database
    .prepare("SELECT id, retention_days FROM sites")
    .all() as { id: string; retention_days: number }[];

  let maxRetention = DEFAULT_RETENTION_DAYS;

  for (const site of sites) {
    const days = site.retention_days > 0 ? site.retention_days : DEFAULT_RETENTION_DAYS;
    maxRetention = Math.max(maxRetention, days);
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    database
      .prepare("DELETE FROM events WHERE site_id = ? AND timestamp < ?")
      .run(site.id, cutoff);
  }

  const saltCutoff = new Date(Date.now() - maxRetention * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  database.prepare("DELETE FROM salts WHERE date < ?").run(saltCutoff);
}
