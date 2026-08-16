/**
 * Smoke checks for agent identity copy (non-impersonation).
 * Run: node --test src/lib/agentVoice.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, "agentVoice.ts"), "utf8");

describe("agentVoice identity", () => {
  it("discloses AI agent and denies being Eduardo", () => {
    assert.match(src, /AI agent/);
    assert.match(src, /not Eduardo/);
    assert.doesNotMatch(src, /I am Eduardo Osteicoechea/i);
    assert.doesNotMatch(src, /Speak in first person as Eduardo/i);
  });
});
