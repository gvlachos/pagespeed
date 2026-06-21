/**
 * One row in the aggregated details table.
 * Stable string columns (url, label) come from the last run.
 * Numeric columns (totalBytes, wastedMs, etc.) are averaged across runs.
 */
export interface AuditDetailsItemStats {
  /** Stable string identifier for this resource (from last run). */
  url?: string;
  /** Human-readable label (from last run). */
  label?: string;
  /** Averaged numeric columns, keyed by column name. */
  numericAverages: Record<string, number>;
}
