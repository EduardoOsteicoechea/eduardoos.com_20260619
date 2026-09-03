# Milestone — Institutes paragraph pack + Scrib copy modal (2026-09-03)

Feature 056: parallel S3 pack `calvin-institutes-paragraphs/` (book → chapter →
paragraph, ids `I.XI.3`, derivation `break-after-period-v1`). Capita
`calvin-institutes/` and 032 reader untouched.

- Builder: `go run ./backend/cmd/calvin-paragraphs-pack --in … --out …`
- API: `GET /api/latin/calvins-institutes/paragraphs` (+ `/chapters/{book}/{chapter}`)
- Scrib editor: Institutes header control → pick Caput → copy paragraph/chapter

Spec: `specs/056-calvin-institutes-paragraphs/spec.md`
Ops: upload built pack to S3 before the modal can load live data.
