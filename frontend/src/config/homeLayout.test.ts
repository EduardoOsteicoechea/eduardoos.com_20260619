import { describe, expect, it } from "vitest";
import { isHomePath } from "./homeLayout";

describe("homeLayout", () => {
  it("detects home pathname", () => {
    expect(isHomePath("/")).toBe(true);
    expect(isHomePath("/auth/login")).toBe(false);
  });
});
