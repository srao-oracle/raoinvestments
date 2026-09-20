"use client";

import { isValidElement, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { AnalysisChart } from "./charts/analysis-chart";

function extractText(node: ReactNode): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (isValidElement(node)) {
    const props = node.props as { children?: ReactNode };
    return extractText(props.children);
  }
  return "";
}

const components: Components = {
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline underline-offset-2 hover:opacity-80"
    >
      {children}
    </a>
  ),
  h1: ({ children }) => <h1 className="mt-4 mb-2 text-lg font-semibold">{children}</h1>,
  h2: ({ children }) => <h2 className="mt-4 mb-2 text-base font-semibold">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-3 mb-1.5 text-sm font-semibold">{children}</h3>,
  h4: ({ children }) => <h4 className="mt-2 mb-1 text-sm font-semibold">{children}</h4>,
  p: ({ children }) => <p className="my-2 leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-[var(--color-border)] pl-3 text-[var(--color-muted-foreground)]">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-4 border-[var(--color-border)]" />,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  table: ({ children }) => (
    <div className="my-3 -mx-1 overflow-x-auto">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-[var(--color-border)] px-2 py-1 text-left font-semibold">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-[var(--color-border)] px-2 py-1 align-top">{children}</td>
  ),
  code: ({ className, children }) => {
    const lang = /language-(\w+)/.exec(className || "")?.[1];
    if (lang === "chart") return <AnalysisChart raw={extractText(children).trim()} />;
    if (lang) return <code className={className}>{children}</code>;
    return (
      <code className="rounded bg-[var(--color-muted)] px-1 py-0.5 text-[0.85em]">{children}</code>
    );
  },
  pre: ({ children }) => {
    // Unwrap our chart blocks so the chart isn't rendered as preformatted text.
    const child = Array.isArray(children) ? children[0] : children;
    const cls = isValidElement(child)
      ? String((child.props as { className?: string }).className ?? "")
      : "";
    if (cls.includes("language-chart")) return <>{children}</>;
    return (
      <pre className="my-2 overflow-x-auto rounded-md bg-[var(--color-muted)] p-3 text-xs">
        {children}
      </pre>
    );
  },
};

/** Renders agent-generated markdown (GFM) with inline ```chart blocks. Mobile-safe. */
export function Markdown({ content, className = "" }: { content: string; className?: string }) {
  return (
    <div className={`text-sm break-words [overflow-wrap:anywhere] ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
