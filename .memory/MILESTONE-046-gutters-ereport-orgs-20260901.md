# Milestone — 046 home + gutters + eReport orgs (2026-09-01)

## Home
- Chat always on top (fixed stacking; no z-index trap on stage)
- Profile cards 2-per-row; direct titles; first-person AI-driven copy

## Gutters / dashboards
- `.page-shell` / `.product-dash` share `--p3` / `--page-inline-pad` / `--p5`
- Homescool gutter → site tokens; ProductDashboard sections on Homescool, Church, Scrib hub, eReport
- Editors excluded: Scrib sheet, Pamphlet canvas, eReport tracker

## eReport
- Org dashboard: Orgs / Register / Recent / Manage
- Magic-link invites (org duration modal; report = 1h edit)
- Invite page `/ereport/invite/?token=`
- Tracker tokens aligned to site light/dark
- Legacy flat APIs kept; new reports under orgs only

Spec: `specs/046-page-gutters-dashboards-ereport-clients/spec.md`
