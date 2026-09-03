# Feature 067 — Lateral header background removal & eReport hub sections

## Problem

1. On desktop (≥768px), the lateral header bar (`.site-header__bar`) has an opaque surface background (`color-mix(...)`) and box-shadow that creates an unnatural vertical strip instead of seamlessly blending into the page background.
2. In the eReport hub dashboard (`/ereport`), "Manage orgs" was placed under the "REPORTS" section.
3. There was no direct button on the dashboard to create a new report; users had to browse into an org first.

## Goals

1. **Remove lateral header bar background**:
   - In `frontend/src/components/Header/Header.css`, on `@media (min-width: 768px)`, set `.site-header__bar` to `background: transparent; box-shadow: none;`.
2. **New eReport Manage section**:
   - Add a third dashboard section titled "Manage" (`<DashboardSection title="Manage">`) containing the "Manage orgs" card (`icon: "folder_managed"`).
3. **`+` Buttons for New Org and New Report**:
   - In the "Orgs" section: Card 2 is `+ New org` (`id: "register"`, `icon: "domain_add"`), opening the org registration form.
   - In the "Reports" section: Card 2 is `+ New report` (`id: "new-report"`, `icon: "post_add"`).
   - Clicking `+ New report` opens a view (`view === "new-report"`) that presents a dropdown (`<select>`) of existing organizations to pick from, a report name input, and "Create report" + "Import .ereport" actions.
   - Submitting creates the report under the selected organization and redirects to `/ereport/workspace`.
   - If no orgs exist, show a clear prompt with a button to create an org first.
4. **HeaderDynamicMenu (`MENU`) sync**:
   - Include `new-report` with icon `post_add` in the HDS toolbar list so it can be navigated to directly.

## Non-goals

- Altering the mobile top bar background (keeps glassed background with blur).
- Modifying backend APIs or workspace tracker iframe behavior.

## Acceptance

- [x] Desktop lateral header bar (`.site-header__bar`) has transparent background and no shadow.
- [x] eReport hub dashboard displays three sections: "Orgs", "Reports", and "Manage".
- [x] "+ New org" card opens org registration.
- [x] "+ New report" card asks user to pick an existing org from a dropdown and provide a report name.
- [x] "Manage orgs" card sits under the "Manage" section.
- [x] Frontend builds cleanly; changes committed and pushed.

## Affected paths

- `specs/067-lateral-header-bg-ereport-hub-sections/spec.md`
- `frontend/src/components/Header/Header.css`
- `frontend/src/components/Ereport/EreportHub.tsx`
- `.memory/MILESTONE-067-lateral-header-bg-ereport-hub-sections-20260903.md`
