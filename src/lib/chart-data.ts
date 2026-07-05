import type { RankedRow, TrafficSplit, VisitorTypeSplit } from "@/lib/queries";

export interface ChartSlice {
  name: string;
  value: number;
}

export function rankedToBars(rows: RankedRow[], limit = 8): ChartSlice[] {
  return rows.slice(0, limit).map((r) => ({
    name: r.label,
    value: r.views,
  }));
}

export function sourcesPieData(
  traffic: TrafficSplit,
  referrers: RankedRow[]
): ChartSlice[] {
  const slices: ChartSlice[] = [];
  if (traffic.direct > 0) {
    slices.push({ name: "Direct", value: traffic.direct });
  }
  const top = referrers.slice(0, 5);
  let topRefSum = 0;
  for (const r of top) {
    slices.push({ name: r.label, value: r.views });
    topRefSum += r.views;
  }
  const other = traffic.referred - topRefSum;
  if (other > 0) {
    slices.push({ name: "Other referrers", value: other });
  }
  return slices;
}

export function visitorTypePieData(split: VisitorTypeSplit): ChartSlice[] {
  const slices: ChartSlice[] = [];
  if (split.newVisitors > 0) {
    slices.push({ name: "New", value: split.newVisitors });
  }
  if (split.returningVisitors > 0) {
    slices.push({ name: "Returning", value: split.returningVisitors });
  }
  return slices;
}

export function screenClassLabel(label: string): string {
  const map: Record<string, string> = {
    sm: "Small (<640px)",
    md: "Medium (<1024px)",
    lg: "Large (1024px+)",
  };
  return map[label] ?? label;
}
