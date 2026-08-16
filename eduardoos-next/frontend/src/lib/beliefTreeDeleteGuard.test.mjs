/**
 * Node tests for belief-tree delete-key guards.
 * Run: node --test src/lib/beliefTreeDeleteGuard.test.mjs
 *
 * Mirrors src/lib/beliefTreeDeleteGuard.ts — keep in sync.
 *
 * Repro (pre-fix): select an idea, focus "Add group" (or leave textarea),
 * press Backspace → xyflow global deleteKeyCode removes the selected idea.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

const INPUT_TAGS = new Set(["INPUT", "SELECT", "TEXTAREA"]);

function shouldIgnoreFlowDeleteKey(target) {
  if (!target || typeof target !== "object") return true;
  const el = target;
  if (typeof el.tagName !== "string") return true;
  const tag = el.tagName;
  if (INPUT_TAGS.has(tag)) return true;
  if (el.isContentEditable) return true;
  if (typeof el.closest === "function" && el.closest(".nokey")) return true;
  if (tag === "BUTTON" || tag === "A") return true;
  if (typeof el.closest === "function" && el.closest("button, a, label")) return true;
  return false;
}

function isFlowDeleteKey(key) {
  return key === "Backspace" || key === "Delete";
}

describe("isFlowDeleteKey", () => {
  it("accepts Backspace and Delete only", () => {
    assert.equal(isFlowDeleteKey("Backspace"), true);
    assert.equal(isFlowDeleteKey("Delete"), true);
    assert.equal(isFlowDeleteKey("Enter"), false);
    assert.equal(isFlowDeleteKey("a"), false);
  });
});

describe("shouldIgnoreFlowDeleteKey", () => {
  it("ignores nullish / non-elements", () => {
    assert.equal(shouldIgnoreFlowDeleteKey(null), true);
    assert.equal(shouldIgnoreFlowDeleteKey(undefined), true);
    assert.equal(shouldIgnoreFlowDeleteKey("x"), true);
  });

  it("ignores form fields and contenteditable", () => {
    assert.equal(shouldIgnoreFlowDeleteKey({ tagName: "INPUT" }), true);
    assert.equal(shouldIgnoreFlowDeleteKey({ tagName: "TEXTAREA" }), true);
    assert.equal(shouldIgnoreFlowDeleteKey({ tagName: "SELECT" }), true);
    assert.equal(
      shouldIgnoreFlowDeleteKey({ tagName: "DIV", isContentEditable: true }),
      true,
    );
  });

  it("ignores buttons (toolbar Add group) and nokey chrome", () => {
    assert.equal(shouldIgnoreFlowDeleteKey({ tagName: "BUTTON" }), true);
    assert.equal(
      shouldIgnoreFlowDeleteKey({
        tagName: "DIV",
        closest: (sel) => (sel === ".nokey" ? {} : null),
      }),
      true,
    );
    assert.equal(
      shouldIgnoreFlowDeleteKey({
        tagName: "SPAN",
        closest: (sel) => (sel === "button, a, label" ? {} : null),
      }),
      true,
    );
  });

  it("allows delete when target is a plain canvas/node surface", () => {
    assert.equal(
      shouldIgnoreFlowDeleteKey({
        tagName: "DIV",
        isContentEditable: false,
        closest: () => null,
      }),
      false,
    );
  });
});