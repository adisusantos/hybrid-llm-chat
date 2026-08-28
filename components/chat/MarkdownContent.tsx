"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import rehypeRaw from "rehype-raw";
import { remarkDialog } from "@/lib/markdown/remark-dialog";
import { cn } from "@/lib/utils";

type Props = {
  content: string;
  className?: string;
};

export function MarkdownContent({ content, className }: Props) {
  // Trim leading/trailing whitespace to prevent overflow from indentation
  const trimmedContent = content.trim();
  
  return (
    <div className={cn("prose prose-sm dark:prose-invert min-w-0 max-w-none overflow-x-hidden break-words", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks, remarkDialog]}
        rehypePlugins={[rehypeRaw]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="underline break-all">
              {children}
            </a>
          ),
          em: ({ children, ...props }) => (
            <em className="text-muted-foreground break-words" {...props}>
              {children}
            </em>
          ),
          p: ({ children }) => (
            <p className="whitespace-pre-wrap break-words mb-0">
              {children}
            </p>
          ),
          code: ({ children, ...props }) => (
            <code className="break-all whitespace-pre-wrap" {...props}>
              {children}
            </code>
          ),
          pre: ({ children, ...props }) => (
            <pre className="overflow-x-auto break-words" {...props}>
              {children}
            </pre>
          ),
          span: ({ children, ...props }) => (
            <span className="break-words" {...props}>
              {children}
            </span>
          ),
          strong: ({ children, ...props }) => (
            <strong className="break-words" {...props}>
              {children}
            </strong>
          ),
          li: ({ children, ...props }) => (
            <li className="break-words" {...props}>
              {children}
            </li>
          ),
          div: ({ children, ...props }) => (
            <div className="break-words" {...props}>
              {children}
            </div>
          ),
        }}
      >
        {trimmedContent}
      </ReactMarkdown>
    </div>
  );
}
