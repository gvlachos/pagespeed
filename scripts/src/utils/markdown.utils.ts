import { AggregatedReport } from "../model/statistics/aggregate-report.model";
import { AuditStats } from "../model/statistics/audit-stats.model";
import {
  cruxEmoji,
  cruxLabel,
  fmtNumericStats,
  fmtStats,
  scoreEmoji,
} from "./score.utils";

/**
 * Renders a Markdown table for one audit's aggregated details items.
 *
 * Columns included:
 *   - URL / label  (stable string columns, from last run)
 *   - Transfer size  (totalBytes or wastedBytes, in KB)
 *   - Potential savings  (wastedMs in ms, or wastedBytes in KB)
 *   - Any other numeric column present, in its raw unit
 *
 * Numeric values shown are averages across all runs, clearly labelled.
 *
 * Returns an empty string when there are no renderable items or columns.
 */
function renderDetailsTable(audit: AuditStats): string {
  if (!audit.detailsItems || audit.detailsItems.length === 0) return "";

  // Discover which numeric columns are actually present across all items.
  const numericKeys = new Set<string>();
  for (const item of audit.detailsItems) {
    for (const key of Object.keys(item.numericAverages)) {
      // Skip internal Lighthouse keys that aren't meaningful to display.
      if (key === "score" || key === "sourceLocation") continue;
      numericKeys.add(key);
    }
  }

  // If there is nothing to show (no url/label and no numeric columns) skip.
  const hasIdentifier = audit.detailsItems.some((i) => i.url || i.label);
  if (!hasIdentifier && numericKeys.size === 0) return "";

  // ── Column definitions ────────────────────────────────────────────────────
  // Friendly display labels for well-known Lighthouse column keys.
  const colLabel: Record<string, string> = {
    totalBytes: "Transfer size (KB avg)",
    wastedBytes: "Wasted bytes (KB avg)",
    wastedMs: "Wasted time (ms avg)",
    duration: "Duration (ms avg)",
    overallSavingsMs: "Savings (ms avg)",
    startTime: "Start time (ms avg)",
    endTime: "End time (ms avg)",
  };

  // Build ordered column list: url/label first, then known keys, then others.
  const knownOrder = ["totalBytes", "wastedBytes", "wastedMs", "duration"];
  const otherKeys = [...numericKeys]
    .filter((k) => !knownOrder.includes(k))
    .sort();
  const orderedNumericKeys = [
    ...knownOrder.filter((k) => numericKeys.has(k)),
    ...otherKeys,
  ];

  // ── Table header ─────────────────────────────────────────────────────────
  const headerCols: string[] = [];
  if (hasIdentifier) headerCols.push("Resource");
  for (const key of orderedNumericKeys) {
    headerCols.push(colLabel[key] ?? `${key} (avg)`);
  }

  const lines: string[] = [];
  lines.push(`| ${headerCols.join(" | ")} |`);
  lines.push(`| ${headerCols.map(() => "---").join(" | ")} |`);

  // ── Table rows ────────────────────────────────────────────────────────────
  for (const item of audit.detailsItems) {
    const cells: string[] = [];

    if (hasIdentifier) {
      // Prefer url; fall back to label; truncate very long URLs for readability.
      const raw = item.url ?? item.label ?? "—";
      // Strip query strings from URLs to keep the table narrow, but keep the
      // full path so the resource is still identifiable.
      const display = raw.length > 80 ? raw.slice(0, 77) + "…" : raw;
      cells.push(display);
    }

    for (const key of orderedNumericKeys) {
      const avg = item.numericAverages[key];
      if (avg === undefined) {
        cells.push("—");
        continue;
      }

      // Format bytes as KB (2 decimal places); ms as integers.
      if (key.toLowerCase().includes("bytes")) {
        cells.push(`${(avg / 1024).toFixed(2)} KB`);
      } else if (
        key.toLowerCase().includes("ms") ||
        key.toLowerCase().includes("time") ||
        key.toLowerCase().includes("duration")
      ) {
        cells.push(`${Math.round(avg)} ms`);
      } else {
        cells.push(avg.toFixed(2));
      }
    }

    lines.push(`| ${cells.join(" | ")} |`);
  }

  return lines.join("\n");
}

