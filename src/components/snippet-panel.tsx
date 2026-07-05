import { SectionHeading } from "./section-heading";
import styles from "./snippet-panel.module.css";
import type { Site } from "@/lib/queries";

interface SnippetPanelProps {
  site: Site;
  origin: string;
  exclusions?: string[];
  info?: string;
}

export function SnippetPanel({
  site,
  origin,
  exclusions = [],
  info,
}: SnippetPanelProps) {
  const excludeAttr =
    exclusions.length > 0
      ? ` data-exclude="${exclusions.join(",")}"`
      : "";
  const snippet = `<script src="${origin}/tracker.js" data-site="${site.id}"${excludeAttr} defer></script>`;

  return (
    <div className={styles.panel}>
      <SectionHeading title="Add this site" info={info} className={styles.title} />
      <p className={styles.desc}>
        Paste before <code>&lt;/head&gt;</code> on{" "}
        <strong>{site.domain}</strong>. No cookies, no local storage.
        Respects DNT, GPC, and <code>meta local-analytics=disabled</code>.
      </p>
      <pre className={styles.code}>{snippet}</pre>
      <p className={styles.desc}>
        Custom events:{" "}
        <code>localAnalytics.track(&quot;signup_click&quot;)</code>
      </p>
    </div>
  );
}
