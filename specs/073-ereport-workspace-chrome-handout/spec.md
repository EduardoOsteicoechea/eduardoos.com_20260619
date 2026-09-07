# Feature 073 — eReport workspace chrome handout (locked inventory)

## Status

**Handout locked 2026-09-07.** This file is the pixel / token / permission contract. **Build recipe (every screen, every button, CSS recipes, postMessage, order):** [`playbook.md`](./playbook.md).

Implementation of 072 (VPS filesystem, invite OTP, full-tracker invitees, vendor html2canvas/jsPDF) is a **later turn**. This spec freezes **what already shipped** so another agent cannot “redesign” tokens or invent controls.

## Problem

A restyle / parity pass stalled because three palettes and two icon fonts were treated as one system, and the prompt listed rail/HDS controls that **do not exist**. Without a numbered inventory, agents guess hex, invent `0.125rem` circles, and restyle the tracker canvas with `--site-*` (forbidden by 049).

## Goals

1. Publish exact light/dark values for Eduardo OS chrome **and** the tracker canvas, plus inherit vs keep.
2. Inventory every real control (rail, nav tray, HDS, host modals, tracker internals) with location, ligature, size, shape, gap, action, states, phone vs desktop.
3. Inventory features with owner / invitee / guest, success, failure, and must-not.

## Non-goals

- New rail buttons (`agent`, `collapse-rail`).
- New HDS button `add section` (add-issue lives **inside** the tracker group head).
- Replacing tracker populado tokens with `--site-*` (049).
- Implementing 072 runtime in the same turn as this lock.
- Changing Pamphlet / Scrib mm/px geometry.

## Scope split (read this first)

| Surface | Palette | Font | Icon font | Radius |
|---------|---------|------|-----------|--------|
| **Eduardo OS chrome** — left rail, phone top bar, nav tray, HDS, host modals, hub cards, `.btn` | `--site-*` / `--btn-*` in `theme.css` (045) | **Kumbh Sans** YOPQ 300 | **Material Symbols Outlined** | `--br` = **3.44px** (not 0.125rem) |
| **Tracker iframe canvas** — `ereport-tracker.html` | Populado QA tokens (049) | `"Segoe UI", "Candara", "Calibri", sans-serif` | **Material Icons** (old ligature set, not Symbols) | `--radius` = **3px** |

**This handout covers both.** Tracker must **inherit** only the rows marked Inherit below. Everything else in the tracker column is **keep**.

---

# 1. Theme colors / brand

Resolved hex for `color-mix` rows are sRGB approximations of the live token (browser may differ by ≤1). **Ship the token**, not a hardcoded hex, except where the tracker already hardcodes.

## 1.1 Eduardo OS chrome (inherit these on rail / HDS / host modals / hub)

