import { NextResponse } from "next/server";
import { UAParser } from "ua-parser-js";
import {
  bucketScreenClass,
  computeVisitorHash,
  computeVisitorSessionFlags,
  getClientIp,
  isObviousBot,
  stripReferrerHostname,
} from "@/lib/analytics";
import { corsHeaders } from "@/lib/cors";
import { getDb, parsePathExclusions } from "@/lib/db";
import { isPathExcluded, parseUtmParams } from "@/lib/privacy";

interface EventPayload {
  site_id?: string;
  pathname?: string;
  hostname?: string;
  referrer?: string | null;
  screen_width?: number;
  event_type?: string;
  event_name?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
}

function jsonResponse(request: Request, status: number): NextResponse {
  return new NextResponse(null, { status, headers: corsHeaders(request) });
}

function normalizeDeviceType(type: string | undefined): string {
  if (type === "mobile" || type === "tablet") return type;
  return "desktop";
}

function normalizeEventType(value: string | undefined): "pageview" | "custom" {
  return value === "custom" ? "custom" : "pageview";
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

export async function POST(request: Request) {
  // Respect Global Privacy Control signal from supporting browsers.
  if (request.headers.get("sec-gpc") === "1") {
    return jsonResponse(request, 204);
  }

  let body: EventPayload;
  try {
    body = (await request.json()) as EventPayload;
  } catch {
    return jsonResponse(request, 400);
  }

  const {
    site_id,
    pathname,
    hostname,
    referrer,
    screen_width,
    event_type: rawEventType,
    event_name,
    utm_source,
    utm_medium,
    utm_campaign,
  } = body;

  if (!site_id || !pathname || !hostname) {
    return jsonResponse(request, 400);
  }

  const eventType = normalizeEventType(rawEventType);
  if (eventType === "custom" && (!event_name || !event_name.trim())) {
    return jsonResponse(request, 400);
  }

  const userAgent = request.headers.get("user-agent") ?? "";

  // TODO: Production-grade bot filtering (rate limits, JS challenge, etc.)
  if (isObviousBot(userAgent)) {
    return jsonResponse(request, 204);
  }

  const db = getDb();
  const site = db
    .prepare(
      "SELECT id, domain, path_exclusions FROM sites WHERE id = ?"
    )
    .get(site_id) as
    | { id: string; domain: string; path_exclusions: string }
    | undefined;

  if (!site) {
    return jsonResponse(request, 404);
  }

  const exclusions = parsePathExclusions(site.path_exclusions);
  if (eventType === "pageview" && isPathExcluded(pathname, exclusions)) {
    return jsonResponse(request, 204);
  }

  const timestamp = Date.now();
  const clientIp = getClientIp(request);
  const visitorHash = computeVisitorHash(site_id, clientIp, userAgent, timestamp);
  const { isNewVisitor, isNewSession } = computeVisitorSessionFlags(
    site_id,
    visitorHash,
    timestamp
  );

  const parser = new UAParser(userAgent);
  const browser = parser.getBrowser().name ?? "Unknown";
  const os = parser.getOS().name ?? "Unknown";
  const device = normalizeDeviceType(parser.getDevice().type);
  const screenClass = bucketScreenClass(
    typeof screen_width === "number" && screen_width > 0 ? screen_width : 1024
  );

  let referrerHostname = stripReferrerHostname(referrer);
  if (
    referrerHostname &&
    (referrerHostname === hostname ||
      referrerHostname === site.domain ||
      referrerHostname.replace(/^www\./, "") ===
        site.domain.replace(/^www\./, ""))
  ) {
    referrerHostname = null;
  }

  const utm = parseUtmParams(utm_source, utm_medium, utm_campaign);
  const safeEventName =
    eventType === "custom" ? event_name!.trim().slice(0, 64) : null;

  db.prepare(
    `INSERT INTO events (
      site_id, timestamp, pathname, hostname, referrer_hostname,
      visitor_hash, browser, os, device, screen_class,
      is_new_visitor, is_new_session,
      event_type, event_name, utm_source, utm_medium, utm_campaign
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    site_id,
    timestamp,
    pathname,
    hostname,
    referrerHostname,
    visitorHash,
    browser,
    os,
    device,
    screenClass,
    isNewVisitor ? 1 : 0,
    isNewSession ? 1 : 0,
    eventType,
    safeEventName,
    utm.utm_source,
    utm.utm_medium,
    utm.utm_campaign
  );

  return jsonResponse(request, 204);
}
