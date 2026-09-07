# eReport full build playbook (pixel-perfect)

Read this as the **only** implementation recipe. Spec 073 §1–4 is the token/permission lock. This file is **how to assemble the product**. Do not invent controls. Do not restyle the iframe with `--site-*`.

**Already shipped (do not rebuild from scratch):** hub UI, workspace HDS, tracker populado canvas, host `postMessage` bridge. **Not shipped (072):** VPS filesystem, invite OTP + full tracker for invitees, vendor html2canvas/jsPDF, org-owner Share/History HDS, Escape on host modals, `.btn--danger` alias.

---

## 0. Mental model (three layers)

```
┌─ Browser chrome (Eduardo OS) ─────────────────────────────────┐
│  Header rail / phone bar  →  HDS host  →  host modals         │
│  tokens: theme.css  font: Kumbh  icons: Material Symbols      │
├───────────────────────────────────────────────────────────────┤
│  Hub page  (.product-dash)     OR     Workspace bleed         │
│  cards + forms + .btn                                         │
│                               iframe src=/ereport-tracker.html│
│                               tokens: populado  Icons (old)   │
└───────────────────────────────────────────────────────────────┘
```

- **Hub** (`/ereport`, `/ereport/hub`, pretty `/ereport/{userSafe}`): product dashboard. Auth required. Gutters on.
- **Workspace** (`/ereport/workspace?org=&report=` or pretty `/ereport/{user}/{id}`): `pageEditorBleed={true}` → `html.layout-editor-bleed`. **No gutters.** Iframe fills the rest of the window under the rail/bar.
- **Invite** (`/ereport/invite/?token=`): public page. 072 target = full tracker after OTP. Today = JSON textarea (wrong; replace, do not restyle as the product).

Host never draws a second topbar over the iframe. All workspace tools are HDS squares in the site Header.

---

## 1. Files (touch only these)

| Job | Path |
|-----|------|
| Tokens | `frontend/src/styles/theme.css` |
| Form / modal buttons | `frontend/src/styles/buttons.css` |
| Hub + host modals + cloud-save green | `frontend/src/components/Ereport/Ereport.css` |
| Hub views | `frontend/src/components/Ereport/EreportHub.tsx` |
| Workspace + bridge | `frontend/src/components/Ereport/EreportEditor.tsx` |
| Workspace HDS + host modals | `frontend/src/components/Ereport/EreportHeaderMenu.tsx` |
| Invite page (072: replace JSON with editor) | `frontend/src/components/Ereport/EreportInvitePage.tsx` |
| HDS geometry | `frontend/src/components/HeaderDynamicMenu/HeaderDynamicMenu.css` |
| Rail | `frontend/src/components/Header/Header.css` |
| Dashboard cards | `frontend/src/components/ProductDashboard/ProductDashboard.css` |
| Tracker canvas | `frontend/public/ereport-tracker.html` **and** alias `frontend/public/ereport/tracker.html` (keep in sync) |
| Bleed | `frontend/src/styles/global.css` (`html.layout-editor-bleed`) |
| Workspace page | `frontend/src/pages/ereport/workspace/index.astro` (`pageEditorBleed={true}`) |

**Forbidden:** changing tracker `:root` / `body.theme-dark` colors to `--site-*`. Changing HDS to text labels. Adding rail agent / rail collapse / HDS add-section.

---

## 2. Copy-paste chrome recipes

Use these class recipes. Do not invent a third button system.

### 2.1 Square icon control (rail hamburger desktop, all HDS, phone tune)

```css
width: var(--header-dynamic-control-size, var(--chrome-control-size));
height: var(--header-dynamic-control-size, var(--chrome-control-size));
min-width: same; min-height: same;
padding: 0;
border: 1px solid var(--site-input-border);
border-radius: var(--br);          /* 3.44px — NOT 0.125rem, NOT 50% */
background: var(--site-surface);
color: var(--site-body-fg);
display: inline-flex; align-items: center; justify-content: center;
```

