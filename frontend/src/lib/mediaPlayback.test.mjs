/**
 * Unit checks for HTML5 audio blob gating (spec 038).
 * Run: node --test src/lib/mediaPlayback.test.mjs
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

function isPlayableAudioBlob(blob) {
  if (!blob || !Number.isFinite(blob.size) || blob.size < 64) {
    return false;
  }
  const type = (blob.type || "").toLowerCase().split(";")[0].trim();
  if (!type || type === "application/octet-stream" || type === "binary/octet-stream") {
    return blob.size > 1024;
  }
  if (type.startsWith("audio/") || type === "application/ogg") {
    return true;
  }
  return false;
}

describe("isPlayableAudioBlob", () => {
  it("rejects empty, tiny, and JSON/HTML error bodies", () => {
    assert.equal(isPlayableAudioBlob(null), false);
    assert.equal(isPlayableAudioBlob({ size: 12, type: "audio/mpeg" }), false);
    assert.equal(isPlayableAudioBlob({ size: 2000, type: "application/json" }), false);
    assert.equal(isPlayableAudioBlob({ size: 4000, type: "text/html" }), false);
  });

  it("accepts audio/* and large generic octet-stream", () => {
    assert.equal(isPlayableAudioBlob({ size: 200, type: "audio/mpeg" }), true);
    assert.equal(isPlayableAudioBlob({ size: 200, type: "audio/webm;codecs=opus" }), true);
    assert.equal(isPlayableAudioBlob({ size: 4096, type: "application/octet-stream" }), true);
    assert.equal(isPlayableAudioBlob({ size: 200, type: "application/octet-stream" }), false);
  });
});
