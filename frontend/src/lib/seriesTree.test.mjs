/**
 * Contract tests for series → chapter grouping (mirrors seriesTree.ts / Go BuildSeriesTree).
 * Run: node --test src/lib/seriesTree.test.mjs
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

const UNASSIGNED_SERIES_LABEL = "(sin serie)";
const UNASSIGNED_CHAPTER_LABEL = "(sin capítulo)";

function seriesKey(raw) {
  const s = (raw ?? "").trim();
  return s === "" ? UNASSIGNED_SERIES_LABEL : s;
}

function chapterKey(raw) {
  const s = (raw ?? "").trim();
  return s === "" ? UNASSIGNED_CHAPTER_LABEL : s;
}

function leafTitle(rec) {
  const title = (rec.title ?? "").trim();
  if (title) return title;
  const fileName = (rec.fileName ?? "").trim();
  if (fileName) return fileName;
  return rec.epamId;
}

function groupEpamsBySeries(records) {
  const seriesMap = new Map();
  for (const rec of records) {
    const sk = seriesKey(rec.series);
    const ck = chapterKey(rec.seriesChapter);
    if (!seriesMap.has(sk)) seriesMap.set(sk, new Map());
    const chapters = seriesMap.get(sk);
    if (!chapters.has(ck)) chapters.set(ck, []);
    chapters.get(ck).push({
      epamId: rec.epamId,
      title: leafTitle(rec),
      series: rec.series,
      seriesChapter: rec.seriesChapter,
    });
  }
  const seriesNames = [...seriesMap.keys()].sort();
  const series = [];
  let count = 0;
  for (const sName of seriesNames) {
    const chaptersMap = seriesMap.get(sName);
    const chapterNames = [...chaptersMap.keys()].sort();
    const chapters = [];
    for (const cName of chapterNames) {
      const items = chaptersMap.get(cName);
      items.sort((a, b) => {
        if (a.title !== b.title) return a.title < b.title ? -1 : 1;
        return a.epamId < b.epamId ? -1 : 1;
      });
      count += items.length;
      chapters.push({ name: cName, items });
    }
    series.push({ name: sName, chapters });
  }
  return { count, series };
}

describe("groupEpamsBySeries", () => {
  it("buckets empty series and sorts names", () => {
    const tree = groupEpamsBySeries([
      { epamId: "b", title: "Beta", series: "Alpha", seriesChapter: "2" },
      { epamId: "a", title: "Alpha", series: "Alpha", seriesChapter: "1" },
      { epamId: "c", title: "Lone", series: "", seriesChapter: "" },
      { epamId: "d", title: "Gamma", series: "Alpha", seriesChapter: "1" },
    ]);
    assert.equal(tree.count, 4);
    assert.equal(tree.series.length, 2);
    assert.equal(tree.series[0].name, UNASSIGNED_SERIES_LABEL);
    assert.equal(tree.series[1].name, "Alpha");
    assert.equal(tree.series[1].chapters[0].name, "1");
    assert.equal(tree.series[1].chapters[0].items[0].title, "Alpha");
    assert.equal(tree.series[1].chapters[0].items[1].title, "Gamma");
  });
});
