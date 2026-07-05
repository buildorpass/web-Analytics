import { getDb } from "./db";

export type DateRange = "today" | "7d" | "30d";

export interface Site {
  id: string;
  name: string;
  domain: string;
  created_at: number;
  retention_days: number;
  path_exclusions: string;
}

export interface PeriodBounds {
  start: number;
  end: number;
  prevStart: number;
  prevEnd: number;
  granularity: "hour" | "day";
}

const PAGEVIEW_FILTER = "event_type = 'pageview'";

export function getPeriodBounds(range: DateRange, now = Date.now()): PeriodBounds {
  const end = now;
  const todayStart = new Date(new Date(now).toISOString().slice(0, 10)).getTime();

  if (range === "today") {
    const start = todayStart;
    const prevStart = start - 24 * 60 * 60 * 1000;
    const prevEnd = start;
    return { start, end, prevStart, prevEnd, granularity: "hour" };
  }

  if (range === "7d") {
    const start = todayStart - 6 * 24 * 60 * 60 * 1000;
    const prevEnd = start;
    const prevStart = start - 7 * 24 * 60 * 60 * 1000;
    return { start, end, prevStart, prevEnd, granularity: "day" };
  }

  const start = todayStart - 29 * 24 * 60 * 60 * 1000;
  const prevEnd = start;
  const prevStart = start - 30 * 24 * 60 * 60 * 1000;
  return { start, end, prevStart, prevEnd, granularity: "day" };
}

export function getSites(): Site[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, name, domain, created_at, retention_days, path_exclusions
       FROM sites ORDER BY created_at ASC`
    )
    .all() as Site[];
}

export function getSite(siteId: string): Site | undefined {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, name, domain, created_at, retention_days, path_exclusions
       FROM sites WHERE id = ?`
    )
    .get(siteId) as Site | undefined;
}

export interface PeriodStats {
  pageviews: number;
  uniqueVisitors: number;
  viewsPerVisitor: number;
  bounceRate: number;
  avgSessionsPerVisitor: number;
}

export interface StatWithChange {
  value: number;
  changePercent: number | null;
}

export interface DashboardStats {
  pageviews: StatWithChange;
  uniqueVisitors: StatWithChange;
  viewsPerVisitor: StatWithChange;
  bounceRate: StatWithChange;
  avgSessionsPerVisitor: StatWithChange;
}

export interface TrafficSplit {
  direct: number;
  referred: number;
  directPercent: number;
}

export interface VisitorTypeSplit {
  newVisitors: number;
  returningVisitors: number;
  newPercent: number;
}

function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

function withChange(current: number, previous: number): StatWithChange {
  return {
    value: current,
    changePercent: percentChange(current, previous),
  };
}

