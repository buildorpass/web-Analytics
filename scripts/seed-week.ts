/**
 * Seeds ~7 days of realistic pageview data for the demo site.
 * Run: pnpm seed
 */
import { createHash, randomBytes } from "crypto";
import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import path from "path";
import { runSchemaMigrations } from "../src/lib/migrations";
import { truncateIpForHash } from "../src/lib/privacy";
import { getUtcDateString } from "../src/lib/salt";

const SITE_ID = "abc123";
const DB_PATH = path.join(process.cwd(), "data", "analytics.db");
const SESSION_GAP_MS = 30 * 60 * 1000;
const HASH_LENGTH = 16;

const PATHS = [
  { path: "/", weight: 20 },
  { path: "/pricing", weight: 12 },
  { path: "/about", weight: 8 },
  { path: "/blog", weight: 10 },
  { path: "/blog/getting-started", weight: 9 },
  { path: "/blog/privacy-matters", weight: 6 },
  { path: "/blog/cookieless-analytics", weight: 7 },
  { path: "/docs", weight: 8 },
  { path: "/docs/install", weight: 6 },
  { path: "/docs/tracker", weight: 5 },
  { path: "/docs/dashboard", weight: 5 },
  { path: "/products", weight: 7 },
  { path: "/products/starter", weight: 5 },
  { path: "/products/pro", weight: 4 },
  { path: "/contact", weight: 4 },
  { path: "/changelog", weight: 3 },
  { path: "/careers", weight: 2 },
  { path: "/legal/privacy", weight: 3 },
];

const REFERRERS = [
  null,
  null,
  null,
  "google.com",
  "google.com",
  "google.com",
  "news.ycombinator.com",
  "twitter.com",
  "github.com",
  "reddit.com",
  "linkedin.com",
  "bing.com",
  "dev.to",
];

const UTM_SETS = [
  null,
  null,
  { source: "google", medium: "cpc", campaign: "brand" },
  { source: "google", medium: "cpc", campaign: "spring_sale" },
  { source: "newsletter", medium: "email", campaign: "weekly_digest" },
  { source: "twitter", medium: "social", campaign: "launch" },
  { source: "github", medium: "referral", campaign: "oss" },
];

const CUSTOM_EVENTS = [
  "signup_click",
  "cta_hero",
  "download_pdf",
  "newsletter_subscribe",
  "outbound:github.com",
];

