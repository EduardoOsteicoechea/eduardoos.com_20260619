/**
 * media.ts — Client for S3 media gallery API routes.
 */

import { apiRequest } from "./api";
import { MEDIA_ROUTES } from "../config/routes";
import { createCorrelationId } from "./telemetry";

export interface MediaImage {
  key: string;
  name: string;
  content_type: string;
  size: number;
  size_human: string;
  last_modified: string;
  url: string;
  s3_url: string;
}

export interface MediaImagesResponse {
  bucket: string;
  backend: string;
  count: number;
  images: MediaImage[];
}

export async function fetchMediaImages(): Promise<MediaImagesResponse> {
  const correlationId = createCorrelationId();
  const result = await apiRequest<MediaImagesResponse>(MEDIA_ROUTES.images, {
    correlationId,
  });
  if (result.error) {
    throw new Error(result.error.message);
  }
  return {
    bucket: result.data?.bucket ?? "",
    backend: result.data?.backend ?? "",
    count: result.data?.count ?? 0,
    images: result.data?.images ?? [],
  };
}

export function formatMediaDate(iso: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

export function sortImagesByName(images: MediaImage[]): MediaImage[] {
  return [...images].sort((a, b) => a.name.localeCompare(b.name));
}
