# Feature 008 — Footer meta cleanup + route prune (milestone)

## Status

Draft — blocked on clarifying questions (esp. route prune). Do not implement prune until confirmed.

## Milestone note (locked)

1. **Footer outer margin / page relationship** is accepted as perfect — do not change page margin or footer placement on the sheet.

## Remaining footer work

### 2. Desktop footer still ≠ PDF
Desktop still shows cell borders / different chrome vs PDF. Goal: desktop print view matches PDF (PDF remains reference where they diverge unless noted below).

Open questions for (2):
- Match means: hide input cell borders on desktop (PDF already omits them), keep double outer frame, same gaps/type?
- Or something else still wrong after last inner-frame + action_message_gap fix?

### 3. Remove the middle meta row (red X)
In the 2-column meta block, remove the empty row between label row 1 (WhatsApp|Teléfono) and label row 3 (Dirección|Actividades) — i.e. the empty **value1|value2** band when values are blank / the spacer the user marked with X.

Proposed default: **collapse empty value rows** in editor + PDF (hide row 2 and/or 4 when both cells empty). Keep label rows. Values still editable when present / when focusing a slot.

Alternative (ask): permanently drop value rows and put value on the same line as the label (header-style `Label: value`).

### 4. Margin between heading and `<p>`
Increase Acción → Mensaje gap again (currently `action_message_gap: 1.2mm`). Propose **2.0mm** unless user picks another mm.

### 5. Delete routes not on the current website (except Subscribe)
**Keep visible:** Subscribe (`/payments/subscription`) — restore/show in UI if hidden.
**Prune:** pages, FE libs, and backend handlers for routes **not** linked from the current public website chrome — but only after an explicit keep-list.

#### Current Header surface (from `Header.tsx` today)

| Area | Routes |
|------|--------|
| Primary | Home, Contact |
| Services menu | Homescool, Church, Music, Pamphlet, Articles |
| Auth chrome | Subscribe, Profile, Login/Register, Admin (admin only) |

Also existing pages **not** in that nav (candidates to delete unless kept): BIM, APS Admin, Debate App, Instrumentalist, Greek (+ build/workspace), Media Gallery (Music stays?), Homescool subpages?, Church subpages?, Articles ver?, Pamphlet stays?, auth OTP/reset, etc.

## Non-goals until confirmed

- Deleting DynamoDB tables or production data.
- Removing auth/login/register/OTP/reset/profile (needed for Subscribe).
- Removing pamphlet PDF pipeline or payments backend for Subscribe.

## Acceptance (when unblocked)

- [ ] Milestone 1 documented; no page-margin churn.
- [ ] Desktop footer visual parity with PDF for agreed chrome.
- [ ] Meta middle empty row gone (per chosen approach).
- [ ] Acción→Mensaje gap = agreed mm on desktop + PDF via `footer_layout`.
- [ ] Route prune matches approved keep-list; Subscribe visible; site builds; smoke `/`, `/payments/subscription`, `/auth/login`.
