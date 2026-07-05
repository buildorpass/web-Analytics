import { createHash } from "crypto";
import { getDb } from "./db";
import type { AiDailyReport } from "./ai-summary";

export function hashReportInput(input: unknown): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export interface CachedDailyReportRow {
  site_id: string;
  date: string;
  input_hash: string;
  report_json: string;
  created_at: number;
}

export function getCachedDailyReport(
  siteId: string,
  date: string
): CachedDailyReportRow | undefined {
  const db = getDb();
  return db
    .prepare(
      `SELECT site_id, date, input_hash, report_json, created_at
       FROM daily_reports WHERE site_id = ? AND date = ?`
    )
    .get(siteId, date) as CachedDailyReportRow | undefined;
}

export function saveDailyReport(
  siteId: string,
  date: string,
  inputHash: string,
  report: AiDailyReport
): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO daily_reports (site_id, date, input_hash, report_json, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(site_id, date) DO UPDATE SET
       input_hash = excluded.input_hash,
       report_json = excluded.report_json,
       created_at = excluded.created_at`
  ).run(siteId, date, inputHash, JSON.stringify(report), Date.now());
}

export function parseCachedReport(row: CachedDailyReportRow): AiDailyReport | null {
  try {
    return JSON.parse(row.report_json) as AiDailyReport;
  } catch {
    return null;
  }
}
