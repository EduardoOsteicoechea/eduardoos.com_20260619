/**
 * playlists.ts — Client for playlist save/load gateway routes.
 * All calls attach X-Correlation-ID and the stored JWT (Authorization: Bearer).
 */

import { apiRequest } from "./api";
import { getAuthToken } from "./auth";
import { PLAYLIST_ROUTES } from "../config/routes";
import { createCorrelationId } from "./telemetry";

export interface PlaylistRecord {
  userId: string;
  playlistId: string;
  name: string;
  trackIds: string[];
  createdAt: string;
  updatedAt: string;
  lastCorrelationId?: string;
}

export interface SavePlaylistPayload {
  playlistId?: string;
  name: string;
  trackIds: string[];
}

export interface PlaylistsResponse {
  count: number;
  playlists: PlaylistRecord[];
}

export async function fetchPlaylists(): Promise<PlaylistsResponse> {
  const correlationId = createCorrelationId();
  const token = getAuthToken();
  const result = await apiRequest<PlaylistsResponse>(PLAYLIST_ROUTES.list, {
    correlationId,
    authToken: token,
  });
  if (result.error) {
    throw new Error(result.error.message);
  }
  return {
    count: result.data?.count ?? 0,
    playlists: result.data?.playlists ?? [],
  };
}

export async function savePlaylist(
  payload: SavePlaylistPayload
): Promise<PlaylistRecord> {
  const correlationId = createCorrelationId();
  const token = getAuthToken();
  const result = await apiRequest<PlaylistRecord>(PLAYLIST_ROUTES.save, {
    method: "POST",
    body: payload,
    correlationId,
    authToken: token,
  });
  if (result.error) {
    throw new Error(result.error.message);
  }
  if (!result.data) {
    throw new Error("Empty playlist response");
  }
  return result.data;
}
