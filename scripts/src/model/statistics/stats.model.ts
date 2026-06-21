/**
 * Descriptive statistics for a single numeric series.
 * All values are in the same unit as the source data (0–1 for scores).
 *
 * Standard deviation reference:
 *   https://en.wikipedia.org/wiki/Standard_deviation
 */
export interface Stats {
  mean: number;
  min: number;
  max: number;
  stdDev: number;
  values: number[]; // the raw per-run values, kept for transparency
}
