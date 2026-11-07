import { useState } from "react";
import type { MonitorRun, ProjectSummary } from "../../../domain";
import { runStatusLabel } from "../../../domain";
import Modal from "../../../components/Modal";
import MonitoringFilterBar from "../MonitoringFilterBar";
import { monitoringDateWindow } from "../queryState";
import type { MonitoringQueryState } from "../types";
import type { MonitoringSummaryData } from "../useMonitoringDataSource";

/** Mounted afresh on open. Draft changes are committed only by Apply. */
export default function ReportConfiguration({ project, query, catalog, runs, before, after, date, onApply, onClose, onReturnFocus }: {
  project: ProjectSummary; query: MonitoringQueryState; catalog?: MonitoringSummaryData; runs: MonitorRun[];
  before?: MonitorRun; after?: MonitorRun; date: (run?: MonitorRun) => string;
  onApply: (patch: Partial<MonitoringQueryState>) => void; onClose: () => void; onReturnFocus: () => void;
}) {
  const [draft, setDraft] = useState(() => ({ ...query }));
  const update = (patch: Partial<MonitoringQueryState>) => setDraft(value => ({ ...value, ...patch }));
  const updateDates = (patch: Partial<MonitoringQueryState>) => update({ runId: undefined, reportBeforeId: undefined, reportAfterId: undefined, ...patch });
  const afterId = draft.reportAfterId || draft.runId || "auto";
  const datesChanged = draft.from !== query.from || draft.to !== query.to;
  const validDates = Boolean(draft.from && draft.to && draft.from < draft.to);
  return <Modal open title="报告配置" className="fm-qpr-config-drawer" onClose={onClose} onCloseAutoFocus={event => { event.preventDefault(); onReturnFocus(); }}>
    <div className="fm-qpr-config-body">
      <section><h4>数据范围</h4><MonitoringFilterBar project={project} run={after || before} summary={catalog} hideQuestion hideSubject model={draft.model} range={draft.range} from={draft.from} to={draft.to} subject="self"
        onQuestionChange={() => undefined} onSubjectChange={() => undefined} onModelChange={model => update({ model })}
        onRangeChange={range => updateDates(range === "custom" ? { range } : { range, ...monitoringDateWindow(range, project.timezone) })}
        onDateWindowChange={(from, to) => updateDates({ range: "custom", from, to })} /></section>
      <section><h4>对比批次</h4>
        <label>优化前<select aria-label="优化前批次" value={draft.reportBeforeId || "auto"} onChange={event => update({ reportBeforeId: event.target.value === "auto" ? undefined : event.target.value })}>
          <option value="auto">最近可比批次{!datesChanged && before ? ` · ${date(before)}` : ""}</option><option value="none">暂不选择</option>
          {draft.reportBeforeId && draft.reportBeforeId !== "none" && !runs.some(run => run.id === draft.reportBeforeId) && <option value={draft.reportBeforeId}>所选批次尚未读取</option>}
          {runs.map(run => <option key={run.id} value={run.id}>{date(run)} · V{run.version} · {runStatusLabel(run.status)}</option>)}
        </select></label>
        <label>优化后<select aria-label="优化后批次" value={afterId} onChange={event => update({ reportAfterId: event.target.value === "auto" ? undefined : event.target.value, runId: undefined })}>
          <option value="auto">最近完成批次{!datesChanged && after && afterId === "auto" ? ` · ${date(after)}` : ""}</option>
          {afterId !== "auto" && !runs.some(run => run.id === afterId) && <option value={afterId}>所选批次尚未读取</option>}
          {runs.map(run => <option key={run.id} value={run.id}>{date(run)} · V{run.version} · {runStatusLabel(run.status)}</option>)}
        </select></label>
        <p>日期用于查找批次；明确选择的批次可保留在日期范围外。时区：{project.timezone}。</p>
        {datesChanged && <p>应用后读取新日期范围。自动批次将重新选择；也可保留上方明确指定的历史批次。</p>}
        {!validDates && <p role="alert">请选择有效日期范围。</p>}
      </section>
    </div>
    <footer className="fm-qpr-config-actions"><button type="button" onClick={onClose}>取消</button><button type="button" className="primary-button" disabled={!validDates} onClick={() => {
      onApply({ model: draft.model, range: draft.range, from: draft.from, to: draft.to, runId: draft.runId, reportBeforeId: draft.reportBeforeId, reportAfterId: draft.reportAfterId }); onClose();
    }}>应用配置</button></footer>
  </Modal>;
}
