import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { RunAttempt } from "../../domain";
import { safeExternalUrl } from "./selectors";

type MarkdownNode = {
  type: string;
  value?: string;
  url?: string;
  title?: string | null;
  data?: { hProperties?: Record<string, unknown> };
  children?: MarkdownNode[];
};

const citationPattern = /\[citation:(\d{1,4})\]/giu;
const excludedCitationNodes = new Set([
  "code",
  "definition",
  "html",
  "image",
  "imageReference",
  "inlineCode",
  "link",
  "linkReference",
]);

function sourceForCitation(attempt: RunAttempt, number: number) {
  return Number.isSafeInteger(number) && number > 0
    ? attempt.sources.find((source) => source.providerPosition === number)
    : undefined;
}

function citationNodes(value: string, attempt: RunAttempt): MarkdownNode[] {
  const nodes: MarkdownNode[] = [];
  let cursor = 0;
  citationPattern.lastIndex = 0;
  for (const match of value.matchAll(citationPattern)) {
    const index = match.index ?? 0;
    const number = Number(match[1]);
    if (index > cursor)
      nodes.push({ type: "text", value: value.slice(cursor, index) });
    const source = sourceForCitation(attempt, number);
    const verified =
      attempt.citationProvenance === "explicit" &&
      source?.isCited === true &&
      (!source.citationProvenance || source.citationProvenance === "explicit");
    const url = safeExternalUrl(source?.url);
    nodes.push(
      verified && url
        ? {
            type: "link",
            url,
            title: `引用 ${number} · ${source?.title || "未命名来源"}`,
            data: {
              hProperties: {
                className: ["inline-citation-link"],
                "aria-label": `引用 ${number}：${source?.title || "未命名来源"}`,
                "data-citation-number": String(number),
              },
            },
            children: [{ type: "text", value: `[${number}]` }],
          }
        : {
            type: "text",
            value: verified ? `［引用 ${number}］` : `［来源 ${number}］`,
          },
    );
    cursor = index + match[0].length;
  }
  if (!nodes.length) return [{ type: "text", value }];
  if (cursor < value.length)
    nodes.push({ type: "text", value: value.slice(cursor) });
  return nodes;
}

function citationPlugin(attempt?: RunAttempt) {
  return () => (tree: MarkdownNode) => {
    if (!attempt) return;
    const visit = (node: MarkdownNode) => {
      if (excludedCitationNodes.has(node.type) || !node.children) return;
      node.children = node.children.flatMap((child) => {
        if (child.type === "text" && child.value)
          return citationNodes(child.value, attempt);
        visit(child);
        return [child];
      });
    };
    visit(tree);
  };
}

const components: Components = {
  a({ href, children, title, node: _node, ...props }) {
    const safeHref = safeExternalUrl(href);
    return safeHref ? (
      <a
        {...props}
        href={safeHref}
        title={title}
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
      </a>
    ) : (
      <span>{children}</span>
    );
  },
  img({ alt, node: _node }) {
    return (
      <span className="fm-blocked-markdown-image" role="note">
        外部图片已拦截{alt ? `：${alt}` : ""}
      </span>
    );
  },
  table({ children, node: _node, ...props }) {
    return (
      <div className="fm-markdown-table-scroll" tabIndex={0}>
        <table {...props}>{children}</table>
      </div>
    );
  },
};

export function MonitoringMarkdown({
  markdown,
  attempt,
  className,
}: {
  markdown?: string;
  attempt?: RunAttempt;
  className?: string;
}) {
  const content = markdown?.trim();
  if (!content)
    return (
      <div className={className}>
        <div className="fm-reader-empty">该回答尚无有效正文</div>
      </div>
    );
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, citationPlugin(attempt)]}
        components={components}
        skipHtml
        urlTransform={(url) => safeExternalUrl(url) ?? ""}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export function MonitoringReasoning({
  markdown,
  attempt,
}: {
  markdown?: string;
  attempt?: RunAttempt;
}) {
  return (
    <MonitoringMarkdown
      markdown={markdown}
      attempt={attempt}
      className="fm-reasoning-markdown"
    />
  );
}
