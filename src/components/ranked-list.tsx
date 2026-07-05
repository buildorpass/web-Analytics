import { SectionHeading } from "./section-heading";
import styles from "./ranked-list.module.css";
import type { RankedRow } from "@/lib/queries";

interface RankedListProps {
  title: string;
  info?: string;
  rows: RankedRow[];
  emptyMessage?: string;
  emptyHint?: string;
}

export function RankedList({
  title,
  info,
  rows,
  emptyMessage = "No data yet",
  emptyHint,
}: RankedListProps) {
  return (
    <div className={styles.wrap}>
      <SectionHeading title={title} info={info} className={styles.title} />
      {rows.length === 0 ? (
        <div className={styles.emptyWrap}>
          <p className={styles.empty}>{emptyMessage}</p>
          {emptyHint && <p className={styles.emptyHint}>{emptyHint}</p>}
        </div>
      ) : (
        <table className={styles.table}>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <td className={styles.label}>{row.label}</td>
                <td className={styles.views}>{row.views.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
