/**
 * pamphletContent.ts — Content insertion protocol: DB-shaped items, mm heights, column flow.
 */
import { computeSheet1Layout, type PamphletLayoutSettings } from "./pamphletLayout";
import {
  DEFAULT_PAMPHLET_FONT_SETTINGS,
  lineHeightMm,
  measureTextHeightMm,
  type PamphletFontSettings,
} from "./pamphletFontSettings";

export type PamphletContentItemType = "paragraph" | "key_idea" | "list" | "image" | "quote";

export interface PamphletHighlightRange {
  start: number;
  end: number;
}

export interface PamphletListItem {
  text: string;
  highlights: PamphletHighlightRange[];
}

export interface PamphletContentItem {
  id: string;
  type: PamphletContentItemType;
  heightMm: number;
  text: string;
  highlights: PamphletHighlightRange[];
  references: string[];
  listItems: PamphletListItem[];
  description: string;
  imageUrl: string;
  imageHeightMm: number;
  contentRef: string;
}

export interface PamphletContentDocument {
  headerItems: PamphletContentItem[];
  footerItems: PamphletContentItem[];
  bodyItems: PamphletContentItem[];
  itemBottomMarginMm: number;
}

export type PamphletZoneId =
  | "header"
  | "footer"
  | "s1r-col0"
  | "s1r-col1"
  | "s1l-col0"
  | "s1l-col1"
  | "s2l-col0"
  | "s2l-col1"
  | "s2r-col0"
  | "s2r-col1";

export interface PamphletPlacedItem {
  item: PamphletContentItem;
  heightMm: number;
  bottomMarginMm: number;
}

export interface PamphletZonePlacement {
  zoneId: PamphletZoneId;
  maxHeightMm: number;
  widthMm: number;
  items: PamphletPlacedItem[];
}

/** Matches Go EightColumnFlowLabels reading order. */
export const COLUMN_ZONE_ORDER: PamphletZoneId[] = [
  "s1r-col0",
  "s1r-col1",
  "s2l-col0",
  "s2l-col1",
  "s2r-col0",
  "s2r-col1",
  "s1l-col0",
  "s1l-col1",
];

/** Vertical immersive reading order: header, eight columns, footer. */
export const IMMERSIVE_ZONE_ORDER: PamphletZoneId[] = ["header", ...COLUMN_ZONE_ORDER, "footer"];

const DEFAULT_IMAGE_HEIGHT_RATIO = 0.75;
const DEFAULT_LINE_TEXT = "New paragraph";
const PAMPHLET_CONTENT_IMAGE_PREFIX = "pamphlets/content-images";

export interface PamphletImageResolveContext {
  userEmail?: string | null;
  pamphletId?: string | null;
}

function encodePamphletImageObjectKey(objectKey: string): string {
  return `/api/pamphlets/images/${objectKey.split("/").map(encodeURIComponent).join("/")}`;
}

/** Builds the canonical S3 object key from stored DB values and optional user scope. */
export function resolveContentImageObjectKey(
  imageUrl: string,
  context?: PamphletImageResolveContext,
): string {
  const trimmed = imageUrl.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  if (trimmed.startsWith("/api/pamphlets/images/")) {
    return decodeURIComponent(trimmed.slice("/api/pamphlets/images/".length));
  }
  if (trimmed.startsWith(PAMPHLET_CONTENT_IMAGE_PREFIX)) {
    return trimmed;
  }

  const email = context?.userEmail?.trim().toLowerCase() ?? "";
  const pamphletId = context?.pamphletId?.trim() || "active";
  let filename = trimmed.replace(/^\/+/, "");
  if (filename.startsWith("images/")) {
    filename = filename.slice("images/".length);
  }
  if (filename.includes("/")) {
    filename = filename.split("/").pop() ?? filename;
  }
  if (email && filename) {
    return `${PAMPHLET_CONTENT_IMAGE_PREFIX}/${email}/${pamphletId}/${filename}`;
  }
  return trimmed;
}

/** Maps stored S3 keys or gateway paths to a browser-loadable pamphlet image URL. */
export function resolvePamphletImageUrl(imageUrl: string, context?: PamphletImageResolveContext): string {
  const trimmed = imageUrl.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  if (trimmed.startsWith("/") && !trimmed.startsWith("/api/pamphlets/images/")) {
    return trimmed;
  }
  if (trimmed.startsWith("/api/pamphlets/images/")) {
    const legacySuffix = decodeURIComponent(trimmed.slice("/api/pamphlets/images/".length));
    if (legacySuffix.startsWith("images/") || !legacySuffix.startsWith(PAMPHLET_CONTENT_IMAGE_PREFIX)) {
      const resolved = resolveContentImageObjectKey(legacySuffix, context);
      if (resolved.startsWith(PAMPHLET_CONTENT_IMAGE_PREFIX)) {
        return encodePamphletImageObjectKey(resolved);
      }
    }
    return trimmed;
  }

  const objectKey = resolveContentImageObjectKey(trimmed, context);
  if (objectKey.startsWith(PAMPHLET_CONTENT_IMAGE_PREFIX)) {
    return encodePamphletImageObjectKey(objectKey);
  }
  return `/api/pamphlets/images/${encodeURIComponent(trimmed)}`;
}

