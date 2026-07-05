"use client";

import { useCallback, useEffect, useState } from "react";
import { SectionHeading } from "./section-heading";
import styles from "./ai-daily-report-panel.module.css";
import type { AiDailyReport } from "@/lib/ai-summary";

interface AiDailyReportPanelProps {
  siteId: string;
  info: string;
}

type PanelState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "not_configured" }
  | { kind: "error"; message: string }
  | { kind: "ready"; report: AiDailyReport; cached: boolean; date: string };

export function AiDailyReportPanel({ siteId, info }: AiDailyReportPanelProps) {
  const [state, setState] = useState<PanelState>({ kind: "idle" });

  const loadCached = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/daily-report?site=${encodeURIComponent(siteId)}`
      );
      const data = (await res.json()) as {
        status?: string;
        report?: AiDailyReport;
        cached?: boolean;
        date?: string;
      };
      if (data.status === "ready" && data.report) {
        setState({
          kind: "ready",
          report: data.report,
          cached: data.cached === true,
          date: data.date ?? "",
        });
      }
    } catch {
      /* ignore — user can click Generate */
    }
  }, [siteId]);

  useEffect(() => {
    void loadCached();
  }, [loadCached]);

  async function generate(regenerate: boolean) {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/daily-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, regenerate }),
      });
      const data = (await res.json()) as {
        status: string;
        report?: AiDailyReport;
        cached?: boolean;
        date?: string;
        message?: string;
      };

      if (data.status === "not_configured") {
        setState({ kind: "not_configured" });
        return;
      }
      if (data.status === "error") {
        setState({
          kind: "error",
          message: data.message ?? "Failed to generate report",
        });
        return;
      }
      if (data.status === "ready" && data.report) {
        setState({
          kind: "ready",
          report: data.report,
          cached: data.cached === true,
          date: data.date ?? "",
        });
        return;
      }
      setState({ kind: "error", message: "Unexpected response from server" });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Request failed",
      });
    }
  }

  const hasReport = state.kind === "ready";
  const isLoading = state.kind === "loading";

  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <SectionHeading title="AI Daily Report" info={info} className={styles.title} />
        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            disabled={isLoading}
            onClick={() => void generate(false)}
          >
            {isLoading ? "Generating…" : hasReport ? "Refresh summary" : "Generate summary"}
          </button>
          {hasReport && (
            <button
              type="button"
              className={styles.btn}
              disabled={isLoading}
              onClick={() => void generate(true)}
            >
              Regenerate
            </button>
          )}
        </div>
      </div>

      <p className={styles.disclaimer}>
        AI-generated interpretation — verify before acting.
      </p>

      {state.kind === "idle" && (
        <p className={styles.placeholder}>
          Click <strong>Generate summary</strong> to analyze what changed today
          for this site. SQL computes all numbers; the AI only writes the
          interpretation.
        </p>
      )}

      {state.kind === "loading" && (
        <p className={styles.loading}>Analyzing today&apos;s changes…</p>
      )}

      {state.kind === "not_configured" && (
        <p className={styles.notConfigured}>
          Add <code>OPENAI_API_KEY</code> and <code>OPENAI_MODEL</code> to{" "}
          <code>.env.local</code> to enable AI summaries.
        </p>
      )}

      {state.kind === "error" && (
        <p className={styles.error}>{state.message}</p>
      )}

      {state.kind === "ready" && (
        <div>
          <h3 className={styles.headline}>
            {state.report.headline}
            {state.cached && (
              <span className={styles.cachedBadge}>(cached)</span>
            )}
          </h3>
          <p className={styles.summary}>{state.report.summary}</p>

          {state.report.changes.length > 0 && (
            <>
              <h4 className={styles.sectionTitle}>Changes</h4>
              <ul className={styles.changes}>
                {state.report.changes.map((change) => (
                  <li key={change.label} className={styles.changeItem}>
                    <span
                      className={`${styles.verdict} ${styles[change.verdict]}`}
                    >
                      {change.verdict}
                    </span>
                    <div>
                      <div className={styles.changeLabel}>{change.label}</div>
                      <div className={styles.changeDetail}>{change.detail}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}

          {state.report.actionItems.length > 0 && (
            <>
              <h4 className={styles.sectionTitle}>Action items</h4>
              <ul className={styles.actionsList}>
                {state.report.actionItems.map((item) => (
                  <li key={item} className={styles.actionItem}>
                    {item}
                  </li>
                ))}
              </ul>
            </>
          )}

          <p className={styles.confidenceNote}>{state.report.confidenceNote}</p>
        </div>
      )}
    </section>
  );
}
