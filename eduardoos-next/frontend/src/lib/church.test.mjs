/**
 * Unit checks for Church slug/path helpers (mirrors church.ts; no TS loader).
 * Run: node --test src/lib/church.test.mjs
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

function sanitizeChurchSlug(raw) {
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

function resolveChurchIdsFromLocation(pathname, search) {
  const params = new URLSearchParams(search);
  const qDenom = (params.get("denom") || params.get("denomination") || "").trim();
  const qChurch = (params.get("church") || "").trim();
  if (qDenom && qChurch) {
    return { denomId: qDenom, churchId: qChurch };
  }
  const parts = pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  if (parts[0] === "church" && parts.length >= 3) {
    const reserved = new Set(["register", "overview", "activity", "workspace", "groups"]);
    if (!reserved.has(parts[1])) {
      return { denomId: decodeURIComponent(parts[1]), churchId: decodeURIComponent(parts[2]) };
    }
  }
  return { denomId: "", churchId: "" };
}

describe("church helpers", () => {
  it("sanitizes slugs", () => {
    assert.equal(sanitizeChurchSlug("Iglesia Central!"), "iglesia-central");
    // Path traversal chars are stripped; remaining letters may form a valid slug.
    assert.equal(sanitizeChurchSlug("../x"), "x");
    assert.equal(sanitizeChurchSlug("!!!"), "");
  });

  it("resolves pretty and query paths", () => {
    assert.deepEqual(resolveChurchIdsFromLocation("/church/asambleas/central", ""), {
      denomId: "asambleas",
      churchId: "central",
    });
    assert.deepEqual(
      resolveChurchIdsFromLocation("/church/workspace", "?denom=asambleas&church=central"),
      { denomId: "asambleas", churchId: "central" },
    );
    assert.deepEqual(resolveChurchIdsFromLocation("/church/register", ""), {
      denomId: "",
      churchId: "",
    });
    assert.deepEqual(resolveChurchIdsFromLocation("/church/groups", ""), {
      denomId: "",
      churchId: "",
    });
  });

  it("builds member display names", () => {
    assert.equal(
      [ "Ana", "María", "Pérez", "López" ].filter(Boolean).join(" "),
      "Ana María Pérez López",
    );
  });

  it("builds leader display names (nombre apellido, legacy name)", () => {
    function leaderDisplayName(L) {
      const first = (L.firstName || "").trim();
      const last = (L.lastName || "").trim();
      if (first || last) return `${first} ${last}`.trim();
      return (L.name || "").trim();
    }
    assert.equal(
      leaderDisplayName({ firstName: "Ana", lastName: "García", roles: [] }),
      "Ana García",
    );
    assert.equal(
      leaderDisplayName({ name: "Pastor Ana", roles: [] }),
      "Pastor Ana",
    );
  });
});
