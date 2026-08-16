/**
 * Unit checks for profile image URL resolution (no network).
 * Run: node --test src/lib/profile.test.mjs
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * Mirrors resolveProfileImageUrl / profileImageUrlFromKey from profile.ts
 * so Node can test without a TS loader. Keep in sync with profile.ts.
 */
function profileImageUrlFromKey(objectKey) {
  let key = objectKey.trim().replace(/^\/+/, "");
  if (!key) return "";
  if (key.startsWith("media/")) {
    key = key.slice("media/".length);
  }
  const encoded = key
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `/api/media/file/${encoded}`;
}

function resolveProfileImageUrl(profile) {
  if (!profile) return "";
  const direct = profile.profileImageUrl?.trim() ?? "";
  if (direct) return direct;
  const key = profile.profileImageKey?.trim() ?? "";
  if (!key) return "";
  return profileImageUrlFromKey(key);
}

describe("profile image URL resolution", () => {
  it("prefers explicit profileImageUrl", () => {
    assert.equal(
      resolveProfileImageUrl({
        email: "a@b.com",
        profileImageUrl: "/api/media/file/profiles/a%40b.com/avatar.png",
        profileImageKey: "media/profiles/a@b.com/avatar.png",
      }),
      "/api/media/file/profiles/a%40b.com/avatar.png",
    );
  });

  it("derives URL from media/ key", () => {
    assert.equal(
      resolveProfileImageUrl({
        email: "user@example.com",
        profileImageKey: "media/profiles/user@example.com/avatar.png",
      }),
      "/api/media/file/profiles/user%40example.com/avatar.png",
    );
  });

  it("derives URL from profiles/ key", () => {
    assert.equal(
      resolveProfileImageUrl({
        email: "user@example.com",
        profileImageKey: "profiles/user@example.com/avatar.webp",
      }),
      "/api/media/file/profiles/user%40example.com/avatar.webp",
    );
  });

  it("returns empty when no image fields", () => {
    assert.equal(resolveProfileImageUrl({ email: "x@y.com" }), "");
    assert.equal(resolveProfileImageUrl(null), "");
  });
});