| Role | Token | Light | Dark |
|------|-------|-------|------|
| Page background | `--bg` / `--site-body-bg` | `#f2f3f6` | `#0e1116` |
| Surface (elevated plate) | `--site-surface` | `color-mix(in srgb, var(--bg) 92%, var(--fg) 8%)` ≈ `#e0e1e5` | `color-mix(in srgb, var(--bg) 88%, var(--fg) 12%)` ≈ `#282b30` |
| Text | `--fg` / `--site-body-fg` | `#141820` | `#e8eaef` |
| Muted | `--site-muted-fg` | `color-mix(in srgb, var(--fg) 55%, var(--bg) 45%)` ≈ `#787a80` | same mix ≈ `#86888d` |
| Meta | `--site-meta-fg` | mix fg 68% / bg 32% ≈ `#5b5e64` | same formula |
| Accent | `--btn-blue` / `--site-accent` | `#2563eb` | `#2563eb` (same) |
| Accent on fill | `--btn-blue-fg` / `--site-accent-fg` | `#ffffff` | `#ffffff` |
| Border (site-wide rule) | `--border_001` | `none` | `none` |
| Input / HDS edge | `--site-input-border` | `color-mix(in srgb, var(--fg) 18%, transparent)` ≈ `#d5d5d7` on white | `color-mix(in srgb, var(--fg) 28%, transparent)` ≈ `#4b4e53` on `#0e1116` |
| Ok (ISO green `.btn`) | `--btn-green` / `--btn-green-fg` | `#16a34a` / `#ffffff` | same |
| Error | `--btn-red` / `--site-danger` / `--btn-red-fg` | `#dc2626` / `#ffffff` | same |
| Warn / yellow `.btn` | `--btn-yellow` / `--btn-yellow-fg` | `#ca8a04` / `#141820` | same |
| Button default bg / fg | `.btn` | `--site-surface` / `--fg` | same tokens |
| Button primary bg / fg | `.btn--primary` / `.btn--blue` | `#2563eb` / `#ffffff` | same |
| Input fill | `--site-input-bg` | `#ffffff` | `#252a33` |
| Glass chrome | `--glassed_background` | bg 88% transparent | bg 86% transparent |
| Focus ring | `--site-focus-ring` | blue 45% transparent | same |
| Hover wash | — | `color-mix(in srgb, var(--site-accent) 12%, transparent)` | same |
| Modal overlay (host) | `.ereport-modal` | `rgba(12, 18, 22, 0.55)` | same (not theme-flipped) |
| Phone tray / HDS drawer overlay | `.site-header__backdrop`, `.header-dynamic-menu__phone-backdrop` | `color-mix(in srgb, var(--site-body-fg) 28%, transparent)` | same |
| Rail (phone bar) | `.site-header__bar` | `--glassed_background` + `backdrop-filter: blur(12px)` | same |
| Rail (tablet/desktop) | `.site-header__bar` @ ≥768px | **transparent** (no plate, no blur) | same |
| Cloud-save HDS only | `.ereport-hds-cloud-save` | `#2e7d32` / `#fff` (active `#1b5e20`) | same — **not** `--btn-green` |

**Font family (chrome):** `"Kumbh Sans", system-ui, sans-serif` — tokens `--font-brand`, `--font-sans`, `--font-display`, `--font-body`, `--font-utility`, `--font-heading` are all this stack (048). Root type `16px × --site-text-scale` (063).

**Do not use** the elegant-formal-ui skill palette (Cormorant / `#3d5a80` steel) on eReport. Shipped chrome is Kumbh + ISO blue `#2563eb`.

## 1.2 Tracker canvas (keep — do not replace with `--site-*`)

| Role | Token | Light (`:root`) | Dark (`body.theme-dark`) |
|------|-------|-----------------|--------------------------|
| Page background | `--bg` | `#ffffff` | `#000000` |
| Surface | `--surface` | `#f3f3f3` | `#1a1a1a` |
| Card | `--card` | `#ffffff` | `#121212` |
| Text | `--ink` | `#000000` | `#ffffff` |
| Muted | `--muted` | `#555555` | `#bdbdbd` |
| Border / line | `--line` | `#cccccc` | `#444444` |
| Ok | `--success` / `--success-bg` | `#2e7d32` / `#e8f5e9` | `#66bb6a` / `#0d2818` |
| Error | `--danger` / `--danger-bg` | `#c62828` / `#ffebee` | `#ef5350` / `#2a0f0f` |
| Yellow chips / unset | `--warning` / `--warning-bg` | `#f9a825` / `#fff8e1` | `#ffca28` / `#2a2208` |
| Neutral / no_aplica | `--neutral` / `--neutral-bg` | `#9e9e9e` / `#eeeeee` | `#757575` / `#2a2a2a` |
| Inverse button | `--inverse-bg` / `--inverse-ink` | `#000000` / `#ffffff` | `#ffffff` / `#000000` |
| Section head | `--section-head-bg` | `#dcdcdc` | `#1f1f1f` |
| Modal overlay | `.modal` | `rgba(0,0,0,.72)` | same |
| Sidebar width | `--sidebar-w` | `24.5rem` | same |
| Radius | `--radius` | `3px` | same |

**Font family (tracker):** `"Segoe UI", "Candara", "Calibri", sans-serif`. **Keep.** Do not load Kumbh inside the iframe.

