/**
 * A single row inside an audit's details table.
 * Columns vary by audit type — we keep all keys and inspect at runtime.
 * Common keys: url, label, totalBytes, wastedMs, wastedBytes, duration.
 * Reference: https://github.com/GoogleChrome/lighthouse/blob/main/docs/understanding-results.md#audit-details
 */
export interface AuditDetailsItem {
  url?: string;
  label?: string;
  totalBytes?: number;
  wastedBytes?: number;
  wastedMs?: number;
  duration?: number;
  // Allow any other numeric or string columns the API may return.
  [key: string]: number | string | boolean | undefined | null | object;
}
