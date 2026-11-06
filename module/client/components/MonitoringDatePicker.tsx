import { useId, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@frontmind/module-ui/components/ui/popover";
import { monitoringLocalCalendarDate, shiftCalendarDate } from "../features/monitoring/queryState";
import type { DateRange } from "../features/monitoring/types";
import "./MonitoringDatePicker.css";

// This control always displays inclusive calendar dates. Callers retain their
// existing API's inclusive/exclusive semantics at the component boundary.
type Props = {
  from: string;
  to: string;
  timezone?: string;
  range?: DateRange;
  disabled?: boolean;
  single?: boolean;
  maxDays?: number;
  label?: string;
  onApply: (from: string, to: string, range: DateRange) => void;
};
const presets = [{ days: 7, range: "7d", label: "近 7 天" }, { days: 30, range: "30d", label: "近 30 天" }, { days: 90, range: "90d", label: "近 90 天" }] as const;
function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function monthStart(value: string) { return `${value.slice(0, 7)}-01`; }
function moveMonth(value: string, offset: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset, 1);
  return date.toISOString().slice(0, 10);
}

export default function MonitoringDatePicker({ from, to, timezone = "Asia/Shanghai", range = "custom", disabled, single = false, maxDays, label = "选择日期范围", onApply }: Props) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(from);
  const [end, setEnd] = useState(to);
  const [draftRange, setDraftRange] = useState<DateRange>(range);
  const [selectingEnd, setSelectingEnd] = useState(false);
  const today = monitoringLocalCalendarDate(new Date(), timezone);
  const [month, setMonth] = useState(monthStart(validDate(from) ? from : today));
  const gridRef = useRef<HTMLDivElement>(null);
  const labelId = useId();
  const days = validDate(start) && validDate(end) ? Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1 : 0;
  const valid = days > 0 && (!maxDays || days <= maxDays);
  const weekday = (new Date(`${month}T12:00:00Z`).getUTCDay() + 6) % 7;
  const cells = Array.from({ length: 42 }, (_, index) => shiftCalendarDate(month, index - weekday));
  const selectedPreset = presets.find(item => item.range === range);
  const valueLabel = single ? from || "全部日期" : selectedPreset?.label || (from && to ? `${from} 至 ${to}` : "选择日期");
  const resetDraft = () => {
    setStart(from); setEnd(to); setDraftRange(range); setSelectingEnd(false);
    setMonth(monthStart(validDate(from) ? from : today));
  };
  const selectDay = (value: string) => {
    setDraftRange("custom");
    if (single) { setStart(value); setEnd(value); return; }
    if (!selectingEnd) { setStart(value); setEnd(""); setSelectingEnd(true); }
    else { setStart(value < start ? value : start); setEnd(value < start ? start : value); setSelectingEnd(false); }
  };
  return <Popover open={open} onOpenChange={next => { if (next) resetDraft(); setOpen(next); }}>
    <PopoverTrigger asChild><button type="button" className="fm-date-picker-trigger" aria-label={label} disabled={disabled} title={from && to ? `${from} 至 ${to}（${timezone}）` : undefined}><span>{valueLabel}</span><ChevronDown size={14} aria-hidden="true" /></button></PopoverTrigger>
    <PopoverContent className="fm-calendar-popover" align="end" sideOffset={8} collisionPadding={12} aria-labelledby={labelId} onOpenAutoFocus={event => { event.preventDefault(); gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${validDate(start) ? start : today}"]`)?.focus(); }}>
      <h3 id={labelId}>{single ? "选择日期" : "选择日期范围"}</h3>
      {!single && <div className="fm-calendar-presets">{presets.map(item => <button type="button" key={item.range} aria-pressed={draftRange === item.range} onClick={() => { setStart(shiftCalendarDate(today, 1 - item.days)); setEnd(today); setDraftRange(item.range); setSelectingEnd(false); setMonth(monthStart(today)); }}>{item.label}</button>)}<button type="button" aria-pressed={draftRange === "custom"} onClick={() => { setDraftRange("custom"); setSelectingEnd(false); }}>自定义</button></div>}
      <div className="fm-calendar-month"><button type="button" aria-label="上个月" onClick={() => setMonth(moveMonth(month, -1))}><ChevronLeft size={16} /></button><strong aria-live="polite">{Number(month.slice(0, 4))} 年 {Number(month.slice(5, 7))} 月</strong><button type="button" aria-label="下个月" onClick={() => setMonth(moveMonth(month, 1))}><ChevronRight size={16} /></button></div>
      <div className="fm-calendar-week" aria-hidden="true">{["一", "二", "三", "四", "五", "六", "日"].map(day => <span key={day}>{day}</span>)}</div>
      <div ref={gridRef} className="fm-calendar-days" role="group" aria-label="日历日期" onKeyDown={event => {
        const target = event.target as HTMLButtonElement;
        const date = target.dataset.date;
        const step = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as Record<string, number>)[event.key];
        if (!date || step === undefined) return;
        event.preventDefault(); const next = shiftCalendarDate(date, step);
        const button = gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${next}"]`);
        if (button) button.focus();
        else { setMonth(monthStart(next)); window.requestAnimationFrame(() => gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${next}"]`)?.focus()); }
      }}>{cells.map(value => <button type="button" key={value} data-date={value} data-outside={value.slice(0, 7) !== month.slice(0, 7) || undefined} data-between={Boolean(start && end && value > start && value < end) || undefined} aria-label={value} aria-current={value === today ? "date" : undefined} aria-pressed={value === start || value === end} onClick={() => selectDay(value)}>{Number(value.slice(8))}</button>)}</div>
      <p className="fm-calendar-selection" aria-live="polite">{single ? start || "请选择日期" : start ? `${start} 至 ${end || "请选择结束日期"}` : "请选择开始日期"}</p>
      {!single && <p className="fm-calendar-caption">包含结束当天 · {timezone}{maxDays ? ` · 最多 ${maxDays} 天` : ""}</p>}
      {days > 0 && maxDays && days > maxDays && <p className="fm-calendar-error" role="alert">日期范围不能超过 {maxDays} 天。</p>}
      <footer>{single && <button type="button" className="fm-calendar-clear" onClick={() => { onApply("", "", "custom"); setOpen(false); }}>清除日期</button>}<button type="button" onClick={() => setOpen(false)}>取消</button><button type="button" className="fm-calendar-confirm" disabled={!valid} onClick={() => { onApply(start, end, draftRange); setOpen(false); }}>确定</button></footer>
    </PopoverContent>
  </Popover>;
}