const FAKE_PARAGRAPH_VARIANTS = [
  "Una mis mayores preocupaciones es que muchas personas afirman creer en Dios, pero sus acciones diarias no reflejan esa creencia.",
  "Me preocupa porque vivimos distraídos, ocupados y sin examinar si nuestras decisiones honran a Dios.",
  "La fe auténtica transforma la manera en que tratamos a los demás, usamos el tiempo y respondemos ante la adversidad.",
  "Decir que creemos no basta cuando nuestras prioridades revelan un corazón dividido y distante del Señor.",
  "Necesitamos una vida coherente donde lo que confesamos con los labios se confirme con obediencia cotidiana.",
];

function stripLegacyBlockPrefix(text: string): string {
  return text.replace(/^Bloque\s+\d+:\s*/i, "").trimStart();
}

export interface DbHighlightRange {
  start: number;
  end: number;
}

export interface DbListItem {
  content: string;
  highlights?: DbHighlightRange[];
}

export interface DbSubidea {
  type?: string;
  content?: string;
  highlights?: DbHighlightRange[];
  references?: string[];
  items?: DbListItem[];
  description?: string;
  image?: string;
  aspect_ratio?: number;
}

export interface DbIdea {
  heading?: string;
  heading_highlights?: DbHighlightRange[];
  summary?: string;
  subideas?: DbSubidea[];
}

export interface DbContentPayload {
  ideas: DbIdea[];
}

export interface DbHeaderPayload {
  heading?: string;
  subheading?: string;
  author?: string;
  date?: string;
  image?: string;
  category?: string;
  text?: string;
}

export interface DbFooterPayload {
  heading?: string;
  contact_items?: Array<{ type?: string; value?: string }>;
  address_data?: { message?: string; address?: string };
  text?: string;
}

let itemCounter = 0;

function nextItemId(prefix: string): string {
  itemCounter += 1;
  return `${prefix}-${itemCounter}`;
}

function fontSizeForType(type: PamphletContentItemType, fonts: PamphletFontSettings): number {
  switch (type) {
    case "key_idea":
      return fonts.regularHeadingFontSizeMm;
    case "quote":
      return fonts.regularFontSizeMm;
    default:
      return fonts.regularFontSizeMm;
  }
}

/** Measures one content item height in millimeters for a container width. */
export function measureContentItemHeight(
  item: PamphletContentItem,
  containerWidthMm: number,
  fonts: PamphletFontSettings = DEFAULT_PAMPHLET_FONT_SETTINGS,
): number {
  const bodyFont = fontSizeForType(item.type, fonts);
  switch (item.type) {
    case "list": {
      const items = item.listItems.length > 0 ? item.listItems : [{ text: "", highlights: [] }];
      const header = item.text.trim()
        ? measureTextHeightMm(item.text, containerWidthMm, bodyFont)
        : 0;
      return (
        header +
        items.reduce(
          (total, entry) => total + measureTextHeightMm(entry.text, containerWidthMm, bodyFont),
          0,
        )
      );
    }
    case "image": {
      const imageHeight = item.imageHeightMm > 0 ? item.imageHeightMm : containerWidthMm * DEFAULT_IMAGE_HEIGHT_RATIO;
      const legend = item.description.trim()
        ? measureTextHeightMm(item.description, containerWidthMm, fonts.referenceFontSizeMm)
        : 0;
      return imageHeight + legend;
    }
    case "quote": {
      const body = measureTextHeightMm(item.text, containerWidthMm, bodyFont);
      if (item.references.length === 0) {
        return body;
      }
      const refs = item.references.join(" ");
      return body + measureTextHeightMm(refs, containerWidthMm, fonts.referenceFontSizeMm);
    }
    default:
      return measureTextHeightMm(item.text || DEFAULT_LINE_TEXT, containerWidthMm, bodyFont);
  }
}

/** Recalculates heightMm (and default image height) for each item. */
export function recalculateContentHeights(
  items: PamphletContentItem[],
  widthForItem: (item: PamphletContentItem) => number,
  fonts: PamphletFontSettings = DEFAULT_PAMPHLET_FONT_SETTINGS,
): PamphletContentItem[] {
  return items.map((entry) => {
    const width = widthForItem(entry);
    const imageHeightMm =
      entry.type === "image" && entry.imageHeightMm <= 0 ? width * DEFAULT_IMAGE_HEIGHT_RATIO : entry.imageHeightMm;
    const withImage = entry.type === "image" ? { ...entry, imageHeightMm } : entry;
    return {
      ...withImage,
      heightMm: measureContentItemHeight(withImage, width, fonts),
    };
  });
}

