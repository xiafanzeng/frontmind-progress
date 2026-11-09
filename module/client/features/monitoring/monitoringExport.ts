import JSZip from "jszip";
import type { TRPCClient } from "@trpc/client";
import type { ProgressRouter } from "../../../server/client-router";
import type { MonitoringScope } from "@frontmind/monitoring-contracts";
import type { MonitoringAnswerDetail, MonitoringAnswerListItem } from "./useMonitoringDataSource";
import { monitoringAnswerMatchesScope } from "./useMonitoringDataSource";
import { exportWorkbook, type ExportCell, type ExportSheet } from "./exportWorkbook";
import { groupKeywordEvaluations } from "./sentimentInsights";

import { EXPORT_OPTIONS, type ExportKind } from "./exportOptions";
export type ExportFile = { kind: ExportKind; name: string; blob: Blob; warning?: string };
type ExportData = { items: MonitoringAnswerListItem[]; details: MonitoringAnswerDetail[] };
export type ExportContext = { scope: MonitoringScope; timezone: string; question: string; from: string; to: string; mediaBase: string; headers: Record<string, string> };
const tone = { positive: "正面", neutral: "中性", negative: "负面", unknown: "标签缺失" };
const archive = { archived: "已归档", pending: "归档中", failed: "归档失败", not_applicable: "不适用" };
const safeName = (value: string, length = 50) => Array.from(value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/[. ]+$/g, "")).slice(0, length).join("") || "监控问题";
const checkAbort = (signal: AbortSignal) => { if (signal.aborted) throw new DOMException("已取消导出", "AbortError"); };
const platform = (item: MonitoringAnswerListItem | MonitoringAnswerDetail) => `${item.platform.displayName}（${item.platform.clientType === "mobile" ? "移动端" : "网页版"}）`;
const dateTime = (value: string | Date, timezone: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(new Date(value));
const identity = (item: MonitoringAnswerDetail, context: ExportContext): ExportCell[] => [item.answerId, dateTime(item.runCreatedAt, context.timezone), item.question, platform(item), item.repetition];
const identityHeaders = ["回答 ID", "执行时间", "问题", "模型", "提问序号"];

/** Read every cursor page rather than exporting just the visible page. No mutations/providers. */
export async function collectExportData(client: TRPCClient<ProgressRouter>, context: ExportContext, signal: AbortSignal, progress: (value: string) => void): Promise<ExportData> {
  const items: MonitoringAnswerListItem[] = [];
  const seen = new Set<string>();
  const cursors = new Set<string>();
  let cursor: string | undefined;
  do {
    checkAbort(signal);
    progress(`正在读取执行记录（${items.length} 条）…`);
    const page = await client.monitoring.answers.list.query({ scope: context.scope, limit: 50, cursor }, { signal });
    for (const item of page.items) {
      if (!seen.has(item.answerId)) { seen.add(item.answerId); items.push(item); }
    }
    if (items.length > 2_000) throw new Error("当前范围超过 2,000 条执行记录，请缩小日期范围后导出。");
    cursor = page.nextCursor || undefined;
    if (cursor && cursors.has(cursor)) throw new Error("读取分页时遇到重复游标，请重试。");
    if (cursor) cursors.add(cursor);
  } while (cursor);
  const answered = items.filter(item => item.result);
  if (!answered.length) throw new Error("当前范围没有可导出的回答。");
  const details: MonitoringAnswerDetail[] = [];
  // Small sequential batches limit load and allow immediate cancellation.
  for (let index = 0; index < answered.length; index += 4) {
    checkAbort(signal);
    progress(`正在整理回答 ${Math.min(index + 4, answered.length)} / ${answered.length}…`);
    const batch = await Promise.all(answered.slice(index, index + 4).map(item => client.monitoring.answers.get.query({ monitorId: context.scope.monitorId, answerId: item.answerId, subject: context.scope.subject }, { signal })));
    batch.forEach(detail => {
      if (!monitoringAnswerMatchesScope(detail, { from: context.scope.from.toISOString(), to: context.scope.to.toISOString() }, context.scope)) throw new Error("回答范围已发生变化，请关闭导出窗口后重试。");
      details.push(detail);
    });
  }
  return { items, details };
}

function notes(data: ExportData, context: ExportContext, extra: ExportCell[][] = []): ExportSheet {
  return { name: "导出说明", rows: [["项目", "内容"], ["监控问题", context.question], ["日期（含首尾）", `${context.from} 至 ${context.to}`], ["时区", context.timezone], ["监控 ID", context.scope.monitorId], ["问题 ID", context.scope.questionId], ["模型 ID", context.scope.platformId || "全部模型"], ["分析主体", context.scope.subject.kind === "self" ? "主品牌" : context.scope.subject.name], ["执行记录数", data.items.length], ["已有回答数", data.details.length], ["导出时间", dateTime(new Date(), context.timezone)], ["数据口径", "仅整理已有结果，不重新执行监控或情感分析。导出期间数据仍可能更新，并非数据库事务快照。"], ["历史品牌", "逐条数据保留历史分析品牌；与当前主体不匹配的回答不计入情感概览。"], ["长文本", "单元格超过 30,000 字符时按原顺序续行，短字段重复；超长内容列可按行顺序拼接。XML 不支持的控制字符会移除。"], ["空值", "缺失数据留空，不以 0 或中性替代。"], ...extra] };
}
function answerSheets(data: ExportData, context: ExportContext): ExportSheet[] {
  return [
    { name: "问答明细", rows: [[...identityHeaders, "回答正文（Markdown）", "思考过程", "原回答链接", "分析品牌", "匹配当前品牌", "运行 ID"], ...data.details.map(item => [...identity(item, context), item.answerMarkdown, item.reasoningMarkdown, item.shareUrl, item.brandContext.targetBrand, item.brandContext.matchesCurrent, item.runId])] },
    { name: "执行记录", rows: [["回答 ID", "执行时间", "问题", "模型", "提问序号", "执行状态", "已有回答", "运行 ID"], ...data.items.map(item => [item.answerId, dateTime(item.runCreatedAt, context.timezone), item.question, platform(item), item.repetition, item.status, Boolean(item.result), item.runId])] },
    notes(data, context),
  ];
}
function sourceSheets(data: ExportData, context: ExportContext): ExportSheet[] {
  const citations: ExportCell[][] = [[...identityHeaders, "信源 ID", "标题", "URL", "域名", "站点", "发布时间", "引用片段", "引用依据"]];
  const references: ExportCell[][] = [[...identityHeaders, "信源 ID", "标题", "URL", "域名", "站点", "发布时间", "摘要", "被引用", "引用依据"]];
  const keywords: ExportCell[][] = [[...identityHeaders, "搜索词"]];
  const domains = new Map<string, { cited: number; found: number; urls: Set<string> }>();
  const provenance = { explicit: "明确引用", legacy_assumed: "历史推定", unavailable: "未提供" };
  const track = (domain: string, url: string, kind: "cited" | "found") => {
    const record = domains.get(domain) || { cited: 0, found: 0, urls: new Set<string>() };
    record[kind] += 1; record.urls.add(url); domains.set(domain, record);
  };
  data.details.forEach(item => {
    item.citationList.forEach(source => {
      citations.push([...identity(item, context), source.id, source.title, source.url, source.domain, source.siteName, source.publishedAt, source.citedText, provenance[item.citationProvenance]]);
      track(source.domain, source.url, "cited");
    });
    item.referenceList.forEach(source => {
      references.push([...identity(item, context), source.id, source.title, source.url, source.domain, source.siteName, source.publishedAt, source.summary, source.isCited, provenance[item.citationProvenance]]);
      track(source.domain, source.url, "found");
    });
    item.searchKeywords.forEach(word => keywords.push([...identity(item, context), word]));
  });
  return [{ name: "引用明细", rows: citations }, { name: "检索信源", rows: references }, { name: "域名统计", rows: [["域名", "引用记录数", "检索记录数", "去重 URL 数"], ...Array.from(domains).sort((a, b) => b[1].cited - a[1].cited).map(([domain, record]) => [domain, record.cited, record.found, record.urls.size])] }, { name: "搜索词", rows: keywords }, notes(data, context, [["域名统计口径", "按本次完整回答集计数。引用与检索分别统计，不相加；URL 按原始地址去重。历史推定引用已单独标记，并不等于明确引用。"]])];
}
function sentimentSheets(data: ExportData, context: ExportContext): ExportSheet[] {
  const groups = new Map<string, { label: string; positive: number; neutral: number; negative: number; unknown: number; excluded: number }>();
  const words: ExportCell[][] = [[...identityHeaders, "分析品牌", "匹配当前品牌", "评价词", "情感", "上下文"]];
  data.details.forEach(item => {
    const group = groups.get(item.platform.id) || { label: platform(item), positive: 0, neutral: 0, negative: 0, unknown: 0, excluded: 0 };
    if (item.brandContext.matchesCurrent) group[item.sentiment] += 1; else group.excluded += 1;
    groups.set(item.platform.id, group);
    Object.values(groupKeywordEvaluations(item.keywordEvaluations)).flat().forEach(word => words.push([...identity(item, context), item.brandContext.targetBrand, item.brandContext.matchesCurrent, word.keyword, tone[word.nature], word.context]));
  });
  return [
    { name: "情感概览", rows: [["模型", "正面", "中性", "负面", "标签缺失", "已分类", "正面占比（已分类）", "历史品牌排除数"], ...Array.from(groups.values()).map(group => { const total = group.positive + group.neutral + group.negative; return [group.label, group.positive, group.neutral, group.negative, group.unknown, total, total ? `${(group.positive / total * 100).toFixed(2)}%` : null, group.excluded]; })] },
    { name: "回答情感", rows: [[...identityHeaders, "分析品牌", "匹配当前品牌", "情感标签", "提及品牌", "提及位置"], ...data.details.map(item => [...identity(item, context), item.brandContext.targetBrand, item.brandContext.matchesCurrent, tone[item.sentiment], item.mentioned, item.position])] },
    { name: "评价词", rows: words },
    notes(data, context, [["情感统计口径", "仅统计与当前主体匹配的已有回答；正面占比的分母为正面+中性+负面，不包含标签缺失。评价词保留已有词条及上下文，并按页面规则去重，不调用模型生成新分析。"]]),
  ];
}

async function screenshotZip(data: ExportData, context: ExportContext, signal: AbortSignal, progress: (value: string) => void) {
  const zip = new JSZip();
  const rows: ExportCell[][] = [[...identityHeaders, "截图 ID", "归档状态", "ZIP 内文件", "导出结果"]];
  let downloaded = 0, missing = 0, bytes = 0;
  const limit = 200 * 1024 * 1024;
  const assets = data.details.flatMap(item => item.archivedScreenshots.map(asset => ({ item, asset })));
  for (const item of data.details.filter(answer => !answer.archivedScreenshots.length)) rows.push([...identity(item, context), "", "无截图记录", "", "未生成截图"]);
  for (let index = 0; index < assets.length; index += 1) {
    checkAbort(signal);
    const { item, asset } = assets[index];
    progress(`正在整理截图 ${index + 1} / ${assets.length}…`);
    let name = "", result = "";
    try {
      if (asset.archiveStatus !== "archived" || !asset.accessPath) throw new Error(archive[asset.archiveStatus]);
      if (!/^\/api\/monitoring\/media\/[0-9a-f-]{36}(?:\?variant=(?:display|thumbnail))?$/i.test(asset.accessPath)) throw new Error("截图地址无效");
      const url = new URL(asset.accessPath, window.location.origin);
      new URL(context.mediaBase, window.location.origin).searchParams.forEach((value, key) => url.searchParams.set(key, value));
      const response = await fetch(url.href, { credentials: "same-origin", headers: context.headers, signal, redirect: "error" });
      if (response.status === 401 || response.status === 403) throw new Error("截图访问权限已失效，请重新登录后导出。");
      if (!response.ok) throw new Error(`读取失败（${response.status}）`);
      const mime = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
      const extension = ({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" } as Record<string, string>)[mime || ""];
      if (!extension) throw new Error("未返回支持的截图图片");
      if (bytes + Number(response.headers.get("content-length") || 0) > limit) throw new RangeError("截图总量超过 200 MB，请缩小日期或模型范围。");
      const reader = response.body?.getReader();
      if (!reader) throw new Error("无法读取截图");
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      try {
        while (true) {
          checkAbort(signal);
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > limit) throw new RangeError("截图总量超过 200 MB，请缩小日期或模型范围。");
          chunks.push(new Uint8Array(chunk.value));
        }
      } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
      const blob = new Blob(chunks, { type: mime });
      if (!blob.size) throw new Error("截图文件为空");
      const stamp = dateTime(item.runCreatedAt, context.timezone).replace(/[-: ]/g, "");
      name = `截图/${stamp}_${safeName(platform(item), 16)}_${safeName(item.question, 14)}_第${item.repetition}次_${item.answerId}_${asset.ordinal + 1}_${asset.id}.${extension}`;
      zip.file(name, await blob.arrayBuffer());
      downloaded += 1; result = "已导出";
    } catch (error) {
      checkAbort(signal);
      if (error instanceof RangeError || (error instanceof Error && error.message.includes("访问权限"))) throw error;
      missing += 1;
      result = error instanceof Error ? error.message : "读取失败";
    }
    rows.push([...identity(item, context), asset.id, archive[asset.archiveStatus], name, result]);
  }
  const manifest = await exportWorkbook([{ name: "截图清单", rows }, notes(data, context, [["成功导出图片数", downloaded], ["未导出截图记录数", missing], ["没有截图的回答数", data.details.filter(item => !item.archivedScreenshots.length).length], ["文件命名", "执行时间_模型及端类型_问题摘要_提问序号_回答ID_截图序号_截图ID；扩展名按实际图片格式保留。"], ["截图来源", "仅下载已有归档图片，不重新采集；失败或不存在的图片只记录原因，不用占位图片替代。"]])]);
  zip.file("截图清单.xlsx", await manifest.arrayBuffer());
  checkAbort(signal);
  return { blob: await zip.generateAsync({ type: "blob", compression: "STORE" }), warning: !downloaded ? "本范围没有可下载图片，ZIP 仅包含截图清单及原因。" : missing ? `已导出 ${downloaded} 张截图，另有 ${missing} 条未能导出，详见 ZIP 内清单。` : undefined };
}

export async function prepareExportFile(kind: ExportKind, data: ExportData, context: ExportContext, signal: AbortSignal, progress: (value: string) => void): Promise<ExportFile> {
  checkAbort(signal);
  const option = EXPORT_OPTIONS.find(item => item.id === kind)!;
  const name = `${safeName(context.question)}-${option.label}-${context.from}-${context.to}`;
  progress(`正在生成${option.label}…`);
  if (kind === "screenshots") {
    const result = await screenshotZip(data, context, signal, progress);
    checkAbort(signal);
    return { kind, name: `${name}.zip`, ...result };
  }
  const sheets = kind === "answers" ? answerSheets(data, context) : kind === "sources" ? sourceSheets(data, context) : sentimentSheets(data, context);
  const blob = await exportWorkbook(sheets);
  checkAbort(signal);
  return { kind, name: `${name}.xlsx`, blob };
}
