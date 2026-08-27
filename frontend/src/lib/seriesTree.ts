/**
 * Series → chapter → pamphlet grouping.
 * Mirrors backend/internal/content/series_tree.go so /articulos and the
 * cloud open list share the same buckets and sort order.
 */

export const UNASSIGNED_SERIES_LABEL = "(sin serie)";
export const UNASSIGNED_CHAPTER_LABEL = "(sin capítulo)";

export type SeriesLeaf = {
  epamId: string;
  title: string;
  fileName?: string;
  series?: string;
  seriesChapter?: string;
  author?: string;
  date?: string;
  updatedAt?: string;
};

export type SeriesChapterNode = {
  name: string;
  items: SeriesLeaf[];
};

export type SeriesNode = {
  name: string;
  chapters: SeriesChapterNode[];
};

export type SeriesTree = {
  count: number;
  series: SeriesNode[];
};

export type SeriesSource = {
  epamId: string;
  title?: string;
  fileName?: string;
  series?: string;
  seriesChapter?: string;
  author?: string;
  date?: string;
  updatedAt?: string;
};

function seriesKey(raw: string | undefined): string {
  const s = (raw ?? "").trim();
  return s === "" ? UNASSIGNED_SERIES_LABEL : s;
}

function chapterKey(raw: string | undefined): string {
  const s = (raw ?? "").trim();
  return s === "" ? UNASSIGNED_CHAPTER_LABEL : s;
}

function leafTitle(rec: SeriesSource): string {
  const title = (rec.title ?? "").trim();
  if (title) return title;
  const fileName = (rec.fileName ?? "").trim();
  if (fileName) return fileName;
  return rec.epamId;
}

/** Group pamphlet metadata into series → chapters → items (stable sort). */
export function groupEpamsBySeries(records: SeriesSource[]): SeriesTree {
  const seriesMap = new Map<string, Map<string, SeriesLeaf[]>>();

  for (const rec of records) {
    const sk = seriesKey(rec.series);
    const ck = chapterKey(rec.seriesChapter);
    if (!seriesMap.has(sk)) seriesMap.set(sk, new Map());
    const chapters = seriesMap.get(sk)!;
    if (!chapters.has(ck)) chapters.set(ck, []);
    chapters.get(ck)!.push({
      epamId: rec.epamId,
      title: leafTitle(rec),
      fileName: rec.fileName,
      series: rec.series,
      seriesChapter: rec.seriesChapter,
      author: rec.author,
      date: rec.date,
      updatedAt: rec.updatedAt,
    });
  }

  const seriesNames = [...seriesMap.keys()].sort();
  const series: SeriesNode[] = [];
  let count = 0;
  for (const sName of seriesNames) {
    const chaptersMap = seriesMap.get(sName)!;
    const chapterNames = [...chaptersMap.keys()].sort();
    const chapters: SeriesChapterNode[] = [];
    for (const cName of chapterNames) {
      const items = chaptersMap.get(cName)!;
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
