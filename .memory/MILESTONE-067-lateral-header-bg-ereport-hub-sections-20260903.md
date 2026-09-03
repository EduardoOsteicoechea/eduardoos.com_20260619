# Milestone 067 — Lateral Header Background Removal & eReport Hub Sections

**Date:** 2026-09-03  
**Spec:** `specs/067-lateral-header-bg-ereport-hub-sections/spec.md`  

## Changes

1. **Header lateral rail background removal (`Header.css`)**:
   - In `.site-header__bar` under `@media (min-width: 768px)`, removed the surface plate background and subtle border shadow:
     ```css
     background: transparent;
     backdrop-filter: none;
     box-shadow: none;
     ```
   - This removes the opaque rectangular column behind the desktop lateral header bar, letting the page background flow through cleanly.

2. **eReport Dashboard Sections Reorganization (`EreportHub.tsx`)**:
   - **ORGS**:
     - Card 1: `Orgs` (`corporate_fare`) - `${visibleOrgs.length} visible`
     - Card 2: `+ New org` (`domain_add`) - `Create a client organization`
   - **REPORTS**:
     - Card 1: `Recent reports` (`history`) - `${recent.length} recent`
     - Card 2: `+ New report` (`post_add`) - `Create report in an org`
   - **MANAGE**:
     - Card 1: `Manage orgs` (`folder_managed`) - `Order, hide, delete`
   - Moved "Manage orgs" out of REPORTS and into its own dedicated "MANAGE" section.

3. **`+` Button Flow for New Report**:
   - Added `view === "new-report"` with a form that asks the user to pick an organization from a dropdown `<select>` of existing organizations (`visibleOrgs`), enter a report name / tema, and click "Create report" or "Import .ereport".
   - Submitting creates the report in that selected organization and immediately redirects to the workspace editor.
   - If no organizations exist yet, prompts to create an organization first with a direct button to `view === "register"`.
   - Updated `MENU` toolbar to include `new-report` with the `post_add` icon.
