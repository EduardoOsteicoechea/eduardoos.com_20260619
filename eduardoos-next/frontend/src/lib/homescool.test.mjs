/**
 * Unit checks for Homescool URL helpers (mirrors homescool.ts; no TS loader).
 * Run: node --test src/lib/homescool.test.mjs
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

const HOMESCOOL_STUDENTS = "/homescool/students";
const HOMESCOOL_WORKSPACE = "/homescool/students/workspace";

function safeEmailKey(email) {
  return email.trim().toLowerCase().replaceAll("@", "_at_").replaceAll("/", "_");
}

function folderLabel(folder) {
  switch (folder) {
    case "portfolio":
      return "Portfolio";
    case "period":
      return "Period";
    case "skills":
      return "Skills";
    case "study_section":
      return "Study section";
    case "tasks":
      return "Tasks";
    default:
      return folder;
  }
}

function resolveStudentSlugFromLocation(pathname, search) {
  const q = new URLSearchParams(search).get("student");
  if (q) return decodeURIComponent(q.trim());
  const prefix = `${HOMESCOOL_STUDENTS}/`;
  if (!pathname.startsWith(prefix)) return "";
  const rest = pathname.slice(prefix.length).replace(/\/$/, "");
  if (!rest || rest === "workspace") return "";
  return decodeURIComponent(rest);
}

function studentWorkspaceHref(slug) {
  return `${HOMESCOOL_WORKSPACE}?student=${encodeURIComponent(slug)}`;
}

describe("homescool helpers", () => {
  it("safeEmailKey mirrors Go @ → _at_", () => {
    assert.equal(safeEmailKey("A@Example.COM"), "a_at_example.com");
  });

  it("folderLabel humanizes study_section", () => {
    assert.equal(folderLabel("study_section"), "Study section");
  });

  it("resolveStudentSlugFromLocation reads query and pretty path", () => {
    assert.equal(
      resolveStudentSlugFromLocation("/homescool/students/workspace", "?student=s_at_x.com"),
      "s_at_x.com",
    );
    assert.equal(
      resolveStudentSlugFromLocation("/homescool/students/s_at_x.com", ""),
      "s_at_x.com",
    );
    assert.equal(resolveStudentSlugFromLocation("/homescool/students/workspace", ""), "");
  });

  it("studentWorkspaceHref points at workspace shell with query", () => {
    assert.equal(
      studentWorkspaceHref("s_at_x.com"),
      "/homescool/students/workspace?student=s_at_x.com",
    );
  });
});
