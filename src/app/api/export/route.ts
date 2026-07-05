import { NextResponse } from "next/server";
import {
  type DateRange,
  getExportSummary,
  getSites,
} from "@/lib/queries";

function parseRange(value: string | null): DateRange {
  if (value === "7d" || value === "30d") return value;
  return "today";
}

function toCsv(summary: ReturnType<typeof getExportSummary>): string {
  const lines: string[] = [
    "Local Analytics — aggregated export (no raw visitor data)",
    `site_id,${summary.siteId}`,
    `range,${summary.range}`,
    `generated_at,${summary.generatedAt}`,
    "",
    "metric,value",
    `pageviews,${summary.pageviews}`,
    `unique_visitors,${summary.uniqueVisitors}`,
    `bounce_rate_percent,${summary.bounceRate.toFixed(2)}`,
    `direct_traffic,${summary.directTraffic}`,
    `referred_traffic,${summary.referredTraffic}`,
    "",
    "top_pages,views",
    ...summary.topPages.map((r) => `"${r.label.replace(/"/g, '""')}",${r.views}`),
    "",
    "top_referrers,views",
    ...summary.topReferrers.map((r) => `"${r.label.replace(/"/g, '""')}",${r.views}`),
    "",
    "top_campaigns,views",
    ...summary.topCampaigns.map((r) => `"${r.label.replace(/"/g, '""')}",${r.views}`),
  ];
  return lines.join("\n");
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get("site");
  const range = parseRange(searchParams.get("range"));

  const sites = getSites();
  const validSite =
    sites.find((s) => s.id === siteId)?.id ?? sites[0]?.id;

  if (!validSite) {
    return NextResponse.json({ error: "No sites configured" }, { status: 404 });
  }

  const summary = getExportSummary(validSite, range);
  const csv = toCsv(summary);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="analytics-${validSite}-${range}.csv"`,
    },
  });
}