const PERSONAS = [
  { ip: "203.0.113.10", ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0", browser: "Chrome", os: "Windows", device: "desktop", screen: "lg" },
  { ip: "203.0.113.11", ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/121.0.0.0", browser: "Chrome", os: "Windows", device: "desktop", screen: "lg" },
  { ip: "203.0.113.12", ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Safari/605.1.15", browser: "Safari", os: "macOS", device: "desktop", screen: "lg" },
  { ip: "203.0.113.13", ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Chrome/120.0.0.0", browser: "Chrome", os: "macOS", device: "desktop", screen: "lg" },
  { ip: "203.0.113.14", ua: "Mozilla/5.0 (X11; Linux x86_64) Firefox/121.0", browser: "Firefox", os: "Linux", device: "desktop", screen: "lg" },
  { ip: "203.0.113.15", ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1", browser: "Mobile Safari", os: "iOS", device: "mobile", screen: "sm" },
  { ip: "203.0.113.16", ua: "Mozilla/5.0 (Linux; Android 14) Chrome/120.0.0.0 Mobile", browser: "Chrome", os: "Android", device: "mobile", screen: "sm" },
  { ip: "203.0.113.17", ua: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) Safari/604.1", browser: "Mobile Safari", os: "iOS", device: "tablet", screen: "md" },
  { ip: "203.0.113.18", ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edge/120.0.0.0", browser: "Edge", os: "Windows", device: "desktop", screen: "lg" },
  { ip: "203.0.113.19", ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Firefox/121.0", browser: "Firefox", os: "macOS", device: "desktop", screen: "lg" },
  { ip: "203.0.113.20", ua: "Mozilla/5.0 (Linux; Android 14) SamsungBrowser/23.0", browser: "Samsung Internet", os: "Android", device: "mobile", screen: "sm" },
  { ip: "203.0.113.21", ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0", browser: "Chrome", os: "Windows", device: "desktop", screen: "md" },
  { ip: "198.51.100.8", ua: "Mozilla/5.0 (X11; Ubuntu; Linux x86_64) Chrome/119.0.0.0", browser: "Chrome", os: "Linux", device: "desktop", screen: "lg" },
  { ip: "198.51.100.9", ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) Chrome/119.0.0.0", browser: "Chrome", os: "iOS", device: "mobile", screen: "sm" },
  { ip: "198.51.100.10", ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/118.0.0.0", browser: "Chrome", os: "Windows", device: "desktop", screen: "lg" },
];

interface SeedEvent {
  timestamp: number;
  pathname: string;
  referrer_hostname: string | null;
  visitor_hash: string;
  browser: string;
  os: string;
  device: string;
  screen_class: string;
  is_new_visitor: number;
  is_new_session: number;
  event_type: string;
  event_name: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
}

function pickWeightedPath(): string {
  const total = PATHS.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * total;
  for (const p of PATHS) {
    r -= p.weight;
    if (r <= 0) return p.path;
  }
  return "/";
}

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function ensureSalt(db: Database.Database, date: string): string {
  const existing = db
    .prepare("SELECT salt FROM salts WHERE date = ?")
    .get(date) as { salt: string } | undefined;
  if (existing) return existing.salt;
  const salt = randomBytes(32).toString("hex");
  db.prepare("INSERT INTO salts (date, salt) VALUES (?, ?)").run(date, salt);
  return salt;
}

function visitorHash(
  salt: string,
  siteId: string,
  ip: string,
  ua: string
): string {
  const raw = `${salt}${siteId}${truncateIpForHash(ip)}${ua}`;
  return createHash("sha256").update(raw).digest("hex").slice(0, HASH_LENGTH);
}

function dayStartMs(dayOffset: number): number {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - dayOffset);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

function randomTimestampForDay(dayOffset: number): number {
  const start = dayStartMs(dayOffset);
  const dayOfWeek = new Date(start).getUTCDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const baseTraffic = isWeekend ? 0.55 : 1;

  let hour: number;
  const roll = Math.random();
  if (roll < 0.05) hour = Math.floor(Math.random() * 6);
  else if (roll < 0.75) hour = 8 + Math.floor(Math.random() * 10);
  else hour = 18 + Math.floor(Math.random() * 6);

  if (Math.random() > baseTraffic) {
    hour = 2 + Math.floor(Math.random() * 4);
  }

  const minute = Math.floor(Math.random() * 60);
  const second = Math.floor(Math.random() * 60);
  return start + hour * 3600000 + minute * 60000 + second * 1000;
}

function generateDayEvents(dayOffset: number, salts: Map<string, string>): SeedEvent[] {
  const events: SeedEvent[] = [];
  const dayKey = getUtcDateString(dayStartMs(dayOffset));
  const salt = salts.get(dayKey)!;

  const visitorLastTs = new Map<string, number>();
  const visitorSeenToday = new Set<string>();

  for (const persona of PERSONAS) {
    if (Math.random() > 0.42) continue;

    const hash = visitorHash(salt, SITE_ID, persona.ip, persona.ua);
    const sessionCount = Math.random() < 0.15 ? 2 : 1;

    for (let s = 0; s < sessionCount; s++) {
      const pageCount =
        Math.random() < 0.28 ? 1 : 2 + Math.floor(Math.random() * 5);

      let ts = randomTimestampForDay(dayOffset);
      if (s === 1) ts += 45 * 60000 + Math.floor(Math.random() * 3600000);

      for (let p = 0; p < pageCount; p++) {
        if (p > 0) ts += 30000 + Math.floor(Math.random() * 180000);

        const isNewVisitor = visitorSeenToday.has(hash) ? 0 : 1;
        visitorSeenToday.add(hash);

        const lastTs = visitorLastTs.get(hash);
        const isNewSession =
          lastTs === undefined || ts - lastTs > SESSION_GAP_MS ? 1 : 0;
        visitorLastTs.set(hash, ts);

        const referrer = p === 0 ? rand(REFERRERS) : null;
        const utm = p === 0 ? rand(UTM_SETS) : null;

        events.push({
          timestamp: ts,
          pathname: pickWeightedPath(),
          referrer_hostname: referrer,
          visitor_hash: hash,
          browser: persona.browser,
          os: persona.os,
          device: persona.device,
          screen_class: persona.screen,
          is_new_visitor: isNewVisitor,
          is_new_session: isNewSession,
          event_type: "pageview",
          event_name: null,
          utm_source: utm?.source ?? null,
          utm_medium: utm?.medium ?? null,
          utm_campaign: utm?.campaign ?? null,
        });
      }
    }

    if (Math.random() < 0.12) {
      const ts = randomTimestampForDay(dayOffset);
      const hash = visitorHash(salt, SITE_ID, persona.ip, persona.ua);
      events.push({
        timestamp: ts,
        pathname: pickWeightedPath(),
        referrer_hostname: null,
        visitor_hash: hash,
        browser: persona.browser,
        os: persona.os,
        device: persona.device,
        screen_class: persona.screen,
        is_new_visitor: visitorSeenToday.has(hash) ? 0 : 1,
        is_new_session: 1,
        event_type: "custom",
        event_name: rand(CUSTOM_EVENTS),
        utm_source: null,
        utm_medium: null,
        utm_campaign: null,
      });
      visitorSeenToday.add(hash);
    }
  }

  return events;
}

function main(): void {
  mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  runSchemaMigrations(db);

  const site = db
    .prepare("SELECT id FROM sites WHERE id = ?")
    .get(SITE_ID) as { id: string } | undefined;

  if (!site) {
    db.prepare(
      `INSERT INTO sites (id, name, domain, created_at, retention_days, path_exclusions)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(SITE_ID, "Demo Site", "localhost", Date.now(), 90, '["/admin","/preview"]');
  }

  const weekStart = dayStartMs(6);
  const deleted = db
    .prepare(
      "DELETE FROM events WHERE site_id = ? AND timestamp >= ?"
    )
    .run(SITE_ID, weekStart);

  const salts = new Map<string, string>();
  for (let d = 6; d >= 0; d--) {
    const key = getUtcDateString(dayStartMs(d));
    salts.set(key, ensureSalt(db, key));
  }

  const allEvents: SeedEvent[] = [];
  for (let d = 6; d >= 0; d--) {
    allEvents.push(...generateDayEvents(d, salts));
  }
  allEvents.sort((a, b) => a.timestamp - b.timestamp);

  const insert = db.prepare(
    `INSERT INTO events (
      site_id, timestamp, pathname, hostname, referrer_hostname,
      visitor_hash, browser, os, device, screen_class,
      is_new_visitor, is_new_session,
      event_type, event_name, utm_source, utm_medium, utm_campaign
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const insertMany = db.transaction((rows: SeedEvent[]) => {
    for (const e of rows) {
      insert.run(
        SITE_ID,
        e.timestamp,
        e.pathname,
        "localhost",
        e.referrer_hostname,
        e.visitor_hash,
        e.browser,
        e.os,
        e.device,
        e.screen_class,
        e.is_new_visitor,
        e.is_new_session,
        e.event_type,
        e.event_name,
        e.utm_source,
        e.utm_medium,
        e.utm_campaign
      );
    }
  });

  insertMany(allEvents);

  const summary = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         COUNT(DISTINCT visitor_hash) AS visitors,
         MIN(timestamp) AS min_ts,
         MAX(timestamp) AS max_ts
       FROM events WHERE site_id = ? AND timestamp >= ?`
    )
    .get(SITE_ID, weekStart) as {
    total: number;
    visitors: number;
    min_ts: number;
    max_ts: number;
  };

  console.log(`Cleared ${deleted.changes} existing events from the past 7 days.`);
  console.log(`Inserted ${allEvents.length} seeded events for site "${SITE_ID}".`);
  console.log(
    `Range: ${new Date(summary.min_ts).toISOString()} → ${new Date(summary.max_ts).toISOString()}`
  );
  console.log(`Unique visitor hashes in week: ${summary.visitors}`);
  console.log(`Total events now in week window: ${summary.total}`);

  db.close();
}

main();
