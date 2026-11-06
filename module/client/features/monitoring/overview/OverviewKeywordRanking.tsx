import { MessageSquare } from "lucide-react";
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
  answerCount: number; selectedKey: string | null; pages: WordPages;
  onPage: (tone: keyof WordPages, page: number) => void; onSelect: (key: string) => void;
};

export default function OverviewKeywordRanking({ keywords, tone, answerCount, selectedKey, pages, onPage, onSelect }: Props) {
  return <div className="fm-ov-word-ranking">{sentimentTones.filter(item => tone === "all" || item.id === tone).map(item => {
    const words = keywords.filter(word => word.nature === item.id).sort((a, b) => b.answerCount - a.answerCount || a.key.localeCompare(b.key));
    const page = Math.min(pages[item.id], Math.max(1, Math.ceil(words.length / 10)));
    return <section key={item.id} className={`fm-ov-word-group ${item.id}`} aria-label={`${item.label}评价词榜单`}>
      <header><h4><i aria-hidden="true" />{item.label}评价词</h4><span>{words.length} 个词</span></header>
      {words.length ? <>
        <ol start={(page - 1) * 10 + 1}>{words.slice((page - 1) * 10, page * 10).map((word, index) => <li key={word.key}>
          <button type="button" className={word.key === selectedKey ? "selected" : undefined} aria-pressed={word.key === selectedKey}
            aria-label={`${word.keyword}，${item.label}，关联 ${word.answerCount} 条回答`}
            title={`${word.answerCount} / ${answerCount} 条回答${word.conflicted ? "；此词在不同语境有不同标签" : ""}`} onClick={() => onSelect(word.key)}>
            <span className="fm-ov-word-rank" aria-hidden="true">{(page - 1) * 10 + index + 1}</span>
            <span className="fm-ov-word-name">{word.keyword}</span>
            <progress value={word.answerCount} max={Math.max(1, answerCount)} aria-hidden="true" />
            <strong>{word.answerCount}</strong>
          </button>
        </li>)}</ol>
        {words.length > 10 && <OverviewPagination label={`${item.label}评价词分页`} size={10} unit="个词" page={page} total={words.length} onChange={value => onPage(item.id, value)} />}
      </> : <div className="fm-ov-word-empty"><span><MessageSquare size={22} strokeWidth={1.4} aria-hidden="true" /></span><p>暂无数据</p></div>}
    </section>;
  })}</div>;
}