function computePeriodStats(
  siteId: string,
  start: number,
  end: number
): PeriodStats {
  const db = getDb();

  const pageviews = (
    db
      .prepare(
        `SELECT COUNT(*) as count FROM events
         WHERE site_id = ? AND timestamp >= ? AND timestamp <= ? AND ${PAGEVIEW_FILTER}`
      )
      .get(siteId, start, end) as { count: number }
  ).count;

  const uniqueVisitors = (
    db
      .prepare(
        `SELECT COUNT(DISTINCT visitor_hash) as count FROM events
         WHERE site_id = ? AND timestamp >= ? AND timestamp <= ? AND ${PAGEVIEW_FILTER}`
      )
      .get(siteId, start, end) as { count: number }
  ).count;

  const sessionStats = db
    .prepare(
      `WITH ordered AS (
         SELECT
           visitor_hash,
           is_new_session,
           SUM(is_new_session) OVER (
             PARTITION BY visitor_hash
             ORDER BY timestamp
             ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
           ) AS session_num
         FROM events
         WHERE site_id = ? AND timestamp >= ? AND timestamp <= ? AND ${PAGEVIEW_FILTER}
       ),
       session_sizes AS (
         SELECT visitor_hash, session_num, COUNT(*) AS pageviews
         FROM ordered
         GROUP BY visitor_hash, session_num
       ),
       visitor_sessions AS (
         SELECT visitor_hash, COUNT(*) AS sessions
         FROM session_sizes
         GROUP BY visitor_hash
       )
       SELECT
         (SELECT COUNT(*) FROM session_sizes) AS total_sessions,
         (SELECT COUNT(*) FROM session_sizes WHERE pageviews = 1) AS bounce_sessions,
         (SELECT COALESCE(AVG(sessions), 0) FROM visitor_sessions) AS avg_sessions_per_visitor
       `
    )
    .get(siteId, start, end) as {
    total_sessions: number;
    bounce_sessions: number;
    avg_sessions_per_visitor: number;
  };

  const bounceRate =
    sessionStats.total_sessions === 0
      ? 0
      : (sessionStats.bounce_sessions / sessionStats.total_sessions) * 100;

  return {
    pageviews,
    uniqueVisitors,
    viewsPerVisitor:
      uniqueVisitors === 0 ? 0 : pageviews / uniqueVisitors,
    bounceRate,
    avgSessionsPerVisitor: sessionStats.avg_sessions_per_visitor,
  };
}

export function getDashboardStats(
  siteId: string,
  range: DateRange
): DashboardStats {
  const { start, end, prevStart, prevEnd } = getPeriodBounds(range);
  const current = computePeriodStats(siteId, start, end);
  const previous = computePeriodStats(siteId, prevStart, prevEnd);

  return {
    pageviews: withChange(current.pageviews, previous.pageviews),
    uniqueVisitors: withChange(current.uniqueVisitors, previous.uniqueVisitors),
    viewsPerVisitor: withChange(
      current.viewsPerVisitor,
      previous.viewsPerVisitor
    ),
    bounceRate: withChange(current.bounceRate, previous.bounceRate),
    avgSessionsPerVisitor: withChange(
      current.avgSessionsPerVisitor,
      previous.avgSessionsPerVisitor
    ),
  };
}

export function getTrafficSplit(
  siteId: string,
  range: DateRange
): TrafficSplit {
  const db = getDb();
  const { start, end } = getPeriodBounds(range);
  const row = db
    .prepare(
      `SELECT
         SUM(CASE WHEN referrer_hostname IS NULL THEN 1 ELSE 0 END) AS direct,
         SUM(CASE WHEN referrer_hostname IS NOT NULL THEN 1 ELSE 0 END) AS referred
       FROM events
       WHERE site_id = ? AND timestamp >= ? AND timestamp <= ? AND ${PAGEVIEW_FILTER}`
    )
    .get(siteId, start, end) as { direct: number; referred: number };

  const total = row.direct + row.referred;
  return {
    direct: row.direct,
    referred: row.referred,
    directPercent: total === 0 ? 0 : (row.direct / total) * 100,
  };
}

export function getVisitorTypeSplit(
  siteId: string,
  range: DateRange
): VisitorTypeSplit {
  const db = getDb();
  const { start, end } = getPeriodBounds(range);
  const row = db
    .prepare(
      `WITH first_in_period AS (
         SELECT visitor_hash, MIN(timestamp) AS first_ts
         FROM events
         WHERE site_id = ? AND timestamp >= ? AND timestamp <= ? AND ${PAGEVIEW_FILTER}
         GROUP BY visitor_hash
       ),
       first_flags AS (
         SELECT e.is_new_visitor
         FROM events e
         INNER JOIN first_in_period f
           ON e.visitor_hash = f.visitor_hash AND e.timestamp = f.first_ts
         WHERE e.site_id = ?
       )
       SELECT
         SUM(CASE WHEN is_new_visitor = 1 THEN 1 ELSE 0 END) AS new_visitors,
         SUM(CASE WHEN is_new_visitor = 0 THEN 1 ELSE 0 END) AS returning_visitors
       FROM first_flags`
    )
    .get(siteId, start, end, siteId) as {
    new_visitors: number;
    returning_visitors: number;
  };

  const total = row.new_visitors + row.returning_visitors;
  return {
    newVisitors: row.new_visitors,
    returningVisitors: row.returning_visitors,
    newPercent: total === 0 ? 0 : (row.new_visitors / total) * 100,
  };
}

