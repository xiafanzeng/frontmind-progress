import type { MonitoringQuestionCategory, MonitoringQuestionSnapshot } from "../contracts/questions";

export class MonitoringQuestionInputError extends Error {}

/** Host-authorized imports are optional. Manual input never creates an intent record. */
export function monitoringQuestionSnapshots(input: {
  imported: Array<Omit<MonitoringQuestionSnapshot, "sourceModule">>;
  customQuestions: string[];
  categories: Record<string, MonitoringQuestionCategory>;
  manualQuestionId: (text: string) => string;
}): MonitoringQuestionSnapshot[] {
  const byText = new Map<string, MonitoringQuestionSnapshot>();
  for (const imported of input.imported) {
    const question = imported.question.trim();
    if (!question) throw new MonitoringQuestionInputError("来源问题为空，请刷新后重试");
    const prior = byText.get(question);
    if (prior && prior.category !== imported.category) {
      throw new MonitoringQuestionInputError("同一个问题的来源类型不一致，请先确认问题类型");
    }
    byText.set(question, { ...imported, question, sourceModule: "intent" });
  }
  for (const text of input.customQuestions) {
    const question = text.trim();
    if (!question) continue;
    const category = input.categories[question];
    if (!category) throw new MonitoringQuestionInputError("请为每个新问题选择类型");
    const prior = byText.get(question);
    if (prior) {
      if (prior.category !== category) {
        throw new MonitoringQuestionInputError("该问题已存在，请沿用来源问题的类型");
      }
      continue;
    }
    byText.set(question, {
      questionId: input.manualQuestionId(question), revision: 1,
      question, category, sourceModule: "progress",
    });
  }
  if (!byText.size) throw new MonitoringQuestionInputError("请选择或输入至少一个要监控的问题");
  return [...byText.values()];
}
