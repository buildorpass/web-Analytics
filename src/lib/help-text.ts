/** Plain-language explanations for dashboard metrics and panels. */
export const HELP = {
  dashboard:
    "Your local analytics home. All data stays on your machine in SQLite — nothing is sent to third parties.",

  siteSwitcher:
    "Choose which tracked site to view. Each site has its own ID (used in the tracking script) and domain.",

  dateRange:
    "Filter all stats to a time window. Percent changes compare against the previous equal period (e.g. last 7 days vs the 7 days before that).",

  autoRefresh:
    "Reloads dashboard data every 30 seconds without a full page reload. Useful while testing with the test lab.",

  exportCsv:
    "Downloads aggregated counts only — pageviews, top pages, referrers. Never includes raw visitor hashes or IP addresses.",

  refreshNow: "Immediately reload the latest data from your local database.",

  pageviews:
    "Total number of page loads recorded. SPA route changes count as separate pageviews. Custom events are not included.",

  uniqueVisitors:
    "Distinct visitor hashes in this period. Hashes rotate at UTC midnight, so the same person on different days counts as two visitors.",

  viewsPerVisitor:
    "Pageviews divided by unique visitors. Higher means people browse more pages per visit.",

  bounceRate:
    "Share of sessions with exactly one pageview. A session ends after 30 minutes of inactivity.",

  avgSessions:
    "Average number of sessions per unique visitor in this period. Someone who leaves and returns after 30+ minutes starts a new session.",

  trafficSource:
    "Direct = no external referrer hostname (typed URL, bookmark, or in-app). Referred = arrived from another site's hostname.",

  visitorsInPeriod:
    "New = first pageview that UTC day for this visitor hash. Returning = same hash already had a pageview earlier today. Not the same as cookie-based 'returning users'.",

  timeSeries:
    "Pageviews over time. 'Today' shows hourly bars; longer ranges show daily totals.",

  chartsHub:
    "Switch between chart views to explore traffic, pages, sources, visitors, technology, and campaigns.",

  chartTraffic:
    "Combined view: pageviews (bars) and unique visitors (line) per hour or day.",

  chartPages: "Horizontal bar chart of the most viewed URL paths.",

  chartSources:
    "Donut chart splitting direct traffic vs top referrer hostnames.",

  chartVisitors:
    "New vs returning visitors in this period. Bounded by UTC-day hashing rules.",

  chartTechnology:
    "Device, browser, OS, and screen-size breakdowns from server-side UA parsing.",

  chartCampaigns:
    "UTM source and campaign performance plus custom event counts.",

  topPages: "Most viewed URL paths in the selected period.",

  topReferrers:
    "External sites that sent traffic. Self-referrals and same-domain links are excluded. Null referrers count as direct.",

  entryPages:
    "First page someone viewed in a session (per visitor hash, per UTC day). Shows where people land.",

  exitPages:
    "Last page before a session ends. Useful for spotting drop-off pages.",

  utmSources:
    "utm_source values from URL query strings (e.g. google, newsletter). Only coarse labels are stored.",

  utmCampaigns:
    "utm_campaign values from URLs (e.g. spring_sale). Helps compare marketing campaigns.",

  customEvents:
    "Events fired via localAnalytics.track('name') — button clicks, signups, etc. No user IDs attached.",

  browsers: "Browser family parsed server-side from User-Agent. Raw UA is never stored.",

  operatingSystems: "OS family from User-Agent parsing.",

  devices: "Device type: mobile, tablet, or desktop.",

  screenSizes:
    "Screen width bucketed at ingest: sm (&lt;640px), md (&lt;1024px), lg (1024px+). Exact pixels are not stored.",

  trackingSnippet:
    "Paste this on your site. The tracker sends pageviews without cookies or local storage. data-exclude skips admin paths.",

  privacyPanel:
    "Summary of what this app collects, what it never stores, and which privacy protections are active.",

  aiDailyReport:
    "Compares today vs yesterday and the prior 7-day average using SQL only. Good/bad/neutral labels and confidence are computed in code. OpenAI writes a short summary from that JSON — it never sees raw events or does math. Results are cached per site per UTC day.",
} as const;
