import { NextRequest, NextResponse } from "next/server";
import {
  getCachedDailyReportOnly,
  getOrGenerateDailyReport,
} from "@/lib/daily-report-service";
import { getUtcDateString } from "@/lib/salt";

export async function GET(request: NextRequest) {
  const siteId = request.nextUrl.searchParams.get("site");
  const date =
    request.nextUrl.searchParams.get("date") ?? getUtcDateString();

  if (!siteId) {
    return NextResponse.json({ error: "Missing site parameter" }, { status: 400 });
  }

  const cached = getCachedDailyReportOnly(siteId, date);
  if (cached) {
    return NextResponse.json(cached);
  }

  return NextResponse.json({ status: "no_cache", date });
}

export async function POST(request: NextRequest) {
  let body: { siteId?: string; date?: string; regenerate?: boolean };
  try {
    body = (await request.json()) as {
      siteId?: string;
      date?: string;
      regenerate?: boolean;
    };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const siteId = body.siteId;
  if (!siteId) {
    return NextResponse.json({ error: "Missing siteId" }, { status: 400 });
  }

  const date = body.date ?? getUtcDateString();
  const result = await getOrGenerateDailyReport(siteId, date, {
    regenerate: body.regenerate === true,
  });

  return NextResponse.json(result);
}