**Yellow icon chips (tracker only):** unset issue cards (`.item-card.is-none`), nav dots with no status (`.nav-dot.is-none`), toast left bar, `warn-hot` (“Aceptar y guardar”). Color `#f9a825` / `#ffca28`. Chrome has **no** yellow chips.

## 1.3 What the tracker must inherit vs keep

| Signal | Inherit from host | Keep in tracker |
|--------|-------------------|-----------------|
| Light / dark | **Yes** — `postMessage { type: "theme", dark }` → `body.theme-dark`. No local theme button (049). | Populado hex table above |
| Text size | **Yes** — host A+/A− **and** HDS font± write `--site-text-scale` on host `html`; host pushes `{ type: "text-scale", scale }`; tracker `html { font-size: calc(16px * var(--site-text-scale)) }` | Internal rem ratios |
| Page bg / ink / accent | **No** | Populado `--bg` / `--ink` / `--warning` |
| Font | **No** | Segoe / Candara / Calibri |
| Icon font | **No** | Material **Icons** ligatures |
| Radius / borders | **No** | 3px + visible `--line` / `--ink` rules (tracker is **not** borderless) |
| HDS / host modals | N/A (outside iframe) | — |
| Cloud-save green | Host HDS uses `#2e7d32` (matches tracker `--success` light) | Tracker download confirm uses `--warning` (`warn-hot`), not green |

---

# 2. Pixel-perfect controls

## 2.0 Shared chrome geometry (HDS + rail icon hits)

| Token | Phone ≤767.98 | Tablet 768–1099.98 | Desktop ≥1100 |
|-------|---------------|--------------------|---------------|
| `--bmh` / `--bmw` (form `.btn`) | 36px | 36px | 36px |
| `--ui-scale` | `4/3` | `4/3` | `1` |
| `--chrome-control-size` / `--header-dynamic-control-size` | **48px** | **48px** | **36px** |
| `--br` | 3.44px | 3.44px | 3.44px |
| HDS gap | 0.45rem column (drawer) | 0.45rem column | 0.45rem column |
| Rail stack gap | n/a (horizontal bar) | 0.65rem | 0.65rem |

**Shape language (locked):**

- Rail logo, hamburger, HDS buttons: **rounded square**, radius `--br` (3.44px). **Not** 0.125rem. **Not** circle.
- Session avatar: **circle** (`border-radius: 50%`), same 48/36 hit size.
- Form `.btn` in host modals / hub: height `--bmh` (36px), radius `--br`, horizontal pad `--p2`, gap `--m1`.
- Tracker internals: radius **3px**; sizes in rem (see 2.4).

**HDS visual states (all workspace + hub HDS):**

| State | Fill | Border | Icon color |
|-------|------|--------|------------|
| Default | `--site-surface` | 1px `--site-input-border` | `--site-body-fg` |
| Hover | surface | `--site-accent` | `--site-accent` |
| Active / pressed (`--active` or `aria-pressed`) | `--site-accent` | `--site-accent` | `--site-accent-fg` |
| Disabled | same, `opacity: 0.45` | same | inherit |
| Cloud-save exception | `#2e7d32` (active `#1b5e20`) | matching green | `#fff` |

Icon size: Material Symbols `font-size: 56%` of control (≈26.9px phone / 20.2px desktop). SVG icons `51%` of control. `FILL 0, wght 400, opsz 24`.

**Phone vs desktop HDS chrome:**

- **Desktop/tablet:** buttons stack in the left rail under avatar + hairline sep. Always visible.
- **Phone:** one **tune** opener in the top bar; actions live in a left drawer (`width: chrome-size + 1.5rem + 10px`). Backdrop click or Escape closes the drawer. Open toggle shows `close`.

---

## 2.1 Site rail (Eduardo OS chrome)

There is **no** rail “agent” button and **no** rail “collapse” button. Agent Sandbox is an **admin-only nav-tray link**. Tracker sidebar collapse is HDS `view_sidebar`. Do not invent extra rail icons.