export interface TimeSeriesPoint {
  label: string;
  pageviews: number;
}

export interface TrafficTimeSeriesPoint {
  label: string;
  pageviews: number;
  visitors: number;
}

export function getTrafficTimeSeries(
  siteId: string,
  range: DateRange
): TrafficTimeSeriesPoint[] {
  const db = getDb();
  const { start, end, granularity } = getPeriodBounds(range);

  if (granularity === "hour") {
    const pvRows = db
      .prepare(
        `SELECT
           CAST(strftime('%H', timestamp / 1000, 'unixepoch') AS INTEGER) AS hour,
           COUNT(*) AS pageviews
         FROM events
         WHERE site_id = ? AND timestamp >= ? AND timestamp <= ? AND ${PAGEVIEW_FILTER}
         GROUP BY hour`
      )
      .all(siteId, start, end) as { hour: number; pageviews: number }[];

    const uvRows = db
      .prepare(
        `SELECT
           CAST(strftime('%H', timestamp / 1000, 'unixepoch') AS INTEGER) AS hour,
           COUNT(DISTINCT visitor_hash) AS visitors
         FROM events
         WHERE site_id = ? AND timestamp >= ? AND timestamp <= ? AND ${PAGEVIEW_FILTER}
         GROUP BY hour`
      )
      .all(siteId, start, end) as { hour: number; visitors: number }[];

    const pvMap = new Map(pvRows.map((r) => [r.hour, r.pageviews]));
    const uvMap = new Map(uvRows.map((r) => [r.hour, r.visitors]));
    const result: TrafficTimeSeriesPoint[] = [];
    for (let h = 0; h < 24; h++) {
      result.push({
        label: `${String(h).padStart(2, "0")}:00`,
        pageviews: pvMap.get(h) ?? 0,
        visitors: uvMap.get(h) ?? 0,
      });
    }
    return result;
  }

  const pvRows = db
    .prepare(
      `SELECT
         date(timestamp / 1000, 'unixepoch') AS day,
         COUNT(*) AS pageviews
       FROM events
       WHERE site_id = ? AND timestamp >= ? AND timestamp <= ? AND ${PAGEVIEW_FILTER}
       GROUP BY day ORDER BY day`
    )
    .all(siteId, start, end) as { day: string; pageviews: number }[];

  const uvRows = db
    .prepare(
      `SELECT
         date(timestamp / 1000, 'unixepoch') AS day,
         COUNT(DISTINCT visitor_hash) AS visitors
       FROM events
       WHERE site_id = ? AND timestamp >= ? AND timestamp <= ? AND ${PAGEVIEW_FILTER}
       GROUP BY day ORDER BY day`
    )
    .all(siteId, start, end) as { day: string; visitors: number }[];

  const uvMap = new Map(uvRows.map((r) => [r.day, r.visitors]));
  return pvRows.map((r) => ({
    label: r.day.slice(5),
    pageviews: r.pageviews,
    visitors: uvMap.get(r.day) ?? 0,
  }));
}

