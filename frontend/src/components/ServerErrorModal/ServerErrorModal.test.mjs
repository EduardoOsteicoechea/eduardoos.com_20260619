/**
 * Unit checks for ServerErrorModal detail coercion (no DOM / no TS loader).
 * Run: node --test src/components/ServerErrorModal/ServerErrorModal.test.mjs
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

/** Mirrors coerceErrorDetails in ServerErrorModal.ts */
function coerceErrorDetails(details) {
  if (details == null) return "";
  if (typeof details === "string") return details.trim();
  if (details instanceof Error) return (details.message || String(details)).trim();

  if (typeof details === "object") {
    const o = details;
    if (typeof o.message === "string" || typeof o.error === "string") {
      const parts = [];
      if (o.method != null || o.path != null) {
        parts.push(`${String(o.method ?? "GET")} ${String(o.path ?? "")}`.trim());
      }
      if (o.status != null && o.status !== "") {
        parts.push(`HTTP ${String(o.status)}`);
      }
      const msg =
        typeof o.message === "string" ? o.message : typeof o.error === "string" ? o.error : "";
      if (msg) parts.push(msg);
      const cid = o.correlationId ?? o.correlation_id;
      if (cid != null && String(cid)) parts.push(`correlation_id=${String(cid)}`);
      if (o.rawBody != null && String(o.rawBody).trim()) {
        const raw = String(o.rawBody);
        const clipped = raw.length > 1200 ? `${raw.slice(0, 1200)}…` : raw;
        parts.push(`body=${clipped}`);
      }
      const joined = parts.join(" · ").trim();
      if (joined) return joined;
    }
    try {
      return JSON.stringify(details, null, 2).trim();
    } catch {
      return String(details).trim();
    }
  }

  return String(details).trim();
}

describe("coerceErrorDetails", () => {
  it("trims strings", () => {
    assert.equal(coerceErrorDetails("  hello  "), "hello");
  });

  it("never calls .trim on non-strings (object payload)", () => {
    const text = coerceErrorDetails({
      title: "Greek API",
      status: 502,
      message: "could not write group metadata",
      correlationId: "cid-1",
      rawBody: '{"error":"could not write group metadata"}',
    });
    assert.match(text, /HTTP 502/);
    assert.match(text, /could not write group metadata/);
    assert.match(text, /correlation_id=cid-1/);
    // Must not throw TypeError: details.trim is not a function
    assert.equal(typeof text, "string");
  });

  it("handles null / number / Error", () => {
    assert.equal(coerceErrorDetails(null), "");
    assert.equal(coerceErrorDetails(502), "502");
    assert.equal(coerceErrorDetails(new Error("boom")), "boom");
  });
});