- Hover: `border-color` + `color` → `--site-accent`.
- Active: `background` + `border` → `--site-accent`; `color` → `--site-accent-fg`.
- Disabled: `opacity: 0.45`.
- Symbol: `font-size: 56%` of the control; `FILL 0, wght 400, opsz 24`.
- SVG: `width/height: 51%` of the control; `fill: currentColor`.

**Sizes:** phone/tablet **48×48px** (`36 × 4/3`). Desktop **36×36px**.

**Exceptions:**

| Control | Difference |
|---------|------------|
| Logo | same hit size, **no** border, **no** plate, image 78% of hit |
| Phone hamburger | same as logo (no plate) |
| Avatar | **circle 50%**, accent fill, 2px surface ring + 1px fg 32% outline |
| Cloud-save HDS | plate `#2e7d32`, icon `#fff`, border `#2e7d32`; active `#1b5e20` |

### 2.2 Text button (hub forms, host modal actions)

Class `btn` from `buttons.css`:

```css
height / min-height / max-height: var(--bmh);   /* 36px all breakpoints */
min-width: var(--bmw);                           /* 36px */
padding: 0 var(--p2);
border: none;
border-radius: var(--br);
background: var(--site-surface);
color: var(--fg);
font: 600 var(--font-base)/1.2 var(--font-display);
gap: var(--m1);
```

- Primary: add `btn--primary` → `#2563eb` / `#fff`; hover `filter: brightness(1.05)`.
- Destroy: **`btn--red`** (`#dc2626` / `#fff`). Hub today uses `btn--danger` which is **undefined** — implement as alias:

```css
.btn--danger { background: var(--btn-red); color: var(--btn-red-fg); }
```

- Disabled: `opacity: 0.55; cursor: not-allowed`.

### 2.3 Dashboard card (hub only)

```css
min-height: calc(var(--bmh) * 3);   /* 108px */
padding: var(--p3);
border: none;
border-radius: var(--br);
background: var(--site-surface);
gap: var(--m1);
```

- Grid: `repeat(auto-fill, minmax(11rem, 1fr))`, gap `--m2`.
- Icon: Symbols `1.35rem`, color `--site-accent`.
- Title: `--font-base` / 650. Desc: `--font-sm` / opacity 0.75.
- Hover: `color-mix(in srgb, var(--btn-blue) 12%, var(--site-surface))`.
- Selected org card: add `product-dash__card--active` → blue 18% into surface.

### 2.4 Form field (hub + host modals)

```css
height: var(--bmh);
padding: 0 var(--p2);
border: 1px solid var(--site-input-border);
border-radius: var(--br);
background: var(--site-input-bg);   /* #fff light / #252a33 dark */
color: var(--site-body-fg);
font-size: var(--font-base);
```

Never paint inputs with `--bg`.

### 2.5 Host modal

```css
.ereport-modal { position:fixed; inset:0; z-index:80; display:grid; place-items:center;
  padding:1rem; background: rgba(12,18,22,0.55); }
.ereport-modal__panel { width:min(100%,26rem); max-height:min(88dvh,36rem); overflow:auto;
  padding:1.1rem 1.15rem 1rem; background: var(--site-body-bg); color: var(--site-body-fg);
  border-radius: var(--br); box-shadow: 0 0.75rem 2rem rgba(0,0,0,0.28); }
```

- Title: `--font-lg` / 650. Lead: `--font-sm` / opacity 0.9.
- Actions: flex-end, gap 0.5rem.
- **Required:** backdrop click closes; **Escape closes** (not wired today — add `keydown` on document while modal open).
- No X in the corner today; do not add one unless you also add it to every host modal consistently.

### 2.6 Workspace iframe fill

```css
html.layout-editor-bleed .ereport-editor {
  position: fixed;
  top: var(--header_offset, var(--header_height, 60px));
  left: var(--header_width, 0px);
  right: 0; bottom: 0;
}
.ereport-editor__frame { width:100%; height:100%; border:0; background:#d8e0e4; }
```

