/**
 * Capture the Scrib sheet as a light grayscale raster (no dark-mode invert)
 * and download a server-built US Letter PDF (spec 024).
 */

import { SCRIB_ROUTES } from "../config/routes";
import { getAuthToken } from "./auth";
import { createCorrelationId } from "./correlation";
import {
  SCRIB_BG_SRC,
  SCRIB_PAGE_HEIGHT_MM,
  SCRIB_PAGE_WIDTH_MM,
  type ScribSheet,
} from "./scrib";

/** ~150 DPI portrait letter → sharp enough for print without huge payloads. */
const PRINT_PX_PER_MM = 150 / 25.4;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

function svgLayerToImage(
  svg: SVGSVGElement,
  widthPx: number,
  heightPx: number,
): Promise<HTMLImageElement> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(widthPx));
  clone.setAttribute("height", String(heightPx));
  // Force light ink (ignore any theme CSS that might tint strokes).
  clone.querySelectorAll("path").forEach((p) => {
    p.setAttribute("stroke", "#141820");
  });
  const xml = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(
    new Blob([xml], { type: "image/svg+xml;charset=utf-8" }),
  );
  return loadImage(url).finally(() => URL.revokeObjectURL(url));
}

function canvasToGrayscale(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height);
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    const y = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    d[i] = y;
    d[i + 1] = y;
    d[i + 2] = y;
  }
  ctx.putImageData(data, 0, 0);
}

/**
 * Rasterize the live sheet DOM (bg + SVG layers) in light appearance.
 * Zoom/pan transforms are ignored — capture is identity geometry.
 */
export async function captureScribSheetLightGrayscale(
  sheetEl: HTMLElement,
  sheet: ScribSheet,
): Promise<Blob> {
  const widthPx = Math.round(SCRIB_PAGE_WIDTH_MM * PRINT_PX_PER_MM);
  const heightPx = Math.round(SCRIB_PAGE_HEIGHT_MM * PRINT_PX_PER_MM);
  const canvas = document.createElement("canvas");
  canvas.width = widthPx;
  canvas.height = heightPx;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");

  // Always light paper — never apply dark invert.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, widthPx, heightPx);

  const bg = await loadImage(SCRIB_BG_SRC);
  ctx.drawImage(bg, 0, 0, widthPx, heightPx);

  const svgs = Array.from(sheetEl.querySelectorAll("svg.scrib-layer"));
  for (let i = 0; i < svgs.length; i++) {
    const svg = svgs[i] as SVGSVGElement;
    const layer = sheet.layers[i];
    const opacity = layer?.opacity ?? 1;
    if (opacity <= 0) continue;
    const layerImg = await svgLayerToImage(svg, widthPx, heightPx);
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.drawImage(layerImg, 0, 0, widthPx, heightPx);
    ctx.restore();
  }

  canvasToGrayscale(canvas);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("JPEG encode failed"))),
      "image/jpeg",
      0.92,
    );
  });
  return blob;
}

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(blob);
  });
}

function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Capture sheet → POST /api/scrib/print/pdf → download PDF. */
export async function downloadScribSheetPdf(
  sheetEl: HTMLElement,
  sheet: ScribSheet,
): Promise<void> {
  const token = getAuthToken();
  if (!token) throw new Error("Sign in required for Scrib print.");

  const jpeg = await captureScribSheetLightGrayscale(sheetEl, sheet);
  const imageBase64 = await blobToDataURL(jpeg);
  const fileName = `${(sheet.name || "scrib-sheet").replace(/[^\w.-]+/g, "_")}.pdf`;

  const res = await fetch(SCRIB_ROUTES.printPdf, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Correlation-ID": createCorrelationId(),
    },
    body: JSON.stringify({ imageBase64, fileName }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Print PDF failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const pdfBlob = await res.blob();
  triggerDownload(pdfBlob, fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`);
}
