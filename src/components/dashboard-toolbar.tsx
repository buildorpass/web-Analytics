"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { InfoTip } from "@/components/info-tip";
import styles from "./dashboard-toolbar.module.css";
import headStyles from "./info-tip.module.css";
import type { DateRange } from "@/lib/queries";

interface DashboardToolbarProps {
  siteId: string;
  range: DateRange;
  autoRefreshInfo: string;
  exportInfo: string;
  refreshInfo: string;
}

export function DashboardToolbar({
  siteId,
  range,
  autoRefreshInfo,
  exportInfo,
  refreshInfo,
}: DashboardToolbarProps) {
  const router = useRouter();
  const [autoRefresh, setAutoRefresh] = useState(false);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => router.refresh(), 30000);
    return () => clearInterval(id);
  }, [autoRefresh, router]);

  const exportUrl = `/api/export?site=${encodeURIComponent(siteId)}&range=${encodeURIComponent(range)}`;

  return (
    <div className={styles.toolbar}>
      <label className={styles.toggle}>
        <input
          type="checkbox"
          checked={autoRefresh}
          onChange={(e) => setAutoRefresh(e.target.checked)}
        />
        <span className={headStyles.head}>
          Auto-refresh every 30s
          <InfoTip text={autoRefreshInfo} label="About auto-refresh" />
        </span>
      </label>
      <span className={headStyles.head}>
        <a className={styles.exportBtn} href={exportUrl} download>
          Export CSV
        </a>
        <InfoTip text={exportInfo} label="About CSV export" />
      </span>
      <span className={headStyles.head}>
        <button
          type="button"
          className={styles.refreshBtn}
          onClick={() => router.refresh()}
        >
          Refresh now
        </button>
        <InfoTip text={refreshInfo} label="About refresh" />
      </span>
      <a className={styles.testLink} href="/test.html">
        Open test lab →
      </a>
    </div>
  );
}
