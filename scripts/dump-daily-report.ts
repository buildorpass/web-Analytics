/**
 * Dump classified daily change report JSON for verification.
 * Run: pnpm dump-report [siteId] [YYYY-MM-DD]
 */
import { mkdirSync } from "fs";
import path from "path";
import Database from "better-sqlite3";
import { runSchemaMigrations } from "../src/lib/migrations";
import { buildClassifiedDailyChangeReport } from "../src/lib/daily-change-report";
import { getUtcDateString } from "../src/lib/salt";

const SITE_ID = process.argv[2] ?? "abc123";
const DATE = process.argv[3] ?? getUtcDateString();

const DB_PATH = path.join(process.cwd(), "data", "analytics.db");
mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
runSchemaMigrations(db);
db.close();

const report = buildClassifiedDailyChangeReport(SITE_ID, DATE);
console.log(JSON.stringify(report, null, 2));
