# Feature 032 — Calvin’s Institutes reader (S3-backed)

## Status

Active (2026-08-25).

## Problem

Public domain Institutes text is uploaded under S3 prefix `calvin-institutes/`. Eduardo OS needs a public page at `/latin/calvins-institutes` with a Services menu link that loads the index + sections via the backend (bucket stays private).

## Goals

| Surface | Path | Auth |
|---------|------|------|
| FE page | `/latin/calvins-institutes` | Public |
| Header | Services → **Calvin’s Institutes** | Always |
| BE index | `GET /api/latin/calvins-institutes` | Public |
| BE section | `GET /api/latin/calvins-institutes/sections/{id}` | Public |

- S3 source: `s3://{S3_BUCKET}/calvin-institutes/index.json` and `…/sections/NNNN.json`
- Optional env `CALVIN_INSTITUTES_S3_PREFIX` (default `calvin-institutes`)
- No Docker changes; upload via `backend/dynamodb_output/sync_to_s3.ps1`

## Non-goals

- DynamoDB import, OCR cleanup, CloudFront, public bucket ACLs.

## Acceptance

- [x] Menu link opens reader without login
- [x] Sidebar from index; section body loads from S3 via API
- [x] Missing object → 404 JSON; backend stays up
