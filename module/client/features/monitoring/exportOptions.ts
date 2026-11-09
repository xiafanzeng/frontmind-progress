export const EXPORT_OPTIONS = [
  { id: "answers", label: "问答明细", format: "Excel", description: "完整回答、思考过程与执行记录", sheets: "问答明细 · 执行记录 · 导出说明" },
  { id: "screenshots", label: "截图", format: "ZIP", description: "按时间、模型和问题命名的原始截图", sheets: "截图图片 · 截图清单.xlsx" },
  { id: "sources", label: "信源分析", format: "Excel", description: "引用明细、检索信源与域名统计", sheets: "引用明细 · 检索信源 · 域名统计 · 搜索词 · 导出说明" },
  { id: "sentiment", label: "情感分析", format: "Excel", description: "情感分布、逐条标签与评价词", sheets: "情感概览 · 回答情感 · 评价词 · 导出说明" },
] as const;
export type ExportKind = typeof EXPORT_OPTIONS[number]["id"];
