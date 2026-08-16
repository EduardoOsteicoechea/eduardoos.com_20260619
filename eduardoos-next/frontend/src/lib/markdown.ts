/**
 * Small, dependency-free Markdown → safe HTML for agent chat replies.
 *
 * Why this exists:
 * Model answers often include **bold**, lists, and links. If we dump the raw
 * string into a React text node, visitors see literal asterisks. We convert a
 * practical Markdown subset to HTML after escaping so raw tags from the model
 * cannot execute as XSS.
 *
 * Flow:
 * 1. Normalize newlines and trim.
 * 2. Optionally unwrap a whole-answer ```markdown fence.
 * 3. Walk line-by-line for headings, lists, fenced code, and paragraphs.
 * 4. Escape every text segment, then apply inline **bold** / *italic* / `code` / links.
 */

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Inline formatting on already-escaped text (no raw HTML reintroduced). */
function inlineMarkdown(escaped: string): string {
  let s = escaped;
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^\w])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  s = s.replace(/(^|[^\w])_([^_\n]+)_(?!_)/g, "$1<em>$2</em>");
  s = s.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
  );
  return s;
}

/**
 * Convert Markdown text to sanitized HTML for dangerouslySetInnerHTML.
 */
export function markdownToSafeHtml(source: string): string {
  const text = source.replace(/\r\n/g, "\n").trim();
  if (!text) return "";

  const unfenced = text.replace(/^```(?:markdown|md)?\n([\s\S]*?)\n```$/i, "$1");

  const lines = unfenced.split("\n");
  const html: string[] = [];
  let i = 0;
  let inUl = false;
  let inOl = false;
  let inCode = false;
  let codeBuf: string[] = [];

  const closeLists = () => {
    if (inUl) {
      html.push("</ul>");
      inUl = false;
    }
    if (inOl) {
      html.push("</ol>");
      inOl = false;
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("```")) {
      if (inCode) {
        html.push(`<pre><code>${escapeHtml(codeBuf.join("\n"))}</code></pre>`);
        codeBuf = [];
        inCode = false;
      } else {
        closeLists();
        inCode = true;
      }
      i += 1;
      continue;
    }

    if (inCode) {
      codeBuf.push(line);
      i += 1;
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      closeLists();
      const level = heading[1].length;
      html.push(`<h${level}>${inlineMarkdown(escapeHtml(heading[2]))}</h${level}>`);
      i += 1;
      continue;
    }

    const ul = /^[-*+]\s+(.+)$/.exec(line);
    if (ul) {
      if (inOl) {
        html.push("</ol>");
        inOl = false;
      }
      if (!inUl) {
        html.push("<ul>");
        inUl = true;
      }
      html.push(`<li>${inlineMarkdown(escapeHtml(ul[1]))}</li>`);
      i += 1;
      continue;
    }

    const ol = /^\d+\.\s+(.+)$/.exec(line);
    if (ol) {
      if (inUl) {
        html.push("</ul>");
        inUl = false;
      }
      if (!inOl) {
        html.push("<ol>");
        inOl = true;
      }
      html.push(`<li>${inlineMarkdown(escapeHtml(ol[1]))}</li>`);
      i += 1;
      continue;
    }

    if (line.trim() === "") {
      closeLists();
      i += 1;
      continue;
    }

    closeLists();
    html.push(`<p>${inlineMarkdown(escapeHtml(line))}</p>`);
    i += 1;
  }

  closeLists();
  if (inCode) {
    html.push(`<pre><code>${escapeHtml(codeBuf.join("\n"))}</code></pre>`);
  }

  return html.join("");
}
