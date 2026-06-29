import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, Blob>();

vi.mock("localforage", () => ({
  default: {
    createInstance: () => ({
      setItem: async (key: string, value: Blob) => {
        store.set(key, value);
      },
      getItem: async (key: string) => store.get(key) ?? null,
    }),
  },
}));

import {
  countOfflineTracks,
  hasOfflineTrack,
  saveTrackOffline,
  saveTracksOfflineBulk,
} from "./offlineAudio";

describe("offlineAudio bulk download", () => {
  beforeEach(() => {
    store.clear();
    vi.restoreAllMocks();
  });

  it("saves multiple unique tracks", async () => {
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      blob: async () => new Blob([url], { type: "audio/mpeg" }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await saveTracksOfflineBulk([
      { trackId: "a", url: "/api/media/file/a.mp3" },
      { trackId: "b", url: "/api/media/file/b.mp3" },
    ]);

    expect(result).toEqual({ saved: 2, skipped: 0, failed: 0 });
    expect(await hasOfflineTrack("a")).toBe(true);
    expect(await hasOfflineTrack("b")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("skips tracks already cached", async () => {
    store.set("cached", new Blob(["cached"], { type: "audio/mpeg" }));
    const fetchMock = vi.fn(async () => ({
      ok: true,
      blob: async () => new Blob(["x"], { type: "audio/mpeg" }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await saveTracksOfflineBulk([
      { trackId: "cached", url: "/api/media/file/cached.mp3" },
      { trackId: "new", url: "/api/media/file/new.mp3" },
    ]);

    expect(result).toEqual({ saved: 1, skipped: 1, failed: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("counts offline tracks", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      blob: async () => new Blob(["x"], { type: "audio/mpeg" }),
    })));
    await saveTrackOffline("one", "/one.mp3");
    const count = await countOfflineTracks(["one", "two", "one"]);
    expect(count).toBe(1);
  });
});
