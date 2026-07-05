import { createHash } from "crypto";
import { getDb } from "./db";
import { truncateIpForHash } from "./privacy";
import { getDailySalt, getUtcDateString } from "./salt";

const HASH_LENGTH = 16;
const SESSION_GAP_MS = 30 * 60 * 1000;

export function computeVisitorHash(
  siteId: string,
  clientIp: string,
  userAgent: string,
  timestampMs: number = Date.now()
): string {
  const date = getUtcDateString(timestampMs);
  const salt = getDailySalt(date);
  const ip = truncateIpForHash(clientIp);
  // Truncated IP and UA are used only for hashing — never stored in the database.
  const raw = `${salt}${siteId}${ip}${userAgent}`;
  return createHash("sha256").update(raw).digest("hex").slice(0, HASH_LENGTH);
}

export function bucketScreenClass(screenWidth: number): string {
  if (screenWidth < 640) return "sm";
  if (screenWidth < 1024) return "md";
  return "lg";
}

export function stripReferrerHostname(
  referrer: string | null | undefined
): string | null {
  if (!referrer || referrer.trim() === "") return null;
  try {
    const url = referrer.includes("://")
      ? new URL(referrer)
      : new URL(`https://${referrer}`);
    return url.hostname || null;
  } catch {
    return null;
  }
}

export function getClientIp(request: Request): string {
  // In production behind a reverse proxy, read x-forwarded-for (first hop).
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return "127.0.0.1";
}

// Basic bot guard — production-grade filtering is out of scope (see TODO in route).
const BOT_UA_PATTERN =
  /bot|crawl|spider|slurp|mediapartners|facebookexternalhit|bingpreview|headlesschrome|phantomjs|selenium|wget|curl\/|python-requests|scrapy/i;

export function isObviousBot(userAgent: string): boolean {
  return BOT_UA_PATTERN.test(userAgent);
}

export interface VisitorSessionFlags {
  isNewVisitor: boolean;
  isNewSession: boolean;
}

export function computeVisitorSessionFlags(
  siteId: string,
  visitorHash: string,
  timestampMs: number
): VisitorSessionFlags {
  const db = getDb();
  const dayStart = new Date(getUtcDateString(timestampMs)).getTime();

  const priorToday = db
    .prepare(
      `SELECT COUNT(*) as count FROM events
       WHERE site_id = ? AND visitor_hash = ? AND timestamp >= ? AND timestamp < ?`
    )
    .get(siteId, visitorHash, dayStart, timestampMs) as { count: number };

  const isNewVisitor = priorToday.count === 0;

  const lastEvent = db
    .prepare(
      `SELECT timestamp FROM events
       WHERE site_id = ? AND visitor_hash = ? AND timestamp >= ? AND timestamp < ?
       ORDER BY timestamp DESC LIMIT 1`
    )
    .get(siteId, visitorHash, dayStart, timestampMs) as
    | { timestamp: number }
    | undefined;

  const isNewSession =
    !lastEvent || timestampMs - lastEvent.timestamp > SESSION_GAP_MS;

  return { isNewVisitor, isNewSession };
}
