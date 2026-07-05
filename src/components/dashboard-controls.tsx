"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { InfoTip } from "@/components/info-tip";
import type { DateRange, Site } from "@/lib/queries";
import styles from "./dashboard-controls.module.css";
import headStyles from "./info-tip.module.css";

const RANGES: { value: DateRange; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
];

interface DashboardControlsProps {
  sites: Site[];
  selectedSiteId: string;
  selectedRange: DateRange;
  siteInfo: string;
  rangeInfo: string;
}

export function DashboardControls({
  sites,
  selectedSiteId,
  selectedRange,
  siteInfo,
  rangeInfo,
}: DashboardControlsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function update(param: string, value: string) {
    const next = new URLSearchParams(searchParams.toString());
    next.set(param, value);
    router.push(`/?${next.toString()}`);
  }

  return (
    <div className={styles.controls}>
      <label className={styles.field}>
        <span className={headStyles.head}>
          Site
          <InfoTip text={siteInfo} label="About site selector" />
        </span>
        <select
          value={selectedSiteId}
          onChange={(e) => update("site", e.target.value)}
        >
          {sites.map((site) => (
            <option key={site.id} value={site.id}>
              {site.name}
            </option>
          ))}
        </select>
      </label>
      <div className={styles.rangeBlock}>
        <span className={`${headStyles.head} ${styles.rangeLabel}`}>
          Date range
          <InfoTip text={rangeInfo} label="About date range" />
        </span>
        <div className={styles.rangeGroup}>
          {RANGES.map((range) => (
            <button
              key={range.value}
              type="button"
              className={
                selectedRange === range.value
                  ? `${styles.rangeBtn} ${styles.active}`
                  : styles.rangeBtn
              }
              onClick={() => update("range", range.value)}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
