/**
 * Profile helpers for Eduardo OS Next.
 *
 * Loads the signed-in user's profile (including avatar URL) from
 * `GET /api/auth/profile`. Uploads go to `POST /api/auth/profile/image`
 * (multipart field `file`), matching the production gateway contract.
 *
 * When the API returns only `profileImageKey`, we derive the public
 * `/api/media/file/...` URL so the header avatar still renders.
 */

import { AUTH_API_ROUTES } from "../config/routes";
import { apiRequest } from "./api";
import { getAuthToken } from "./auth";
import { createCorrelationId } from "./correlation";

export interface UserProfile {
  email: string;
  profileImageKey?: string;
  profileImageUrl?: string;
}

/** Dispatched when a profile photo upload finishes so the header can refresh. */
export const PROFILE_IMAGE_UPDATED_EVENT = "eduardoos-next-profile-image-updated";

const PROFILE_IMAGE_API = AUTH_API_ROUTES.profileImage;

/**
 * Build a public media URL from an S3 object key when the API omits
 * profileImageUrl. Keys look like `media/profiles/{email}/avatar.png`
 * or `profiles/{email}/avatar.png`.
 */
export function profileImageUrlFromKey(objectKey: string): string {
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

/** Prefer explicit URL; otherwise derive from key. */
export function resolveProfileImageUrl(profile: UserProfile | null | undefined): string {
  if (!profile) return "";
  const direct = profile.profileImageUrl?.trim() ?? "";
  if (direct) return direct;
  const key = profile.profileImageKey?.trim() ?? "";
  if (!key) return "";
  return profileImageUrlFromKey(key);
}

export function profileImageUrlWithCacheBust(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  const separator = trimmed.includes("?") ? "&" : "?";
  return `${trimmed}${separator}t=${Date.now()}`;
}

export function notifyProfileImageUpdated(profileImageUrl: string): void {
  if (typeof window === "undefined" || !profileImageUrl.trim()) return;
  window.dispatchEvent(
    new CustomEvent(PROFILE_IMAGE_UPDATED_EVENT, {
      detail: { profileImageUrl: profileImageUrl.trim() },
    }),
  );
}

/**
 * Load the current user's profile. Returns null when there is no token
 * or the request fails.
 */
export async function fetchUserProfile(): Promise<UserProfile | null> {
  const token = getAuthToken();
  if (!token) return null;
  const correlationId = createCorrelationId();
  const response = await apiRequest<UserProfile>(AUTH_API_ROUTES.profile, {
    correlationId,
    authToken: token,
  });
  if (response.error || !response.data) return null;
  const data = response.data;
  const resolved = resolveProfileImageUrl(data);
  return {
    email: data.email,
    profileImageKey: data.profileImageKey,
    profileImageUrl: resolved || undefined,
  };
}

/** Upload a profile photo; notifies the header via PROFILE_IMAGE_UPDATED_EVENT. */
export async function uploadProfileImage(file: File): Promise<UserProfile | null> {
  const token = getAuthToken();
  if (!token) {
    throw new Error("Sign in required");
  }
  const correlationId = createCorrelationId();
  const body = new FormData();
  body.append("file", file);
  const response = await fetch(PROFILE_IMAGE_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Correlation-ID": correlationId,
    },
    body,
  });
  const text = await response.text();
  let data: {
    profileImageUrl?: string;
    profileImageKey?: string;
    message?: string;
    error?: string;
  } | undefined;
  if (text) {
    try {
      data = JSON.parse(text) as typeof data;
    } catch {
      data = undefined;
    }
  }
  if (!response.ok) {
    throw new Error(data?.message ?? data?.error ?? response.statusText ?? "Upload failed");
  }
  const uploadedUrl = resolveProfileImageUrl({
    email: "",
    profileImageKey: data?.profileImageKey,
    profileImageUrl: data?.profileImageUrl,
  });
  if (uploadedUrl) {
    notifyProfileImageUpdated(profileImageUrlWithCacheBust(uploadedUrl));
  }
  const profile = await fetchUserProfile();
  if (profile?.profileImageUrl && !uploadedUrl) {
    notifyProfileImageUpdated(profileImageUrlWithCacheBust(profile.profileImageUrl));
  }
  return profile;
}
