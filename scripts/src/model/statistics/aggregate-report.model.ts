import { Stats } from "./stats.model";
import { CategoryStats } from "./category-stats.model";
import { AuditStats } from "./audit-stats.model";
import { CruxMetric } from "../api/crux-metric.model";

/** The full aggregated report produced from N runs. */
export interface AggregatedReport {
  url: string;
  strategy: "mobile" | "desktop";
  runs: number;
  startedAt: string; // ISO timestamp of first run
  finishedAt: string; // ISO timestamp of last run
  hostUserAgent: string;
  benchmarkIndex: Stats; // fluctuates between runs
  categories: Record<string, CategoryStats>;
  audits: Record<string, AuditStats>;
  /**
   * Chrome UX Report field data from the last run.
   * CrUX reflects real-user measurements aggregated by Google over 28 days,
   * so it is stable across runs — no averaging needed.
   * May be absent if the URL has insufficient real-user traffic.
   * Reference: https://developer.chrome.com/docs/crux
   */
  loadingExperience?: {
    overall_category?: "FAST" | "AVERAGE" | "SLOW";
    metrics?: Record<string, CruxMetric>;
  };
}