export function getTimeSeries(
  siteId: string,
  range: DateRange
): TimeSeriesPoint[] {
  const db = getDb();
  const { start, end, granularity } = getPeriodBounds(range);

  if (granularity === "hour") {
    const rows = db
      .prepare(
        `SELECT
           CAST(strftime('%H', timestamp / 1000, 'unixepoch') AS INTEGER) AS hour,
           COUNT(*) AS pageviews
         FROM events
         WHERE site_id = ? AND timestamp >= ? AND timestamp <= ? AND ${PAGEVIEW_FILTER}
         GROUP BY hour
         ORDER BY hour`
      )
      .all(siteId, start, end) as { hour: number; pageviews: number }[];

    const map = new Map(rows.map((r) => [r.hour, r.pageviews]));
    const result: TimeSeriesPoint[] = [];
    for (let h = 0; h < 24; h++) {
      result.push({
        label: `${String(h).padStart(2, "0")}:00`,
        pageviews: map.get(h) ?? 0,
      });
    }
    return result;
  }

  const rows = db
    .prepare(
      `SELECT
         date(timestamp / 1000, 'unixepoch') AS day,
         COUNT(*) AS pageviews
       FROM events
       WHERE site_id = ? AND timestamp >= ? AND timestamp <= ? AND ${PAGEVIEW_FILTER}
       GROUP BY day
       ORDER BY day`
    )
    .all(siteId, start, end) as { day: string; pageviews: number }[];

  return rows.map((r) => ({
    label: r.day.slice(5),
    pageviews: r.pageviews,
  }));
}

export interface RankedRow {
  label: string;
  views: number;
}

export function getTopPages(siteId: string, range: DateRange): RankedRow[] {
  const db = getDb();
  const { start, end } = getPeriodBounds(range);
  return db
    .prepare(
      `SELECT pathname AS label, COUNT(*) AS views
       FROM events
       WHERE site_id = ? AND timestamp >= ? AND timestamp <= ? AND ${PAGEVIEW_FILTER}
       GROUP BY pathname
       ORDER BY views DESC
       LIMIT 10`
    )
    .all(siteId, start, end) as RankedRow[];
}

export function getEntryPages(siteId: string, range: DateRange): RankedRow[] {
  const db = getDb();
  const { start, end } = getPeriodBounds(range);
  return db
    .prepare(
      `WITH ranked AS (
         SELECT pathname,
           ROW_NUMBER() OVER (
             PARTITION BY visitor_hash, date(timestamp / 1000, 'unixepoch')
             ORDER BY timestamp ASC
           ) AS rn
         FROM events
         WHERE site_id = ? AND timestamp >= ? AND timestamp <= ? AND ${PAGEVIEW_FILTER}
       )
       SELECT pathname AS label, COUNT(*) AS views
       FROM ranked WHERE rn = 1
       GROUP BY pathname
       ORDER BY views DESC
       LIMIT 10`
    )
    .all(siteId, start, end) as RankedRow[];
}

export function getExitPages(siteId: string, range: DateRange): RankedRow[] {
  const db = getDb();
  const { start, end } = getPeriodBounds(range);
  return db
    .prepare(
      `WITH ranked AS (
         SELECT pathname,
           ROW_NUMBER() OVER (
             PARTITION BY visitor_hash, date(timestamp / 1000, 'unixepoch')
             ORDER BY timestamp DESC
           ) AS rn
         FROM events
         WHERE site_id = ? AND timestamp >= ? AND timestamp <= ? AND ${PAGEVIEW_FILTER}
       )
       SELECT pathname AS label, COUNT(*) AS views
       FROM ranked WHERE rn = 1
       GROUP BY pathname
       ORDER BY views DESC
       LIMIT 10`
    )
    .all(siteId, start, end) as RankedRow[];
}

export function getTopReferrers(siteId: string, range: DateRange): RankedRow[] {
  const db = getDb();
  const { start, end } = getPeriodBounds(range);
  return db
    .prepare(
      `SELECT referrer_hostname AS label, COUNT(*) AS views
       FROM events
       WHERE site_id = ? AND timestamp >= ? AND timestamp <= ?
         AND referrer_hostname IS NOT NULL AND ${PAGEVIEW_FILTER}
       GROUP BY referrer_hostname
       ORDER BY views DESC
       LIMIT 10`
    )
    .all(siteId, start, end) as RankedRow[];
}

