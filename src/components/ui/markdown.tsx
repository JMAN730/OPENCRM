"use client";

import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders assistant chat content as GitHub-flavoured markdown. Styling lives in
 * the `.crm-md` rules in globals.css so it stays theme-aware via the --crm-*
 * tokens. Links open in a new tab; internal links (e.g. /team/<id>) navigate
 * within the app.
 */
export function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="crm-md">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => {
            const internal = href?.startsWith("/");
            return (
              <a
                href={href}
                target={internal ? undefined : "_blank"}
                rel={internal ? undefined : "noopener noreferrer"}
              >
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