function createContentItem(
  type: PamphletContentItemType,
  partial: Partial<PamphletContentItem> = {},
): PamphletContentItem {
  return {
    id: partial.id ?? nextItemId("item"),
    type,
    heightMm: 0,
    text: partial.text ?? (type === "paragraph" || type === "key_idea" || type === "quote" ? DEFAULT_LINE_TEXT : ""),
    highlights: partial.highlights ?? [],
    references: partial.references ?? [],
    listItems:
      partial.listItems ??
      (type === "list" ? [{ text: DEFAULT_LINE_TEXT, highlights: [] }] : []),
    description: partial.description ?? "",
    imageUrl: partial.imageUrl ?? "",
    imageHeightMm: partial.imageHeightMm ?? 0,
    contentRef: partial.contentRef ?? partial.id ?? nextItemId("ref"),
  };
}

function mapDbSubideaType(raw?: string): PamphletContentItemType {
  const kind = (raw ?? "simple_idea").toLowerCase();
  if (kind === "list") {
    return "list";
  }
  if (kind === "image") {
    return "image";
  }
  if (kind === "quote") {
    return "quote";
  }
  if (kind === "paragraph") {
    return "paragraph";
  }
  return "paragraph";
}

function subideaToItem(sub: DbSubidea, contentRef: string): PamphletContentItem {
  const type = mapDbSubideaType(sub.type);
  return createContentItem(type, {
    contentRef,
    text: stripLegacyBlockPrefix(sub.content ?? ""),
    highlights: sub.highlights ?? [],
    references: sub.references ?? [],
    listItems: (sub.items ?? []).map((entry) => ({
      text: entry.content ?? "",
      highlights: entry.highlights ?? [],
    })),
    description: sub.description ?? "",
    imageUrl: sub.image ?? "",
    imageHeightMm: 0,
  });
}

/** Converts header/footer/content JSON payloads into editable preview items. */
export function documentFromDbPayload(
  header: DbHeaderPayload,
  content: DbContentPayload,
  footer: DbFooterPayload,
): PamphletContentDocument {
  const headerItems: PamphletContentItem[] = [];
  if (header.text?.trim()) {
    headerItems.push(createContentItem("paragraph", { text: header.text, contentRef: "header:text" }));
  } else {
    if (header.heading?.trim()) {
      headerItems.push(
        createContentItem("key_idea", { text: header.heading, contentRef: "header:heading" }),
      );
    }
    if (header.subheading?.trim()) {
      headerItems.push(
        createContentItem("paragraph", { text: header.subheading, contentRef: "header:subheading" }),
      );
    }
    const meta = [header.author, header.date, header.category].filter((entry) => entry?.trim()).join(" · ");
    if (meta) {
      headerItems.push(createContentItem("paragraph", { text: meta, contentRef: "header:meta" }));
    }
  }

  const footerItems: PamphletContentItem[] = [];
  if (footer.text?.trim()) {
    footerItems.push(createContentItem("paragraph", { text: footer.text, contentRef: "footer:text" }));
  } else {
    if (footer.heading?.trim()) {
      footerItems.push(createContentItem("key_idea", { text: footer.heading, contentRef: "footer:heading" }));
    }
    for (const [index, contact] of (footer.contact_items ?? []).entries()) {
      const line = `${contact.type ?? ""}: ${contact.value ?? ""}`.trim();
      if (line !== ":") {
        footerItems.push(
          createContentItem("paragraph", { text: line, contentRef: `footer:contact:${index}` }),
        );
      }
    }
    const address = [footer.address_data?.message, footer.address_data?.address].filter(Boolean).join(" ");
    if (address.trim()) {
      footerItems.push(createContentItem("paragraph", { text: address, contentRef: "footer:address" }));
    }
  }

  const bodyItems: PamphletContentItem[] = [];
  content.ideas.forEach((idea, ideaIndex) => {
    if (idea.heading?.trim()) {
      bodyItems.push(
        createContentItem("key_idea", {
          text: idea.heading,
          highlights: idea.heading_highlights ?? [],
          contentRef: `${ideaIndex}:heading`,
        }),
      );
    }
    (idea.subideas ?? []).forEach((sub, subIndex) => {
      bodyItems.push(subideaToItem(sub, `${ideaIndex}:subidea:${subIndex}`));
    });
  });

  return {
    headerItems,
    footerItems,
    bodyItems,
    itemBottomMarginMm: 1,
  };
}

function itemToSubidea(item: PamphletContentItem): DbSubidea {
  switch (item.type) {
    case "list":
      return {
        type: "list",
        content: item.text,
        items: item.listItems.map((entry) => ({
          content: entry.text,
          highlights: entry.highlights,
        })),
      };
    case "image":
      return {
        type: "image",
        description: item.description,
        image: item.imageUrl,
        aspect_ratio: 0.75,
      };
    case "quote":
      return {
        type: "quote",
        content: item.text,
        highlights: item.highlights,
        references: item.references,
      };
    default:
      return {
        type: "simple_idea",
        content: item.text,
        highlights: item.highlights,
      };
  }
}