Desktop order (top → bottom): logo → hamburger + avatar (column-reverse in bar-end) → hairline → HDS. Phone order (left → right): logo → HDS opener → avatar + hamburger.

### R1 — Logo

| | |
|--|--|
| Location | Rail / phone bar, first |
| Icon | `<img src="/favicon-48.png">` (not a ligature) |
| Label | `aria-label="Eduardo OS home"` (no tooltip title) |
| Size | Hit: chrome-control-size. Image: 78% of that (≈37.4px / 28.1px) |
| Shape | Rounded square `--br`; **no plate** (`background: transparent`) |
| Gap | Rail 0.65rem to next; phone bar `gap: 0.5rem` |
| Does | Navigate `/` |
| States | Hover: accent 12% wash. Always enabled |
| Mobile / desktop | Same control; phone in top bar, desktop top of rail |

### R2 — Menu (hamburger)

| | |
|--|--|
| Location | Rail / phone bar-end |
| Icon | Inline SVG hamburger ↔ X (not Material). 55% of chrome size |
| Label | `Open menu` / `Close menu` |
| Size | chrome-control-size |
| Shape | Rounded square `--br` |
| Gap | 0.5rem from avatar (phone); 0.65rem (desktop) |
| Does | Opens `#site-header-nav` tray; backdrop click closes |
| States | `aria-expanded`. Phone: **no plate**. Desktop: `--site-surface` plate. Hover: `--btn-blue` icon |
| Mobile / desktop | Tray is under the bar on phone; to the **right of the rail** on desktop (`left: var(--header_width)`) |

### R3 — Session (avatar)

| | |
|--|--|
| Location | Rail / phone bar-end, before hamburger |
| Icon | Profile photo or initial letter (not a ligature) |
| Label | `title="Account"` · `aria-label="Account menu"` |
| Size | chrome-control-size **circle** |
| Shape | **Circle** 50%. Fill `--site-accent` / `--site-accent-fg`. 2px `--site-surface` ring + 1px fg 32% outline |
| Gap | 0.5rem / 0.65rem |
| Does | Logged in: flyout Subscribe / Profile / Log out. Logged out: bar shows Register + Log in (not this circle) |
| States | Hover brightness 1.06, outline → accent. Flyout: `--site-surface`, items hover accent 12% |
| Mobile / desktop | Phone flyout below-right. Desktop flyout **to the right of the rail** |

### R4 — HDS opener (phone only)

| | |
|--|--|
| Location | Phone top-bar center slot |
| Icon | Material Symbols `tune` (closed) / `close` (open) |
| Label | `Open tools` / `Close tools` |
| Size | chrome-control-size (48px) |
| Shape | Rounded square; **has plate** (`--site-surface` + 1px input border) — unlike logo/hamburger |
| Gap | 0.25rem in shell |
| Does | Slides HDS drawer from the left under the bar |
| States | Hidden when host empty. Open: accent 18% wash. Escape + backdrop close |
| Mobile / desktop | **Phone only.** Desktop HDS is always in the rail (no opener) |

### R5 — Agent (does **not** exist on the rail)

Admin-only **nav tray** row: Symbols `terminal`, label “Agent Sandbox”, href `/admin` agent sandbox route. Same row style as other tray links (full-width, icon + text). Not a chrome-control-size square. Do not add a rail agent button.

---

## 2.2 Nav tray (opened by R2)

All tray toolbar buttons: min `--bmh`×`--bmw` (36px), `--site-surface-muted`, radius `--br`, gap 0.35rem.

| ID | Ligature / glyph | Label | Does |
|----|------------------|-------|------|
| T1 | Text `A+` | Increase text size | `bumpUiScale(+1)` → `--site-text-scale` + tracker `text-scale` |
| T2 | Text `A−` | Decrease text size | `bumpUiScale(-1)` |
| T3 | `☀` / `☾` (not Material) | Light theme / Dark theme | `toggleTheme()`; host pushes `theme` into iframe |
| T4 | `×` | Close menu | Closes tray |
| T5… | Symbols per `PRIMARY_TRAY_LINKS` | Product names | Navigate; subscription-filtered |
| T6 | `group` | Admin users | Admin only |
| T7 | `terminal` | Agent Sandbox | Admin only |

