# Portable Issue Tracker (static)

Copy **this entire folder** into another project. It is a single-file static app to report and track issues — **not** tied to Model Checker BA.

## Quick start

```bash
# 1) Edit host brand tokens
#    theme.host.css

# 2) Optional: edit sample structure / copy
#    seed.example.json

# 3) Build
python _build.py
```

Open:
- `app.empty.html` — blank report
- `app.sample.html` — example data

## Host styles

The host app **must** provide styles by editing `theme.host.css` (CSS variables). See `SPEC.md` §0.

Rebuild after every theme change so tokens are inlined into the HTML.

## Format

- Save/load uses **`.ereport`** (JSON + base64 images).
- Details and acceptance checklist: **`SPEC.md`**.