function headerItemsToPayload(items: PamphletContentItem[]): DbHeaderPayload {
  const payload: DbHeaderPayload = {
    heading: "",
    subheading: "",
    author: "",
    date: "",
    image: "",
    category: "",
    text: "",
  };
  for (const item of items) {
    if (item.contentRef === "header:text") {
      payload.text = item.text;
    } else if (item.contentRef === "header:heading") {
      payload.heading = item.text;
    } else if (item.contentRef === "header:subheading") {
      payload.subheading = item.text;
    } else if (item.contentRef === "header:meta") {
      const parts = item.text.split(" · ").map((entry) => entry.trim());
      if (parts[0]) {
        payload.author = parts[0];
      }
      if (parts[1]) {
        payload.date = parts[1];
      }
      if (parts[2]) {
        payload.category = parts[2];
      }
    }
  }
  return payload;
}

/** Assigns stable idea/subidea refs so every body item survives cloud save. */
export function assignBodyContentRefs(items: PamphletContentItem[]): PamphletContentItem[] {
  let ideaIndex = 0;
  let subIndex = 0;
  let hasHeadingForCurrentIdea = false;

  return items.map((item) => {
    if (item.type === "key_idea") {
      if (hasHeadingForCurrentIdea || subIndex > 0) {
        ideaIndex += 1;
      }
      hasHeadingForCurrentIdea = true;
      subIndex = 0;
      return { ...item, contentRef: `${ideaIndex}:heading` };
    }
    const ref = `${ideaIndex}:subidea:${subIndex}`;
    subIndex += 1;
    return { ...item, contentRef: ref };
  });
}

function footerItemsToPayload(items: PamphletContentItem[]): DbFooterPayload {
  const payload: DbFooterPayload = {
    heading: "",
    contact_items: [],
    address_data: { message: "", address: "" },
    text: "",
  };
  for (const item of items) {
    if (item.contentRef === "footer:text") {
      payload.text = item.text;
    } else if (item.contentRef === "footer:heading") {
      payload.heading = item.text;
    } else if (item.contentRef.startsWith("footer:contact:")) {
      const match = item.text.match(/^([^:]+):\s*(.*)$/);
      payload.contact_items = payload.contact_items ?? [];
      payload.contact_items.push({
        type: match?.[1]?.trim() ?? "",
        value: match?.[2]?.trim() ?? item.text,
      });
    } else if (item.contentRef === "footer:address") {
      payload.address_data = { message: "At", address: item.text.replace(/^At\s*/, "") };
    }
  }
  return payload;
}

function bodyItemsToContentPayload(items: PamphletContentItem[]): DbContentPayload {
  const ideasMap = new Map<number, DbIdea & { subideaMap: Map<number, DbSubidea> }>();
  for (const item of items) {
    const parts = item.contentRef.split(":");
    if (parts.length >= 2 && parts[1] === "heading") {
      const ideaIndex = Number.parseInt(parts[0], 10);
      const idea = ideasMap.get(ideaIndex) ?? {
        heading: "",
        summary: "",
        subideas: [],
        subideaMap: new Map<number, DbSubidea>(),
      };
      idea.heading = item.text;
      idea.heading_highlights = item.highlights;
      ideasMap.set(ideaIndex, idea);
      continue;
    }
    if (parts.length >= 3 && parts[1] === "subidea") {
      const ideaIndex = Number.parseInt(parts[0], 10);
      const subIndex = Number.parseInt(parts[2], 10);
      const idea = ideasMap.get(ideaIndex) ?? {
        heading: "",
        summary: "",
        subideas: [],
        subideaMap: new Map<number, DbSubidea>(),
      };
      idea.subideaMap.set(subIndex, itemToSubidea(item));
      ideasMap.set(ideaIndex, idea);
    }
  }

  const ideas = [...ideasMap.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, idea]) => ({
      heading: idea.heading,
      heading_highlights: idea.heading_highlights,
      summary: idea.summary ?? "",
      subideas: [...idea.subideaMap.entries()]
        .sort(([left], [right]) => left - right)
        .map(([, subidea]) => subidea),
    }));

  return { ideas };
}

/** Converts editable preview items back into the pamphlet JSON document shape. */
export function contentDocumentToDbPayload(document: PamphletContentDocument): {
  header: DbHeaderPayload;
  content: DbContentPayload;
  footer: DbFooterPayload;
} {
  const bodyItems = assignBodyContentRefs(document.bodyItems);
  return {
    header: headerItemsToPayload(document.headerItems),
    content: bodyItemsToContentPayload(bodyItems),
    footer: footerItemsToPayload(document.footerItems),
  };
}

/** Recomputes all item heights after layout or font changes. */
export function recalculatePamphletDocument(
  document: PamphletContentDocument,
  settings: PamphletLayoutSettings,
  fonts: PamphletFontSettings,
): PamphletContentDocument {
  return finalizeDocument(document, settings, fonts);
}

