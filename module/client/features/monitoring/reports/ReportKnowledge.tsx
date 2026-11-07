import type { MonitorRun, RunAttempt } from "../../../domain";
import { safeExternalUrl } from "../selectors";
import { answerExcerpt, explicitCitations, sentimentLabel } from "./reportPresentation";
import type { QuestionReportPhase } from "./questionReportModel";

type Observation = { key: string; title: string; observed: string; quote: string; review: string };
function observations(answer?: RunAttempt, run?: MonitorRun): Observation[] {
  const citations = explicitCitations(answer);
  const keywords = answer?.keywordEvaluations || [];
  const brands = [run?.config.brandName || "", ...(run?.config.brandAliases || [])];
  return [
    { key: "brand", title: "品牌主体识别", observed: !answer ? "暂无有效回答" : answer.brandMentioned === true ? "采集结果判定已提及目标品牌" : answer.brandMentioned === false ? "采集结果判定未提及目标品牌" : "采集结果未返回品牌提及判定",
      quote: answerExcerpt(answer, brands), review: "结合品牌名称、别名和正文，核对是否指向同一主体；主体事实差距待核验。" },
    { key: "expression", title: "评价表达与语境", observed: !answer ? "暂无有效回答" : `回答整体标签：${sentimentLabel[answer.sentiment || "unknown"]}；已返回 ${keywords.length} 个评价词`,
      quote: keywords.length ? keywords.slice(0, 3).map(item => `${item.keyword}（${sentimentLabel[item.nature]}）${item.context ? `：${item.context}` : "：未返回语境"}`).join("；") : "本条回答未提供可展示的评价词与语境。",
      review: "评价词与整体标签分别保留。需将具体断言与已核验资料对照，不能把正面评价当作事实准确。" },
    { key: "sources", title: "知识事实与引用信源", observed: !answer ? "暂无有效回答" : citations ? `采集结果返回 ${citations.length} 条明确引用` : "引用判定口径未返回，无法确认明确引用数量",
      quote: citations?.length ? citations.slice(0, 3).map(source => source.title || "未命名引用").join("；") : "暂无可展示的明确引用证据。",
      review: "逐条核对引用是否支持回答中的事实、是否适用当前时间。存在引用不等于事实已经核验。" },
  ];
}

function observedChanges(before?: RunAttempt, after?: RunAttempt, reason?: string): Record<string, string> {
  if (reason || !before || !after) return { brand: "尚不具备两期回答对照条件。", expression: "尚不具备两期回答对照条件。", sources: "尚不具备两期回答对照条件。" };
  const labels = (value?: boolean) => value === true ? "已提及" : value === false ? "未提及" : "未判定";
  const priorWords = new Set((before.keywordEvaluations || []).map(item => item.keyword));
  const addedWords = [...new Set((after.keywordEvaluations || []).map(item => item.keyword))].filter(word => !priorWords.has(word));
  const priorSources = explicitCitations(before), currentSources = explicitCitations(after);
  const priorUrls = new Set((priorSources || []).map(source => safeExternalUrl(source.url)).filter(Boolean));
  const addedUrls = new Set((currentSources || []).map(source => safeExternalUrl(source.url)).filter((url): url is string => Boolean(url && !priorUrls.has(url))));
  return {
    brand: `品牌判定：${labels(before.brandMentioned)} → ${labels(after.brandMentioned)}。`,
    expression: `整体标签：${sentimentLabel[before.sentiment || "unknown"]} → ${sentimentLabel[after.sentiment || "unknown"]}。${addedWords.length ? `本期新增返回评价词：${addedWords.slice(0, 6).join("、")}${addedWords.length > 6 ? "等" : ""}。` : "未观察到新增返回的评价词。"}`,
    sources: priorSources && currentSources ? `明确引用：${priorSources.length} → ${currentSources.length} 条；本期有 ${addedUrls.size} 个不同于前期的引用链接。` : "至少一期未返回明确引用口径，暂不比较引用数量。",
  };
}