Do **not** use `height: 100%` through `<astro-island>` alone — the chain breaks and the iframe collapses to a strip.

Phone: `--header_offset` = 48px + safe-area. Desktop: `--header_offset` = 0; `--header_width` = `--lbw` (~78.6px desktop / scaled tablet).

---

## 3. Site rail (every route, including eReport)

Desktop ≥768: left column, transparent, gap **0.65rem**. Order top→bottom: **logo → hamburger → avatar → 1px hairline (only if HDS nonempty) → HDS stack**.

Phone: top bar glassed+blur, height 48px + safe-area. Order left→right: **logo → tune (if HDS) → avatar + hamburger**.

| # | Control | Icon | title / aria | Hit | Shape | Plate | Action |
|---|---------|------|--------------|-----|-------|-------|--------|
| R1 | Logo | `/favicon-48.png` @ 78% | Eduardo OS home | 48/36 | `--br` square | none | `href=/` |
| R2 | Menu | SVG ☰ / ✕ @ 55% | Open/Close menu | 48/36 | `--br` square | desktop yes / phone no | toggle `#site-header-nav` |
| R3 | Session | photo or initial | Account / Account menu | 48/36 | **circle** | accent fill | flyout Subscribe, Profile, Log out |
| R4 | HDS opener | Symbols `tune` / `close` | Open/Close tools | 48 | `--br` square | **yes** | phone drawer only |

**Do not add** rail agent or rail collapse.

Nav tray (after R2): `A+` `A−` theme `☀/☾` close `×`, then product links. Admin extra: `group` Admin users, `terminal` Agent Sandbox. Tray overlay: fg 28% mix. Desktop tray starts at `left: var(--header_width)`.

---

## 4. Hub — button by button

**Page:** `BaseLayout requireAuth` + `EreportHub`. Padding comes from `.product-dash`: `--p3` top, `--page-inline-pad` sides, `--p5` bottom. Title “eReport” `--font-lg` / 650.

**HDS (always mounted, all `?view=`):** icon-only, same 48/36 squares as §2.1. Active view = accent fill.

| # | Ligature | title | Sets `?view=` |
|---|----------|-------|----------------|
| P1 | `dashboard` | Dashboard | (delete `view`) |
| P2 | `corporate_fare` | Orgs | `orgs` |
| P3 | `domain_add` | New org | `register` |
| P4 | `post_add` | New report | `new-report` |
| P5 | `history` | Recent | `recent` |
| P6 | `folder_managed` | Manage | `manage` |

Every non-dashboard view: first control is `.btn` **Back to dashboard** (36px surface). Clears org panel + invite link.

Error: `<p class="ereport-hub__error">`. Loading: `ViewLoading` “Loading eReport”.

### 4.1 Dashboard (`view` empty)

Three sections. Uppercase section titles `--font-base` / 650 / opacity 0.72.

**Orgs**

| Card title | Icon | Desc | Click |
|------------|------|------|-------|
| Orgs | `corporate_fare` | `{n} visible` | → `orgs` |
| + New org | `domain_add` | Create a client organization | → `register` |

**Reports**

| Card title | Icon | Desc | Click |
|------------|------|------|-------|
| Recent reports | `history` | `{n} recent` | → `recent` |
| + New report | `post_add` | Create report in an org | → `new-report` |

**Manage**

| Card title | Icon | Desc | Click |
|------------|------|------|-------|
| Manage orgs | `folder_managed` | Order, hide, delete | → `manage` |

### 4.2 New org (`register`)

Form `.ereport-hub__form` max-width 28rem, gap `--m1`.

| Control | Type | Copy | Enabled | Success |
|---------|------|------|---------|---------|
| Organization name | input `--bmh` | placeholder “Client / project org” | `canCreate && !busy` | — |
| First report name | input | “e.g. Model QA — Sprint 1” | same | — |
| Create org + first report | `btn btn--primary` | — | same | `POST` org; redirect workspace of first report |

If `!canCreate`: muted “eReport subscription required.” Do not create.

