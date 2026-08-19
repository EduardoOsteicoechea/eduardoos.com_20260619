/**
 * Playlists client against Next GET/POST /api/playlists (+ track append).
 */

import { PLAYLIST_ROUTES } from "../config/routes";
import { apiRequest, formatApiError } from "./api";
import { getAuthToken } from "./auth";
import { createCorrelationId } from "./correlation";

export type PlaylistTrack = {
  trackId: string;
  title: string;
  url?: string;
};

export type Playlist = {
  playlistId: string;
  userId?: string;
  name: string;
  tracks?: PlaylistTrack[];
  updatedAt?: string;
};

type ListResponse = {
  items?: Playlist[];
  playlists?: Playlist[];
};

function requireToken(): string {
  const token = getAuthToken();
  if (!token) throw new Error("Sign in to manage playlists.");
  return token;
}

export async function listPlaylists(): Promise<Playlist[]> {
  const result = await apiRequest<ListResponse>(PLAYLIST_ROUTES.list, {
    correlationId: createCorrelationId(),
    authToken: requireToken(),
  });
  if (result.error) throw new Error(formatApiError(result.error));
  return result.data?.items ?? result.data?.playlists ?? [];
}

export async function createPlaylist(
  name: string,
  tracks: Array<{ title: string; url?: string }> = [],
): Promise<Playlist> {
  const result = await apiRequest<Playlist>(PLAYLIST_ROUTES.save, {
    method: "POST",
    body: {
      name: name.trim() || "Untitled playlist",
      tracks,
    },
    correlationId: createCorrelationId(),
    authToken: requireToken(),
  });
  if (result.error) throw new Error(formatApiError(result.error));
  if (!result.data?.playlistId) throw new Error("Empty playlist create response");
  return result.data;
}

export async function addPlaylistTrack(
  playlistId: string,
  title: string,
  url: string,
): Promise<Playlist> {
  const result = await apiRequest<Playlist>(PLAYLIST_ROUTES.tracks(playlistId), {
    method: "POST",
    body: {
      title: title.trim() || "Untitled track",
      url: url.trim(),
    },
    correlationId: createCorrelationId(),
    authToken: requireToken(),
  });
  if (result.error) throw new Error(formatApiError(result.error));
  if (!result.data?.playlistId) throw new Error("Empty add-track response");
  return result.data;
}