export default function ReportKnowledge({ phase, before, after, beforeRun, afterRun, reason, change, onEvidence }: {
  phase: QuestionReportPhase; before?: RunAttempt; after?: RunAttempt; beforeRun?: MonitorRun; afterRun?: MonitorRun;
  reason?: string; change: { title: string; description: string }; onEvidence: (attempt: RunAttempt, side: "before" | "after") => void;
}) {
  const prior = observations(before, beforeRun), current = observations(after, afterRun);
  const changes = observedChanges(before, after, reason);
  const title = phase === "before" ? "知识事实与模型回答差距" : phase === "after" ? "知识事实与模型回答差距的填补" : "知识事实与改善分析";
  const sourceAnswer = phase === "before" ? before : after;
  const sources = explicitCitations(sourceAnswer);
  return <section className="fm-qpr-panel fm-qpr-knowledge" aria-label={title}>
    <header className="fm-qpr-section-heading"><h3>{title}</h3><small>跟随上方所选回答记录</small></header>
    {phase === "before" ? <div className="fm-qpr-knowledge-grid">{prior.map(item => <article key={item.key} className="fm-qpr-knowledge-card">
      <header><span className="fm-qpr-review-state">待核验</span><h4>{item.title}</h4></header>
      <div className="fm-qpr-knowledge-standard"><small>知识事实基准</small><p>待关联已核验知识事实与标准应答。</p></div>
      <small>当前表达 / 采集证据</small><blockquote>{item.quote}</blockquote>
      <small>已观察到的情况</small><p>{item.observed}</p><small>待核对与补充</small><p>{item.review}</p>
      {before && <button type="button" className="fm-qpr-text-button" onClick={() => onEvidence(before, "before")}>查看完整证据 →</button>}
    </article>)}</div> : phase === "after" ? <>
      <p className="fm-qpr-knowledge-notice">已读取的回答可用于核对变化；尚未返回已核验事实及填补记录，填补状态待核验。</p>
      <div className="fm-pr-table fm-qpr-table"><table><thead><tr><th>核对事项</th><th>优化前观察</th><th>本轮进展</th><th>填补状态</th></tr></thead><tbody>{current.map((item, index) => <tr key={item.key}>
        <th scope="row">{item.title}</th><td>{prior[index]!.observed}</td><td>{item.observed}<small>{changes[item.key]}</small>{after && <button type="button" className="fm-qpr-text-button" onClick={() => onEvidence(after, "after")}>查看本期证据 →</button>}</td><td><span className="fm-qpr-review-state">待核验</span></td>
      </tr>)}</tbody></table></div>
    </> : <>
      <div className="fm-qpr-standard-answer"><h4>标准应答逻辑</h4><p>尚未关联当前问题的已核验知识事实与标准应答，暂不生成标准答案或一致性评分。</p></div>
      <div className="fm-qpr-comparison-gaps">
        <article className="is-before"><h4>与应答逻辑的差距 <span className="fm-qpr-review-state">待核验</span></h4><ul>{prior.map(item => <li key={item.key}><b>{item.title}</b><p>{item.observed}</p><small>{item.review}</small></li>)}</ul>{before && <button type="button" className="fm-qpr-text-button" onClick={() => onEvidence(before, "before")}>查看优化前证据 →</button>}</article>
        <article className="is-after"><h4>本轮已填补 <span className="fm-qpr-review-state">待核验</span></h4><p>尚无已确认的填补记录。以下为所选回答中可核查的变化：</p><ul>{current.map(item => <li key={item.key}><b>{item.title}</b><p>{changes[item.key]}</p></li>)}</ul>{after && <button type="button" className="fm-qpr-text-button" onClick={() => onEvidence(after, "after")}>查看优化后证据 →</button>}</article>
      </div>
      <div className="fm-qpr-improvement"><h4>改善分析</h4><p>当前所选指标：{change.title}。{change.description}</p><p>{reason || (!before || !after ? "所选平台至少一期暂无有效回答，暂不比较正文证据。" : "上方列出所选回答的品牌判定、评价词与引用变化；具体事实差距是否填补，仍需关联知识事实并逐项核验。")}</p></div>
    </>}
    {!!sources?.length && <div className="fm-qpr-knowledge-sources"><h4>{phase === "before" ? "优化前" : "优化后"}引用证据</h4><ul>{sources.slice(0, 3).map(source => { const url = safeExternalUrl(source.url); return <li key={source.id}>{url ? <a href={url} target="_blank" rel="noopener noreferrer">{source.title || source.domain || "查看来源"} ↗</a> : <span>{source.title || "未命名引用"}（未返回链接）</span>}</li>; })}</ul>{sourceAnswer && sources.length > 3 && <button type="button" className="fm-qpr-text-button" onClick={() => onEvidence(sourceAnswer, phase === "before" ? "before" : "after")}>查看全部 {sources.length} 条引用 →</button>}</div>}
  </section>;
}
