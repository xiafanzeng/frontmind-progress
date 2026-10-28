import { useState } from "react";
import { Bot } from "lucide-react";
import "./ModelBrandIcon.css";

const logos = {
  doubao: new URL("../assets/model-logos/doubao-color.svg", import.meta.url).href,
  deepseek: new URL("../assets/model-logos/deepseek-color.svg", import.meta.url).href,
  yuanbao: new URL("../assets/model-logos/yuanbao-color.svg", import.meta.url).href,
  qianwen: new URL("../assets/model-logos/qwen-color.svg", import.meta.url).href,
  baidu: new URL("../assets/model-logos/baidu-color.svg", import.meta.url).href,
  kimi: new URL("../assets/model-logos/kimi-color.svg", import.meta.url).href,
  weibo: new URL("../assets/model-logos/sinaweibo.svg", import.meta.url).href,
  quark: new URL("../assets/model-logos/quark.png", import.meta.url).href,
  douyin: new URL("../assets/model-logos/tiktok.svg", import.meta.url).href,
  chatgpt: new URL("../assets/model-logos/openai.svg", import.meta.url).href,
  antafu: new URL("../assets/model-logos/antafu.jpg", import.meta.url).href,
  xiaohongshu: new URL("../assets/model-logos/xiaohongshu.svg", import.meta.url).href,
  bing: new URL("../assets/model-logos/bing-color.svg", import.meta.url).href,
  google: new URL("../assets/model-logos/google-color.svg", import.meta.url).href,
  gemini: new URL("../assets/model-logos/gemini-color.svg", import.meta.url).href,
  grok: new URL("../assets/model-logos/grok.svg", import.meta.url).href,
  copilot: new URL("../assets/model-logos/copilot-color.svg", import.meta.url).href,
  perplexity: new URL("../assets/model-logos/perplexity-color.svg", import.meta.url).href,
};
export type ModelBrandKey = keyof typeof logos | "fallback";
const codes: Record<string, Exclude<ModelBrandKey, "fallback">> = {
  doubao: "doubao", deepseek: "deepseek", yuanbao: "yuanbao", qianwen: "qianwen", qwen: "qianwen",
  baiduai: "baidu", baidu: "baidu", wenxinyiyan: "baidu", kimi: "kimi", weibo_zhisou: "weibo",
  quark: "quark", douyinai: "douyin", douyin: "douyin", chatgpt: "chatgpt", antafu: "antafu",
  xiaohongshu: "xiaohongshu", bingai_overviews: "bing", googleai: "google", gemini: "gemini",
  grok: "grok", copilot: "copilot", perplexity: "perplexity",
};
export function resolveModelBrand(code: string, name: string): ModelBrandKey {
  const normalized = code.toLowerCase().replace(/_mobile$/, "");
  if (codes[normalized]) return codes[normalized];
  // Historical catalogs may use display names; avoid broad matches such as "gpt".
  const names: Array<[RegExp, Exclude<ModelBrandKey, "fallback">]> = [
    [/豆包|doubao/i, "doubao"], [/DeepSeek/i, "deepseek"], [/元宝|yuanbao/i, "yuanbao"],
    [/千问|通义|qwen|qianwen/i, "qianwen"], [/文心|百度|baidu/i, "baidu"], [/kimi/i, "kimi"],
    [/微博|weibo/i, "weibo"], [/夸克|quark/i, "quark"], [/抖音|douyin/i, "douyin"],
    [/chatgpt/i, "chatgpt"], [/蚂蚁阿福|antafu/i, "antafu"], [/小红书|xiaohongshu/i, "xiaohongshu"],
    [/copilot/i, "copilot"], [/gemini/i, "gemini"], [/google/i, "google"], [/必应|bing/i, "bing"],
    [/grok/i, "grok"], [/perplexity/i, "perplexity"],
  ];
  return names.find(([pattern]) => pattern.test(name))?.[1] ?? "fallback";
}
/** Display geography only; never changes provider region or execution capabilities. */
export function modelDisplayRegion(code: string, name: string) {
  const brand = resolveModelBrand(code, name);
  return brand === "fallback" ? "other" : ["chatgpt", "bing", "google", "gemini", "grok", "copilot", "perplexity"].includes(brand) ? "overseas" : "domestic";
}
export default function ModelBrandIcon({ code, name }: { code: string; name: string }) {
  const brand = resolveModelBrand(code, name);
  const [failedSource, setFailedSource] = useState<string>();
  const source = brand === "fallback" ? undefined : logos[brand];
  return <span className={`model-brand-icon model-brand-icon--${brand}`} data-model-brand={brand} aria-hidden="true">
    {source && source !== failedSource ? <img src={source} alt="" width={24} height={24} draggable={false} onError={() => setFailedSource(source)} /> : <Bot size={22} />}
  </span>;
}
