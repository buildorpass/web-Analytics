import { Suspense } from "react";
import { headers } from "next/headers";
import { DashboardControls } from "@/components/dashboard-controls";
import { DashboardToolbar } from "@/components/dashboard-toolbar";
import { InsightCards } from "@/components/insight-cards";
import { InfoTip } from "@/components/info-tip";
import { PrivacyPanel } from "@/components/privacy-panel";
import { RankedList } from "@/components/ranked-list";
import { SnippetPanel } from "@/components/snippet-panel";
import { StatCard } from "@/components/stat-card";
import { AiDailyReportPanel } from "@/components/ai-daily-report-panel";
import { ChartsHub } from "@/components/charts-hub";
import { parsePathExclusions } from "@/lib/db";
import { HELP } from "@/lib/help-text";
import {
  type DateRange,
  getBrowserBreakdown,
  getCustomEvents,
  getDashboardStats,
  getDeviceBreakdown,
  getEntryPages,
  getExitPages,
  getOsBreakdown,
  getPeriodBounds,
  getScreenClassBreakdown,
  getSite,
  getSites,
  getTrafficTimeSeries,
  getTopPages,
  getTopReferrers,
  getTrafficSplit,
  getUtmCampaigns,
  getUtmSources,
  getVisitorTypeSplit,
} from "@/lib/queries";
import styles from "./page.module.css";

interface PageProps {
  searchParams: Promise<{ site?: string; range?: string }>;
}

