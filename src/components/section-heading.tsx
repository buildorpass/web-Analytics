import { InfoTip } from "./info-tip";
import headStyles from "./info-tip.module.css";

interface SectionHeadingProps {
  title: string;
  info?: string;
  as?: "h1" | "h2" | "h3" | "span";
  className?: string;
}

export function SectionHeading({
  title,
  info,
  as: Tag = "h2",
  className,
}: SectionHeadingProps) {
  return (
    <div className={`${headStyles.head} ${className ?? ""}`}>
      <Tag className={headStyles.label}>{title}</Tag>
      {info && <InfoTip text={info} label={`About ${title}`} />}
    </div>
  );
}
