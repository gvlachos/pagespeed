import { Stats } from "../model/statistics/stats.model";

/**
 * Calculates mean, min, max, and standard deviation for an array of numbers.
 *
 * Population standard deviation formula:
 *   σ = sqrt( Σ(xᵢ - μ)² / N )
 *
 * We use population (not sample) std dev because we have the full set of
 * measurements, not a sample from a larger unknown population.
 */
export function calcStats(values: number[]): Stats {
  if (values.length === 0) {
    return { mean: 0, min: 0, max: 0, stdDev: 0, values: [] };
  }

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const stdDev = Math.sqrt(
    values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length,
  );

  return { mean, min, max, stdDev, values };
}
