"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { InfoTip } from "@/components/info-tip";
import { SectionHeading } from "@/components/section-heading";
import {
  rankedToBars,
  screenClassLabel,
  sourcesPieData,
  visitorTypePieData,
} from "@/lib/chart-data";
import {
  CHART_AXIS_TICK,
  CHART_COLORS,
  CHART_GRID_STROKE,
  CHART_TOOLTIP_STYLE,
} from "@/lib/chart-theme";
import type {
  RankedRow,
  TrafficSplit,
  TrafficTimeSeriesPoint,
  VisitorTypeSplit,
} from "@/lib/queries";
import styles from "./charts-hub.module.css";

type ChartView =
  | "traffic"
  | "pages"
  | "sources"
  | "visitors"
  | "technology"
  | "campaigns";

const VIEWS: { id: ChartView; label: string }[] = [
  { id: "traffic", label: "Traffic" },
  { id: "pages", label: "Pages" },
  { id: "sources", label: "Sources" },
  { id: "visitors", label: "Visitors" },
  { id: "technology", label: "Technology" },
  { id: "campaigns", label: "Campaigns" },
];

interface ChartsHubProps {
  trafficSeries: TrafficTimeSeriesPoint[];
  granularity: "hour" | "day";
  topPages: RankedRow[];
  topReferrers: RankedRow[];
  traffic: TrafficSplit;
  visitors: VisitorTypeSplit;
  browsers: RankedRow[];
  devices: RankedRow[];
  osList: RankedRow[];
  screenClasses: RankedRow[];
  utmSources: RankedRow[];
  utmCampaigns: RankedRow[];
  customEvents: RankedRow[];
  help: Record<ChartView | "hub", string>;
}

function EmptyChart({ message }: { message: string }) {
  return <div className={styles.empty}>{message}</div>;
}

