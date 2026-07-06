/**
 * profile.ts — Authenticated profile image API helpers.
 */
import { apiRequest } from "./api";
import { AUTH_ROUTES, getAuthToken } from "./auth";
import { createCorrelationId } from "./telemetry";
import { humanizeS3Error } from "./s3Errors";

export interface UserProfile {
  email: string;
  profileImageKey: string;
  profileImageUrl: string;
}

export const PROFILE_IMAGE_UPDATED_EVENT = "eduardoos-profile-image-updated";

/** Appends a cache-busting query param so the browser loads a fresh avatar. */
export function profileImageUrlWithCacheBust(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) {
    return "";
  }
  const separator = trimmed.includes("?") ? "&" : "?";
  return `${trimmed}${separator}t=${Date.now()}`;
}

/** Notifies header chrome (and other listeners) that the profile avatar changed. */
export function notifyProfileImageUpdated(profileImageUrl: string): void {
  if (typeof window === "undefined" || !profileImageUrl.trim()) {
    return;
  }
  window.dispatchEvent(
    new CustomEvent(PROFILE_IMAGE_UPDATED_EVENT, {
      detail: { profileImageUrl },
    }),
  );
}

export async function fetchUserProfile(): Promise<UserProfile | null> {
  const token = getAuthToken();
  if (!token) {
    return null;
  }
  const correlationId = createCorrelationId();
  const response = await apiRequest<UserProfile>(AUTH_ROUTES.profile, {
    correlationId,
    authToken: token,
  });
  if (response.error || !response.data) {
    return null;
  }
  return response.data;
}

export async function uploadProfileImage(file: File): Promise<UserProfile | null> {
  const token = getAuthToken();
  if (!token) {
    throw new Error("Sign in required");
  }
  const correlationId = createCorrelationId();
  const body = new FormData();
  body.append("file", file);
  const response = await fetch(AUTH_ROUTES.profileImage, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Correlation-ID": correlationId,
    },
    body,
  });
  const text = await response.text();
  let data: { profileImageUrl?: string; profileImageKey?: string; message?: string } | undefined;
  if (text) {
    try {
      data = JSON.parse(text) as typeof data;
    } catch {
      data = undefined;
    }
  }
  if (!response.ok) {
    throw new Error(humanizeS3Error(data?.message ?? response.statusText ?? "Upload failed"));
  }
  const uploadedUrl = data?.profileImageUrl?.trim() ?? "";
  if (uploadedUrl) {
    notifyProfileImageUpdated(profileImageUrlWithCacheBust(uploadedUrl));
  }
  const profile = await fetchUserProfile();
  if (profile?.profileImageUrl && !uploadedUrl) {
    notifyProfileImageUpdated(profileImageUrlWithCacheBust(profile.profileImageUrl));
  }
  return profile;
}