Disabled: none. Error: none. Logged-out tray still has A+/A−/theme + public links + Register/Log in.

---

## 2.3 Workspace HDS (`EreportHeaderMenu` on `/ereport/workspace`)

Icon-only. Material **Symbols** except Hub / Tema / Cloud / Share / History (inline SVG, same 51% box). Order is locked. **There is no HDS “add section”.**

Gap 0.45rem. Size chrome-control-size. Shape rounded square `--br`.

| # | Ligature / SVG | `title` | `aria-label` | Command / action | Enabled | Error | Phone / desktop |
|---|----------------|---------|--------------|------------------|---------|-------|-----------------|
| H1 | `help` | Cómo usarla | Tutorial | `tutorial` → iframe howto modal | always | — | drawer vs rail |
| H2 | `view_sidebar` | Mostrar/ocultar sidebar | Sidebar | `toggle-sidebar`; `aria-pressed` when collapsed | always | — | same |
| H3 | `text_increase` | Agrandar fuente | Agrandar fuente | Host `bumpUiScale(+1)` + `text-scale` (**does not** call iframe `font-up`) | always | — | same |
| H4 | `text_decrease` | Reducir fuente | Reducir fuente | Host scale −1 | always | — | same |
| H5 | `upload_file` | Cargar .ereport | Cargar reporte | `upload` → hidden `#ereport-file` | always | bad file → iframe toast / host error | same |
| H6 | `delete_sweep` | Limpiar todo | Limpiar todo | `clear-all` → `confirm` then empty skeleton | always | cancel = no-op | same |
| H7 | `checklist` | Progreso / qué falta | Progreso | `progress` → progress modal (info) | always | — | same |
| H8 | `download` | Descargar (.ereport + HTML + PDF) | Descargar reporte | `save-export` → progress modal (save) | always | export fail → toast | **regular chrome**, not green |
| H9 | SVG hub | Hub | Abrir hub | Toggle host modal `hub` | always | — | active when modal open |
| H10 | SVG pencil | Editar tema | Editar tema | Toggle modal `tema` | always | save fail → error in modal | same |
| H11 | SVG cloud | Guardar en nube | Guardar en nube | Toggle modal `save`; **green** `#2e7d32` | `disabled` while `saving` | error paragraph in modal | only green HDS |
| H12 | SVG share | Compartir | Compartir con usuarios | Toggle modal `share` | **Rendered only if `canShare && !orgId`** (today). 072: owner-only org/report invite | API error in modal | hidden for invitee / guest / current org reports |
| H13 | SVG history | Historial | Historial de versiones API | Toggle modal `historial` + fetch | **Same gate as H12 today.** 072: owner org history | empty / API error | hidden for invitee |

**Hub HDS** (not workspace — `/ereport` / hub views), `ProductHeaderMenu`:

| # | Ligature | title / aria | Does |
|---|----------|--------------|------|
| P1 | `dashboard` | Dashboard | `?view=dashboard` |
| P2 | `corporate_fare` | Orgs | orgs |
| P3 | `domain_add` | New org | register |
| P4 | `post_add` | New report | new-report |
| P5 | `history` | Recent | recent |
| P6 | `folder_managed` | Manage | manage |

Active view: accent fill. Same 48/36 geometry.

---

## 2.4 Host modals (portaled to `document.body`)

Shared chrome: `.ereport-modal` overlay `rgba(12,18,22,0.55)`; panel `min(100%, 26rem)`, max-height `min(88dvh, 36rem)`, pad `1.1rem 1.15rem 1rem`, bg `--site-body-bg` (not `--site-surface`), radius `--br`, title `--font-lg` / 650. **No X close button today** — close is secondary `.btn` or backdrop. **Escape is not wired today**; lock for implementation: **Escape and backdrop click close** without saving.

Actions row: flex-end, gap 0.5rem. Secondary = `.btn`. Primary = `.btn--primary`. Disabled: `.btn:disabled` opacity 0.55.

