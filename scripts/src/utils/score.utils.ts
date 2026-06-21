import { Stats } from "../model/statistics/stats.model";

/**
 * Formats a 0–1 score as a 0–100 integer string, or "N/A".
 */
function fmt(score: number | null | undefined): string {
  if (score === null || score === undefined) return "N/A";
  return String(Math.round(score * 100));
}

/**
 * Formats a Stats object as "mean (min–max ±stddev)" on the 0–100 scale.
 * Example: "87 (82–91 ±3)"
 */
export function fmtStats(s: Stats): string {
  const mean = Math.round(s.mean * 100);
  const min = Math.round(s.min * 100);
  const max = Math.round(s.max * 100);
  const stdDev = (s.stdDev * 100).toFixed(1);
  return `**${mean}** (${min}–${max} ±${stdDev})`;
}

/**
 * Formats a numeric Stats (milliseconds, bytes, etc.) for display.
 * Uses the last run's displayValue for the unit and formatting hint.
 */
export function fmtNumericStats(s: Stats, unit?: string): string {
  // Decide decimal places based on magnitude.
  const decimals = s.mean < 1 ? 3 : s.mean < 100 ? 2 : 0;
  const mean = s.mean.toFixed(decimals);
  const min = s.min.toFixed(decimals);
  const max = s.max.toFixed(decimals);
  const stdDev = s.stdDev.toFixed(decimals);
  const u = unit ? ` ${unit}` : "";
  return `**${mean}${u}** (${min}–${max} ±${stdDev})`;
}

/**
 * Traffic-light emoji based on the mean score (0–1 scale).
 * Thresholds: https://developer.chrome.com/docs/lighthouse/performance/performance-scoring#color-coding
 */
export function scoreEmoji(meanScore: number): string {
  const pct = meanScore * 100;
  if (pct >= 90) return "🟢";
  if (pct >= 50) return "🟠";
  return "🔴";
}

export function cruxEmoji(category: string): string {
  switch (category) {
    case "FAST":
      return "🟢";
    case "AVERAGE":
      return "🟠";
    case "SLOW":
      return "🔴";
    default:
      return "⚪";
  }
}

export function cruxLabel(key: string): string {
  const labels: Record<string, string> = {
    FIRST_CONTENTFUL_PAINT_MS: "First Contentful Paint (ms)",
    FIRST_INPUT_DELAY_MS: "First Input Delay (ms)",
    LARGEST_CONTENTFUL_PAINT_MS: "Largest Contentful Paint (ms)",
    CUMULATIVE_LAYOUT_SHIFT_SCORE: "Cumulative Layout Shift",
    EXPERIMENTAL_TIME_TO_FIRST_BYTE: "Time to First Byte (ms)",
    INTERACTION_TO_NEXT_PAINT: "Interaction to Next Paint (ms)",
  };
  return labels[key] ?? key;
}