### 4.3 New report (`new-report`)

| Control | Type | Enabled | Success |
|---------|------|---------|---------|
| Organization | `<select>` `--bmh` | `canCreate && orgs.length` | — |
| Report name | input required | `canCreate` | — |
| Create report | `btn btn--primary` | org selected + name trim | `POST` report → workspace |
| Import .ereport | `btn` | org selected | hidden file `.ereport`; parse `sections[]`; import → workspace |
| Register an org first | `btn` | shown if no orgs | → `register` |

Failure: “Select an organization…”, “Solo archivos .ereport”, “El .ereport no tiene sections[]”.

### 4.4 Orgs (`orgs`)

**Row 1 — org picker.** Grid of cards (same card CSS). Icon `corporate_fare`. Title = org name. Desc = “Select org” / “Selected”. Active: `product-dash__card--active`. Click: `GET` org reports, set `activeOrgId`.

**Row 2 — after an org is selected** (not stacked forms):

| Card | Icon | Desc | Opens |
|------|------|------|-------|
| Edit org | `edit` | Rename this organization | panel `edit` |
| Reports | `description` | `{n} report(s)` | panel `reports` |
| Invite | `mail` | Magic link to the org list | panel `invite` |

Panel header: org name `--font-base` / 650. **Back to org cards** `.btn` returns to the three cards.

**Panel edit**

| Control | Action |
|---------|--------|
| Org name input | local rename |
| Save org name `btn--primary` | `PUT` orgs; disabled if empty / busy |

**Panel reports**

| Control | Action |
|---------|--------|
| Report name input | tema for create |
| New report `btn--primary` | create in `activeOrgId` → workspace |
| Import .ereport `btn` | same import as 4.3 |
| List row: tema link | `href=/ereport/workspace?user=&org=&report=` |
| Invite `.btn` | `prompt` email → 1h report magic link → `alert` the URL |
| Delete `btn--red` | `confirm('Delete report “{name}”? This cannot be undone.')` then `DELETE` |

**Panel invite (org-wide)**

| Control | Action |
|---------|--------|
| Email `type=email` required | — |
| Duration (hours) `min=1` default 24 | clamp ≥1; 072 max 30 days |
| Send magic link `btn--primary` | `POST` org invite; show link `<a>` |
| 072 | email OTP on `/ereport/invite/`; invitee gets **full tracker**, not JSON |

### 4.5 Recent

List rows: `{tema} · {orgName}` → same workspace href. Empty: “No recent org reports yet.”

### 4.6 Manage

| Control | Action |
|---------|--------|
| Rename org `<select>` + New name + Save name `btn--primary` | `PUT` name |
| Up / Down `.btn` | swap `order` with neighbor |
| Show / Hide `.btn` | toggle `hidden` |
| Delete `btn--red` | `confirm('Delete this org and its reports?')` then `DELETE` org |
| New org `btn--primary` | → `register` |

---

## 5. Workspace — HDS button by button

**Page:** `pageEditorBleed`. No product title. `EreportHeaderMenu` portals into `#header-dynamic-menu-host`. Iframe `src="/ereport-tracker.html?v=068"` (bump `?v=` when tracker HTML changes).

**Toolbar:** `role="toolbar"` `aria-label="eReport actions"`. Gap **0.45rem**. Column on desktop rail / phone drawer. Horizontal unused on phone bar (only tune).

Every button: §2.1 square. Icon-only. `title` + `aria-label` required.

