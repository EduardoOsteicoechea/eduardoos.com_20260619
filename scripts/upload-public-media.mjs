#!/usr/bin/env node
/**
 * Upload all static assets from frontend/public to /api/media/upload.
 * Usage: node scripts/upload-public-media.mjs [baseUrl]
 * Default baseUrl: https://localhost
 */
import { readdir, readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..", "frontend", "public");
const baseUrl = process.argv[2] ?? "https://localhost";
const insecureTLS = process.argv.includes("--insecure") || baseUrl.includes("localhost");
const skipExt = new Set([".xcf"]);

const mime = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

async function uploadFile(name, data) {
  const ext = extname(name).toLowerCase();
  const form = new FormData();
  const blob = new Blob([data], { type: mime[ext] ?? "application/octet-stream" });
  form.append("file", blob, name);
  form.append("key", name);
  const prevReject = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  if (insecureTLS) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }
  let res;
  try {
    res = await fetch(`${baseUrl}/api/media/upload`, {
      method: "POST",
      body: form,
    });
  } finally {
    if (insecureTLS) {
      if (prevReject === undefined) {
        delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      } else {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = prevReject;
      }
    }
  }
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${name}: HTTP ${res.status} ${text}`);
  }
  console.log(`OK ${name} -> ${text}`);
}

const files = await readdir(root);
let uploaded = 0;
for (const name of files) {
  const ext = extname(name).toLowerCase();
  if (skipExt.has(ext)) continue;
  const data = await readFile(join(root, name));
  await uploadFile(name, data);
  uploaded++;
}
console.log(`Uploaded ${uploaded} files to ${baseUrl}`);