function PieView({
  data,
  emptyMessage,
}: {
  data: { name: string; value: number }[];
  emptyMessage: string;
}) {
  if (data.length === 0) return <EmptyChart message={emptyMessage} />;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={90}
          paddingAngle={2}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
        <Legend
          wrapperStyle={{ fontSize: 12 }}
          formatter={(value) => (
            <span style={{ color: "#c8cdd8" }}>{value}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

function HorizontalBars({
  data,
  color = CHART_COLORS[0],
  emptyMessage,
}: {
  data: { name: string; value: number }[];
  color?: string;
  emptyMessage: string;
}) {
  if (data.length === 0) return <EmptyChart message={emptyMessage} />;
  const height = Math.max(200, data.length * 36 + 40);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
        <XAxis type="number" tick={CHART_AXIS_TICK} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="name"
          width={120}
          tick={CHART_AXIS_TICK}
          tickFormatter={(v: string) =>
            v.length > 18 ? `${v.slice(0, 16)}…` : v
          }
        />
        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
        <Bar dataKey="value" fill={color} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ChartsHub({
  trafficSeries,
  granularity,
  topPages,
  topReferrers,
  traffic,
  visitors,
  browsers,
  devices,
  osList,
  screenClasses,
  utmSources,
  utmCampaigns,
  customEvents,
  help,
}: ChartsHubProps) {
  const [view, setView] = useState<ChartView>("traffic");

  const timeLabel = granularity === "hour" ? "hour" : "day";
  const pagesData = rankedToBars(topPages, 8);
  const sourcesData = sourcesPieData(traffic, topReferrers);
  const visitorPie = visitorTypePieData(visitors);
  const browserData = rankedToBars(browsers, 6);
  const osData = rankedToBars(osList, 6);
  const deviceData = rankedToBars(devices, 4);
  const screenData = screenClasses.map((r) => ({
    name: screenClassLabel(r.label),
    value: r.views,
  }));
  const utmSourceData = rankedToBars(utmSources, 8);
  const utmCampaignData = rankedToBars(utmCampaigns, 8);
  const customData = rankedToBars(customEvents, 8);

  const hasTraffic = trafficSeries.some(
    (p) => p.pageviews > 0 || p.visitors > 0
  );

  return (
    <div className={styles.hub}>
      <div className={styles.header}>
        <SectionHeading title="Charts" info={help.hub} />
        <div className={styles.tabs} role="tablist" aria-label="Chart views">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={view === v.id}
              className={view === v.id ? `${styles.tab} ${styles.active}` : styles.tab}
              onClick={() => setView(v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.panel} role="tabpanel">
        <div className={styles.panelTitle}>
          <span>{VIEWS.find((v) => v.id === view)?.label}</span>
          <InfoTip text={help[view]} label={`About ${view} chart`} />
        </div>

        {view === "traffic" && (
          <>
            {!hasTraffic ? (
              <EmptyChart message="No traffic data for this period." />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart
                  data={trafficSeries}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
                  <XAxis
                    dataKey="label"
                    tick={CHART_AXIS_TICK}
                    interval={granularity === "hour" ? 2 : "preserveStartEnd"}
                  />
                  <YAxis
                    yAxisId="left"
                    tick={CHART_AXIS_TICK}
                    allowDecimals={false}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={CHART_AXIS_TICK}
                    allowDecimals={false}
                  />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar
                    yAxisId="left"
                    dataKey="pageviews"
                    name="Pageviews"
                    fill={CHART_COLORS[0]}
                    radius={[4, 4, 0, 0]}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="visitors"
                    name="Unique visitors"
                    stroke={CHART_COLORS[1]}
                    strokeWidth={2}
                    dot={{ r: 3, fill: CHART_COLORS[1] }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
            <p className={styles.caption}>
              Bars = pageviews per {timeLabel}. Line = unique visitors per {timeLabel}.
            </p>
          </>
        )}

        {view === "pages" && (
          <>
            <HorizontalBars
              data={pagesData}
              color={CHART_COLORS[0]}
              emptyMessage="No page data yet."
            />
            <p className={styles.caption}>Top paths by pageview count.</p>
          </>
        )}

        {view === "sources" && (
          <>
            <PieView
              data={sourcesData}
              emptyMessage="No source data — try test lab §3."
            />
            <p className={styles.caption}>
              Direct traffic vs external referrer hostnames.
            </p>
          </>
        )}

        {view === "visitors" && (
          <>
            <PieView
              data={visitorPie}
              emptyMessage="No visitor data for this period."
            />
            <p className={styles.caption}>
              New vs returning within the period (UTC-day bounded).
            </p>
          </>
        )}

        {view === "technology" && (
          <div className={styles.techGrid}>
            <div className={styles.techCell}>
              <h3>Devices</h3>
              <PieView data={deviceData} emptyMessage="No device data." />
            </div>
            <div className={styles.techCell}>
              <h3>Browsers</h3>
              <HorizontalBars
                data={browserData}
                color={CHART_COLORS[2]}
                emptyMessage="No browser data."
              />
            </div>
            <div className={styles.techCell}>
              <h3>Operating systems</h3>
              <HorizontalBars
                data={osData}
                color={CHART_COLORS[4]}
                emptyMessage="No OS data."
              />
            </div>
            <div className={styles.techCell}>
              <h3>Screen sizes</h3>
              <PieView data={screenData} emptyMessage="No screen data." />
            </div>
          </div>
        )}

        {view === "campaigns" && (
          <div className={styles.campaignGrid}>
            <div className={styles.techCell}>
              <h3>UTM sources</h3>
              <HorizontalBars
                data={utmSourceData}
                color={CHART_COLORS[3]}
                emptyMessage="No UTM sources — try test lab §5."
              />
            </div>
            <div className={styles.techCell}>
              <h3>UTM campaigns</h3>
              <HorizontalBars
                data={utmCampaignData}
                color={CHART_COLORS[5]}
                emptyMessage="No campaigns yet."
              />
            </div>
            {customData.length > 0 && (
              <div className={`${styles.techCell} ${styles.fullWidth}`}>
                <h3>Custom events</h3>
                <HorizontalBars
                  data={customData}
                  color={CHART_COLORS[6]}
                  emptyMessage="No custom events."
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
