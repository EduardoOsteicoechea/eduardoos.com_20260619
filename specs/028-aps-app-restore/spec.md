# Feature 028 — Restore APS RevitHello AppBundle under backend

## Status

Active (2026-08-24).

## Problem

The functional APS Design Automation robot + registration scripts that reviewed a Revit model lived at commit `f3e41eb` under repo-root `aps_app/`. Product UI/API were later pruned; the user needs that **standalone component** available again under the current backend tree.

## Goals

- Restore **only** the peak `aps_app/` tree from `f3e41eb` into `backend/aps_app/`:
  - `RevitHello/` AppBundle sources + packed bundle contents
  - `pack-bundle.ps1`
  - `register-revit-activity.mjs`
- Document origin commit and that this does **not** re-wire gateway routes or `/aps-admin`.
- Ignore `bin/`, `obj/`, and `*.zip` under `backend/aps_app/`.

## Non-goals

- Re-enable `POST /api/aps/*`, `pkg/aps`, or frontend `/aps-admin`.
- Delete or rewrite `backend/revitapi/` in this change (may remain as prior relocated copy).
- Change Design Automation nicknames, engines, or S3 buckets.

## Acceptance

- [x] `backend/aps_app/` matches `f3e41eb:aps_app/` sources.
- [x] README cites commit `f3e41eb` and usage (pack + register only).
- [x] `.gitignore` covers build artifacts under `backend/aps_app/`.
- [x] Commit + push.

## Affected paths

- `specs/028-aps-app-restore/spec.md`
- `backend/aps_app/**`
- `.gitignore`
- `.memory/MILESTONE-aps-design-automation-20260806.md` (pointer note)
