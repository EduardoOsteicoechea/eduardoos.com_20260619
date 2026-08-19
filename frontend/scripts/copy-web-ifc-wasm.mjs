/**
 * Copy web-ifc WASM binaries into public/web-ifc so the browser can load them
 * from same-origin (/web-ifc/) during IFC → fragments conversion.
 * Runs on postinstall; safe to re-run before build.
 */
import { copyFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "node_modules", "web-ifc");
const destDir = join(root, "public", "web-ifc");

if (!existsSync(srcDir)) {
  console.warn("[copy-web-ifc-wasm] node_modules/web-ifc missing; skip");
  process.exit(0);
}

mkdirSync(destDir, { recursive: true });
const files = readdirSync(srcDir).filter((name) => name.endsWith(".wasm"));
for (const name of files) {
  copyFileSync(join(srcDir, name), join(destDir, name));
}
console.log(`[copy-web-ifc-wasm] copied ${files.length} wasm file(s) → public/web-ifc/`);
