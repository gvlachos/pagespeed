export interface CruxMetric {
  percentile: number;
  category: "FAST" | "AVERAGE" | "SLOW";
}
