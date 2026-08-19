/**
 * Focused Node tests for APS registry list normalization.
 * Run: node --test src/lib/apsRegistry.test.mjs
 *
 * Mirrors src/lib/apsRegistry.ts — keep logic in sync when changing either file.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

function unwrapList(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (typeof payload !== "object") return [];
  const obj = payload;
  if (Array.isArray(obj.data)) return obj.data;
  if (Array.isArray(obj.items)) return obj.items;
  return [];
}

function normalizeRegistryLists(registry) {
  if (!registry) {
    return { bundles: [], activities: [], engines: [] };
  }
  const bundlesSource =
    registry.bundles !== undefined && registry.bundles !== null
      ? registry.bundles
      : registry.appbundles;
  return {
    bundles: unwrapList(bundlesSource),
    activities: unwrapList(registry.activities),
    engines: unwrapList(registry.engines),
  };
}

describe("unwrapList", () => {
  it("returns empty for nullish / non-list shapes", () => {
    assert.deepEqual(unwrapList(null), []);
    assert.deepEqual(unwrapList(undefined), []);
    assert.deepEqual(unwrapList("x"), []);
    assert.deepEqual(unwrapList({ pagination: { totalResults: 1 } }), []);
  });

  it("passes through arrays", () => {
    assert.deepEqual(unwrapList(["a", "b"]), ["a", "b"]);
  });

  it("unwraps Autodesk DA { data: [] } objects (the crash shape)", () => {
    const da = {
      pagination: { limit: 100, offset: 0, totalResults: 2 },
      data: ["Nick.Bundle+prod", "Nick.Other+prod"],
    };
    assert.deepEqual(unwrapList(da), ["Nick.Bundle+prod", "Nick.Other+prod"]);
  });

  it("unwraps { items: [] }", () => {
    assert.deepEqual(unwrapList({ items: [{ id: "1" }] }), [{ id: "1" }]);
  });
});

describe("normalizeRegistryLists", () => {
  it("does not throw and yields arrays when backend forwards raw DA maps", () => {
    const registry = {
      appbundles: { data: ["B1"], pagination: {} },
      activities: { data: ["A1", "A2"] },
      engines: { data: ["Autodesk.Revit+2024"] },
    };
    const lists = normalizeRegistryLists(registry);
    assert.equal(Array.isArray(lists.bundles), true);
    assert.equal(Array.isArray(lists.activities), true);
    assert.equal(Array.isArray(lists.engines), true);
    assert.deepEqual(lists.bundles, ["B1"]);
    assert.deepEqual(lists.activities, ["A1", "A2"]);
    assert.deepEqual(lists.engines, ["Autodesk.Revit+2024"]);
    // Safe to map — this is what used to blank the APS admin UI.
    assert.deepEqual(
      lists.bundles.map((b) => String(b)),
      ["B1"],
    );
  });

  it("prefers bundles over appbundles when both exist", () => {
    const lists = normalizeRegistryLists({
      bundles: ["from-bundles"],
      appbundles: { data: ["from-appbundles"] },
      activities: [],
      engines: [],
    });
    assert.deepEqual(lists.bundles, ["from-bundles"]);
  });

  it("handles null registry", () => {
    assert.deepEqual(normalizeRegistryLists(null), {
      bundles: [],
      activities: [],
      engines: [],
    });
  });
});
