# Feature 015 — Wider header/footer body gutters

## Goals

1. Gap header → cols 1–2 **+2mm**: `body_gutter` / `--header-body-gutter` `1` → **`3`**.
2. Gap cols 7–8 → footer **+2mm**: `--footer-body-gutter` / `PamphletFooterBodyGutterMm` / `main.ts` `4` → **`6`**.
3. Recalc `--page1-body-height`, right/left col heights, and Go defaults to match.

## Acceptance

- [x] Gutters 3mm / 6mm FE+PDF; column math updated; tests + build green.