| # | Visible icon | title | aria-label | Click | Active | Disabled |
|---|--------------|-------|------------|-------|--------|----------|
| H1 | Symbols `help` | Cómo usarla | Tutorial | `postMessage { type:"command", command:"tutorial" }` | — | — |
| H2 | `view_sidebar` | Mostrar/ocultar sidebar | Sidebar | command `toggle-sidebar`; host flips `sidebarCollapsed` | `aria-pressed` + accent when collapsed | — |
| H3 | `text_increase` | Agrandar fuente | Agrandar fuente | host `bumpUiScale(+1)` then `{ type:"text-scale", scale }` — **do not** send `font-up` | — | — |
| H4 | `text_decrease` | Reducir fuente | Reducir fuente | scale −1 | — | — |
| H5 | `upload_file` | Cargar .ereport | Cargar reporte | command `upload` → iframe `#ereport-file.click()` | — | — |
| H6 | `delete_sweep` | Limpiar todo | Limpiar todo | command `clear-all` → iframe `confirm` then empty skeleton | — | — |
| H7 | `checklist` | Progreso / qué falta | Progreso | command `progress` → info modal | — | — |
| H8 | `download` | Descargar (.ereport + HTML + PDF) | Descargar reporte | command `save-export` → save modal | — | **not green** |
| H9 | SVG hub tiles | Hub | Abrir hub | toggle host modal `hub` | accent while open | — |
| H10 | SVG pencil | Editar tema | Editar tema | toggle modal `tema` | accent while open | — |
| H11 | SVG cloud | Guardar en nube | Guardar en nube | toggle modal `save` | green `#2e7d32`; darker when open | `saving` |
| H12 | SVG share nodes | Compartir | Compartir con usuarios | toggle modal `share` | accent | **omit node** if not owner (today also omit if `orgId`) |
| H13 | SVG history clock | Historial | Historial de versiones API | toggle `historial` + fetch | accent | same gate as H12 |

**There is no HDS add-section.** Adding an issue is tracker C4.

### 5.1 Host modals (one at a time)

Clicking the same HDS icon again closes. Backdrop click closes. **Wire Escape.**

**M1 Hub**

- Title: Hub eReport
- Lead: unsaved cloud changes are lost
- Seguir editando `.btn` → close
- Ir al hub `a.btn.btn--primary` → `/ereport/{ownerSafe}`

**M2 Tema**

- Title: Tema del reporte
- Field “Tema” input `#ereport-modal-tema` maxLength 200 autofocus
- Cerrar `.btn` (no save)
- Guardar tema `btn--primary` → PUT tema; close on success; stay + error on fail
- Label while busy: “Guardando…”

**M3 Guardar**

- Title: Guardar en nube
- Lead: rewrite S3 copy to filesystem when 072 ships
- Cerrar `.btn`
- Guardar ahora `btn--primary` → `{ type:"collect" }` → wait `state` → PUT payload+tema → close
- Auto-save (500ms iframe + 100ms host) **must not** open this modal

**M4 Compartir** (owner)

- Title: Compartir
- Email + Añadir `.btn`
- Chips: email + Quitar (text, not icon)
- Listo `btn--primary` closes
- 072: replace chips with invite create (email + duration); OTP; no registered-user requirement

**M5 Historial** (owner)

- Title: Historial API
- Loading / empty / list of `{tema} · {source} · {createdAt}` + Restaurar `.btn`
- Restaurar → `confirm` → snapshot current → load payload into iframe
- Actualizar `.btn` + Cerrar `btn--primary`

---

## 6. Tracker canvas — button by button

**Iframe document is a different app.** Font Segoe/Candara/Calibri. Icons = `<span class="material-icons">name</span>` (not Symbols). Radius **3px**. Colors §073 1.2.

Layout: `grid-template-columns: minmax(0,1fr) 24.5rem`. Main pad `1.25rem`. Phone `<68rem`: sidebar `position:fixed; right:0; width:min(28rem,80vw)`; collapsed `translateX(105%)`.

### 6.1 Meta (always visible, not HDS)

| Field | Control | Notes |
|-------|---------|-------|
| Organization | `#org-name` text | writes `state.orgName`; host also PUTs org name on cloud save |
| Report name | `#report-name` text | writes `reportName` / tema |
| Report Date | `#report-date` date | |
| Report Code | `#report-number` **readonly** | auto |
| Validation criteria | chips + add | |

Criteria chip: pad `0.2rem 0.4rem 0.2rem 0.55rem`, surface fill, line border. Remove: Icons `close`, 1.25rem, hover `--danger`. Add row: input + `add` button 2×2rem.

