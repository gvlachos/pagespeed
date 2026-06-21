import { Stats } from "./stats.model";

/** Aggregated category scores across N runs. */
export interface CategoryStats {
  id: string;
  title: string;
  score: Stats; // score is 0–1; multiply by 100 for display
}
