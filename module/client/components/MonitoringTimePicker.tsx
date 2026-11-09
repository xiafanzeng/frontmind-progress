import InlineSelect from "./InlineSelect";

const hours = Array.from({ length: 24 }, (_, index) => {
  const value = String(index).padStart(2, "0");
  return { value, label: value };
});
const minutes = Array.from({ length: 60 }, (_, index) => {
  const value = String(index).padStart(2, "0");
  return { value, label: value };
});

export default function MonitoringTimePicker({ value, onChange }: {
  value: string; onChange: (value: string) => void;
}) {
  const [hour, minute] = value.split(":");
  return <div role="group" aria-label="执行时间" className="fm-monitor-time-picker">
    <InlineSelect label="执行时间：小时" value={hour || "00"} options={hours} onChange={next => onChange(`${next}:${minute || "00"}`)} />
    <span aria-hidden="true">:</span>
    <InlineSelect label="执行时间：分钟" value={minute || "00"} options={minutes} onChange={next => onChange(`${hour || "00"}:${next}`)} />
  </div>;
}