function finalizeDocument(
  document: PamphletContentDocument,
  settings: PamphletLayoutSettings,
  fonts: PamphletFontSettings,
): PamphletContentDocument {
  const specs = buildZoneSpecs(settings);
  const headerSpec = specs.find((spec) => spec.zoneId === "header")!;
  const footerSpec = specs.find((spec) => spec.zoneId === "footer")!;
  const colSpec = specs.find((spec) => spec.zoneId === COLUMN_ZONE_ORDER[0])!;
  return {
    ...document,
    headerItems: recalculateContentHeights(document.headerItems, () => headerSpec.widthMm, fonts),
    footerItems: recalculateContentHeights(document.footerItems, () => footerSpec.widthMm, fonts),
    bodyItems: recalculateContentHeights(document.bodyItems, () => colSpec.widthMm, fonts),
  };
}

/** Bundled fake document for local preview (mirrors pkg/pamphlet/data/*.json). */
export function buildFakePamphletContentDocument(
  settings: PamphletLayoutSettings,
  fonts: PamphletFontSettings = DEFAULT_PAMPHLET_FONT_SETTINGS,
): PamphletContentDocument {
  const longFlowSubideas: DbSubidea[] = Array.from({ length: 140 }, (_, index) => {
    const block = index + 1;
    if (block % 17 === 0) {
      return {
        type: "quote",
        content: `Cita ${block}: La fe sin obras está muerta, y nuestra vida cotidiana revela lo que realmente creemos.`,
        references: [`Santiago 2:${(block % 20) + 10}`],
      };
    }
    if (block % 13 === 0) {
      return {
        type: "list",
        items: [
          { content: "Recordar la Palabra cada mañana" },
          { content: "Servir con humildad a quienes nos rodean" },
          { content: "Examinar nuestras decisiones a la luz del Evangelio" },
        ],
      };
    }
    if (block % 11 === 0) {
      return {
        type: "image",
        description: `Ilustración ${block}`,
        image: "",
        aspect_ratio: 1.1,
      };
    }
    return {
      type: "simple_idea",
      content: FAKE_PARAGRAPH_VARIANTS[(block - 1) % FAKE_PARAGRAPH_VARIANTS.length],
    };
  });

  return finalizeDocument(
    documentFromDbPayload(
    {
      heading:
        "La Creencia y la Realidad Una reflexión sobre la desconexión entre afirmar creer en Dios y nuestra forma real de vivir.",
      subheading:
        "¿Cómo es posible que muchas personas afirmen creer en Dios, pero sus acciones y decisiones diarias no reflejen esa creencia?",
      author: "Por Eduardo Osteicoechea",
      date: "Publicado el 2026",
      category: "Reflexión",
      image: "",
      text: "",
    },
    {
      ideas: [
        {
          heading: "La Creencia y la Realidad",
          summary: "Una reflexión sobre la desconexión entre afirmar creer en Dios y nuestra forma real de vivir.",
          subideas: [
            { type: "simple_idea", content: "Una mis mayores preocupaciones es que la mayoría dice creer en Dios." },
            {
              type: "simple_idea",
              content: "Me preocupa porque vivimos de una manera distinta a lo que Dios espera.",
            },
            {
              type: "quote",
              content: "¿Cómo decimos que creemos si vivimos de espaldas a Su propósito?",
              references: ["Romanos 12:2"],
            },
            ...longFlowSubideas,
          ],
        },
        {
          heading: "Segunda sección de prueba",
          summary: "Contenido adicional para llenar columnas posteriores del folleto.",
          subideas: Array.from({ length: 24 }, (_, index) => ({
            type: "simple_idea" as const,
            content:
              FAKE_PARAGRAPH_VARIANTS[index % FAKE_PARAGRAPH_VARIANTS.length],
          })),
        },
      ],
    },
    {
      heading: "Contactanos",
      contact_items: [
        { type: "Email", value: "eduardooost@gmail.com" },
        { type: "WhatsApp", value: "+58 414 728 1033" },
      ],
      address_data: { message: "Estamos ubicados en:", address: "Mérida, Venezuela" },
      text: "",
    },
    ),
    settings,
    fonts,
  );
}

interface ZoneSpec {
  zoneId: PamphletZoneId;
  maxHeightMm: number;
  widthMm: number;
}

function buildZoneSpecs(settings: PamphletLayoutSettings): ZoneSpec[] {
  const layout = computeSheet1Layout(settings);
  const halfWidth = layout.contentWidthMm / 2 - settings.pageLateralInternalMarginMm;
  const innerHeight = layout.innerPageColumnHeightMm;
  return [
    { zoneId: "header", maxHeightMm: layout.rightHeaderHeightMm, widthMm: halfWidth },
    { zoneId: "footer", maxHeightMm: layout.leftFooterHeightMm, widthMm: halfWidth },
    { zoneId: "s1r-col0", maxHeightMm: layout.rightColumns.bodyHeightMm, widthMm: layout.rightColumns.col1WidthMm },
    { zoneId: "s1r-col1", maxHeightMm: layout.rightColumns.bodyHeightMm, widthMm: layout.rightColumns.col2WidthMm },
    { zoneId: "s1l-col0", maxHeightMm: layout.leftColumns.bodyHeightMm, widthMm: layout.leftColumns.col1WidthMm },
    { zoneId: "s1l-col1", maxHeightMm: layout.leftColumns.bodyHeightMm, widthMm: layout.leftColumns.col2WidthMm },
    { zoneId: "s2l-col0", maxHeightMm: innerHeight, widthMm: layout.leftColumns.col1WidthMm },
    { zoneId: "s2l-col1", maxHeightMm: innerHeight, widthMm: layout.leftColumns.col2WidthMm },
    { zoneId: "s2r-col0", maxHeightMm: innerHeight, widthMm: layout.rightColumns.col1WidthMm },
    { zoneId: "s2r-col1", maxHeightMm: innerHeight, widthMm: layout.rightColumns.col2WidthMm },
  ];
}