### M1 — Hub (`hub`)

| | |
|--|--|
| Title | Hub eReport |
| Close | Backdrop · “Seguir editando” · Escape (required) |
| Fields | None. Lead: leaving loses unsaved cloud changes |
| Secondary | Seguir editando → close |
| Primary | Ir al hub → `<a class="btn btn--primary">` to owner hub |
| Must not | Auto-save or discard on open |

### M2 — Tema / edit name (`tema`)

| | |
|--|--|
| Title | Tema del reporte |
| Close | Backdrop · “Cerrar” · Escape (no save) |
| Fields | Label “Tema”; input `#ereport-modal-tema` height `--bmh`, maxLength 200, autofocus, `--site-input-bg` |
| Secondary | Cerrar |
| Primary | Guardar tema (disabled + “Guardando…” while `saving`) |
| Success | Persist tema; close modal |
| Failure | Stay open; do not clear field |

### M3 — Guardar en nube (`save`)

| | |
|--|--|
| Title | Guardar en nube |
| Close | Backdrop · “Cerrar” · Escape |
| Fields | Lead (copy still says S3 — **072 must rewrite** to filesystem). Optional error `<p class="ereport-hub__error">` |
| Secondary | Cerrar |
| Primary | Guardar ahora → `collect` + PUT; disabled while saving |
| Must not | Open this modal on auto-save (025 debounce is silent) |

### M4 — Compartir / invite (`share`)

| | |
|--|--|
| Title | Compartir |
| Close | Backdrop · “Listo” (primary) · Escape |
| Fields | Email input + `.btn` “Añadir”; list of emails + text “Quitar” |
| Today | Flat `sharedWith` only; **hidden on org reports** |
| 072 target | Magic invite + OTP; duration min 1h / max 30d (org) or 1h (report); no registered-user requirement |
| Must not | Let invitee manage invites |

### M5 — Historial (`historial`)

| | |
|--|--|
| Title | Historial API |
| Close | Backdrop · “Cerrar” primary · Escape |
| Fields | List of snapshots; each “Restaurar” `.btn`; “Actualizar” secondary |
| Today | Flat reports only |
| 072 target | Filesystem snapshots under the org report dir; max 50 |
| Restore | `confirm` first; snapshot current then replace; reload iframe |

---

## 2.5 Tracker internals (iframe — keep populado)

Material **Icons** ligatures. Radius 3px. Colors from §1.2.

### Sidebar

| ID | Ligature | title / aria | Size | Shape | Does |
|----|----------|--------------|------|-------|------|
| S1 | — | Nav dots (no icon) | 1.071rem × 1.071rem | 2px radius square | Scroll to issue. Fill: green / red / gray / **yellow** (unset). Active: gold `--warning` ring, scale 1.175 |
| S2 | `keyboard_arrow_up` | Ir arriba | 2.2rem | square 3px, transparent + ink 55% border | Scroll top |
| S3 | `keyboard_arrow_down` | Ir abajo | 2.2rem | same | Scroll bottom |

Sidebar 24.5rem sticky right. Phone `<68rem`: overlay `min(28rem, 80vw)` from the right; collapsed = `translateX(105%)`. Desktop collapse = width 0.

### Section / group / issue chrome

