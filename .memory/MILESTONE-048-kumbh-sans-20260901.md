# Milestone — Kumbh Sans site-wide (2026-09-01)

Feature 048: site UI uses Google Font **Kumbh Sans** (wght 100–900, YOPQ 300).

- Loaded in `BaseLayout` + `PamphletLayout`
- All `--font-*` tokens → `"Kumbh Sans", system-ui, sans-serif`
- Root optical sizing + `font-variation-settings: "YOPQ" 300`
- Legacy Montserrat/Raleway/Roboto/Calibri/Cormorant hardcodes in UI CSS → theme tokens
- Exempt: monospace stacks; pamphlet-generator document canvas; PDF embed

Spec: `specs/048-kumbh-sans-site-font/spec.md`
