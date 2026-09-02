# Milestone — eReport editor viewport fill (2026-09-02)

Bug: under `html.layout-editor-bleed`, `.ereport-editor` used `height: 100%` /
`min-height: 0`, which collapsed through Astro’s `astro-island` wrapper so the
Issue Tracker iframe sat as a short top strip over empty page chrome.

Fix: fixed inset under Header/rail tokens (`--header_offset`, `--header_width`),
iframe `height: 100%` inside that shell (same idea as Scrib viewport).

Specs: `025-ereport`, `054-universal-site-layout`.
