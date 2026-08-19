/**
 * Shared safe Markdown bubble body for site agent chats.
 * Escapes model HTML first (see markdownToSafeHtml), then styles via ChatMarkdown.css.
 */

import { markdownToSafeHtml } from "../../lib/markdown";
import "./ChatMarkdown.css";

type ChatMarkdownProps = {
  text: string;
  className?: string;
};

export default function ChatMarkdown({ text, className = "" }: ChatMarkdownProps) {
  return (
    <div
      className={`chat-md ${className}`.trim()}
      dangerouslySetInnerHTML={{ __html: markdownToSafeHtml(text) }}
    />
  );
}