| ID | Ligature | title | Size | Class | Does |
|----|----------|-------|------|-------|------|
| C1 | `expand_more` / `chevron_right` | Colapsar/expandir sección | 1.5rem | `.collapse-toggle` | Toggle section body |
| C2 | `delete` | Vaciar sección | 2rem | `.danger` | Clear all groups’ items in section |
| C3 | `expand_more` / `chevron_right` | Colapsar/expandir subartículo | 1.5rem | `.collapse-toggle` | Toggle group |
| C4 | `add` | Agregar fila | 1.9rem | `.ghost` | **Add issue** (this is the “add section/issue” control — **not** HDS) |
| C5 | `delete` | Vaciar grupo | 1.9rem | `.danger` | Clear group items |
| C6 | `expand_more` / `chevron_right` | Colapsar/expandir incidencia | 1.5rem | `.collapse-toggle` | Toggle issue body |
| C7 | `delete` | Eliminar incidencia | 1.25rem | `.danger` | Remove one issue |
| C8 | `check` | Aprobado | 2.1rem (crit 1.55rem) | `.btn-status` | Set aprobado (green when active) |
| C9 | `close` | Reprobado | 2.1rem | `.btn-status` | Set reprobado (red) |
| C10 | `remove` | No aplica / fuera de entrega | 2.1rem | `.btn-status` | Set no_aplica (gray `#757575`) |
| C11 | — | datetime-local | auto | `.moment-input` | Issue / solution time |
| C12 | — | file `image/*` multiple | auto | `.img-input` | Attach images |
| C13 | `close` | Eliminar imagen | 1.15rem | `.thumb-del` red `#c62828` / `#fff` | Delete one thumb |
| C14 | `close` | Remove criterion | 1.25rem | chip button | Remove validation criterion |
| C15 | `add` | Add criterion | 2rem | criteria-add | Add criterion |

Unset status: yellow wash (`.is-none`). `no_aplica`: grayscale + gray rail. Hover collapse: ink 12% wash. Disabled: `opacity: .5`.

**There is no “add section” control.** New reports ship a fixed skeleton section; users add **issues** (C4), not new top-level sections.

### Tracker modals

| Modal | Title | Close | Overlay | Extra |
|-------|-------|-------|---------|-------|
| Howto | Qué es y cómo usarla | `close` 2.1rem `.icon-btn` · backdrop | `rgba(0,0,0,.72)` | Escape **not** wired (inplace editors only). Lock: add Escape |
| Progress (info) | Progreso del reporte | header `close` + footer `close` | same | lists fill + export preview |
| Progress (save) | Guardar reporte | header `close` · Cancelar `.secondary` · backdrop | same | Primary `warn-hot`: Icons `save` + “Aceptar y guardar” — yellow `#f9a825` / `#000` |
| Image | Evidencia | `close` · backdrop · prev `chevron_left` · next `chevron_right` | same | count label |

---

# 3. Features (who / success / failure / must-not)

Roles: **Owner** = session `userId` matches `ownerUserId`. **Invitee** = scoped invite cookie after email OTP (072). **Guest** = no session and no valid invite. **Admin** = platform admin; **same as a normal user for files** (072 7B) — no cross-org.

