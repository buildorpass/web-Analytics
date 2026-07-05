import { generateAiDailyReport } from "./ai-summary";
import { buildClassifiedDailyChangeReport } from "./daily-change-report";
import {
  getCachedDailyReport,
  hashReportInput,
  parseCachedReport,
  saveDailyReport,
} from "./report-cache";
import type { AiDailyReport } from "./ai-summary";
import { getAiConfig } from "./ai-summary";

export type DailyReportResult =
  | {
      status: "ready";
      report: AiDailyReport;
      cached: boolean;
      date: string;
    }
  | { status: "not_configured" }
  | { status: "error"; message: string };

export function getCachedDailyReportOnly(
  siteId: string,
  date: string
): DailyReportResult | null {
  const row = getCachedDailyReport(siteId, date);
  if (!row) return null;
  const report = parseCachedReport(row);
  if (!report) return null;
  return { status: "ready", report, cached: true, date };
}

export async function getOrGenerateDailyReport(
  siteId: string,
  date: string,
  options: { regenerate?: boolean } = {}
): Promise<DailyReportResult> {
  const config = getAiConfig();
  if (!config.configured) {
    return { status: "not_configured" };
  }

  const input = buildClassifiedDailyChangeReport(siteId, date);
  const inputHash = hashReportInput(input);

  if (!options.regenerate) {
    const row = getCachedDailyReport(siteId, date);
    if (row && row.input_hash === inputHash) {
      const report = parseCachedReport(row);
      if (report) {
        console.log(
          `[daily-report] cache hit site=${siteId} date=${date} hash=${inputHash.slice(0, 8)}`
        );
        return { status: "ready", report, cached: true, date };
      }
    }
  }

  console.log(
    `[daily-report] calling OpenAI site=${siteId} date=${date} regenerate=${Boolean(options.regenerate)}`
  );

  const result = await generateAiDailyReport(input);
  if (!result.ok) {
    if (result.error === "not_configured") {
      return { status: "not_configured" };
    }
    return { status: "error", message: result.error };
  }

  saveDailyReport(siteId, date, inputHash, result.report);
  return { status: "ready", report: result.report, cached: false, date };
}