function placeItemsInZone(
  items: PamphletContentItem[],
  spec: ZoneSpec,
  bottomMarginMm: number,
  fonts: PamphletFontSettings,
): { placed: PamphletPlacedItem[]; overflow: PamphletContentItem[] } {
  const placed: PamphletPlacedItem[] = [];
  let used = 0;

  for (let index = 0; index < items.length; index++) {
    const entry = items[index];
    const measured = measureContentItemHeight(entry, spec.widthMm, fonts);
    const leadingGap = placed.length > 0 ? bottomMarginMm : 0;
    const needed = leadingGap + measured;

    if (needed > spec.maxHeightMm - used) {
      return { placed, overflow: items.slice(index) };
    }

    placed.push({
      item: { ...entry, heightMm: measured },
      heightMm: measured,
      bottomMarginMm: 0,
    });
    used += measured;

    if (index < items.length - 1) {
      const nextMeasured = measureContentItemHeight(items[index + 1], spec.widthMm, fonts);
      if (used + bottomMarginMm + nextMeasured > spec.maxHeightMm) {
        placed[placed.length - 1].bottomMarginMm = 0;
        return { placed, overflow: items.slice(index + 1) };
      }
      placed[placed.length - 1].bottomMarginMm = bottomMarginMm;
      used += bottomMarginMm;
    }
  }

  if (placed.length > 0) {
    placed[placed.length - 1].bottomMarginMm = 0;
  }

  return { placed, overflow: [] };
}

/** Distributes header, footer, then column body items across preview zones. */
export function distributeContentToZones(
  document: PamphletContentDocument,
  settings: PamphletLayoutSettings,
  fonts: PamphletFontSettings = DEFAULT_PAMPHLET_FONT_SETTINGS,
): PamphletZonePlacement[] {
  const specs = buildZoneSpecs(settings);
  const specMap = new Map(specs.map((spec) => [spec.zoneId, spec]));
  const bottomMargin = document.itemBottomMarginMm;

  const headerSpec = specMap.get("header")!;
  const footerSpec = specMap.get("footer")!;
  const headerItems = recalculateContentHeights(document.headerItems, () => headerSpec.widthMm, fonts);
  const footerItems = recalculateContentHeights(document.footerItems, () => footerSpec.widthMm, fonts);
  const bodyItems = recalculateContentHeights(document.bodyItems, (entry) => {
    const firstCol = specMap.get(COLUMN_ZONE_ORDER[0])!;
    return firstCol.widthMm;
  }, fonts);

  const headerResult = placeItemsInZone(headerItems, headerSpec, bottomMargin, fonts);
  const footerResult = placeItemsInZone(footerItems, footerSpec, bottomMargin, fonts);

  let pending = [...headerResult.overflow, ...bodyItems];
  const columnPlacements = new Map<PamphletZoneId, PamphletPlacedItem[]>();

  for (const zoneId of COLUMN_ZONE_ORDER) {
    if (pending.length === 0) {
      columnPlacements.set(zoneId, []);
      continue;
    }
    const spec = specMap.get(zoneId)!;
    const recalcPending = recalculateContentHeights(pending, () => spec.widthMm, fonts);
    const result = placeItemsInZone(recalcPending, spec, bottomMargin, fonts);
    columnPlacements.set(zoneId, result.placed);
    pending = result.overflow;
  }

  // Content beyond the eight flow columns is not rendered in preview.
  void pending;
  void footerResult.overflow;

  return specs.map((spec) => {
    if (spec.zoneId === "header") {
      return { ...spec, items: headerResult.placed };
    }
    if (spec.zoneId === "footer") {
      return { ...spec, items: footerResult.placed };
    }
    return { ...spec, items: columnPlacements.get(spec.zoneId) ?? [] };
  });
}

/** Adds a default paragraph below the target item. */
export function addContentItemAfter(
  items: PamphletContentItem[],
  itemId: string,
  containerWidthMm: number,
  fonts: PamphletFontSettings = DEFAULT_PAMPHLET_FONT_SETTINGS,
): PamphletContentItem[] {
  const index = items.findIndex((entry) => entry.id === itemId);
  const fresh = createContentItem("paragraph");
  const next = index < 0 ? [...items, fresh] : [...items.slice(0, index + 1), fresh, ...items.slice(index + 1)];
  return recalculateContentHeights(next, () => containerWidthMm, fonts);
}

export function removeContentItem(items: PamphletContentItem[], itemId: string): PamphletContentItem[] {
  return items.filter((entry) => entry.id !== itemId);
}