/**
 * Builds the full Markdown report from an AggregatedReport.
 *
 * The report shows:
 *   - mean score  (the headline number)
 *   - min / max   (range of observed values)
 *   - ± std dev   (how consistent the scores were across runs)
 *   - per-run values (raw data, for full transparency)
 *
 * CommonMark Markdown spec: https://commonmark.org/
 */
export function buildMarkdown(report: AggregatedReport): string {
  const startDate = new Date(report.startedAt).toUTCString();
  const endDate = new Date(report.finishedAt).toUTCString();
  const stratLabel =
    report.strategy.charAt(0).toUpperCase() + report.strategy.slice(1);

  const lines: string[] = [];

  // ── Header ────────────────────────────────────────────────────────────────
  lines.push(`# PageSpeed Insights Report — Averaged over ${report.runs} runs`);
  lines.push(``);
  lines.push(`| Field | Value |`);
  lines.push(`|-------|-------|`);
  lines.push(`| **Analysed URL** | ${report.url} |`);
  lines.push(`| **Strategy** | ${stratLabel} |`);
  lines.push(`| **Runs** | ${report.runs} |`);
  lines.push(`| **First run** | ${startDate} |`);
  lines.push(`| **Last run** | ${endDate} |`);
  lines.push(`| **Lighthouse** | ${report.hostUserAgent} |`);
  lines.push(
    `| **Benchmark index** | ${fmtNumericStats(report.benchmarkIndex)} |`,
  );
  lines.push(``);
  lines.push(
    `> **How to read the numbers:** each cell shows **mean** (min–max ±std dev).`,
  );
  lines.push(
    `> A small std dev means consistent scores across runs; a large one suggests`,
  );
  lines.push(
    `> the site's performance is variable. Reference: [Lighthouse score variability](https://web.dev/articles/variability)`,
  );
  lines.push(``);
  lines.push(`---`);
  lines.push(``);

  // ── Category scores ───────────────────────────────────────────────────────
  lines.push(`## Lighthouse Category Scores`);
  lines.push(``);
  lines.push(
    `> Scores are on a 0–100 scale. ` +
      `[Lighthouse scoring guide](https://developer.chrome.com/docs/lighthouse/performance/performance-scoring)`,
  );
  lines.push(``);
  lines.push(`| Category | Mean (min–max ±std dev) | Per-run values |`);
  lines.push(`|----------|------------------------|----------------|`);

  const categoryOrder = [
    "performance",
    "accessibility",
    "best-practices",
    "seo",
  ];
  for (const key of categoryOrder) {
    const cat = report.categories[key];
    if (!cat) continue;

    const emoji = scoreEmoji(cat.score.mean);
    const statStr = fmtStats(cat.score);
    // Show each raw per-run score as a compact list, e.g. "87, 90, 88"
    const perRun = cat.score.values.map((v) => Math.round(v * 100)).join(", ");
    lines.push(`| ${emoji} ${cat.title} | ${statStr} | ${perRun} |`);
  }

  lines.push(``);
  lines.push(`---`);
  lines.push(``);

  // ── Key performance audits ────────────────────────────────────────────────
  lines.push(`## Performance Audits`);
  lines.push(``);
  lines.push(
    `> [Lighthouse audit reference](https://developer.chrome.com/docs/lighthouse/performance/) · ` +
      `[Core Web Vitals](https://web.dev/articles/vitals)`,
  );
  lines.push(``);

  // The audits most important for performance, in priority order.
  const keyAudits = [
    "first-contentful-paint",
    "largest-contentful-paint",
    "total-blocking-time",
    "cumulative-layout-shift",
    "speed-index",
    "interactive",
    "server-response-time",
    "render-blocking-resources",
    "uses-optimized-images",
    "uses-webp-images",
    "uses-text-compression",
    "unused-javascript",
    "unused-css-rules",
    "efficient-animated-content",
  ];

  lines.push(
    `| Audit | Score (mean) | Numeric value (mean) | Per-run scores |`,
  );
  lines.push(`|-------|:------------:|---------------------|----------------|`);

  for (const id of keyAudits) {
    const audit = report.audits[id];
    if (!audit || audit.scoreDisplayMode === "notApplicable") continue;

    const isBinary = audit.scoreDisplayMode === "binary";
    const isInformative = audit.scoreDisplayMode === "informative";
    const emoji = audit.score ? scoreEmoji(audit.score.mean) : "⚪";

    // Score column: show mean±stddev for numeric, PASS/FAIL for binary,
    // "Diagnostic" for informative (no real score exists).
    let scoreStr: string;
    if (isInformative || audit.score === null) {
      scoreStr = "ℹ️ Diagnostic";
    } else if (isBinary) {
      const label = audit.score.mean >= 0.5 ? "✔ PASS" : "✘ FAIL";
      scoreStr = `${emoji} ${label}`;
    } else {
      scoreStr = `${emoji} ${fmtStats(audit.score)}`;
    }

    // Numeric value column: prefer averaged numericValue, fallback to
    // last run's displayValue string, then "—".
    const numStr = audit.numericValue
      ? fmtNumericStats(audit.numericValue, audit.numericUnit)
      : (audit.lastDisplayValue ?? "—");

    // Per-run column: 0–100 for numeric, PASS/FAIL for binary, "—" for diagnostic.
    let perRun: string;
    if (isInformative || audit.score === null) {
      perRun = "—";
    } else if (isBinary) {
      perRun = audit.score.values.map((v) => (v >= 0.5 ? "✔" : "✘")).join(", ");
    } else {
      perRun = audit.score.values.map((v) => Math.round(v * 100)).join(", ");
    }

    lines.push(`| ${audit.title} | ${scoreStr} | ${numStr} | ${perRun} |`);
  }

  lines.push(``);

  // For key audits that failed and carry details, render a per-resource
  // breakdown directly below the summary table.
  const keyAuditsWithDetails = keyAudits
    .map((id) => {
      const result = report.audits[id];
      return result;
    })
    .filter(
      (a) =>
        !!a &&
        a.scoreDisplayMode !== "notApplicable" &&
        a.scoreDisplayMode !== "informative" &&
        a.score !== null &&
        a.score.mean < 0.9 &&
        !!(a.detailsItems && a.detailsItems.length > 0),
    );

  if (keyAuditsWithDetails.length > 0) {
    for (const audit of keyAuditsWithDetails) {
      const detailsTable = renderDetailsTable(audit);
      if (detailsTable) {
        lines.push(
          `**${audit.title} — per-resource breakdown** *(averaged across ${report.runs} runs)*`,
        );
        lines.push(``);
        lines.push(detailsTable);
        lines.push(``);
      }
    }
  }

  lines.push(`---`);
  lines.push(``);

  // ── Opportunities & diagnostics ───────────────────────────────────────────
  lines.push(`## Opportunities & Diagnostics`);
  lines.push(``);
  lines.push(
    `Audits with a **mean score below 0.9** that are not purely informational, ` +
      `excluding those already listed above.`,
  );
  lines.push(``);

  // ── Opportunities (scored audits that failed) ─────────────────────────────
  // Audits with a real 0–1 score where the mean is below 0.9,
  // excluding the key audits already shown in the performance table above.
  //
  // scoreDisplayMode values and what they mean:
  //   "numeric"  — 0–1 continuous score (e.g. LCP, TBT). Show mean ± stddev.
  //   "binary"   — pass (1) or fail (0). Showing "0 (0–0 ±0.0)" is misleading;
  //                show PASS/FAIL and displayValue instead.
  //   "informative" — no score, diagnostic data only. Handled separately below.
  //   "notApplicable" / "error" — audit did not run. Skip entirely.
  //
  // Reference:
  // https://github.com/GoogleChrome/lighthouse/blob/main/docs/understanding-results.md#audit-properties
  const opportunities = Object.values(report.audits).filter(
    (a) =>
      a.scoreDisplayMode !== "informative" &&
      a.scoreDisplayMode !== "notApplicable" &&
      a.scoreDisplayMode !== "error" &&
      a.score !== null &&
      a.score.mean < 0.9 &&
      !keyAudits.includes(a.id),
  );

  if (opportunities.length === 0) {
    lines.push(`✅ No additional scored opportunities found.`);
  } else {
    for (const audit of opportunities) {
      const isBinary = audit.scoreDisplayMode === "binary";
      const meanScore = audit.score ? audit.score.mean : null;
      const emoji = meanScore !== null ? scoreEmoji(meanScore) : "⚪";

      lines.push(`### ${emoji} ${audit.title}`);
      lines.push(``);

      if (isBinary) {
        // Binary audits are either pass or fail — showing "0 (0–0 ±0.0)"
        // is meaningless. Show FAIL/PASS per run instead.
        if (audit.score) {
          const perRun = audit.score.values
            .map((v) => (v >= 0.5 ? "✔ PASS" : "✘ FAIL"))
            .join(", ");
          lines.push(`**Result per run:** ${perRun}`);
          lines.push(``);
        }
      } else {
        // Numeric audit — score statistics are meaningful.
        if (audit.score) {
          const perRun = audit.score.values
            .map((v) => Math.round(v * 100))
            .join(", ");
          lines.push(
            `**Mean score:** ${fmtStats(audit.score)} | **Per run:** ${perRun}`,
          );
          lines.push(``);
        }
      }

      // For both modes, the displayValue / numericValue carry the most
      // actionable information (e.g. "Potential savings of 540 ms").
      if (audit.numericValue) {
        lines.push(
          `**Measured value:** ${fmtNumericStats(audit.numericValue, audit.numericUnit)}`,
        );
        lines.push(``);
      } else if (audit.lastDisplayValue) {
        lines.push(`**Last run value:** ${audit.lastDisplayValue}`);
        lines.push(``);
      }

      lines.push(audit.description.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"));
      lines.push(``);

      // If this audit has per-resource details (opportunity or table type),
      // render an averaged breakdown table so the developer can see which
      // specific resources are responsible for the failure.
      const detailsTable = renderDetailsTable(audit);
      if (detailsTable) {
        lines.push(
          `**Per-resource breakdown** *(numeric values averaged across ${report.runs} runs)*`,
        );
        lines.push(``);
        lines.push(detailsTable);
        lines.push(``);
      }
    }
  }

  lines.push(`---`);
  lines.push(``);

  // ── Informative diagnostics ───────────────────────────────────────────────
  // These audits have scoreDisplayMode = "informative". Lighthouse sets their
  // score field to 0 as a placeholder — it does NOT mean the site failed.
  // Their real data lives in displayValue (a human-readable string) and
  // numericValue (a raw number). We render those instead of any score.
  //
  // Examples: "Minimize main-thread work", "Forced reflow",
  //           "Render-blocking requests", "Missing source maps".
  //
  // Reference:
  // https://github.com/GoogleChrome/lighthouse/blob/main/docs/understanding-results.md#audit-properties
  lines.push(`## Informative Diagnostics`);
  lines.push(``);
  lines.push(
    `> These audits report **diagnostic data only** — they have no pass/fail score.` +
      ` Lighthouse sets their score field to \`0\` as a placeholder, which does not mean the site failed.` +
      ` The meaningful data is in the measured values below.`,
  );
  lines.push(``);

  const diagnostics = Object.values(report.audits).filter(
    (a) =>
      a.scoreDisplayMode === "informative" &&
      // Only show diagnostics that have something useful to display.
      (a.numericValue !== null || a.lastDisplayValue),
  );

  if (diagnostics.length === 0) {
    lines.push(`✅ No informative diagnostics returned for this page.`);
  } else {
    for (const audit of diagnostics) {
      lines.push(`### ℹ️ ${audit.title}`);
      lines.push(``);

      // Show averaged numeric value if available (e.g. main-thread ms).
      if (audit.numericValue) {
        lines.push(
          `**Measured value (avg):** ${fmtNumericStats(audit.numericValue, audit.numericUnit)}`,
        );
        lines.push(``);
      } else if (audit.lastDisplayValue) {
        // Fall back to the raw display string from the last run when there is
        // no numeric value to average (e.g. a list of affected resources).
        lines.push(`**Last run value:** ${audit.lastDisplayValue}`);
        lines.push(``);
      }

      lines.push(audit.description.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"));
      lines.push(``);
    }
  }

  lines.push(`---`);
  lines.push(``);

  // ── Chrome UX Report (CrUX) field data ───────────────────────────────────
  // CrUX reflects real-user measurements aggregated by Google over a 28-day
  // rolling window. Unlike Lighthouse lab data, it is not affected by run
  // noise — the same value is returned on every API call for a given URL.
  // We therefore show it once from the last run rather than averaging.
  //
  // The loadingExperience object may be absent if the URL does not have
  // enough real-user traffic for Google to publish data for it.
  //
  // Reference: https://developer.chrome.com/docs/crux
  lines.push(`## Chrome UX Report — Real-User Field Data`);
  lines.push(``);
  lines.push(
    `> CrUX data reflects **real users** measured over a 28-day rolling window, ` +
      `not a Lighthouse lab run. It is stable between API calls and is shown ` +
      `from a single run. May be absent for URLs with insufficient traffic. ` +
      `[Learn more](https://developer.chrome.com/docs/crux)`,
  );
  lines.push(``);

  if (!report.loadingExperience?.metrics) {
    lines.push(
      `⚪ No CrUX field data available for this URL. ` +
        `This usually means the URL does not have enough real-user traffic ` +
        `for Google to publish aggregated measurements.`,
    );
  } else {
    const le = report.loadingExperience!;
    const metrics = le.metrics!;
    if (le.overall_category) {
      const overallEmoji = cruxEmoji(le.overall_category);
      lines.push(
        `**Overall field data rating:** ${overallEmoji} ${le.overall_category}`,
      );
      lines.push(``);
    }

    lines.push(`| Metric | Percentile | Rating |`);
    lines.push(`|--------|:----------:|--------|`);

    for (const [key, metric] of Object.entries(metrics)) {
      const label = cruxLabel(key);
      const emoji = cruxEmoji(metric.category);
      lines.push(
        `| ${label} | ${metric.percentile.toLocaleString()} | ${emoji} ${metric.category} |`,
      );
    }
  }

  lines.push(``);
  lines.push(`---`);
  lines.push(``);

  // ── Resources ─────────────────────────────────────────────────────────────
  lines.push(`## Resources`);
  lines.push(``);
  lines.push(
    `- [PageSpeed Insights](https://pagespeed.web.dev/) – run analyses in the browser`,
  );
  lines.push(
    `- [PageSpeed Insights API](https://developers.google.com/speed/docs/insights/v5/get-started) – official API docs`,
  );
  lines.push(
    `- [web.dev – Core Web Vitals](https://web.dev/articles/vitals) – LCP, FID/INP, CLS explained`,
  );
  lines.push(
    `- [Lighthouse performance scoring](https://developer.chrome.com/docs/lighthouse/performance/performance-scoring) – how scores are calculated`,
  );
  lines.push(
    `- [Lighthouse score variability](https://web.dev/articles/variability) – why scores differ between runs`,
  );
  lines.push(
    `- [Chrome UX Report (CrUX)](https://developer.chrome.com/docs/crux) – real-user field data`,
  );
  lines.push(``);
  lines.push(`*Report generated by [pagespeed.ts](./pagespeed.ts)*`);

  return lines.join("\n");
}
