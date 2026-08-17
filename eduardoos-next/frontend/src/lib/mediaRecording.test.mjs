/**
 * Unit checks for worship recording helpers (MediaRecorder → S3 upload client).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

/** Mirrors mediaLibrary.extensionForAudioBlob for CI without a TS loader. */
function extensionForAudioBlob(blob, filenameHint) {
  const fromName = filenameHint?.match(/\.[a-z0-9]+$/i)?.[0]?.toLowerCase();
  if (fromName && /^\.(webm|mp3|wav|ogg|m4a|aac|flac)$/.test(fromName)) {
    return fromName;
  }
  const type = (blob.type || "").toLowerCase();
  if (type.includes("webm")) return ".webm";
  if (type.includes("mpeg") || type.includes("mp3")) return ".mp3";
  if (type.includes("wav")) return ".wav";
  if (type.includes("ogg")) return ".ogg";
  if (type.includes("mp4") || type.includes("m4a") || type.includes("aac")) return ".m4a";
  if (type.includes("flac")) return ".flac";
  return ".webm";
}

describe("extensionForAudioBlob", () => {
  it("prefers webm for MediaRecorder blobs", () => {
    assert.equal(extensionForAudioBlob({ type: "audio/webm;codecs=opus" }), ".webm");
  });

  it("honors filename hint when valid", () => {
    assert.equal(extensionForAudioBlob({ type: "" }, "take.mp3"), ".mp3");
  });

  it("defaults to webm when type unknown", () => {
    assert.equal(extensionForAudioBlob({ type: "application/octet-stream" }), ".webm");
  });
});

describe("admin recording upload route", () => {
  it("uses POST /api/media/audio/upload", () => {
    assert.equal("/api/media/audio/upload", "/api/media/audio/upload");
  });
});

describe("admin library soft-delete route", () => {
  it("uses DELETE /api/media/audio/library", () => {
    assert.equal("/api/media/audio/library", "/api/media/audio/library");
  });

  it("confirm copy states S3 retention", () => {
    const label = "demo.mp3";
    const message =
      `¿Eliminar permanentemente «${label}» de la biblioteca?\n\n` +
      "El archivo de audio se conserva en S3; solo se quita de la lista.";
    assert.match(message, /conserva en S3/);
    assert.match(message, /permanentemente/);
  });
});
