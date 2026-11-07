import { ChevronRight, Info, MessageSquare } from "lucide-react";
import type { OverviewSentimentData, OverviewSentimentInput } from "../../../../contracts/overview";
import OverviewPagination from "./OverviewPagination";

export const sentimentTones = [
  { id: "positive", label: "正面", color: "#10B981" },
  { id: "neutral", label: "中性", color: "#98A2B3" },
  { id: "negative", label: "负面", color: "#F5333F" },
] as const;
export type WordPages = Record<typeof sentimentTones[number]["id"], number>;
export const initialWordPages = (): WordPages => ({ positive: 1, neutral: 1, negative: 1 });

type Props = {
  keywords: OverviewSentimentData["keywords"]; tone: OverviewSentimentInput["keywordTone"];
  scrollable?: boolean; answerCount: number; selectedKey: string | null; pages: WordPages;
  onPage: (tone: keyof WordPages, page: number) => void; onSelect: (key: string) => void;
};

export default function OverviewKeywordRanking({ keywords, tone, answerCount, selectedKey, pages, onPage, onSelect, scrollable = false }: Props) {
  return <div className={`fm-ov-word-ranking${scrollable ? " fm-ov-word-ranking-scroll" : ""}`} data-tone={tone}>{sentimentTones.filter(item => tone === "all" || item.id === tone).map(item => {
    const words = keywords.filter(word => word.nature === item.id).sort((a, b) => b.answerCount - a.answerCount || a.key.localeCompare(b.key));
    const page = Math.min(pages[item.id], Math.max(1, Math.ceil(words.length / 10)));
    return <section key={item.id} className={`fm-ov-word-group ${item.id}`} aria-label={`${item.label}评价词榜单`}>
      <header><h4>{item.label}评价词<span title="按关联回答数排序；同一回答中相同词语、相同倾向只计一次"><Info size={13} aria-label="评价词统计说明" /></span></h4><span>{words.length} 个词</span></header>
      <div className="fm-ov-word-list-body" tabIndex={scrollable && words.length ? 0 : undefined} role={scrollable ? "region" : undefined} aria-label={scrollable ? `${item.label}评价词滚动列表` : undefined}>{words.length ? <>
        <ol start={scrollable ? 1 : (page - 1) * 10 + 1}>{(scrollable ? words : words.slice((page - 1) * 10, page * 10)).map((word, index) => <li key={word.key}>
          <button type="button" className={word.key === selectedKey ? "selected" : undefined} aria-pressed={word.key === selectedKey}
            aria-label={`${word.keyword}，${item.label}，关联 ${word.answerCount} 条回答`}
            title={`${word.answerCount} / ${answerCount} 条回答${word.conflicted ? "；此词在不同语境有不同标签" : ""}`} onClick={() => onSelect(word.key)}>
            <span className="fm-ov-word-rank" aria-hidden="true">{(scrollable ? 0 : (page - 1) * 10) + index + 1}</span>
            <span className="fm-ov-word-name">{word.keyword}</span>{scrollable && <ChevronRight className="fm-ov-word-arrow" size={14} aria-hidden="true" />}
            <progress value={word.answerCount} max={Math.max(1, answerCount)} aria-hidden="true" />
            <strong>{word.answerCount}{scrollable && " 条"}</strong>
          </button>
        </li>)}</ol>
        {!scrollable && words.length > 10 && <OverviewPagination label={`${item.label}评价词分页`} size={10} unit="个词" page={page} total={words.length} onChange={value => onPage(item.id, value)} />}
      </> : <div className="fm-ov-word-empty"><span><MessageSquare size={22} strokeWidth={1.4} aria-hidden="true" /></span><p>暂无数据</p></div>}</div>
    </section>;
  })}</div>;
}
