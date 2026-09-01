# Milestone 054 — Universal site layout (2026-09-01)

Locked: every route uses BaseLayout + Articles-style product chrome
(`page-shell--product` / `.product-dash`). Hard exceptions only:

- Pamphlet non-dashboard editor (`html.layout-editor-bleed` + generator)
- Scrib sheet editor (`pageEditorBleed`)
- eReport workspace / report editor (`pageEditorBleed`)

Pamphlet no longer mounts `PamphletLayout` for the dashboard.
Header / left rail / hamburger tray stay on all surfaces including editors.

Spec: `specs/054-universal-site-layout/spec.md`
