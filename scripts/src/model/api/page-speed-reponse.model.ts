import { Audit } from "./audit.model";
import { Category } from "./category.model";
import { CruxMetric } from "./crux-metric.model";

/**
 * Subset of the PageSpeed Insights API response we care about.
 * Full schema: https://developers.google.com/speed/docs/insights/v5/reference/pagespeedapi/runpagespeed#response
 */
export interface PageSpeedResponse {
  id: string;
  analysisUTCTimestamp: string;
  lighthouseResult: {
    categories: {
      performance?: Category;
      accessibility?: Category;
      "best-practices"?: Category;
      seo?: Category;
    };
    audits: Record<string, Audit>;
    environment: {
      networkUserAgent: string;
      hostUserAgent: string;
      benchmarkIndex: number;
    };
    configSettings: {
      formFactor: "mobile" | "desktop";
      locale: string;
    };
  };
  loadingExperience?: {
    overall_category?: "FAST" | "AVERAGE" | "SLOW";
    metrics?: Record<string, CruxMetric>;
  };
}
