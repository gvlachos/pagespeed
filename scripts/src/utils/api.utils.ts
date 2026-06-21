import { Audit } from "../model/api/audit.model";
import { Category } from "../model/api/category.model";
import { PageSpeedResponse } from "../model/api/page-speed-reponse.model";
import { AggregatedReport } from "../model/statistics/aggregate-report.model";
import { AuditDetailsItemStats } from "../model/statistics/audit-details-items-stats.model";
import { AuditStats } from "../model/statistics/audit-stats.model";
import { CategoryStats } from "../model/statistics/category-stats.model";
import { calcStats } from "./stats.utls";

/**
 * Fetches PageSpeed Insights data for one URL and one run.
 *
 * This is the raw HTTP call. It throws on any non-2xx response so that
 * fetchWithRetry() above it can decide whether to retry or give up.
 *
 * @param targetUrl  The URL to analyse
 * @param strategy   "mobile" or "desktop"
 * @param apiKey     Optional Google API key
 *
 * API key guide: https://developers.google.com/speed/docs/insights/v5/get-started#key
 */
async function fetchPageSpeed(
  targetUrl: string,
  strategy: "mobile" | "desktop",
  apiKey?: string,
): Promise<PageSpeedResponse> {
  // Build query params — each category must be appended separately.
  // URLSearchParams.append() docs:
  // https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams/append
  const params = new URLSearchParams({ url: targetUrl, strategy });
  for (const cat of ["performance", "accessibility", "best-practices", "seo"]) {
    params.append("category", cat);
  }
  if (apiKey) params.set("key", apiKey);

  const endpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`;
  const response = await fetch(endpoint);

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    // Attach the HTTP status code to the error so fetchWithRetry() can
    // inspect it and decide whether the error is worth retrying.
    const err = new Error(
      `PageSpeed API error ${response.status}: ${JSON.stringify(errorBody)}`,
    ) as Error & { statusCode: number };
    err.statusCode = response.status;
    throw err;
  }

  return response.json() as Promise<PageSpeedResponse>;
}

/**
 * Wraps fetchPageSpeed() with exponential-backoff retry logic.
 *
 * WHY RETRY?
 *   The PageSpeed Insights API returns HTTP 500 when Google's internal
 *   Lighthouse runner crashes or times out on the target page. This is
 *   almost always transient — the same URL succeeds on the next attempt.
 *   Common causes: slow page loads, CDN cold starts, JS errors in headless
 *   Chrome, or transient overload on Google's Lighthouse worker fleet.
 *
 * WHICH ERRORS ARE RETRIED?
 *   - HTTP 500 (Internal Server Error)  — Lighthouse crash / timeout
 *   - HTTP 503 (Service Unavailable)    — Google API overloaded
 *   - HTTP 429 (Too Many Requests)      — rate limited (back off and retry)
 *   - Network errors (fetch() throws)   — transient connectivity issues
 *
 *   HTTP 400 (Bad Request) is NOT retried — it means the URL or parameters
 *   are invalid, which will not fix itself by waiting.
 *
 *   HTTP 403 (Forbidden) is NOT retried — bad API key or quota exhausted,
 *   both of which require human intervention.
 *
 * EXPONENTIAL BACKOFF WITH JITTER
 *   Each retry waits longer than the last:
 *     attempt 1 → wait baseDelayMs        (e.g.  5 000 ms)
 *     attempt 2 → wait baseDelayMs × 2    (e.g. 10 000 ms)
 *     attempt 3 → wait baseDelayMs × 4    (e.g. 20 000 ms)
 *
 *   Jitter adds a small random offset (±20% of the delay) so that multiple
 *   parallel batch runs don't all retry at exactly the same moment and
 *   amplify the load on the API.
 *
 *   Reference: https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
 *
 * @param targetUrl    URL to analyse
 * @param strategy     "mobile" or "desktop"
 * @param maxRetries   Max number of EXTRA attempts after the first failure (default 3)
 * @param baseDelayMs  Starting backoff delay in ms (default 5000)
 * @param apiKey       Optional Google API key
 */
async function fetchWithRetry(
  targetUrl: string,
  strategy: "mobile" | "desktop",
  maxRetries: number = 3,
  baseDelayMs: number = 5000,
  apiKey?: string,
): Promise<PageSpeedResponse> {
  // Total attempts = 1 initial + maxRetries.
  // e.g. maxRetries=3 → up to 4 attempts total.
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    const isFirstAttempt = attempt === 1;
    const isLastAttempt = attempt === maxRetries + 1;

    if (!isFirstAttempt) {
      // Calculate the exponential backoff delay for this retry.
      // Math.pow(2, attempt - 2) gives: 1, 2, 4, 8, ... for attempts 2, 3, 4, 5
      const exponentialDelay = baseDelayMs * Math.pow(2, attempt - 2);

      // Add jitter: a random value in the range [-20%, +20%] of the delay.
      // Math.random() returns a float in [0, 1).
      // (Math.random() - 0.5) gives [-0.5, 0.5).
      // Multiplying by 0.4 gives [-0.2, 0.2) — i.e. ±20%.
      const jitter = exponentialDelay * (Math.random() - 0.5) * 0.4;
      const waitMs = Math.round(exponentialDelay + jitter);

      console.log(
        `  ⚠️   Attempt ${attempt - 1} failed. ` +
          `Retrying in ${(waitMs / 1000).toFixed(1)}s ` +
          `(attempt ${attempt}/${maxRetries + 1})...`,
      );

      // Promise-based sleep — avoids blocking the Node.js event loop.
      // setTimeout reference: https://developer.mozilla.org/en-US/docs/Web/API/setTimeout
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    try {
      const result = await fetchPageSpeed(targetUrl, strategy, apiKey);

      // Success — if this was a retry, note it so the caller can see it worked.
      if (!isFirstAttempt) {
        console.log(`  ✅  Retry ${attempt - 1} succeeded.`);
      }
      return result;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const statusCode = (err as { statusCode?: number }).statusCode;

      // Classify the error to decide whether it is worth retrying.
      const isRetryable =
        statusCode === 500 || // Lighthouse crash
        statusCode === 503 || // API overloaded
        statusCode === 429 || // rate limited
        statusCode === undefined; // network error (fetch() threw without a status)

      // Log what happened on this attempt.
      console.log(
        `  ❌  Attempt ${attempt} failed` +
          (statusCode ? ` (HTTP ${statusCode})` : ` (network error)`) +
          `: ${lastError.message.slice(0, 120)}`,
      );

      if (!isRetryable) {
        // Non-retryable error (e.g. 400 Bad Request, 403 Forbidden).
        // Fail immediately — no point waiting and trying again.
        console.log(`  ⛔  HTTP ${statusCode} is not retryable. Giving up.`);
        throw lastError;
      }

      if (isLastAttempt) {
        // Exhausted all retries.
        console.log(`  ⛔  All ${maxRetries + 1} attempts failed. Giving up.`);
        throw lastError;
      }

      // Otherwise fall through to the next loop iteration, which will wait
      // and then try again.
    }
  }

  // TypeScript requires a return/throw here, but the loop above always
  // either returns or throws before reaching this point.
  throw lastError ?? new Error("fetchWithRetry: unexpected exit");
}

/**
 * Runs fetchWithRetry() N times sequentially with a configurable delay between
 * successful runs, then aggregates all results into an AggregatedReport.
 *
 * Sequential (not parallel) to avoid hitting API rate limits.
 * Rate limit reference: https://developers.google.com/speed/docs/insights/v5/get-started#quota
 *
 * @param targetUrl    URL to analyse
 * @param strategy     "mobile" or "desktop"
 * @param runs         Number of times to call the API (for averaging)
 * @param delayMs      Milliseconds to wait between successful runs (default 3000)
 * @param maxRetries   Max retries per run on transient failures (default 3)
 * @param baseDelayMs  Starting backoff delay for retries in ms (default 5000)
 * @param apiKey       Optional Google API key
 */
export async function fetchMultipleRuns(
  targetUrl: string,
  strategy: "mobile" | "desktop",
  runs: number,
  delayMs: number = 3000,
  maxRetries: number = 3,
  baseDelayMs: number = 5000,
  apiKey?: string,
): Promise<AggregatedReport> {
  // Accumulators: maps from category/audit id → array of per-run values.
  // We use Map<string, number[]> so we can push values as we go.
  const categoryScores = new Map<string, { title: string; values: number[] }>();
  const auditScores = new Map<string, number[]>();
  const auditNumerics = new Map<string, number[]>();
  const benchmarkValues: number[] = [];

  /**
   * Accumulates per-run numeric columns for each details item, keyed by
   * audit id → item index → column name → array of per-run values.
   * We use item index (not URL) as the primary key because some items lack URLs.
   * URLs and labels are captured from the last run only (stable across runs).
   */
  const auditDetailsNumerics = new Map<
    string, // audit id
    Map<number, Record<string, number[]>> // item index → column → values
  >();

  // Metadata captured on the first run.
  let firstTimestamp = "";
  let lastTimestamp = "";
  let hostUserAgent = "";
  let urlCanonical = targetUrl;

  // Keep the last full audit map so we can copy titles, descriptions, etc.
  let lastAudits: Record<string, Audit> = {};
  let lastCategories: Record<string, Category> = {};
  // CrUX field data — stable across runs, so we only need the last value.
  let lastLoadingExperience: PageSpeedResponse["loadingExperience"] | undefined;

  console.log(`\n🔁  Starting ${runs} run(s) for [${strategy}]: ${targetUrl}`);
  console.log(
    `    (up to ${maxRetries} retr${maxRetries === 1 ? "y" : "ies"} per run on transient errors)\n`,
  );

  for (let i = 1; i <= runs; i++) {
    console.log(`  Run ${i}/${runs}...`);

    // fetchWithRetry replaces the bare fetchPageSpeed call — it handles
    // transient 500/503/429 errors automatically before throwing to us.
    const data = await fetchWithRetry(
      targetUrl,
      strategy,
      maxRetries,
      baseDelayMs,
      apiKey,
    );
    const lhr = data.lighthouseResult;

    // Capture metadata.
    if (i === 1) {
      firstTimestamp = data.analysisUTCTimestamp;
      hostUserAgent = lhr.environment.hostUserAgent;
      urlCanonical = data.id;
    }
    lastTimestamp = data.analysisUTCTimestamp;
    lastAudits = lhr.audits;
    lastLoadingExperience = data.loadingExperience;

    // Accumulate benchmark index (varies slightly between runs).
    benchmarkValues.push(lhr.environment.benchmarkIndex);

    // Accumulate category scores.
    for (const [key, cat] of Object.entries(lhr.categories)) {
      if (!cat || cat.score === null) continue;
      if (!categoryScores.has(key)) {
        categoryScores.set(key, { title: cat.title, values: [] });
      }
      categoryScores.get(key)!.values.push(cat.score);
    }
    // Keep a reference to category objects for metadata.
    lastCategories = lhr.categories as Record<string, Category>;

    // Accumulate audit scores and numeric values.
    for (const [id, audit] of Object.entries(lhr.audits)) {
      // IMPORTANT: skip informative audits when accumulating scores.
      //
      // Lighthouse sets score = 0 for informative-mode audits as a placeholder,
      // NOT as a real failure. Accumulating those zeros produces misleading
      // statistics like "Mean score: 0 (0–0 ±0.0)".
      //
      // Informative audits carry their real data in displayValue / numericValue,
      // not in score. We still accumulate numericValue below so the averages
      // for values like "main-thread time" are correct.
      //
      // scoreDisplayMode reference:
      // https://github.com/GoogleChrome/lighthouse/blob/main/docs/understanding-results.md#audit-properties
      const isInformative =
        audit.scoreDisplayMode === "informative" ||
        audit.scoreDisplayMode === "notApplicable" ||
        audit.scoreDisplayMode === "error";

      if (audit.score !== null && !isInformative) {
        if (!auditScores.has(id)) auditScores.set(id, []);
        auditScores.get(id)!.push(audit.score);
      }
      if (audit.numericValue !== undefined) {
        if (!auditNumerics.has(id)) auditNumerics.set(id, []);
        auditNumerics.get(id)!.push(audit.numericValue);
      }

      // Accumulate numeric columns from details items (opportunity/table only).
      // We average numeric columns (bytes, ms) and carry string columns from
      // the last run. Indexed by item position so that matching works even
      // when individual items lack a URL.
      if (
        audit.details &&
        (audit.details.type === "opportunity" ||
          audit.details.type === "table") &&
        Array.isArray(audit.details.items)
      ) {
        if (!auditDetailsNumerics.has(id)) {
          auditDetailsNumerics.set(id, new Map());
        }
        const itemMap = auditDetailsNumerics.get(id)!;

        for (let itemIdx = 0; itemIdx < audit.details.items.length; itemIdx++) {
          const item = audit.details.items[itemIdx];
          if (!itemMap.has(itemIdx)) itemMap.set(itemIdx, {});
          const cols = itemMap.get(itemIdx)!;

          for (const [key, value] of Object.entries(item)) {
            if (typeof value === "number") {
              if (!cols[key]) cols[key] = [];
              cols[key].push(value);
            }
          }
        }
      }
    }

    // Wait between runs — except after the last one.
    if (i < runs) {
      process.stdout.write(
        `  ⏳  Waiting ${delayMs / 1000}s before next run...\n`,
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  console.log(`\n  ✅  All ${runs} run(s) complete. Aggregating results...\n`);

  // ── Build aggregated categories ──────────────────────────────────────────
  const categories: Record<string, CategoryStats> = {};
  for (const [id, { title, values }] of categoryScores) {
    categories[id] = { id, title, score: calcStats(values) };
  }

  // ── Build aggregated audits ──────────────────────────────────────────────
  const audits: Record<string, AuditStats> = {};
  for (const [id, audit] of Object.entries(lastAudits)) {
    const scoreValues = auditScores.get(id);
    const numericValues = auditNumerics.get(id);

    // ── Aggregate details items ──────────────────────────────────────────
    // For each item position, average every numeric column across runs and
    // carry stable string columns (url, label) from the last run.
    let detailsType: string | undefined;
    let detailsItems: AuditDetailsItemStats[] | undefined;

    const itemMap = auditDetailsNumerics.get(id);
    if (
      itemMap &&
      audit.details &&
      (audit.details.type === "opportunity" ||
        audit.details.type === "table") &&
      Array.isArray(audit.details.items)
    ) {
      detailsType = audit.details.type;
      detailsItems = audit.details.items.map((lastItem, idx) => {
        const cols = itemMap.get(idx) ?? {};

        // Average each numeric column across all runs.
        const numericAverages: Record<string, number> = {};
        for (const [key, values] of Object.entries(cols)) {
          if (values.length > 0) {
            numericAverages[key] =
              values.reduce((a: number, b: number) => a + b, 0) / values.length;
          }
        }

        return {
          url: typeof lastItem.url === "string" ? lastItem.url : undefined,
          label:
            typeof lastItem.label === "string" ? lastItem.label : undefined,
          numericAverages,
        };
      });
    }

    audits[id] = {
      id,
      title: audit.title,
      description: audit.description,
      scoreDisplayMode: audit.scoreDisplayMode,
      score: scoreValues ? calcStats(scoreValues) : null,
      numericValue: numericValues ? calcStats(numericValues) : null,
      numericUnit: audit.numericUnit,
      lastDisplayValue: audit.displayValue,
      detailsType,
      detailsItems,
    };
  }

  return {
    url: urlCanonical,
    strategy,
    runs,
    startedAt: firstTimestamp,
    finishedAt: lastTimestamp,
    hostUserAgent,
    benchmarkIndex: calcStats(benchmarkValues),
    categories,
    audits,
    loadingExperience: lastLoadingExperience,
  };
}