export function getUtmSources(siteId: string, range: DateRange): RankedRow[] {
  const db = getDb();
  const { start, end } = getPeriodBounds(range);
  return db
    .prepare(
      `SELECT utm_source AS label, COUNT(*) AS views
       FROM events
       WHERE site_id = ? AND timestamp >= ? AND timestamp <= ?
         AND utm_source IS NOT NULL AND ${PAGEVIEW_FILTER}
       GROUP BY utm_source
       ORDER BY views DESC
       LIMIT 10`
    )
    .all(siteId, start, end) as RankedRow[];
}

export function getUtmCampaigns(siteId: string, range: DateRange): RankedRow[] {
  const db = getDb();
  const { start, end } = getPeriodBounds(range);
  return db
    .prepare(
      `SELECT utm_campaign AS label, COUNT(*) AS views
       FROM events
       WHERE site_id = ? AND timestamp >= ? AND timestamp <= ?
         AND utm_campaign IS NOT NULL AND ${PAGEVIEW_FILTER}
       GROUP BY utm_campaign
       ORDER BY views DESC
       LIMIT 10`
    )
    .all(siteId, start, end) as RankedRow[];
}

export function getCustomEvents(siteId: string, range: DateRange): RankedRow[] {
  const db = getDb();
  const { start, end } = getPeriodBounds(range);
  return db
    .prepare(
      `SELECT event_name AS label, COUNT(*) AS views
       FROM events
       WHERE site_id = ? AND timestamp >= ? AND timestamp <= ?
         AND event_type = 'custom' AND event_name IS NOT NULL
       GROUP BY event_name
       ORDER BY views DESC
       LIMIT 10`
    )
    .all(siteId, start, end) as RankedRow[];
}

export function getBrowserBreakdown(
  siteId: string,
  range: DateRange
): RankedRow[] {
  const db = getDb();
  const { start, end } = getPeriodBounds(range);
  return db
    .prepare(
      `SELECT browser AS label, COUNT(*) AS views
       FROM events
       WHERE site_id = ? AND timestamp >= ? AND timestamp <= ? AND ${PAGEVIEW_FILTER}
       GROUP BY browser
       ORDER BY views DESC`
    )
    .all(siteId, start, end) as RankedRow[];
}

export function getOsBreakdown(siteId: string, range: DateRange): RankedRow[] {
  const db = getDb();
  const { start, end } = getPeriodBounds(range);
  return db
    .prepare(
      `SELECT os AS label, COUNT(*) AS views
       FROM events
       WHERE site_id = ? AND timestamp >= ? AND timestamp <= ? AND ${PAGEVIEW_FILTER}
       GROUP BY os
       ORDER BY views DESC`
    )
    .all(siteId, start, end) as RankedRow[];
}

export function getDeviceBreakdown(
  siteId: string,
  range: DateRange
): RankedRow[] {
  const db = getDb();
  const { start, end } = getPeriodBounds(range);
  return db
    .prepare(
      `SELECT device AS label, COUNT(*) AS views
       FROM events
       WHERE site_id = ? AND timestamp >= ? AND timestamp <= ? AND ${PAGEVIEW_FILTER}
       GROUP BY device
       ORDER BY views DESC`
    )
    .all(siteId, start, end) as RankedRow[];
}

export function getScreenClassBreakdown(
  siteId: string,
  range: DateRange
): RankedRow[] {
  const db = getDb();
  const { start, end } = getPeriodBounds(range);
  return db
    .prepare(
      `SELECT screen_class AS label, COUNT(*) AS views
       FROM events
       WHERE site_id = ? AND timestamp >= ? AND timestamp <= ? AND ${PAGEVIEW_FILTER}
       GROUP BY screen_class
       ORDER BY views DESC`
    )
    .all(siteId, start, end) as RankedRow[];
}

