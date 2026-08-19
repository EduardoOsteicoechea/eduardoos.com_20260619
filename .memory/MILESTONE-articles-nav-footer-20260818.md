# Milestone: Nav hide + Articles crawl + footer editable labels — 2026-08-18

## Status: IN PROGRESS / shipping

## 1. Main menu
- OpenBIM (`/bim`) and APS (`/aps-admin`) removed from `PRIMARY_LINKS` in Header.
- Routes remain reachable by URL.

## 2. Articles (`/articulos`)
- Lists cloud pamphlets via public `GET /api/articles` (owner = Bearer user or `PUBLIC_ARTICLES_USER_ID`, default `eduardooost@gmail.com`).
- Detail: `GET /api/articles/{id}` (+ `/text`, `/html`), crawlable index at `/api/articles/index.html`.
- Frontend: `ArticlesList` / `ArticleView` (no auth gate); `llms.txt` + `robots.txt`.
- Semantic HTML includes JSON-LD `Article` + `plainText` in JSON for AI crawlers.

## 3. Pamphlet footer
- Schema: `action`, `message`, `label1`…`label4`, `value1`…`value4`.
- Labels default to WhatsApp / Teléfono / Dirección / Actividades but are editable inputs.
- Acción + Mensaje are always-visible input chrome (wireframe).
- PDF `normalizeFooter` / `drawFooter` migrate legacy whatsapp/phone/… and items[].
