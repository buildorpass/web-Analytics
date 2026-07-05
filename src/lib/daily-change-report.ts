import {
  type CustomEventMover,
  type DailyChangeReport,
  type DailyMetricSnapshot,
  type PageMover,
  type ReferrerMover,
  getDailyChangeReport,
} from "./queries";

export type Direction = "good" | "bad" | "neutral";
export type Confidence = "low" | "high";

export interface ClassifiedMetric extends DailyMetricSnapshot {
  direction: Direction;
  confidence: Confidence;
}

export interface ClassifiedReferrerMover extends ReferrerMover {
  direction: "neutral";
  label: "verify";
}

export interface ClassifiedDailyChangeReport {
  siteId: string;
  date: string;
  sampleSize: number;
  baselineSampleSize: number;
  metrics: {
    pageviews: ClassifiedMetric;
    uniqueVisitors: ClassifiedMetric;
    bounceRate: ClassifiedMetric;
    viewsPerVisitor: ClassifiedMetric;
    avgSessionsPerVisitor: ClassifiedMetric;
  };
  movers: {
    pages: PageMover[];
    referrers: ClassifiedReferrerMover[];
    customEvents: CustomEventMover[];
  };
}

type MetricKey = keyof ClassifiedDailyChangeReport["metrics"];

const RAW_CHANGE_THRESHOLDS: Record<MetricKey, number> = {
  pageviews: 10,
  uniqueVisitors: 5,
  bounceRate: 3,
  viewsPerVisitor: 0.15,
  avgSessionsPerVisitor: 0.15,
};

/** Higher value is better except bounce rate. */
const HIGHER_IS_BETTER: Record<MetricKey, boolean> = {
  pageviews: true,
  uniqueVisitors: true,
  bounceRate: false,
  viewsPerVisitor: true,
  avgSessionsPerVisitor: true,
};

function classifyMetric(
  key: MetricKey,
  snapshot: DailyMetricSnapshot,
  sampleSize: number
): ClassifiedMetric {
  const rawChange = snapshot.rawChangeVsYesterday;
  const absRawChange = Math.abs(rawChange);
  const threshold = RAW_CHANGE_THRESHOLDS[key];

  if (sampleSize < 50 || absRawChange < threshold) {
    return { ...snapshot, direction: "neutral", confidence: "low" };
  }

  if (rawChange === 0) {
    return { ...snapshot, direction: "neutral", confidence: "high" };
  }

  const higherIsBetter = HIGHER_IS_BETTER[key];
  const wentUp = rawChange > 0;
  const isGood = higherIsBetter ? wentUp : !wentUp;
  return {
    ...snapshot,
    direction: isGood ? "good" : "bad",
    confidence: "high",
  };
}

function classifyReferrers(
  referrers: ReferrerMover[]
): ClassifiedReferrerMover[] {
  return referrers.map((r) => ({
    ...r,
    direction: "neutral" as const,
    label: "verify" as const,
  }));
}

/** Attach good/bad/neutral labels and confidence — computed in code, not by the LLM. */
export function classifyDailyChangeReport(
  report: DailyChangeReport
): ClassifiedDailyChangeReport {
  const { sampleSize, metrics, movers } = report;

  return {
    siteId: report.siteId,
    date: report.date,
    sampleSize: report.sampleSize,
    baselineSampleSize: report.baselineSampleSize,
    metrics: {
      pageviews: classifyMetric("pageviews", metrics.pageviews, sampleSize),
      uniqueVisitors: classifyMetric(
        "uniqueVisitors",
        metrics.uniqueVisitors,
        sampleSize
      ),
      bounceRate: classifyMetric("bounceRate", metrics.bounceRate, sampleSize),
      viewsPerVisitor: classifyMetric(
        "viewsPerVisitor",
        metrics.viewsPerVisitor,
        sampleSize
      ),
      avgSessionsPerVisitor: classifyMetric(
        "avgSessionsPerVisitor",
        metrics.avgSessionsPerVisitor,
        sampleSize
      ),
    },
    movers: {
      pages: movers.pages,
      referrers: classifyReferrers(movers.referrers),
      customEvents: movers.customEvents,
    },
  };
}

/** Raw SQL deltas + classification labels — input payload for the AI layer. */
export function buildClassifiedDailyChangeReport(
  siteId: string,
  date: string
): ClassifiedDailyChangeReport {
  return classifyDailyChangeReport(getDailyChangeReport(siteId, date));
}
