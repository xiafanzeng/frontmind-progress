export type MonitoringQuestionCategory = "industry" | "competitor_comparison" | "reputation" | "product_scenario";

/** The question and source revision are snapshots, never live joins to another module. */
export interface MonitoringQuestionSnapshot {
  questionId: string;
  revision: number;
  question: string;
  category: MonitoringQuestionCategory;
  sourceModule: "progress" | "intent";
}
