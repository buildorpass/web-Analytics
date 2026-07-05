import { InfoTip } from "./info-tip";
import styles from "./stat-card.module.css";
import headStyles from "./info-tip.module.css";
import type { StatWithChange } from "@/lib/queries";

interface StatCardProps {
  label: string;
  stat: StatWithChange;
  info?: string;
  format?: (value: number) => string;
}

function defaultFormat(value: number): string {
  if (Number.isInteger(value)) return value.toLocaleString();
  return value.toFixed(1);
}

export function StatCard({
  label,
  stat,
  info,
  format = defaultFormat,
}: StatCardProps) {
  const change = stat.changePercent;
  const changeClass =
    change === null
      ? styles.neutral
      : change >= 0
        ? styles.positive
        : styles.negative;

  return (
    <div className={styles.card}>
      <div className={`${headStyles.head} ${styles.label}`}>
        <span>{label}</span>
        {info && <InfoTip text={info} label={`About ${label}`} />}
      </div>
      <div className={styles.value}>{format(stat.value)}</div>
      {change !== null && (
        <div className={`${styles.change} ${changeClass}`}>
          {change >= 0 ? "+" : ""}
          {change.toFixed(1)}% vs prev period
        </div>
      )}
      {change === null && stat.value > 0 && (
        <div className={`${styles.change} ${styles.neutral}`}>New activity</div>
      )}
    </div>
  );
}
