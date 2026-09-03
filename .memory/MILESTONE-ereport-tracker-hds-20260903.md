# Milestone — eReport tracker tools → HDS (2026-09-03)

Moved Issue Tracker topbar icons into the site Header Dynamic Section
and removed the iframe `.topbar` (“Issue Tracker” title bar).

- HDS: tutorial, sidebar, font±, upload, clear, progress, save-export (+ existing hub/tema/cloud/share/history)
- Host → iframe `postMessage` `{ type: "command", command }`
- Meta panel (org / report name / date / number) kept in edit body
- Alias synced; cache-bust `?v=051a`

Specs: `025-ereport`, `049-ereport-tracker-populado`.
