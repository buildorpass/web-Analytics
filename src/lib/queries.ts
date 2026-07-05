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
