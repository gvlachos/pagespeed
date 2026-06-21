import { AuditDetails } from "./audit-details.model";

export interface Audit {
  id: string;
  title: string;
  description: string;
  score: number | null; // 0–1, or null for informational
  displayValue?: string; // e.g. "1.2 s"
  numericValue?: number; // raw numeric value when available
  numericUnit?: string; // e.g. "millisecond"
  scoreDisplayMode:
    | "binary"
    | "numeric"
    | "informative"
    | "notApplicable"
    | "error";
  details?: AuditDetails; // per-resource breakdown (opportunity/table types)
}
