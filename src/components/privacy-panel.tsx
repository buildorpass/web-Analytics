import { SectionHeading } from "./section-heading";
import styles from "./privacy-panel.module.css";
import type { Site } from "@/lib/queries";
import { parsePathExclusions } from "@/lib/db";

interface PrivacyPanelProps {
  site: Site;
  info?: string;
}

export function PrivacyPanel({ site, info }: PrivacyPanelProps) {
  const exclusions = parsePathExclusions(site.path_exclusions);

  return (
    <div className={styles.panel}>
      <SectionHeading
        title="Privacy & data policy"
        info={info}
        className={styles.title}
      />
      <div className={styles.grid}>
        <div>
          <h3>Never collected</h3>
          <ul>
            <li>Cookies or local storage</li>
            <li>Raw IP addresses</li>
            <li>Full User-Agent strings</li>
            <li>Full referrer URLs (hostname only)</li>
            <li>Cross-day visitor identity</li>
            <li>Fingerprinting signals</li>
          </ul>
        </div>
        <div>
          <h3>Collected (aggregated)</h3>
          <ul>
            <li>Page path &amp; hostname</li>
            <li>Referrer hostname</li>
            <li>Coarse browser / OS / device</li>
            <li>Screen size class (sm / md / lg)</li>
            <li>UTM campaign labels (if present in URL)</li>
            <li>Custom event names (via localAnalytics.track)</li>
            <li>Daily salted visitor hash (16 chars)</li>
          </ul>
        </div>
        <div>
          <h3>Protections active</h3>
          <ul>
            <li>IP truncated before hashing (last octet zeroed)</li>
            <li>Auto-purge after {site.retention_days} days</li>
            <li>Respects Do Not Track &amp; Global Privacy Control</li>
            <li>Meta tag opt-out: local-analytics=disabled</li>
            {exclusions.length > 0 && (
              <li>Path exclusions: {exclusions.join(", ")}</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