Inputs: `font-size: 1rem`, pad `0.5rem 0.65rem`, border `--line`, bg `--card`, radius 3px.

### 6.2 Section head (sticky, `--section-head-bg`, 2px ink border, pad `0.85rem 1rem`)

| # | Icon | title | Box | Action |
|---|------|-------|-----|--------|
| C1 | `expand_more` / `chevron_right` | Colapsar/expandir sección | 1.5×1.5, transparent, line 40% | toggle body |
| C2 | `delete` | Vaciar sección | 2×2 `.danger` (card fill, danger ink) | clear items in section |

### 6.3 Group head (sticky under section, `--surface`, 2px ink, pad `0.7rem 0.85rem`)

| # | Icon | title | Box | Action |
|---|------|-------|-----|--------|
| C3 | same chevron | Colapsar/expandir subartículo | 1.5×1.5 | toggle group |
| C4 | `add` | Agregar fila | 1.9×1.9 `.ghost` | **add issue** |
| C5 | `delete` | Vaciar grupo | 1.9×1.9 `.danger` | clear group |

Group title is an inplace `<input>` styled as heading (click/focus, Enter/blur commit).

### 6.4 Issue card

Card pad `0.65rem`, `--surface`. Tone rail 0.25rem inset: green / red / yellow (`is-none`) / gray+grayscale (`no_aplica`).

| # | Icon | title | Box | Action |
|---|------|-------|-----|--------|
| C6 | chevron | Colapsar/expandir incidencia | 1.5×1.5 | toggle body |
| C7 | `delete` | Eliminar incidencia | 1.25×1.25 `.danger` | remove issue |
| C8 | `check` | Aprobado | 2.1×2.1 (crit 1.55) | set status; active fill `--success` / `#fff` |
| C9 | `close` | Reprobado | 2.1 | `--danger` when active |
| C10 | `remove` | No aplica / fuera de entrega | 2.1 | `#757575` when active |
| C11 | — | Momento de la incidencia / solución | datetime-local `.moment-input` 0.72rem | |
| C12 | — | Imágenes incidencia / solución | `input[type=file][multiple] accept=image/*` | 072: upload as files, not new base64 |
| C13 | `close` | Eliminar imagen | 1.15 `.thumb-del` danger fill + white X | delete thumb |
| — | — | click thumb | — | open Evidencia modal |

Default (inactive) status: `--card` + `--line`. Criteria rows repeat C8–C10 at 1.55rem.

### 6.5 Sidebar

No header title (topbar removed). Dots 1.071rem, radius **2px**.

| Status | Fill | Border |
|--------|------|--------|
| unset | `--warning-bg` | `--warning` |
| aprobado | `--success-bg` | `--success` |
| reprobado | `--danger-bg` | `--danger` |
| no_aplica | `#3a3a3a` | `#6b6b6b` opacity 0.75 |

Active: scale 1.175 + `--warning` ring. Hover: scale 1.06. Tooltip `.nav-tip`: `--warning` left bar, 1.3125rem type.

Footer buttons:

| # | Icon | title | Box |
|---|------|-------|-----|
| S2 | `keyboard_arrow_up` | Ir arriba | 2.2×2.2 transparent, ink 55% 2px border |
| S3 | `keyboard_arrow_down` | Ir abajo | same |

### 6.6 Tracker modals

Overlay `rgba(0,0,0,.72)`. Cards `--card`, radius 3px. Close: `.icon-btn` 2.1×2.1, Icons `close`. Backdrop click closes. **Add Escape.**

| Modal | Title | Actions |
|-------|-------|---------|
| howto | Qué es y cómo usarla | close only |
| progress info | Progreso del reporte | close |
| progress save | Guardar reporte | Cancelar `.secondary` + `warn-hot` Icons `save` + “Aceptar y guardar” (`#f9a825` / `#000`) → `saveAll()` downloads 3 files + emit `cloud-save` |
| img | Evidencia | `chevron_left` / `chevron_right` `.secondary` |

