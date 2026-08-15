/** Chrome markup injected into the host mount node (Astro layout slot). */
export function renderShell(menuIconSrc: string): string {
    return `
<header id="file-toolbar">
  <button type="button" id="btn-menu" class="menu-toggle" aria-label="Menu" aria-expanded="false" aria-controls="app-sidebar">
    <img src="${menuIconSrc}" alt="" class="menu-toggle-icon" />
  </button>
</header>

<div id="sidebar-backdrop" class="sidebar-backdrop" hidden></div>
<aside id="app-sidebar" class="app-sidebar" aria-hidden="true">
  <nav class="app-sidebar-nav">
    <button type="button" id="btn-open">Open file</button>
    <button type="button" id="btn-create">New pamphlet</button>
    <button type="button" id="btn-save-cloud">Save to cloud</button>
    <button type="button" id="btn-print" disabled>Print</button>
    <button type="button" id="btn-view-desktop" class="is-active" aria-pressed="true">Desktop view</button>
    <button type="button" id="btn-view-mobile" aria-pressed="false">Mobile view</button>
  </nav>
</aside>

<dialog id="open-source-modal" class="create-modal">
  <div class="create-modal-form">
    <h2>Open pamphlet</h2>
    <p class="create-modal-hint">Choose where to load the .epam file from.</p>
    <div class="item-type-options">
      <button type="button" id="open-source-local">From this device</button>
      <button type="button" id="open-source-cloud">From the cloud</button>
    </div>
    <div class="create-modal-actions">
      <button type="button" id="open-source-cancel">Cancel</button>
    </div>
  </div>
</dialog>

<dialog id="open-cloud-modal" class="create-modal open-cloud-modal">
  <div class="create-modal-form">
    <h2>My pamphlets in the cloud</h2>
    <p class="create-modal-hint" id="open-cloud-hint">Select a .epam linked to your account.</p>
    <div id="open-cloud-list" class="open-cloud-list" role="list"></div>
    <div class="create-modal-actions">
      <button type="button" id="open-cloud-cancel">Cancel</button>
    </div>
  </div>
</dialog>

<dialog id="create-modal" class="create-modal">
  <form id="create-form" class="create-modal-form">
    <h2>New pamphlet</h2>
    <p class="create-modal-hint">Fill in the header, then choose where to save the .epam file.</p>
    <label>
      Title
      <input id="modal-title" name="title" type="text" required autocomplete="off" />
    </label>
    <label>
      Series name
      <input id="modal-series" name="series" type="text" required autocomplete="off" />
    </label>
    <label>
      Chapter
      <input id="modal-chapter" name="series_chapter" type="text" required autocomplete="off" />
    </label>
    <label>
      Author
      <input id="modal-author" name="author" type="text" required autocomplete="off" />
    </label>
    <div class="create-modal-actions">
      <button type="button" id="modal-cancel" value="cancel">Cancel</button>
      <button type="submit" id="modal-confirm">Create and save</button>
    </div>
  </form>
</dialog>

<dialog id="create-save-modal" class="create-modal">
  <div class="create-modal-form">
    <h2>Save pamphlet</h2>
    <p class="create-modal-hint">Choose where to save the new .epam file.</p>
    <div class="item-type-options">
      <button type="button" id="create-save-local">On this device</button>
      <button type="button" id="create-save-cloud">In the cloud</button>
    </div>
    <p class="create-modal-hint" id="create-save-cloud-hint" hidden>Sign in to save to the cloud.</p>
    <div class="create-modal-actions">
      <button type="button" id="create-save-cancel">Cancel</button>
    </div>
  </div>
</dialog>

<dialog id="item-type-modal" class="create-modal item-type-modal">
  <div class="create-modal-form">
    <h2>Element type</h2>
    <p class="create-modal-hint">Choose what you want to insert.</p>
    <div class="item-type-options">
      <button type="button" data-item-type="paragraph">Paragraph</button>
      <button type="button" data-item-type="heading_1">Heading</button>
      <button type="button" data-item-type="image">Image</button>
    </div>
    <div class="create-modal-actions">
      <button type="button" id="item-type-cancel">Cancel</button>
    </div>
  </div>
</dialog>

<main class="pamphlet-sheet"></main>
`.trim();
}
