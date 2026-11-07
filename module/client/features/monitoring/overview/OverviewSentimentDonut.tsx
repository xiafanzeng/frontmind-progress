import { useState } from "react";
import { sentimentTones } from "./OverviewKeywordRanking";

type Tone = typeof sentimentTones[number]["id"];

export default function OverviewSentimentDonut({ counts, onSelect }: {
  counts: Record<Tone, number>; onSelect: (tone: Tone) => void;
}) {
  const [hovered, setHovered] = useState<Tone | null>(null);
  const [focused, setFocused] = useState<Tone | null>(null);
  const total = counts.positive + counts.neutral + counts.negative;
  const active = hovered || focused;
  const tone = sentimentTones.find(item => item.id === active && counts[item.id] > 0);
  let offset = 0;
  return <div className="fm-ov-interactive-donut" role="group" aria-label={`情感分布，已判定 ${total} 条回答`}>
    <svg viewBox="0 0 180 180" aria-label="悬停或聚焦色块查看情感数量与占比">
      <circle cx="90" cy="90" r="62" fill="none" stroke="#e9e7ef" strokeWidth="22" />
      {sentimentTones.map(item => {
        const share = total ? counts[item.id] / total * 100 : 0;
        const start = offset;
        offset += share;
        if (!share) return null;
        const label = `${item.label} ${counts[item.id]} 条，占已判定回答 ${share.toFixed(1)}%`;
        return <circle key={item.id} className={`fm-ov-donut-segment${tone?.id === item.id ? " is-active" : ""}`}
          cx="90" cy="90" r="62" fill="none" stroke={item.color} strokeWidth={tone?.id === item.id ? 28 : 22}
          pathLength="100" strokeDasharray={`${share} ${100 - share}`} strokeDashoffset={-start} transform="rotate(-90 90 90)"
          opacity={tone && tone.id !== item.id ? .4 : 1} tabIndex={0} role="button" aria-label={`${label}，点击筛选回答`}
          onPointerEnter={() => setHovered(item.id)} onPointerLeave={() => setHovered(null)}
          onFocus={() => setFocused(item.id)} onBlur={() => setFocused(null)}
          onClick={() => onSelect(item.id)} onKeyDown={event => {
            if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(item.id); }
          }}><title>{label}</title></circle>;
      })}
    </svg>
    <div className="fm-ov-donut-readout" aria-live="polite"><strong>{tone ? counts[tone.id] : total}</strong><span>{tone ? `${tone.label}回答` : "已判定回答"}</span>{tone && <small>{(counts[tone.id] / total * 100).toFixed(1)}%</small>}</div>
  </div>;
}
