#!/usr/bin/env node
/**
 * Upload MP3 files from frontend/public into S3 path media/worship_playlists/.
 * Usage: node scripts/upload-worship-playlists.mjs [baseUrl]
 * Default baseUrl: https://localhost
 */
import { readdir, readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..", "frontend", "public");
const baseUrl = process.argv[2] ?? "https://localhost";
const insecureTLS = process.argv.includes("--insecure") || baseUrl.includes("localhost");
const s3KeyPrefix = "worship_playlists";

async function uploadFile(name, data) {
  const form = new FormData();
  const blob = new Blob([data], { type: "audio/mpeg" });
  const objectKey = `${s3KeyPrefix}/${name}`;
  form.append("file", blob, name);
  form.append("key", objectKey);

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
    throw new Error(`${objectKey}: HTTP ${res.status} ${text}`);
  }
  console.log(`OK ${objectKey} -> ${text}`);
}

const files = await readdir(root);
let uploaded = 0;
for (const name of files) {
  if (extname(name).toLowerCase() !== ".mp3") continue;
  const data = await readFile(join(root, name));
  await uploadFile(name, data);
  uploaded++;
}
console.log(`Uploaded ${uploaded} worship playlist tracks to ${baseUrl}/${s3KeyPrefix}/`);
