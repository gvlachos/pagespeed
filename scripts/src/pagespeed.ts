/**
 * Google PageSpeed Insights CLI Tool  —  Multi-run averaging edition
 * ==================================================================
 * Queries the PageSpeed Insights API N times for a given URL,
 * then calculates averages, min, max, and standard deviation for
 * every score and audit metric, saving a single Markdown report.
 *
 * Why average multiple runs?
 *   Lighthouse scores fluctuate between runs due to server load,
 *   CDN cache state, and measurement noise. 3–10 runs give a far
 *   more reliable picture than a single measurement.
 *   Reference: https://web.dev/articles/variability
 *
 * Official API docs:
 *   https://developers.google.com/speed/docs/insights/v5/get-started
 *
 * PageSpeed Insights API reference:
 *   https://developers.google.com/speed/docs/insights/v5/reference/pagespeedapi/runpagespeed
 *
 * Lighthouse scoring guide:
 *   https://developer.chrome.com/docs/lighthouse/performance/performance-scoring
 *
 * Node.js fetch (built-in since Node 18):
 *   https://nodejs.org/en/blog/announcements/v18-release-announce#fetch-api
 *
 * TypeScript handbook:
 *   https://www.typescriptlang.org/docs/handbook/intro.html
 */

import * as path from "path";
import { fetchMultipleRuns } from "./utils/api.utils";
import { buildMarkdown } from "./utils/markdown.utils";
import { deriveFilename, saveReport } from "./utils/file.utils";
import { scoreEmoji } from "./utils/score.utils";

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

/**
 * Parses command-line flags.
 *
 * Usage:
 *   npx ts-node pagespeed.ts --url <URL> [OPTIONS]
 *
 * Options:
 *   --strategy  mobile|desktop   (default: mobile)
 *   --runs      N                number of API calls to average (default: 3)
 *   --delay     milliseconds     pause between successful runs  (default: 3000)
 *   --retries   N                max retries per run on 500/503 (default: 3)
 *   --backoff   milliseconds     starting backoff delay         (default: 5000)
 *   --key       API_KEY          Google API key
 *   --out       directory        output directory               (default: .)
 *
 * Node.js process.argv: https://nodejs.org/api/process.html#processargv
 */
function parseArgs() {
  const args = process.argv.slice(2);

  const get = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const url = get("--url");
  if (!url) {
    console.error(`
❌  Missing required argument: --url

Usage:
  npx ts-node pagespeed.ts --url <URL> [OPTIONS]

Options:
  --strategy  mobile|desktop   (default: mobile)
  --runs      N                number of API calls to average   (default: 3)
  --delay     milliseconds     pause between successful runs    (default: 3000)
  --retries   N                max retries per run on 500/503   (default: 3)
  --backoff   milliseconds     starting retry backoff delay     (default: 5000)
  --key       API_KEY          Google API key
  --out       directory        output directory                 (default: .)

Examples:
  npx ts-node pagespeed.ts --url https://example.com
  npx ts-node pagespeed.ts --url https://example.com --runs 10 --strategy desktop
  npx ts-node pagespeed.ts --url https://example.com --runs 5 --retries 5 --key AIzaSy... --out ./reports
`);
    process.exit(1);
  }

  const rawStrategy = get("--strategy") ?? "mobile";
  if (rawStrategy !== "mobile" && rawStrategy !== "desktop") {
    console.error(
      `❌  --strategy must be "mobile" or "desktop", got: "${rawStrategy}"`,
    );
    process.exit(1);
  }

  const rawRuns = parseInt(get("--runs") ?? "3", 10);
  if (isNaN(rawRuns) || rawRuns < 1) {
    console.error(
      `❌  --runs must be a positive integer, got: "${get("--runs")}"`,
    );
    process.exit(1);
  }

  const rawDelay = parseInt(get("--delay") ?? "3000", 10);
  if (isNaN(rawDelay) || rawDelay < 0) {
    console.error(
      `❌  --delay must be a non-negative integer (ms), got: "${get("--delay")}"`,
    );
    process.exit(1);
  }

  const rawRetries = parseInt(get("--retries") ?? "3", 10);
  if (isNaN(rawRetries) || rawRetries < 0) {
    console.error(
      `❌  --retries must be a non-negative integer, got: "${get("--retries")}"`,
    );
    process.exit(1);
  }

  const rawBackoff = parseInt(get("--backoff") ?? "5000", 10);
  if (isNaN(rawBackoff) || rawBackoff < 0) {
    console.error(
      `❌  --backoff must be a non-negative integer (ms), got: "${get("--backoff")}"`,
    );
    process.exit(1);
  }

  return {
    url,
    strategy: rawStrategy as "mobile" | "desktop",
    runs: rawRuns,
    delayMs: rawDelay,
    maxRetries: rawRetries,
    baseDelayMs: rawBackoff,
    apiKey: get("--key"),
    outputDir: get("--out") ?? ".",
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const {
    url,
    strategy,
    runs,
    delayMs,
    maxRetries,
    baseDelayMs,
    apiKey,
    outputDir,
  } = parseArgs();

  try {
    // Run N times and aggregate. Each run retries automatically on 500/503.
    const report = await fetchMultipleRuns(
      url,
      strategy,
      runs,
      delayMs,
      maxRetries,
      baseDelayMs,
      apiKey,
    );

    // Build and save the Markdown report.
    const markdown = buildMarkdown(report);
    const filename = deriveFilename(url, strategy, runs);
    const savedPath = saveReport(markdown, filename, outputDir);

    console.log(`✅  Report saved to: ${path.resolve(savedPath)}`);
    console.log(`\n📊  Averaged scores (${runs} runs):\n`);

    const categoryOrder = [
      "performance",
      "accessibility",
      "best-practices",
      "seo",
    ];
    for (const key of categoryOrder) {
      const cat = report.categories[key];
      if (!cat) continue;
      const mean = Math.round(cat.score.mean * 100);
      const min = Math.round(cat.score.min * 100);
      const max = Math.round(cat.score.max * 100);
      const stdDev = (cat.score.stdDev * 100).toFixed(1);
      const emoji = scoreEmoji(cat.score.mean);
      console.log(
        `  ${emoji}  ${cat.title.padEnd(20)} avg=${mean}  (${min}–${max} ±${stdDev})`,
      );
    }
  } catch (err) {
    console.error(`\n❌  Error:`, err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