function parseRange(value: string | undefined): DateRange {
  if (value === "7d" || value === "30d") return value;
  return "today";
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const sites = getSites();
  const selectedSiteId =
    sites.find((s) => s.id === params.site)?.id ?? sites[0]?.id ?? "abc123";
  const range = parseRange(params.range);
  const selectedSite = getSite(selectedSiteId) ?? sites[0];

  const stats = getDashboardStats(selectedSiteId, range);
  const traffic = getTrafficSplit(selectedSiteId, range);
  const visitors = getVisitorTypeSplit(selectedSiteId, range);
  const trafficSeries = getTrafficTimeSeries(selectedSiteId, range);
  const { granularity } = getPeriodBounds(range);
  const topPages = getTopPages(selectedSiteId, range);
  const entryPages = getEntryPages(selectedSiteId, range);
  const exitPages = getExitPages(selectedSiteId, range);
  const topReferrers = getTopReferrers(selectedSiteId, range);
  const utmSources = getUtmSources(selectedSiteId, range);
  const utmCampaigns = getUtmCampaigns(selectedSiteId, range);
  const customEvents = getCustomEvents(selectedSiteId, range);
  const browsers = getBrowserBreakdown(selectedSiteId, range);
  const osList = getOsBreakdown(selectedSiteId, range);
  const devices = getDeviceBreakdown(selectedSiteId, range);
  const screenClasses = getScreenClassBreakdown(selectedSiteId, range);

  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost:3000";
  const origin = `http://${host}`;
  const exclusions = selectedSite
    ? parsePathExclusions(selectedSite.path_exclusions)
    : [];

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <div className={styles.headerTitle}>
          <h1 className={styles.title}>Local Analytics</h1>
          <InfoTip text={HELP.dashboard} label="About this dashboard" />
        </div>
        <p className={styles.subtitle}>
          Privacy-focused, cookieless analytics — runs entirely on your machine.
          Click <strong>i</strong> next to any metric for a plain-language explanation.
        </p>
      </header>

      <Suspense fallback={null}>
        <DashboardControls
          sites={sites}
          selectedSiteId={selectedSiteId}
          selectedRange={range}
          siteInfo={HELP.siteSwitcher}
          rangeInfo={HELP.dateRange}
        />
        <DashboardToolbar
          siteId={selectedSiteId}
          range={range}
          autoRefreshInfo={HELP.autoRefresh}
          exportInfo={HELP.exportCsv}
          refreshInfo={HELP.refreshNow}
        />
      </Suspense>

      <AiDailyReportPanel
        siteId={selectedSiteId}
        info={HELP.aiDailyReport}
      />

      <section className={styles.stats}>
        <StatCard label="Pageviews" stat={stats.pageviews} info={HELP.pageviews} />
        <StatCard
          label="Unique visitors"
          stat={stats.uniqueVisitors}
          info={HELP.uniqueVisitors}
        />
        <StatCard
          label="Views per visitor"
          stat={stats.viewsPerVisitor}
          info={HELP.viewsPerVisitor}
          format={(v) => v.toFixed(2)}
        />
        <StatCard
          label="Bounce rate"
          stat={stats.bounceRate}
          info={HELP.bounceRate}
          format={(v) => `${v.toFixed(1)}%`}
        />
        <StatCard
          label="Avg sessions / visitor"
          stat={stats.avgSessionsPerVisitor}
          info={HELP.avgSessions}
          format={(v) => v.toFixed(2)}
        />
      </section>

      <InsightCards
        traffic={traffic}
        visitors={visitors}
        trafficInfo={HELP.trafficSource}
        visitorsInfo={HELP.visitorsInPeriod}
      />

      <ChartsHub
        trafficSeries={trafficSeries}
        granularity={granularity}
        topPages={topPages}
        topReferrers={topReferrers}
        traffic={traffic}
        visitors={visitors}
        browsers={browsers}
        devices={devices}
        osList={osList}
        screenClasses={screenClasses}
        utmSources={utmSources}
        utmCampaigns={utmCampaigns}
        customEvents={customEvents}
        help={{
          hub: HELP.chartsHub,
          traffic: HELP.chartTraffic,
          pages: HELP.chartPages,
          sources: HELP.chartSources,
          visitors: HELP.chartVisitors,
          technology: HELP.chartTechnology,
          campaigns: HELP.chartCampaigns,
        }}
      />

      <section className={styles.grid}>
        <RankedList title="Top pages" rows={topPages} info={HELP.topPages} />
        <RankedList
          title="Top referrers"
          rows={topReferrers}
          info={HELP.topReferrers}
          emptyHint="Use test lab §3 or §4 to generate referrer traffic."
        />
      </section>

      <section className={styles.grid}>
        <RankedList
          title="Entry pages"
          rows={entryPages}
          info={HELP.entryPages}
          emptyMessage="No entry data"
          emptyHint="Run test lab §7 (deep session) to create multi-page sessions."
        />
        <RankedList
          title="Exit pages"
          rows={exitPages}
          info={HELP.exitPages}
          emptyMessage="No exit data"
          emptyHint="Run test lab §7 (deep session) to create multi-page sessions."
        />
      </section>

      <section className={styles.grid}>
        <RankedList
          title="UTM sources"
          rows={utmSources}
          info={HELP.utmSources}
          emptyMessage="No UTM data"
          emptyHint="Use test lab §5 UTM buttons or add ?utm_source= to URLs."
        />
        <RankedList
          title="UTM campaigns"
          rows={utmCampaigns}
          info={HELP.utmCampaigns}
          emptyMessage="No campaigns"
          emptyHint="Use test lab §5 UTM buttons."
        />
      </section>

      <section className={styles.grid}>
        <RankedList
          title="Custom events"
          rows={customEvents}
          info={HELP.customEvents}
          emptyMessage="No custom events yet"
          emptyHint="Use test lab §6 or call localAnalytics.track('name')."
        />
      </section>

      <section className={styles.breakdowns}>
        <RankedList title="Browsers" rows={browsers} info={HELP.browsers} />
        <RankedList
          title="Operating systems"
          rows={osList}
          info={HELP.operatingSystems}
        />
        <RankedList title="Devices" rows={devices} info={HELP.devices} />
        <RankedList
          title="Screen sizes"
          rows={screenClasses}
          info={HELP.screenSizes}
          emptyHint="Use test lab §3 screen preset to populate sm/md/lg buckets."
        />
      </section>

      {selectedSite && (
        <SnippetPanel
          site={selectedSite}
          origin={origin}
          exclusions={exclusions}
          info={HELP.trackingSnippet}
        />
      )}

      {selectedSite && (
        <PrivacyPanel site={selectedSite} info={HELP.privacyPanel} />
      )}
    </main>
  );
}
