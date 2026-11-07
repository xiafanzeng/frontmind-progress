import { useMemo } from "react";
import InlineSelect from "./InlineSelect";

const commonZones = ["Asia/Shanghai", "Asia/Hong_Kong", "Asia/Singapore", "Asia/Tokyo", "Asia/Seoul", "Asia/Kolkata", "Asia/Dubai", "Europe/London", "Europe/Paris", "America/New_York", "America/Los_Angeles", "Australia/Sydney", "UTC"];
const labels: Record<string, string> = { "Asia/Shanghai": "中国标准时间", "Asia/Hong_Kong": "香港", "Asia/Singapore": "新加坡", "Asia/Tokyo": "东京", "Asia/Seoul": "首尔", "Asia/Kolkata": "印度", "Asia/Dubai": "迪拜", "Europe/London": "伦敦", "Europe/Paris": "巴黎", "America/New_York": "纽约", "America/Los_Angeles": "洛杉矶", "Australia/Sydney": "悉尼", UTC: "协调世界时" };

export default function TimezoneSelect({ value, onChange, label, inline = false }: { value: string; onChange: (value: string) => void; label: string; inline?: boolean }) {
  const zones = useMemo(() => {
    const supported = (Intl as typeof Intl & { supportedValuesOf?: (key: "timeZone") => string[] }).supportedValuesOf?.("timeZone") || [];
    // Keep legacy IANA aliases selectable, even when the browser lists only their canonical name.
    return Array.from(new Set([...commonZones, ...(value ? [value] : []), ...supported]));
  }, [value]);
  if (inline) return <InlineSelect label={label} value={value} onChange={onChange} options={zones.map(zone => ({ value: zone, label: labels[zone] ? `${labels[zone]} · ${zone}` : zone }))} />;
  return <select aria-label={label} value={value} required onChange={event => onChange(event.target.value)}>{zones.map(zone => <option key={zone} value={zone}>{labels[zone] ? `${labels[zone]} · ${zone}` : zone}</option>)}</select>;
}
