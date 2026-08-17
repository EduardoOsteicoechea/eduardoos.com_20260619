/**
 * Unit checks for platform-admin entitlement bypass (mirrors auth + payments helpers).
 * Run: node --test src/lib/serviceAccess.test.mjs
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

const APS_ADMIN_EMAIL = "eduardooost@gmail.com";

function isApsAdminEmail(email) {
  return (email ?? "").trim().toLowerCase() === APS_ADMIN_EMAIL;
}

function isPlatformAdmin(email, role) {
  if (isApsAdminEmail(email)) return true;
  return (role ?? "").trim().toLowerCase() === "admin";
}

function entitlementActive(row, now = Date.now()) {
  if (!row.valid_until) return true;
  const until = Date.parse(row.valid_until);
  return Number.isFinite(until) ? until >= now : true;
}

function hasServiceAccess(serviceId, entitlements, email, role) {
  if (isPlatformAdmin(email, role)) return true;
  return entitlements.some(
    (e) => e.service_id === serviceId && entitlementActive(e),
  );
}

describe("platform admin service access", () => {
  it("bootstrap admin email bypasses homescool without entitlements", () => {
    assert.equal(
      hasServiceAccess("homescool", [], "eduardooost@gmail.com"),
      true,
    );
    assert.equal(
      hasServiceAccess("homescool", [], "EduardoOost@Gmail.com"),
      true,
    );
  });

  it("bootstrap admin bypasses debate (second gated service)", () => {
    assert.equal(hasServiceAccess("debate", [], APS_ADMIN_EMAIL), true);
  });

  it("stored role admin bypasses homescool and debate", () => {
    assert.equal(
      hasServiceAccess("homescool", [], "teacher@example.com", "admin"),
      true,
    );
    assert.equal(
      hasServiceAccess("debate", [], "teacher@example.com", "admin"),
      true,
    );
  });

  it("regular user without entitlement is denied", () => {
    assert.equal(
      hasServiceAccess("homescool", [], "member@example.com", "user"),
      false,
    );
    assert.equal(
      hasServiceAccess("debate", [], "member@example.com", "user"),
      false,
    );
  });

  it("regular user with active entitlement is allowed", () => {
    const ents = [
      {
        service_id: "homescool",
        valid_until: new Date(Date.now() + 86400000).toISOString(),
      },
    ];
    assert.equal(
      hasServiceAccess("homescool", ents, "member@example.com", "user"),
      true,
    );
  });

  it("isPlatformAdmin prefers role when email is not bootstrap", () => {
    assert.equal(isPlatformAdmin("other@example.com", "admin"), true);
    assert.equal(isPlatformAdmin("other@example.com", "user"), false);
    assert.equal(isPlatformAdmin(APS_ADMIN_EMAIL, "user"), true);
  });
});
