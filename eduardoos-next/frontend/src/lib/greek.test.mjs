/**
 * Unit checks for Greek slug/ordinal/path/alphabet helpers (mirrors greek.ts; no TS loader).
 * Run: node --test src/lib/greek.test.mjs
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

const GREEK_BUILD = "/greek/build";
const GREEK_WORKSPACE = "/greek/build/workspace";

function sanitizeGreekSlug(raw) {
  const lower = raw.trim().toLowerCase();
  if (!lower) return "";
  let out = "";
  let prevHyphen = false;
  for (const ch of lower) {
    if (/[a-z0-9]/.test(ch)) {
      out += ch;
      prevHyphen = false;
    } else if (" _-./".includes(ch)) {
      if (out.length > 0 && !prevHyphen) {
        out += "-";
        prevHyphen = true;
      }
    }
  }
  out = out.replace(/^-+|-+$/g, "");
  if (out.length > 80) out = out.slice(0, 80).replace(/-+$/g, "");
  if (!out || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(out)) return "";
  return out;
}

function validateOrdinals(ordinalChapter, ordinalBook) {
  if (!Number.isInteger(ordinalChapter) || ordinalChapter < 1 || ordinalChapter > 1000) {
    return "ordinalChapter must be 1–1000";
  }
  if (!Number.isInteger(ordinalBook) || ordinalBook < 1 || ordinalBook > 10000) {
    return "ordinalBook must be 1–10000";
  }
  return null;
}

function validateAlphabetNumber(n) {
  if (!Number.isFinite(n) || n < 1 || n > 30) {
    return "alphabetNumber must be 1–30";
  }
  if (Math.abs(n * 10 - Math.round(n * 10)) > 1e-6) {
    return "alphabetNumber must use steps of 0.1 (e.g. 1.1, 1.2)";
  }
  return null;
}

function greekAlphabetNumberOptions() {
  const out = [];
  for (let n = 1; n <= 30; n += 1) {
    out.push(n);
    if (n < 30) {
      for (let d = 1; d <= 9; d += 1) {
        out.push(Math.round((n + d / 10) * 10) / 10);
      }
    }
  }
  return out;
}

function resolveGroupSlugFromLocation(pathname, search) {
  const q = new URLSearchParams(search).get("group");
  if (q) return decodeURIComponent(q.trim());
  const prefix = `${GREEK_BUILD}/`;
  if (!pathname.startsWith(prefix)) return "";
  const rest = pathname.slice(prefix.length).replace(/\/$/, "");
  if (!rest || rest === "workspace") return "";
  return decodeURIComponent(rest);
}

function greekGroupWorkspaceHref(slug) {
  return `${GREEK_WORKSPACE}?group=${encodeURIComponent(slug)}`;
}

function strokesToLetterSvg(strokes, canvasWidth, canvasHeight) {
  const sx = 32 / Math.max(1, canvasWidth);
  const sy = 64 / Math.max(1, canvasHeight);
  const paths = [];
  for (const stroke of strokes) {
    if (!stroke.length) continue;
    let d = "";
    stroke.forEach((p, i) => {
      const x = (p.x * sx).toFixed(2);
      const y = (p.y * sy).toFixed(2);
      d += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
    });
    paths.push(`<path d="${d}"`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="64" viewBox="0 0 32 64">${paths.join("")}</svg>`;
}

describe("greek helpers", () => {
  it("sanitizeGreekSlug mirrors Go", () => {
    assert.equal(sanitizeGreekSlug("John 3:16!"), "john-316");
    assert.equal(sanitizeGreekSlug(""), "");
  });

  it("validateOrdinals enforces chapter/book ranges", () => {
    assert.equal(validateOrdinals(1, 1), null);
    assert.ok(validateOrdinals(0, 1));
    assert.ok(validateOrdinals(1, 10001));
  });

  it("validateAlphabetNumber allows 1–30 with 0.1 steps", () => {
    assert.equal(validateAlphabetNumber(1), null);
    assert.equal(validateAlphabetNumber(1.1), null);
    assert.equal(validateAlphabetNumber(13.1), null);
    assert.equal(validateAlphabetNumber(30), null);
    assert.ok(validateAlphabetNumber(0));
    assert.ok(validateAlphabetNumber(31));
    assert.ok(validateAlphabetNumber(1.15));
  });

  it("koine-style numbering uses integer letter + decimal variants", () => {
    // Mirror of Go KoineCatalogSeed scheme: n=upper, n.1=lower, n.2+=accents.
    const samples = [
      { slug: "alpha-upper", n: 1 },
      { slug: "alpha-lower", n: 1.1 },
      { slug: "nu-lower", n: 13.1 },
      { slug: "sigma-final", n: 18.2 },
      { slug: "omega-iota-sub", n: 24.9 },
    ];
    for (const s of samples) {
      assert.equal(validateAlphabetNumber(s.n), null, s.slug);
    }
    assert.equal(Math.floor(13.1), 13);
    assert.equal(Math.round((13.1 % 1) * 10), 1);
  });

  it("greekAlphabetNumberOptions includes decimals between integers", () => {
    const opts = greekAlphabetNumberOptions();
    assert.ok(opts.includes(1));
    assert.ok(opts.includes(1.1));
    assert.ok(opts.includes(1.2));
    assert.ok(opts.includes(30));
    assert.equal(opts[opts.length - 1], 30);
  });

  it("resolveGroupSlugFromLocation reads query and pretty path", () => {
    assert.equal(
      resolveGroupSlugFromLocation("/greek/build/workspace", "?group=genesis"),
      "genesis",
    );
    assert.equal(resolveGroupSlugFromLocation("/greek/build/genesis", ""), "genesis");
    assert.equal(resolveGroupSlugFromLocation("/greek/build/workspace", ""), "");
  });

  it("greekGroupWorkspaceHref points at workspace shell", () => {
    assert.equal(
      greekGroupWorkspaceHref("genesis"),
      "/greek/build/workspace?group=genesis",
    );
  });

  it("strokesToLetterSvg emits 32x64 svg", () => {
    const svg = strokesToLetterSvg(
      [
        [
          { x: 0, y: 0 },
          { x: 100, y: 200 },
        ],
      ],
      256,
      512,
    );
    assert.match(svg, /width="32"/);
    assert.match(svg, /height="64"/);
    assert.match(svg, /<path d=/);
  });
});
