import { SectionHeading } from "./section-heading";
import styles from "./insight-cards.module.css";
import type { TrafficSplit, VisitorTypeSplit } from "@/lib/queries";

interface InsightCardsProps {
  traffic: TrafficSplit;
  visitors: VisitorTypeSplit;
  trafficInfo: string;
  visitorsInfo: string;
}

export function InsightCards({
  traffic,
  visitors,
  trafficInfo,
  visitorsInfo,
}: InsightCardsProps) {
  const trafficTotal = traffic.direct + traffic.referred;
  const visitorTotal = visitors.newVisitors + visitors.returningVisitors;

  return (
    <section className={styles.row}>
      <div className={styles.card}>
        <SectionHeading title="Traffic source" info={trafficInfo} className={styles.title} />
        <div className={styles.bar}>
          <div
            className={styles.direct}
            style={{
              width: `${trafficTotal ? traffic.directPercent : 50}%`,
            }}
          />
        </div>
        <div className={styles.legend}>
          <span>
            Direct {traffic.direct.toLocaleString()} (
            {traffic.directPercent.toFixed(0)}%)
          </span>
          <span>Referred {traffic.referred.toLocaleString()}</span>
        </div>
      </div>
      <div className={styles.card}>
        <SectionHeading
          title="Visitors in period"
          info={visitorsInfo}
          className={styles.title}
        />
        <div className={styles.bar}>
          <div
            className={styles.new}
            style={{
              width: `${visitorTotal ? visitors.newPercent : 50}%`,
            }}
          />
        </div>
        <div className={styles.legend}>
          <span>
            New {visitors.newVisitors.toLocaleString()} (
            {visitors.newPercent.toFixed(0)}%)
          </span>
          <span>Returning {visitors.returningVisitors.toLocaleString()}</span>
        </div>
      </div>
    </section>
  );
}
