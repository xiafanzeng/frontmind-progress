import type { RunAttempt } from "../../../domain";
import { trpc } from "../../../trpc";
import type { MonitoringQueryState } from "../types";
import { attemptFromDetail } from "../useMonitoringDataSource";
import { MonitoringMarkdown } from "../MonitoringMarkdown";
import CompactAnswerInsights from "../CompactAnswerInsights";
import { safeExternalUrl } from "../selectors";
import { isMonitoringUuid } from "../../../identifiers";

export default function ReportAnswerEvidence({ attempt, monitorId, subject, brand, serverData }: {
  attempt: RunAttempt; monitorId: string; subject: MonitoringQueryState["subject"]; brand: string; serverData: boolean;
}) {
  const competitor = subject.startsWith("competitor:") ? subject.slice(11) : undefined;
  const detail = trpc.monitoring.answers.get.useQuery({ monitorId, answerId: attempt.id,
    subject: competitor ? { kind: "competitor", name: competitor } : { kind: "self" } },
    { enabled: Boolean(competitor && serverData && isMonitoringUuid(attempt.id)), staleTime: 60_000, retry: false, refetchOnWindowFocus: false });
  // The run endpoint is a self-brand snapshot. Never label it as competitor evidence.
  const projected = competitor ? detail.data ? attemptFromDetail(detail.data) : undefined : attempt;
  const displayed = projected || attempt;
  return <section className="fm-pr-card" aria-label="所选回答证据"><h3>{attempt.platformName} · 第 {attempt.repetition} 次</h3>
    <p className="fm-pr-note">{competitor ? `所选竞品：${competitor}` : `历史监控品牌：${brand || "未返回"}`} · 回答版本 {projected?.revision ?? attempt.revision ?? "未返回"}</p>
    {competitor && projected && projected.revision !== attempt.revision && <p className="fm-pr-note">标签接口返回的回答版本与运行快照不同，以下正文与标签统一展示接口返回版本，不用于批次变化计算。</p>}
    <div className="fm-pr-answer"><MonitoringMarkdown attempt={projected || attempt} markdown={displayed.answer || "这条采集尚无有效正文"} /></div>
    {displayed.error && <p className="fm-pr-warning">采集错误：{displayed.error}</p>}
    {competitor && !projected ? <p role={detail.error ? "alert" : "status"}>{detail.error ? "竞品标签读取失败。" : serverData ? "正在读取该回答的竞品标签…" : "当前快照未提供竞品标签明细。"}{detail.error && <button type="button" onClick={() => void detail.refetch()}>重试</button>}</p> : projected && <>
      <p>提及：{projected.brandMentioned === undefined ? "未返回" : projected.brandMentioned ? "是" : "否"} · 排名：{projected.mentionPosition ?? "未返回"}</p>
      <CompactAnswerInsights attempt={projected} />
    </>}
    <h4>回答中的明确引用</h4>{displayed.citationProvenance !== "explicit" ? <p>引用记录口径尚不完整，不能视为未引用。</p> : displayed.sources.some(source => source.isCited) ? <ul>{displayed.sources.filter(source => source.isCited).map(source => {
      const url = safeExternalUrl(source.url);
      return <li key={source.id}>{url ? <a href={url} target="_blank" rel="noopener noreferrer">{source.title || source.domain} ↗</a> : source.title}{source.citedText && <blockquote>{source.citedText}</blockquote>}</li>;
    })}</ul> : <p>本条回答未返回明确引用。</p>}
    <small>供应商标签及引用原样保留；此处展示证据，不作事实准确、优势或场景达标判定。</small>
  </section>;
}
