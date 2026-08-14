# Milestone: Pamphlet PDF ↔ desktop parity + Homescool — 2026-08-14

## Status: SHIPPED on `master`

PDF print now matches the desktop sheet at the **bottom of filled columns** (last heading + last line). Header geometry at this milestone is the **20 mm band** that the user signed off on the PDF. Next change (same day): scale that header **1.35×** and make desktop wrap like Helvetica so it does not leave a hole under the title.

| Commit | Message |
|--------|---------|
| `4683227` | fix: paint pamphlet PDF last line that sits in the page margin |
| `0d947f1` | fix: stop pamphlet PDF from clipping the last column lines |
| `1c9d427` | feat: add /homescool with articles, resources, and interest form |
| `f92f818` | fix: set TMPDIR off /tmp so Go build can finish on EC2 |
| `713d4fc` | fix: wrap pamphlet PDF title with Helvetica-Bold AFM widths |
| `b5ebbd2` | fix: scope pamphlet CSS so it cannot hide site header avatar |

---

## 1. Pamphlet PDF (`pkg/pdf`, Imprimir)

### Signed off
- Desktop sheet is the visual source of truth for **column bottoms**.
- PDF was dropping the last line (`para santificae`, `Mira cómo dice Romanos…`) because it clipped at the column floor while CSS `.dumb-column` is `overflow: visible` (ink sits in the 10 mm page margin).
- Extra 3 mm heading margin (not in CSS) plus `y − lineH < floor` ate the last heading + paragraph.
- Fix: item-top cursor, heading 4.25 mm / line-height 1.2, only 2.5 mm item gaps, paint a line whose line-box intersects the band or starts at most one body line into the margin.

### Header at this milestone (PDF approved)
- Band **20 mm** + **5 mm** header→body gutter
- Title **5 mm / lh 1.1**, meta **2.5 mm / lh 1.2**, title→meta gap **0.6 mm**, meta row-gap **0.8 mm**
- Wrap via Helvetica-Bold AFM so a two-line title fills the band (no fake empty margin under Autor/Fecha)

### Do not regress
- No global `p {}` in pamphlet CSS (hides site avatar / Panfleto)
- No `go run` on EC2; prebuild `bin/eduardoos` with `TMPDIR` on the app disk
- Do not clip the last visible sheet line at the column floor

---

## 2. Homescool (`/homescool`)

Public landing: pamphlet-backed articles, resource cards, interest form → `eduardooost@gmail.com` via `POST /api/contact/notify` or WhatsApp `wa.me/584147281033`.

---

## 3. Deploy

EC2 `/tmp` tmpfs ENOSPC was leaving nginx **502** on `/api/*`. Deploy builds with `TMPDIR`/`GOTMPDIR`/`GOCACHE` under `APP_DIR/.cache`, waits for monolith `/health`.

---

## Next up

Title type only (not the 20 mm band / page margin): 5 mm → **6.75 mm**. Band, gutter, and cols 1–2 stay as signed off.
