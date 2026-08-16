/**
 * Profile helpers for Eduardo OS Next.
 *
 * Fetches the signed-in user's profile (including optional avatar URL) from
 * `/api/auth/profile`. When the Next backend does not yet expose that route,
 * callers treat a null result as “no photo” and fall back to the JWT initial.
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

export function notifyProfileImageUpdated(profileImageUrl: string): void {
  if (typeof window === "undefined" || !profileImageUrl.trim()) return;
  window.dispatchEvent(
    new CustomEvent(PROFILE_IMAGE_UPDATED_EVENT, {
      detail: { profileImageUrl: profileImageUrl.trim() },
    }),
  );
}

/**
 * Load the current user's profile. Returns null when there is no token,
 * the request fails, or the endpoint is not wired yet.
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
  return response.data;
}
