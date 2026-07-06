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
  const profile = await fetchUserProfile();
  return profile;
}
