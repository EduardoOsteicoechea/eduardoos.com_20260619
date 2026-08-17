/**
 * Unit checks for Homescool URL helpers + score bands (mirrors homescool.ts; no TS loader).
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

/** Mirrors Go ScoreBand / frontend scoreBand (1–5). */
function scoreBand(score) {
  if (score <= 0) return "";
  if (score === 1) return "minimo";
  if (score === 2) return "pobre";
  if (score === 3) return "aprobado";
  return "bueno";
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

  it("scoreBand maps 1–5 into color bands", () => {
    assert.equal(scoreBand(1), "minimo");
    assert.equal(scoreBand(2), "pobre");
    assert.equal(scoreBand(3), "aprobado");
    assert.equal(scoreBand(4), "bueno");
    assert.equal(scoreBand(5), "bueno");
  });

  it("duration presets map codes to minutes and Spanish labels", () => {
    const DAY = 24 * 60;
    const WEEK = 7 * DAY;
    const MONTH = 30 * DAY;
    const presets = [
      { code: "30m", label: "30min", minutes: 30 },
      { code: "1h", label: "1hr", minutes: 60 },
      { code: "2h", label: "2hrs", minutes: 120 },
      { code: "4h", label: "4hrs", minutes: 240 },
      { code: "1d", label: "1 día", minutes: DAY },
      { code: "6d", label: "6 días", minutes: 6 * DAY },
      { code: "1w", label: "1 semana", minutes: WEEK },
      { code: "3w", label: "3 semanas", minutes: 3 * WEEK },
      { code: "1mo", label: "1 mes", minutes: MONTH },
      { code: "12mo", label: "12 meses (1 año)", minutes: 12 * MONTH },
    ];
    const byMinutes = new Map(presets.map((p) => [p.minutes, p.label]));
    function formatDurationLabel(durationMin) {
      if (!Number.isFinite(durationMin) || durationMin <= 0) return "";
      return byMinutes.get(durationMin) ?? `${durationMin} min`;
    }
    assert.equal(formatDurationLabel(30), "30min");
    assert.equal(formatDurationLabel(60), "1hr");
    assert.equal(formatDurationLabel(DAY), "1 día");
    assert.equal(formatDurationLabel(WEEK), "1 semana");
    assert.equal(formatDurationLabel(MONTH), "1 mes");
    assert.equal(formatDurationLabel(12 * MONTH), "12 meses (1 año)");
    assert.equal(formatDurationLabel(45), "45 min");
    assert.equal(presets.length, 10);
  });

  it("folders sidebar preference parses 1/0/true (default open)", () => {
    function parseFoldersOpen(stored) {
      if (stored === null || stored === undefined) return true;
      return stored === "1" || stored === "true";
    }
    assert.equal(parseFoldersOpen(null), true);
    assert.equal(parseFoldersOpen("1"), true);
    assert.equal(parseFoldersOpen("true"), true);
    assert.equal(parseFoldersOpen("0"), false);
    assert.equal(parseFoldersOpen("false"), false);
  });
});