export interface ExportSummary {
  siteId: string;
  range: DateRange;
  generatedAt: string;
  pageviews: number;
  uniqueVisitors: number;
  bounceRate: number;
  directTraffic: number;
  referredTraffic: number;
  topPages: RankedRow[];
  topReferrers: RankedRow[];
  topCampaigns: RankedRow[];
}

export function getExportSummary(
  siteId: string,
  range: DateRange
): ExportSummary {
  const { start, end } = getPeriodBounds(range);
  const stats = computePeriodStats(siteId, start, end);
  const traffic = getTrafficSplit(siteId, range);
  return {
    siteId,
    range,
    generatedAt: new Date().toISOString(),
    pageviews: stats.pageviews,
    uniqueVisitors: stats.uniqueVisitors,
    bounceRate: stats.bounceRate,
    directTraffic: traffic.direct,
    referredTraffic: traffic.referred,
    topPages: getTopPages(siteId, range),
    topReferrers: getTopReferrers(siteId, range),
    topCampaigns: getUtmCampaigns(siteId, range),
  };
}

/** UTC day bounds [start, end] in Unix ms for YYYY-MM-DD. */
export function getUtcDayBounds(date: string): { start: number; end: number } {
  const start = new Date(`${date}T00:00:00.000Z`).getTime();
  const end = start + 24 * 60 * 60 * 1000 - 1;
  return { start, end };
}

/** Add calendar days to a UTC date string. */
export function offsetUtcDate(date: string, days: number): string {
  const start = new Date(`${date}T00:00:00.000Z`).getTime();
  return new Date(start + days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

export interface DailyMetricSnapshot {
  today: number;
  yesterday: number;
  trailing7DayAvg: number;
  changeVsYesterdayPercent: number | null;
  changeVsTrailing7Percent: number | null;
  rawChangeVsYesterday: number;
}

export interface PageMover {
  pathname: string;
  todayRank: number | null;
  yesterdayRank: number | null;
  todayViews: number;
  yesterdayViews: number;
  kind: "new_in_top5" | "large_rank_change" | "dropped_from_top5";
  rankChange: number | null;
}

export interface ReferrerMover {
  referrerHostname: string;
  todayViews: number;
  yesterdayViews: number;
  isNewReferrer: boolean;
}

export interface CustomEventMover {
  eventName: string;
  today: number;
  yesterday: number;
  changePercent: number | null;
  rawChange: number;
}

export interface DailyChangeReport {
  siteId: string;
  date: string;
  sampleSize: number;
  baselineSampleSize: number;
  metrics: {
    pageviews: DailyMetricSnapshot;
    uniqueVisitors: DailyMetricSnapshot;
    bounceRate: DailyMetricSnapshot;
    viewsPerVisitor: DailyMetricSnapshot;
    avgSessionsPerVisitor: DailyMetricSnapshot;
  };
  movers: {
    pages: PageMover[];
    referrers: ReferrerMover[];
    customEvents: CustomEventMover[];
  };
}

function getTopPagesForWindow(
  siteId: string,
  start: number,
  end: number,
  limit: number
): RankedRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT pathname AS label, COUNT(*) AS views
       FROM events
       WHERE site_id = ? AND timestamp >= ? AND timestamp <= ? AND ${PAGEVIEW_FILTER}
       GROUP BY pathname
       ORDER BY views DESC
       LIMIT ?`
    )
    .all(siteId, start, end, limit) as RankedRow[];
}

function getReferrerCountsForWindow(
  siteId: string,
  start: number,
  end: number
): Map<string, number> {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT referrer_hostname AS label, COUNT(*) AS views
       FROM events
       WHERE site_id = ? AND timestamp >= ? AND timestamp <= ?
         AND referrer_hostname IS NOT NULL AND ${PAGEVIEW_FILTER}
       GROUP BY referrer_hostname`
    )
    .all(siteId, start, end) as RankedRow[];
  return new Map(rows.map((r) => [r.label, r.views]));
}