export function moveContentItemUp(items: PamphletContentItem[], itemId: string): PamphletContentItem[] {
  const index = items.findIndex((entry) => entry.id === itemId);
  if (index <= 0) {
    return items;
  }
  const next = [...items];
  [next[index - 1], next[index]] = [next[index], next[index - 1]];
  return next;
}

export function moveContentItemDown(items: PamphletContentItem[], itemId: string): PamphletContentItem[] {
  const index = items.findIndex((entry) => entry.id === itemId);
  if (index < 0 || index >= items.length - 1) {
    return items;
  }
  const next = [...items];
  [next[index], next[index + 1]] = [next[index + 1], next[index]];
  return next;
}

export function setContentItemType(
  items: PamphletContentItem[],
  itemId: string,
  type: PamphletContentItemType,
  containerWidthMm: number,
  fonts: PamphletFontSettings = DEFAULT_PAMPHLET_FONT_SETTINGS,
): PamphletContentItem[] {
  const next = items.map((entry) => {
    if (entry.id !== itemId) {
      return entry;
    }
    return createContentItem(type, {
      ...entry,
      type,
      listItems: type === "list" ? entry.listItems.length ? entry.listItems : [{ text: DEFAULT_LINE_TEXT, highlights: [] }] : [],
      imageHeightMm: type === "image" ? containerWidthMm * DEFAULT_IMAGE_HEIGHT_RATIO : 0,
    });
  });
  return recalculateContentHeights(next, () => containerWidthMm, fonts);
}

export function adjustImageHeight(
  items: PamphletContentItem[],
  itemId: string,
  deltaMm: number,
  containerWidthMm: number,
  fonts: PamphletFontSettings = DEFAULT_PAMPHLET_FONT_SETTINGS,
): PamphletContentItem[] {
  const next = items.map((entry) => {
    if (entry.id !== itemId || entry.type !== "image") {
      return entry;
    }
    const minHeight = containerWidthMm * 0.25;
    const maxHeight = containerWidthMm * 1.5;
    const base = entry.imageHeightMm > 0 ? entry.imageHeightMm : containerWidthMm * DEFAULT_IMAGE_HEIGHT_RATIO;
    return { ...entry, imageHeightMm: Math.min(maxHeight, Math.max(minHeight, base + deltaMm)) };
  });
  return recalculateContentHeights(next, () => containerWidthMm, fonts);
}

export function createDefaultContentItem(type: PamphletContentItemType = "paragraph"): PamphletContentItem {
  return createContentItem(type);
}

export function defaultSingleLineHeightMm(fonts: PamphletFontSettings = DEFAULT_PAMPHLET_FONT_SETTINGS): number {
  return lineHeightMm(fonts.regularFontSizeMm);
}

export type ContentStream = "header" | "footer" | "body";

/** Finds which document stream owns a content item id. */
export function findContentItemLocation(
  document: PamphletContentDocument,
  itemId: string,
): { stream: ContentStream; index: number } | null {
  const headerIndex = document.headerItems.findIndex((entry) => entry.id === itemId);
  if (headerIndex >= 0) {
    return { stream: "header", index: headerIndex };
  }
  const footerIndex = document.footerItems.findIndex((entry) => entry.id === itemId);
  if (footerIndex >= 0) {
    return { stream: "footer", index: footerIndex };
  }
  const bodyIndex = document.bodyItems.findIndex((entry) => entry.id === itemId);
  if (bodyIndex >= 0) {
    return { stream: "body", index: bodyIndex };
  }
  return null;
}

export function getStreamItems(document: PamphletContentDocument, stream: ContentStream): PamphletContentItem[] {
  if (stream === "header") {
    return document.headerItems;
  }
  if (stream === "footer") {
    return document.footerItems;
  }
  return document.bodyItems;
}

export function setStreamItems(
  document: PamphletContentDocument,
  stream: ContentStream,
  items: PamphletContentItem[],
): PamphletContentDocument {
  if (stream === "header") {
    return { ...document, headerItems: items };
  }
  if (stream === "footer") {
    return { ...document, footerItems: items };
  }
  return { ...document, bodyItems: assignBodyContentRefs(items) };
}

/** Counts items placed across the eight body flow columns. */
export function countPlacedColumnItems(zones: PamphletZonePlacement[]): number {
  return COLUMN_ZONE_ORDER.reduce(
    (total, zoneId) => total + (zones.find((zone) => zone.zoneId === zoneId)?.items.length ?? 0),
    0,
  );
}

/** Chooses above-vs-below action bar placement based on available viewport space. */
export function resolveActionBarPlacement(
  elementTopPx: number,
  elementBottomPx: number,
  actionBarHeightPx = 35,
  headerOffsetPx = 72,
  viewportBottomPx = typeof window !== "undefined" ? window.innerHeight : 900,
): "top" | "bottom" {
  const spaceAbove = elementTopPx - headerOffsetPx;
  const spaceBelow = viewportBottomPx - elementBottomPx;
  const fitsAbove = spaceAbove >= actionBarHeightPx;
  const fitsBelow = spaceBelow >= actionBarHeightPx;

  if (fitsAbove && !fitsBelow) {
    return "top";
  }
  if (fitsBelow && !fitsAbove) {
    return "bottom";
  }
  if (fitsAbove && fitsBelow) {
    return spaceAbove >= spaceBelow ? "top" : "bottom";
  }
  return spaceBelow >= spaceAbove ? "bottom" : "top";
}