Toast: inverse fill, `--warning` left 0.25rem (success/danger variants).

---

## 7. Host ↔ iframe contract (do not change names)

Parent → iframe (`target: "ereport-tracker"`, `origin` = site):

| `type` | Payload | Iframe does |
|--------|---------|-------------|
| `load` | `{ payload }` | normalize, render, `autoSaveEnabled=true`, emit `loaded` |
| `collect` | — | emit `state` with clone |
| `theme` | `{ dark: boolean }` | `setTheme` |
| `text-scale` | `{ scale: number }` | `--site-text-scale` on iframe `html` |
| `command` | `{ command }` | `tutorial` `toggle-sidebar` `upload` `clear-all` `progress` `save-export` |

Iframe → parent (`source: "ereport-tracker"`):

| `type` | When |
|--------|------|
| `booted` | script end — parent then `load` + `theme` + `text-scale` |
| `loaded` | after `load` or file pick — parent **only** re-pushes theme/scale, **never** re-`load` (would wipe file) |
| `cloud-save` | 500ms after edits, or after `saveAll` | parent PUT (debounce 100ms) |
| `state` | answer to `collect` |
| `error` | string `message` |

Font± from HDS is **host-owned**. Do not also run iframe `fontUp()` / `fontDown()`.

---

## 8. Permissions (implement against this)

| Action | Owner | Invitee (OTP) | Guest | Admin (other user) |
|--------|-------|---------------|-------|--------------------|
| Hub list / open / edit / save | yes (lapsed OK) | no hub | no | no |
| Create org / report / import | entitlement or admin **self** | no | no | no |
| Full tracker | yes | **yes** (072) | no | no |
| H1–H11 | yes | yes (no hub navigate to owner? H9 goes to owner hub — hide H9 for invitee) | — | — |
| H12 invite / H13 history | yes | **no** | no | no |
| Delete org/report | yes | no | no | no |
| Theme / A± | yes | yes | tray if they can see Header | — |

---

## 9. Implementation order (atomic; stop if you drift)

Do **not** start at tracker colors.

1. Confirm `--bg/#f2f3f6`, `--fg/#141820`, `--br/3.44px`, Kumbh, HDS 48/36 in `theme.css` + `HeaderDynamicMenu.css`. No new tokens.
2. Hub: `.btn--danger` alias; every hub control matches §4. Build FE.
3. Workspace bleed: iframe fills under rail. Cache-bust tracker `?v=`.
4. HDS H1–H11 + green H11 only. Commands + font± as §7.
5. Host modals M1–M3 + Escape + backdrop.
6. Tracker: **leave populado CSS**. Only add Escape on modals; vendor html2canvas/jsPDF (072); new images as files.
7. 072 storage + authz + invite OTP + invitee `EreportEditor` (not JSON).
8. Owner H12/H13 for **org** reports (filesystem history, magic invite).
9. Hide H9/H12/H13 for invitee sessions.

After each step: `npm run build` in `frontend/` (reuse `node_modules`). Commit that step only.

---

## 10. Visual QA checklist (phone 48 + desktop 36)

- [ ] Rail: logo no plate, hamburger plate only desktop, avatar **circle**, no extra icons
- [ ] Phone eReport: tune opens a left drawer of HDS squares on `--bg`, not a second topbar
- [ ] HDS default = surface plate + 1px input border; hover = blue edge/icon; active = blue fill white icon
- [ ] H11 is the only green square
- [ ] H8 download is surface, not green
- [ ] Host modal overlay 55% ink; panel is `--bg` not surface; inputs are white / `#252a33`
- [ ] Iframe page is white or black, **not** `#f2f3f6` / `#0e1116`
- [ ] Unset issues are yellow; approved green; failed red
- [ ] Sidebar 24.5rem desktop; overlay on phone
- [ ] No text on any HDS button
- [ ] Theme toggle in **nav tray only**; iframe follows within one frame