| # | Feature | Who | Success | Failure | Must not |
|---|---------|-----|---------|---------|----------|
| F1 | Open hub | Owner (entitled or lapsed). Admin: own hub only | Org dashboard + HDS P1–P6 | 401 → login | Guest browsing another user’s orgs |
| F2 | Create org / report / import `.ereport` | Owner with `ereport` entitlement **or** admin on **own** account (072 6A) | New org/report on filesystem; open workspace | 403 if no entitlement; fail closed if entitlements down | Create without entitlement; admin creating under someone else’s `userId` |
| F3 | Open / edit workspace | Owner (even if lapsed). Invitee after OTP (072 4A: **full tracker**). | Iframe loads payload; HDS H1–H11; auto cloud-save debounce | 403/404 generic; loading error + Volver | Guest; admin opening another user’s report; invitee seeing host Share/History |
| F4 | Tutorial | Anyone who can open workspace | Howto modal | — | Local theme instructions (theme is site-global) |
| F5 | Toggle sidebar | Same as F3 | Sidebar hides / shows; H2 pressed when collapsed | — | Persist as a different report |
| F6 | Font ± | Same as F3 | Site `--site-text-scale` steps `[0.85…1.4]`; iframe rem scale matches | At min/max: no-op | Changing only iframe scale (must stay synced with site A+/A−) |
| F7 | Load `.ereport` | Same as F3 | File replaces canvas; **must not** overwrite with cloud payload on `loaded` | Invalid file → error/toast; cloud copy stays | Re-push `payloadRef` on `loaded` (wipes the file) |
| F8 | Clear all | Same as F3 | Confirm → empty skeleton; toast | Cancel → unchanged | Delete org/report on disk |
| F9 | Progress | Same as F3 | Info modal of fill + export preview | — | Trigger download |
| F10 | Download export | Same as F3 | Confirm → `.ereport` + HTML + PDF to Downloads (072: vendor libs, no jsDelivr) | Lib/canvas fail → toast; stay in workspace | Paint H8 green; require entitlement |
| F11 | Hub modal | Same as F3 | Navigate to owner hub | — | Silent discard without the warning lead |
| F12 | Edit tema / report name | Owner. Invitee may edit body fields in iframe (org/report name inputs); host tema save is owner persist | PUT meta; modal closes | Error stays in modal | Invitee managing org name as owner rename of another tree |
| F13 | Guardar en nube (manual) | Owner. Invitee: 072 edit PUT on invite endpoints | Collect + write report dir | Error in modal; iframe state kept | Opening modal on every keystroke (auto-save is silent) |
| F14 | Auto cloud-save | Owner (and 072 invitee edit) | Debounced PUT after tracker edits | Host `error` string; do not toast-spam | Open M3; lose images |
| F15 | Invite | **Owner only** | 072: write invite file, email magic link, OTP page public | Invalid email / expiry; 403 if not owner | Capability-only link without OTP; invitee adding more invites; guest minting links |
| F16 | Accept invite | Guest with link | OTP to `invitedEmail` → scoped cookie → **full tracker** | Expired / wrong OTP → 403; show expired copy | Forcing Eduardo OS registration; serving files over public `/media/` |
| F17 | History list / restore | **Owner only** | List ≤50; restore after confirm | Empty copy; API error | Invitee restore; admin restore of another user |
| F18 | Delete org / report | **Owner only** (hub manage) | Confirm → gone from list | 403 | Invitee delete; admin delete of another user |
| F19 | Add issue / status / images | Owner + invitee (full tracker). Guest: no | DOM + state + auto-save; new images = files (072 2B), not new base64 | Oversize / bad MIME → reject | New SVG/HTML images; public image URLs |
| F20 | Theme toggle | Anyone with the nav tray | `eduardoos-theme` + `html[data-theme]` + iframe `theme` | — | Tracker-local theme button |
| F21 | Subscription gate | Catalog `ereport` $1/mo | Create/import allowed | 403 on create | Blocking **edit/open/invite/delete** when lapsed (6A) |

**Guest on `/ereport/workspace`:** 403 / login. **Guest on `/ereport/invite/`:** public page; no file bytes until OTP.

---

# 4. Explicit “do not invent” list

The prompt that listed these is **wrong** relative to shipped chrome. Do not implement them:

1. Rail **agent** square button.
2. Rail **collapse** square button.
3. HDS **add section**.
4. Tracker painted with `--bg #f2f3f6` / Kumbh / borderless 045 chrome.
5. HDS text labels.
6. Green download button.
7. Second theme toggle inside the iframe.
8. `0.125rem` radius as the site standard (site is **3.44px**; tracker is **3px**; avatar is **50%**).

## Acceptance

- [ ] An implementer can restyle **only** host chrome using §1.1 without touching tracker `:root` colors.
- [ ] Tracker still matches §1.2 after any chrome pass.
- [ ] Every HDS id H1–H13 and rail R1–R4 exists as specified; no extras.
- [ ] Host modals close on Escape + backdrop.
- [ ] Feature table F1–F21 is the permission source until 072 code ships (then invitee gets full tracker; H12/H13 appear for org owners).

## Affected paths

- `specs/073-ereport-workspace-chrome-handout/spec.md` (this file)
- `frontend/src/styles/theme.css`, `buttons.css`
- `frontend/src/components/Header/**`, `HeaderDynamicMenu/**`
- `frontend/src/components/Ereport/**`
- `frontend/public/ereport-tracker.html` (+ alias `frontend/public/ereport/tracker.html`)
- Related: `specs/025-ereport`, `045-global-theme-product-dashboards`, `049-ereport-tracker-populado`, `072-ereport-vps-filesystem`
