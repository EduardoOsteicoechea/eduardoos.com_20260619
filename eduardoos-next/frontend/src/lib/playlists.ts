/**
 * Playlists client against Next GET/POST /api/playlists.
 * Simple list + create-by-name; track editing ports later.
 */

import { PLAYLIST_ROUTES } from "../config/routes";
import { apiRequest, formatApiError } from "./api";
import { getAuthToken } from "./auth";
import { createCorrelationId } from "./correlation";

export type Playlist = {
  playlistId: string;
  userId?: string;
  name: string;
  tracks?: Record<string, unknown>[];
  updatedAt?: string;
};

type ListResponse = {
  items?: Playlist[];
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
  return result.data?.items ?? [];
}

export async function createPlaylist(name: string): Promise<Playlist> {
  const result = await apiRequest<Playlist>(PLAYLIST_ROUTES.save, {
    method: "POST",
    body: {
      name: name.trim() || "Untitled playlist",
      tracks: [],
    },
    correlationId: createCorrelationId(),
    authToken: requireToken(),
  });
  if (result.error) throw new Error(formatApiError(result.error));
  if (!result.data?.playlistId) throw new Error("Empty playlist create response");
  return result.data;
}
