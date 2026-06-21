import { AuditDetailsItemStats } from "./audit-details-items-stats.model";
import { Stats } from "./stats.model";

/** Aggregated audit results across N runs. */
export interface AuditStats {
  id: string;
  title: string;
  description: string;
  scoreDisplayMode: string;
  score: Stats | null; // null if audit is informational
  numericValue: Stats | null; // null if audit has no numeric value
  numericUnit: string | undefined;
  lastDisplayValue: string | undefined; // from the final run, for context
  /** Aggregated details items (opportunity/table types only). */
  detailsType?: string;
  detailsItems?: AuditDetailsItemStats[];
}
