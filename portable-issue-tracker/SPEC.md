# SPEC — Portable static Issue Tracker (copy/paste kit)

This folder is a **self-contained, domain-agnostic** static web app for reporting and tracking issues (bugs / findings / QA items) as a **single HTML file**. It is **not** tied to Model Checker BA, GCBA, Revit, or any product line.

Use it by copying this entire folder into another repo/product and regenerating (or shipping) the HTML.

---

## 0. Contract with the HOST APP (styles)

**The host product owns the visual brand.** This kit owns structure + behavior only.

### Required from the host

1. Edit **`theme.host.css`** (do **not** rename the CSS variables).
2. Rebuild with `python _build.py` so the theme is inlined into the HTML.
3. Or, after paste into a host shell, inject an equivalent `:root { … }` block before the app structure CSS.

### Tokens the host MUST provide

| Token | Role |
|---|---|
| `--brand-primary` | Topbar / section headers / strong borders |
| `--brand-accent` | Save CTA, active nav highlight |
| `--brand-secondary` | Secondary accents, approved stripe |
| `--brand-ink` | Default text |
| `--brand-surface` | Light surfaces / off-white |
| `--bg` | Page background |
| `--ink` | Body text (usually = brand-ink) |
| `--muted` | Labels / hints |
| `--card` | Card surfaces |
| `--line` | Borders |
| `--shadow` | Elevations (optional; cards may be flat) |
| `--font` | Font stack |
| `--sidebar-w` | Sidebar width (rem) |
| `--topbar-h` | Topbar height (rem) |
| `--base` | Base rem unit (`1rem`) |
| `--ok-bg` / `--ok-stripe` | Approved row |
| `--fail-bg` / `--fail-stripe` | Rejected row |
| `--pending-card-bg` | Neutral issue card |

Also define **`body.theme-dark { … }`** overrides for the same tokens.

### Host must NOT

- Hardcode brand colors into the structure CSS of `_build.py` / generated HTML.
- Rename structural class names (`.item-card`, `.qa-pair`, `.nav-dot`, …) without updating the SPEC + JS.
- Depend on Model Checker paths, tickets, or analytics.

---

## 1. What the app does (parity checklist)

Reproduce **exactly** this behavior in any host that embeds the static page:

### Shell
- Sticky **topbar**: title left; actions right:
  1. Toggle sidebar  
  2. Toggle light/dark theme  
  3. Increase root font-size  
  4. Decrease root font-size (min 8px)  
  5. Upload **`.ereport`** only  
  6. Clear all  
  7. **Yellow save** = download all (same as footer save)
- Default `html { font-size: 12px }`; all layout sizes in **`rem`**.
- Right **sidebar**: header + scrollable section rails of dots + ↑↓ footer.
- Scroll-spy: yellow accent on the issue currently at the top of the viewport; siblings in same group softer accent; section label accent when active.
- Floating tooltip on dots: **group title + issue name**.

### Data model (JSON / `.ereport`)
`.ereport` is JSON on disk with extension `.ereport`.

```json
{
  "reportDate": "YYYY-MM-DD",
  "reportNumber": "string",
  "sections": [
    {
      "id": "slug",
      "title": "Section title",
      "kind": "funcionalidades" | "subarticulos",
      "groups": [
        {
          "id": "slug",
          "title": "Group / submodule title",
          "items": [
            {
              "id": "slug",
              "nombre": "short name",
              "incidencia": "issue text",
              "fechaIncidencia": "datetime-local value or \"\"",
              "status": "" | "aprobado" | "reprobado",
              "solucion": "resolution text",
              "fechaSolucion": "datetime-local value or \"\"",
              "imagesIncidencia": [{ "name": "", "mime": "", "dataUrl": "data:image/…;base64,…" }],
              "imagesSolucion": [{ "name": "", "mime": "", "dataUrl": "data:image/…;base64,…" }],
              "images": []
            }
          ]
        }
      ]
    }
  ]
}
```

Legacy keys `queja` / `imagesQueja` may be accepted on load and normalized to `incidencia` / `imagesIncidencia`.

### Issue card UI
- Per section: title bar + clear-section; body with gap **1.4rem** between groups.
- Per group: header (title + add / clear group); transparent group chrome.
- Per item (issue card):
  - Name input + delete item (no “Nombre” / “Estado” labels).
  - Paired panel: **Incidencia** | **Solución** (bordered pair with vertical divider).
  - Each side: `datetime-local`, textarea, image file input, thumbs with **× delete**.
  - Status box (✓ / ✕) right-aligned, bordered, buttons centered.
  - Pending card bg = `--pending-card-bg`; approved/rejected tint + left stripe; **no drop shadow**.
- Images stored as **base64 data URLs** inside state and `.ereport`.

### Persist / export
- **Save** downloads:
  1. `issue_report_<number>.ereport` (JSON + embedded images)
  2. `.html` snapshot (self-contained)
  3. `.pdf` via html2canvas + jsPDF (CDN)
- Load accepts **only** `.ereport`.
- Clear all resets to empty skeleton from embedded schema.

### Navigation labels
- Sidebar section short label = leading number from title, else first 3 chars.

---

## 2. Files in this kit

| File | Purpose |
|---|---|
| `SPEC.md` | This contract (give to an agent / junior to reproduce) |
| `README.md` | Human copy/paste steps |
| `theme.host.css` | **Host styles** (edit me) |
| `seed.example.json` | Sample domain-agnostic data |
| `_build.py` | Builds `app.empty.html` + `app.sample.html` |
| `app.empty.html` | Empty skeleton ready to fill |
| `app.sample.html` | Sample populated demo |

Optional: delete `_adapt_build.py` if present (one-shot helper; not required at runtime).

---

## 3. How an agent should rebuild / port

1. Copy this folder into the host repo.
2. Ask host design for token values → write `theme.host.css`.
3. Replace `seed.example.json` sections/groups/items with the host domain structure (keep the schema).
4. Run `python _build.py`.
5. Ship `app.empty.html` (and optionally `app.sample.html`) as static assets, or iframe / open as `file://` / static host.
6. Do **not** pull Model Checker BA analytics, actionable tickets, or GCBA brand into this kit.

### Acceptance tests
- [ ] Open `app.sample.html` offline (CDN needed only for PDF).
- [ ] Change theme tokens → rebuild → colors update; layout unchanged.
- [ ] Upload images → × removes → Save → `.ereport` contains `dataUrl` base64.
- [ ] Reload `.ereport` restores text, dates, status, images.
- [ ] Reject `.json` upload; accept `.ereport` only.
- [ ] Font ± scales whole UI (rem).
- [ ] Sidebar yellow tracks scroll-top issue.
- [ ] Dark mode toggles via host dark tokens.

---

## 4. Embedding into another app

Options:
1. **Static page**: open / host the single HTML.
2. **Iframe** inside the host shell; host still supplies theme via rebuild.
3. **Extract**: keep JS+structure; host injects CSS variables on `document.documentElement` before load (advanced). Prefer rebuild + `theme.host.css` for single-file reliability.

---

## 5. Out of scope

- Backend / auth / multi-user sync.
- Product-specific normative text or analytics.
- Changing the `.ereport` schema without bumping a `schemaVersion` field (add if you evolve the format).
