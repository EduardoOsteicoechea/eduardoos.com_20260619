import { describe, expect, it } from "vitest";
import { APP_ROUTES } from "../config/routes";
import { isPublicPagePath } from "./routeAccess";

describe("routeAccess", () => {
  it("allows home, auth, playlist, and pamphlet (temp) without login", () => {
    expect(isPublicPagePath("/")).toBe(true);
    expect(isPublicPagePath("/auth/login/")).toBe(true);
    expect(isPublicPagePath(APP_ROUTES.mediaPlaylist)).toBe(true);
    expect(isPublicPagePath(`${APP_ROUTES.mediaPlaylist}/`)).toBe(true);
    expect(isPublicPagePath(APP_ROUTES.pamphlet)).toBe(true);
  });

  it("protects observability, media gallery, and payments", () => {
    expect(isPublicPagePath(APP_ROUTES.logger)).toBe(false);
    expect(isPublicPagePath(APP_ROUTES.mediaGallery)).toBe(false);
    expect(isPublicPagePath(APP_ROUTES.subscriptionMonthlyBasic)).toBe(false);
  });
});
