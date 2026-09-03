# Milestone — Header + icon chrome scale (2026-09-03)

Spec 045 amendment: phone/tablet site header and HDS icon buttons were ~0.5× / ~0.75× of intended size after the rem shrink. Restored via `--ui-scale` → `--chrome-control-size` (phone ×2, tablet ×4/3, desktop ×1). Page `.btn` / inputs stay on `--bmh` only.

Spec: `specs/045-global-theme-product-dashboards/spec.md`