function streamWidthForLocation(
  document: PamphletContentDocument,
  location: NonNullable<ReturnType<typeof findContentItemLocation>>,
  settings: PamphletLayoutSettings,
): number {
  void document;
  return buildZoneSpecs(settings).find((spec) =>
    location.stream === "header"
      ? spec.zoneId === "header"
      : location.stream === "footer"
        ? spec.zoneId === "footer"
        : spec.zoneId === COLUMN_ZONE_ORDER[0],
  )!.widthMm;
}

function updateContentItemById(
  document: PamphletContentDocument,
  itemId: string,
  patch: (item: PamphletContentItem) => PamphletContentItem,
  settings: PamphletLayoutSettings,
  fonts: PamphletFontSettings,
): PamphletContentDocument {
  const location = findContentItemLocation(document, itemId);
  if (!location) {
    return document;
  }
  const width = streamWidthForLocation(document, location, settings);
  const streamItems = getStreamItems(document, location.stream);
  const nextItems = streamItems.map((entry) => (entry.id === itemId ? patch(entry) : entry));
  const recalculated = recalculateContentHeights(nextItems, () => width, fonts);
  return setStreamItems(document, location.stream, recalculated);
}

export function updateContentItemText(
  document: PamphletContentDocument,
  itemId: string,
  text: string,
  settings: PamphletLayoutSettings,
  fonts: PamphletFontSettings,
): PamphletContentDocument {
  return updateContentItemById(document, itemId, (entry) => ({ ...entry, text }), settings, fonts);
}

export function updateContentItemDescription(
  document: PamphletContentDocument,
  itemId: string,
  description: string,
  settings: PamphletLayoutSettings,
  fonts: PamphletFontSettings,
): PamphletContentDocument {
  return updateContentItemById(document, itemId, (entry) => ({ ...entry, description }), settings, fonts);
}

export function updateContentItemReferences(
  document: PamphletContentDocument,
  itemId: string,
  references: string[],
  settings: PamphletLayoutSettings,
  fonts: PamphletFontSettings,
): PamphletContentDocument {
  return updateContentItemById(document, itemId, (entry) => ({ ...entry, references }), settings, fonts);
}

export function updateContentItemListHeader(
  document: PamphletContentDocument,
  itemId: string,
  text: string,
  settings: PamphletLayoutSettings,
  fonts: PamphletFontSettings,
): PamphletContentDocument {
  return updateContentItemById(document, itemId, (entry) => ({ ...entry, text }), settings, fonts);
}

export function updateContentItemListItems(
  document: PamphletContentDocument,
  itemId: string,
  listItems: PamphletListItem[],
  settings: PamphletLayoutSettings,
  fonts: PamphletFontSettings,
): PamphletContentDocument {
  return updateContentItemById(document, itemId, (entry) => ({ ...entry, listItems }), settings, fonts);
}

export function updateContentItemImageUrl(
  document: PamphletContentDocument,
  itemId: string,
  imageUrl: string,
  settings: PamphletLayoutSettings,
  fonts: PamphletFontSettings,
): PamphletContentDocument {
  return updateContentItemById(document, itemId, (entry) => ({ ...entry, imageUrl }), settings, fonts);
}

export function addContentListItem(
  document: PamphletContentDocument,
  itemId: string,
  settings: PamphletLayoutSettings,
  fonts: PamphletFontSettings,
): PamphletContentDocument {
  return updateContentItemById(
    document,
    itemId,
    (entry) => ({
      ...entry,
      listItems: [...entry.listItems, { text: DEFAULT_LINE_TEXT, highlights: [] }],
    }),
    settings,
    fonts,
  );
}

export function removeContentListItem(
  document: PamphletContentDocument,
  itemId: string,
  index: number,
  settings: PamphletLayoutSettings,
  fonts: PamphletFontSettings,
): PamphletContentDocument {
  return updateContentItemById(
    document,
    itemId,
    (entry) => {
      if (entry.listItems.length <= 1) {
        return entry;
      }
      return {
        ...entry,
        listItems: entry.listItems.filter((_, itemIndex) => itemIndex !== index),
      };
    },
    settings,
    fonts,
  );
}

export function updateContentListItemText(
  document: PamphletContentDocument,
  itemId: string,
  index: number,
  text: string,
  settings: PamphletLayoutSettings,
  fonts: PamphletFontSettings,
): PamphletContentDocument {
  return updateContentItemById(
    document,
    itemId,
    (entry) => ({
      ...entry,
      listItems: entry.listItems.map((listEntry, itemIndex) =>
        itemIndex === index ? { ...listEntry, text } : listEntry,
      ),
    }),
    settings,
    fonts,
  );
}
