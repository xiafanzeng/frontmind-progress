/** Overview-only heuristics. AnswerInsights retains its existing nine categories. */
export const sourceCategoryKeys = ["news", "knowledge", "social", "commerce", "official", "other"] as const;
export type SourceCategory = typeof sourceCategoryKeys[number];
export const sourceCategoryLabels: Record<SourceCategory, string> = {
  news: "新闻资讯", knowledge: "知识问答", social: "社交平台", commerce: "电商平台", official: "官方网站", other: "其他站点",
};
const seeds: Record<Exclude<SourceCategory, "other">, readonly string[]> = {
  news: ["stcn.com", "eastmoney.com", "cs.com.cn", "xinhuanet.com", "news.cn", "people.com.cn", "chinanews.com", "thepaper.cn", "caixin.com", "yicai.com", "cnstock.com", "sina.com.cn", "sohu.com", "163.com", "qq.com", "ifeng.com", "reuters.com", "bbc.com"],
  knowledge: ["zhihu.com", "wikipedia.org", "wikipedia.com", "baike.baidu.com", "baike.com", "csdn.net", "csdn.com", "stackoverflow.com", "quora.com", "juejin.cn"],
  social: ["weibo.com", "weibo.cn", "xiaohongshu.com", "xhslink.com", "douban.com", "bilibili.com", "b23.tv", "reddit.com", "douyin.com", "tiktok.com", "tieba.baidu.com", "x.com", "twitter.com"],
  commerce: ["taobao.com", "tmall.com", "jd.com", "1688.com", "amazon.com", "amazon.cn", "amazon.co.uk", "amazon.co.jp", "pinduoduo.com", "yangkeduo.com", "suning.com", "ebay.com"],
  // University and government hosts are classified by the .edu/.gov/.ac suffix
  // rule below; do NOT add literal campus domains here — the Core production
  // bundle audit rejects certain legacy tenant fixtures by name.
  official: ["cscse.edu.cn", "longdameishi.com"],
};
export function sourceHostname(value: string): string {
  const input = value.trim().toLowerCase();
  try { return new URL(input.includes("://") ? input : `https://${input}`).hostname.replace(/^www\./, "").replace(/\.$/, ""); }
  catch { return input.split(/[/:]/)[0]!.replace(/^www\./, ""); }
}
const normalized = (value: string) => value.normalize("NFKC").trim().toLocaleLowerCase();
export function classifyOverviewSource(domain: string, siteName?: string | null, brandNames: readonly string[] = []): SourceCategory {
  const host = sourceHostname(domain);
  // Exact hostname or subdomain boundaries avoid matching e.g. zhihu.com.example.org.
  for (const category of sourceCategoryKeys) {
    if (category !== "other" && seeds[category].some(seed => host === seed || host.endsWith(`.${seed}`))) return category;
  }
  if (/(^|\.)(gov|edu|ac)(\.[a-z]{2})?$/.test(host)) return "official";
  const name = normalized(siteName || "");
  if (brandNames.some(value => {
    const brand = normalized(value);
    return brand.length >= 2 && (name.includes(brand) || host.split(/[.-]/).includes(brand));
  })) return "official";
  const label = `${host} ${name}`;
  if (/(^|[.\s-])(news|finance|press)([.\s-]|$)|新闻|资讯|财经|证券|日报|晚报/.test(label)) return "news";
  if (/(^|[.\s-])(wiki|qa|baike)([.\s-]|$)|百科|问答|知识社区/.test(label)) return "knowledge";
  if (/(^|[.\s-])(forum|bbs|social)([.\s-]|$)|论坛|社交|社区/.test(label)) return "social";
  if (/(^|[.\s-])(shop|store|mall)([.\s-]|$)|商城|购物|电商/.test(label)) return "commerce";
  return "other";
}
export function sourceTypeCounts(rows: Iterable<{ domain: string; siteName?: string | null; count?: number }>, brandNames: readonly string[] = []) {
  const counts = new Map<SourceCategory, number>(sourceCategoryKeys.map(category => [category, 0]));
  for (const row of rows) {
    const category = classifyOverviewSource(row.domain, row.siteName, brandNames);
    counts.set(category, counts.get(category)! + (row.count ?? 1));
  }
  return sourceCategoryKeys.map(category => ({ category, count: counts.get(category)! }));
}