function getCustomEventCountsForWindow(
  siteId: string,
  start: number,
  end: number
): Map<string, number> {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT event_name AS label, COUNT(*) AS views
       FROM events
       WHERE site_id = ? AND timestamp >= ? AND timestamp <= ?
         AND event_type = 'custom' AND event_name IS NOT NULL
       GROUP BY event_name`
    )
    .all(siteId, start, end) as RankedRow[];
  return new Map(rows.map((r) => [r.label, r.views]));
}

function buildMetricSnapshot(
  today: number,
  yesterday: number,
  trailingValues: number[]
): DailyMetricSnapshot {
  const trailing7DayAvg =
    trailingValues.length === 0
      ? 0
      : trailingValues.reduce((a, b) => a + b, 0) / trailingValues.length;
  return {
    today,
    yesterday,
    trailing7DayAvg: roundMetric(trailing7DayAvg),
    changeVsYesterdayPercent: percentChange(today, yesterday),
    changeVsTrailing7Percent: percentChange(today, trailing7DayAvg),
    rawChangeVsYesterday: roundMetric(today - yesterday),
  };
}

function roundMetric(value: number): number {
  return Math.round(value * 1000) / 1000;
}

const LARGE_RANK_CHANGE = 3;

function computePageMovers(
  todayTop: RankedRow[],
  yesterdayTop: RankedRow[]
): PageMover[] {
  const todayRank = new Map(
    todayTop.map((r, i) => [r.label, { rank: i + 1, views: r.views }])
  );
  const yesterdayRank = new Map(
    yesterdayTop.map((r, i) => [r.label, { rank: i + 1, views: r.views }])
  );

  const movers: PageMover[] = [];
  const seen = new Set<string>();

  for (const row of todayTop) {
    const y = yesterdayRank.get(row.label);
    const todayR = todayRank.get(row.label)!;
    if (!y) {
      movers.push({
        pathname: row.label,
        todayRank: todayR.rank,
        yesterdayRank: null,
        todayViews: row.views,
        yesterdayViews: 0,
        kind: "new_in_top5",
        rankChange: null,
      });
      seen.add(row.label);
      continue;
    }
    const rankChange = y.rank - todayR.rank;
    if (Math.abs(rankChange) >= LARGE_RANK_CHANGE) {
      movers.push({
        pathname: row.label,
        todayRank: todayR.rank,
        yesterdayRank: y.rank,
        todayViews: row.views,
        yesterdayViews: y.views,
        kind: "large_rank_change",
        rankChange,
      });
      seen.add(row.label);
    }
  }

  for (const row of yesterdayTop) {
    if (seen.has(row.label)) continue;
    if (!todayRank.has(row.label)) {
      const y = yesterdayRank.get(row.label)!;
      movers.push({
        pathname: row.label,
        todayRank: null,
        yesterdayRank: y.rank,
        todayViews: 0,
        yesterdayViews: y.views,
        kind: "dropped_from_top5",
        rankChange: null,
      });
    }
  }

  return movers;
}

function computeReferrerMovers(
  todayMap: Map<string, number>,
  yesterdayMap: Map<string, number>
): ReferrerMover[] {
  const movers: ReferrerMover[] = [];
  for (const [hostname, todayViews] of todayMap) {
    const yesterdayViews = yesterdayMap.get(hostname) ?? 0;
    if (yesterdayViews === 0 && todayViews > 0) {
      movers.push({
        referrerHostname: hostname,
        todayViews,
        yesterdayViews: 0,
        isNewReferrer: true,
      });
    }
  }
  return movers.sort((a, b) => b.todayViews - a.todayViews);
}

function computeCustomEventMovers(
  todayMap: Map<string, number>,
  yesterdayMap: Map<string, number>
): CustomEventMover[] {
  const names = new Set([...todayMap.keys(), ...yesterdayMap.keys()]);
  return [...names]
    .map((eventName) => {
      const today = todayMap.get(eventName) ?? 0;
      const yesterday = yesterdayMap.get(eventName) ?? 0;
      return {
        eventName,
        today,
        yesterday,
        changePercent: percentChange(today, yesterday),
        rawChange: today - yesterday,
      };
    })
    .filter((e) => e.today > 0 || e.yesterday > 0)
    .sort((a, b) => b.today - a.today);
}

/**
 * Pre-computed daily deltas for the AI daily change report.
 * All arithmetic is done in SQL/TS — the LLM only interprets this JSON.
 */
export function getDailyChangeReport(
  siteId: string,
  date: string
): DailyChangeReport {
  const { start: todayStart, end: todayEnd } = getUtcDayBounds(date);
  const yesterday = offsetUtcDate(date, -1);
  const { start: yesterdayStart, end: yesterdayEnd } =
    getUtcDayBounds(yesterday);

  const todayStats = computePeriodStats(siteId, todayStart, todayEnd);
  const yesterdayStats = computePeriodStats(
    siteId,
    yesterdayStart,
    yesterdayEnd
  );

  const trailingDays: PeriodStats[] = [];
  for (let d = 1; d <= 7; d++) {
    const day = offsetUtcDate(date, -d);
    const { start, end } = getUtcDayBounds(day);
    trailingDays.push(computePeriodStats(siteId, start, end));
  }

  const trailingPageviews = trailingDays.map((s) => s.pageviews);
  const baselineSampleSize =
    trailingPageviews.length === 0
      ? 0
      : trailingPageviews.reduce((a, b) => a + b, 0) / trailingPageviews.length;

  const todayTopPages = getTopPagesForWindow(
    siteId,
    todayStart,
    todayEnd,
    5
  );
  const yesterdayTopPages = getTopPagesForWindow(
    siteId,
    yesterdayStart,
    yesterdayEnd,
    5
  );

  const todayReferrers = getReferrerCountsForWindow(
    siteId,
    todayStart,
    todayEnd
  );
  const yesterdayReferrers = getReferrerCountsForWindow(
    siteId,
    yesterdayStart,
    yesterdayEnd
  );

  const todayCustom = getCustomEventCountsForWindow(
    siteId,
    todayStart,
    todayEnd
  );
  const yesterdayCustom = getCustomEventCountsForWindow(
    siteId,
    yesterdayStart,
    yesterdayEnd
  );

  return {
    siteId,
    date,
    sampleSize: todayStats.pageviews,
    baselineSampleSize: roundMetric(baselineSampleSize),
    metrics: {
      pageviews: buildMetricSnapshot(
        todayStats.pageviews,
        yesterdayStats.pageviews,
        trailingPageviews
      ),
      uniqueVisitors: buildMetricSnapshot(
        todayStats.uniqueVisitors,
        yesterdayStats.uniqueVisitors,
        trailingDays.map((s) => s.uniqueVisitors)
      ),
      bounceRate: buildMetricSnapshot(
        todayStats.bounceRate,
        yesterdayStats.bounceRate,
        trailingDays.map((s) => s.bounceRate)
      ),
      viewsPerVisitor: buildMetricSnapshot(
        todayStats.viewsPerVisitor,
        yesterdayStats.viewsPerVisitor,
        trailingDays.map((s) => s.viewsPerVisitor)
      ),
      avgSessionsPerVisitor: buildMetricSnapshot(
        todayStats.avgSessionsPerVisitor,
        yesterdayStats.avgSessionsPerVisitor,
        trailingDays.map((s) => s.avgSessionsPerVisitor)
      ),
    },
    movers: {
      pages: computePageMovers(todayTopPages, yesterdayTopPages),
      referrers: computeReferrerMovers(todayReferrers, yesterdayReferrers),
      customEvents: computeCustomEventMovers(todayCustom, yesterdayCustom),
    },
  };
}
