/**
 * Unit checks for safe Markdown → HTML (no TS loader).
 * Mirrors markdown.ts — keep in sync.
 * Run: node --test src/lib/markdown.test.mjs
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

function escapeHtml(raw) {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function inlineMarkdown(escaped) {
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

function markdownToSafeHtml(source) {
  const text = source.replace(/\r\n/g, "\n").trim();
  if (!text) return "";

  const unfenced = text.replace(/^```(?:markdown|md)?\n([\s\S]*?)\n```$/i, "$1");

  const lines = unfenced.split("\n");
  const html = [];
  let i = 0;
  let inUl = false;
  let inOl = false;
  let inCode = false;
  let codeBuf = [];

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

describe("markdownToSafeHtml", () => {
  it("renders bold and lists without leaving asterisks", () => {
    const out = markdownToSafeHtml("**Hello**\n\n- one\n- two");
    assert.match(out, /<strong>Hello<\/strong>/);
    assert.match(out, /<ul>/);
    assert.match(out, /<li>one<\/li>/);
    assert.doesNotMatch(out, /\*\*Hello\*\*/);
  });

  it("escapes raw HTML from the model", () => {
    const out = markdownToSafeHtml('<script>alert(1)</script>\n\n**ok**');
    assert.match(out, /&lt;script&gt;/);
    assert.doesNotMatch(out, /<script>/);
    assert.match(out, /<strong>ok<\/strong>/);
  });

  it("allows https links only via markdown syntax", () => {
    const out = markdownToSafeHtml("[site](https://eduardoos.com/path)");
    assert.match(
      out,
      /<a href="https:\/\/eduardoos.com\/path" target="_blank" rel="noopener noreferrer">site<\/a>/,
    );
  });
});
