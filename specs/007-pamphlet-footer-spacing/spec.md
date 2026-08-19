# Feature 007 — Pamphlet footer inner-frame gap + action→message gap

## Status

Ready to implement (clarified 2026-08-19).

## Problem

1. **Inner frame (PDF only):** Outer footer border is fine. The **thinner inner frame** sits too close to the outer stroke in the PDF. Desktop spacing looks correct — PDF must match desktop.
2. **Action → message:** Need **double** vertical gap between footer title (Acción h1) and the message `<p>` below.

## Clarifications (locked)

1. Not page margin / not moving the footer on the sheet. Only the **gap between outer stroke and inner stroke** (`inner_inset`) must match desktop visually in PDF.
2. `action_message_gap` = **1.2mm** (2 × current `chrome_gap` 0.6). Gap from message → meta bar stays `chrome_gap` 0.6mm.

## Current tokens

| Token | Desktop (CSS) | PDF (`footer_layout`) |
|-------|---------------|------------------------|
| Outer stroke | 0.2mm | `stroke` 0.2 |
| Inner stroke | 0.1mm | `inner_stroke` 0.1 |
| Inner inset | `::after { inset: 0.45mm }` | `inner_inset` 0.45 |
| chrome_gap | 0.6mm | 0.6 |
| action→message | same as chrome_gap today | same |

## Goals

1. Diagnose why PDF inner frame reads tighter than desktop at the same 0.45mm; fix PDF (and/or bump `inner_inset` in the shared layout constant) so PDF matches desktop. Prefer a single `PAMPHLET_FOOTER_LAYOUT_MM.inner_inset` driving both.
2. Add `action_message_gap: 1.2` to layout; CSS uses it between Acción and Mensaje only; PDF `drawFooter` uses the same mm. Keep `chrome_gap` for message→meta.

## Non-goals

- Changing page `PamphletMarginMm`.
- Removing the double frame.
- Changing meta row gaps.

## Acceptance

- [x] PDF inner path inset accounts for centered strokes (`stroke/2 + inner_inset + inner_stroke/2`).
- [x] Acción → Mensaje gap is 1.2mm on desktop and PDF via `action_message_gap`.
- [x] Print still POSTs `footer_layout`; no invented sizes in PDF.
- [x] Frontend `npm run build` green before push (spec 005).
