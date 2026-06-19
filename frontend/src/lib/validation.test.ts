import { describe, expect, it } from "vitest";
import {
  validateEmail,
  validateLoggerEvent,
  validateOtp,
  validatePassword,
  validateTesterScript,
} from "./validation";

describe("validation", () => {
  it("rejects invalid email", () => {
    expect(validateEmail("")).toBe("Email is required");
    expect(validateEmail("bad")).toBe("Enter a valid email address");
  });

  it("accepts valid email", () => {
    expect(validateEmail("user@example.com")).toBeNull();
  });

  it("enforces password length", () => {
    expect(validatePassword("short")).toMatch(/8 characters/);
    expect(validatePassword("longenough")).toBeNull();
  });

  it("validates otp format", () => {
    expect(validateOtp("12345")).toMatch(/6 digits/);
    expect(validateOtp("123456")).toBeNull();
  });

  it("validates logger event name", () => {
    expect(validateLoggerEvent("ab")).toMatch(/3 characters/);
    expect(validateLoggerEvent("auth.login")).toBeNull();
  });

  it("validates tester script slug", () => {
    expect(validateTesterScript("bad script")).toMatch(/letters/);
    expect(validateTesterScript("smoke_test-1")).toBeNull();
  });
});
