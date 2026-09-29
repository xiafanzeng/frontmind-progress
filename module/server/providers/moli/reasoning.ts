export type MoliReasoningSupport = "supported" | "unsupported" | "unknown";

// Vendor submit-task documentation and the vendor's public model configuration,
// checked 2026-09-14. Local acceptance failures describe a test run, not the
// provider's supported modes. In particular, Weibo and both Baidu clients do
// not offer deep reasoning despite the generic mode parameter in the API.
const REASONING_SUPPORTED = new Set([
  "deepseek",
  "doubao",
  "yuanbao",
  "kimi",
  "qianwen",
  "quark",
  "antafu",
  "douyinai",
  "chatgpt",
  "doubao_mobile",
  "deepseek_mobile",
  "qianwen_mobile",
  "yuanbao_mobile",
]);

const REASONING_UNSUPPORTED = new Set([
  "baiduai",
  "baidu_mobile",
  "weibo_zhisou",
]);

/**
 * Resolve the vendor's effective capability without changing diagnostic
 * acceptance records. Unknown models can be opened only by a real passed
 * reasoning_search check for the same platform and current catalog fingerprint;
 * never pass a legacy supportsReasoning flag as acceptance evidence.
 */
export function moliEffectiveReasoningSupport(
  providerCode: string,
  hasCurrentReasoningAcceptance = false,
): MoliReasoningSupport {
  if (REASONING_UNSUPPORTED.has(providerCode)) return "unsupported";
  if (REASONING_SUPPORTED.has(providerCode)) return "supported";
  return hasCurrentReasoningAcceptance ? "supported" : "unknown";
}
