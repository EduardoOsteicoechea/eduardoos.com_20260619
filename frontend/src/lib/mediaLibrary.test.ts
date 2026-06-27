import { describe, expect, it } from "vitest";
import {
  encodeMediaRelativePath,
  mediaObjectPlaybackUrl,
  normalizeMediaPlaybackUrl,
} from "./mediaLibrary";

describe("mediaLibrary playback URLs", () => {
  it("encodes each segment but keeps slashes literal", () => {
    expect(encodeMediaRelativePath("worship_playlists/Ayúdame. Cánticos espirituales..mp3")).toBe(
      "worship_playlists/Ay%C3%BAdame.%20C%C3%A1nticos%20espirituales..mp3",
    );
  });

  it("builds playback URL from full S3 object key", () => {
    expect(
      mediaObjectPlaybackUrl("media/worship_playlists/song.mp3"),
    ).toBe("/api/media/file/worship_playlists/song.mp3");
  });

  it("normalizes legacy %2F URLs from the audio list API", () => {
    const legacy =
      "/api/media/file/worship_playlists%2FAy%C3%BAdame.%20C%C3%A1nticos%20espirituales..mp3";
    expect(normalizeMediaPlaybackUrl(legacy)).toBe(
      "/api/media/file/worship_playlists/Ay%C3%BAdame.%20C%C3%A1nticos%20espirituales..mp3",
    );
  });

  it("uses normalized playback URL when API returns legacy encoding", () => {
    const legacy =
      "/api/media/file/worship_playlists%2FReposo%20%28Salmo%203%29..mp3";
    expect(
      mediaObjectPlaybackUrl("media/worship_playlists/Reposo (Salmo 3)..mp3", legacy),
    ).toBe("/api/media/file/worship_playlists/Reposo%20%28Salmo%203%29..mp3");
  });
});
