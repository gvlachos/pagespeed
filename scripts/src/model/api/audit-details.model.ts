import { AuditDetailsItem } from "./audit-details-item.model";

/**
 * The optional details object attached to many audits.
 * We only handle "opportunity" and "table" types in this tool;
 * "list", "criticalrequestchain", and "treemap-data" are noted but ignored.
 */
export interface AuditDetails {
  type:
    | "opportunity"
    | "table"
    | "list"
    | "criticalrequestchain"
    | "treemap-data"
    | string;
  items?: AuditDetailsItem[];
  headings?: Array<{ key: string; label?: string; valueType?: string }>;
  overallSavingsMs?: number;
  overallSavingsBytes?: number;
}
