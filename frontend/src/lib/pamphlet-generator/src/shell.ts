/**
 * Pamphlet chrome markup: Header Dynamic Menu tools + dialogs.
 * Buttons keep stable ids so main.ts can wire them without a React mount.
 * Tools mount into #header-dynamic-menu-host inside Header (rail / mobile bar).
 */

function iconSvg(paths: string, viewBox = "0 0 24 24"): string {
  return `<svg class="header-dynamic-menu__icon header-dynamic-menu__icon--svg" viewBox="${viewBox}" aria-hidden="true" focusable="false">${paths}</svg>`;
}

const ICONS = {
  open: iconSvg(
    `<path d="M4 4h7l2 2h7v14H4V4zm2 4v10h12V8H6z" fill="currentColor"/>`,
  ),
  create: iconSvg(
    `<path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5z" fill="currentColor"/>`,
  ),
  save: iconSvg(
    `<path d="M17 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7l-4-4zm-5 16a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm3-10H5V5h10v4z" fill="currentColor"/>`,
  ),
  print: iconSvg(
    `<path d="M18 7V3H6v4H4v10h3v4h10v-4h3V7h-2zM8 5h8v2H8V5zm8 14H8v-4h8v4zm2-6h-2v-2H8v2H6V9h12v4z" fill="currentColor"/>`,
  ),
  desktop: iconSvg(
    `<path d="M21 3H3v13h7v2H8v2h8v-2h-2v-2h7V3zm-2 11H5V5h14v9z" fill="currentColor"/>`,
  ),
  mobile: iconSvg(
    `<path d="M15 1H7a2 2 0 0 0-2 2v18a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V3a2 2 0 0 0-2-2zm0 18H7V5h8v14z" fill="currentColor"/>`,
  ),
  series: iconSvg(
    `<path d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h10v2H4v-2z" fill="currentColor"/>`,
  ),
  template: iconSvg(
    `<path d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 3h7v4h-7v-4z" fill="currentColor"/>`,
  ),
  footer: iconSvg(
    `<path d="M4 4h16v2H4V4zm0 14h16v2H4v-2zm2-8h4v2H6v-2zm6 0h6v2h-6v-2zM6 14h12v2H6v-2z" fill="currentColor"/>`,
  ),
  copy: iconSvg(
    `<path d="M8 4h10v12h-2V6H8V4zm-4 4h10v12H4V8zm2 2v8h6v-8H6z" fill="currentColor"/>`,
  ),
  expand: iconSvg(
    `<path d="M7 10l5 5 5-5H7z" fill="currentColor"/>`,
  ),
  trash: iconSvg(
    `<path d="M6 7h12v2H6V7zm2 3h8l-1 9H9L8 10zm3-6h2l1 1h4v2H6V5h4l1-1z" fill="currentColor"/>`,
  ),
};

/** @param _menuIconSrc retained for call-site compatibility; unused (icons are inline). */
export function renderShell(_menuIconSrc?: string): string {
  return `
<section id="pamphlet-header-menu" class="header-dynamic-menu" aria-label="Pamphlet tools">
  <div class="header-dynamic-menu__inner">
    <div class="header-dynamic-menu__actions" role="toolbar" aria-label="Pamphlet actions">
      <button type="button" id="btn-open" class="header-dynamic-menu__btn" title="Open pamphlet" aria-label="Open pamphlet">
        ${ICONS.open}
      </button>
      <button type="button" id="btn-create" class="header-dynamic-menu__btn" title="New pamphlet" aria-label="New pamphlet">
        ${ICONS.create}
      </button>
      <button type="button" id="btn-copy" class="header-dynamic-menu__btn" title="Copy existing pamphlet" aria-label="Copy existing pamphlet">
        ${ICONS.copy}
      </button>
      <button type="button" id="btn-save-cloud" class="header-dynamic-menu__btn" title="Save to cloud" aria-label="Save to cloud">
        ${ICONS.save}
      </button>
      <button type="button" id="btn-print" class="header-dynamic-menu__btn" title="Print" aria-label="Print" disabled>
        ${ICONS.print}
      </button>
      <button type="button" id="btn-view-desktop" class="header-dynamic-menu__btn header-dynamic-menu__btn--active is-active" title="Desktop view" aria-label="Desktop view" aria-pressed="true">
        ${ICONS.desktop}
      </button>
      <button type="button" id="btn-view-mobile" class="header-dynamic-menu__btn" title="Mobile view" aria-label="Mobile view" aria-pressed="false">
        ${ICONS.mobile}
      </button>
      <button type="button" id="btn-series" class="header-dynamic-menu__btn" title="Series and chapters" aria-label="Series and chapters" hidden>
        ${ICONS.series}
      </button>
      <button type="button" id="btn-template" class="header-dynamic-menu__btn" title="Tipo de panfleto (simple / imágenes estructuradas)" aria-label="Tipo de panfleto" aria-pressed="false">
        ${ICONS.template}
      </button>
      <button type="button" id="btn-footer" class="header-dynamic-menu__btn" title="Pie de página estático" aria-label="Pie de página estático">
        ${ICONS.footer}
      </button>
      <button type="button" id="btn-activity-expand" class="header-dynamic-menu__btn header-dynamic-menu__tray-toggle" title="Show action labels" aria-label="Show action labels" aria-expanded="false" aria-controls="pamphlet-header-menu-tray">
        ${ICONS.expand}
      </button>
    </div>
    <div id="pamphlet-header-menu-tray" class="header-dynamic-menu__tray" role="region" aria-label="Action labels" hidden>
      <ul class="pamphlet-header-menu-tray__labels">
		<li>Open · New · Copy existing · Save · Print</li>
        <li>Print: blanco y negro or azul #00368c</li>
        <li>Desktop / Mobile view</li>
        <li>Template type (simple / structured images)</li>
        <li>Static footer profiles (copy or link)</li>
        <li>Series (when a pamphlet is open)</li>
      </ul>
    </div>
  </div>
</section>

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
    <div class="open-cloud-modal__head">
      <h2>My pamphlets in the cloud</h2>
      <button type="button" id="open-cloud-delete-toggle" class="open-cloud-delete-toggle" title="Borrar panfletos" aria-label="Borrar panfletos" aria-pressed="false">
        ${ICONS.trash}
      </button>
    </div>
    <p class="create-modal-hint" id="open-cloud-hint">Select a .epam linked to your account. Copy never deletes the original.</p>
    <div id="open-cloud-list" class="open-cloud-list" role="list"></div>
    <div class="create-modal-actions">
      <button type="button" id="open-cloud-cancel">Cancel</button>
      <button type="button" id="open-cloud-delete-confirm" hidden>Borrar seleccionados</button>
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

<dialog id="print-ink-modal" class="create-modal">
  <div class="create-modal-form">
    <h2>Imprimir panfleto</h2>
    <p class="create-modal-hint">Elige el color de tinta del PDF. La geometría es la misma en ambas opciones.</p>
    <div class="item-type-options">
      <button type="button" id="print-ink-black">Blanco y negro</button>
      <button type="button" id="print-ink-blue" title="#00368c">Azul #00368c</button>
    </div>
    <div class="create-modal-actions">
      <button type="button" id="print-ink-cancel">Cancel</button>
    </div>
  </div>
</dialog>

<dialog id="series-modal" class="create-modal series-modal">
  <form id="series-form" class="create-modal-form">
    <h2>Serie y capítulos</h2>
    <p class="create-modal-hint">Define the series this pamphlet belongs to, then browse the tree series → chapter → pamphlet.</p>
    <label>
      Series
      <input id="series-modal-series" name="series" type="text" required autocomplete="off" />
    </label>
    <label>
      Chapter
      <input id="series-modal-chapter" name="series_chapter" type="text" required autocomplete="off" />
    </label>
    <div id="series-tree" class="series-tree" role="tree" aria-label="Series tree"></div>
    <p class="create-modal-hint" id="series-tree-hint">Loading tree…</p>
    <div class="create-modal-actions">
      <button type="button" id="series-modal-cancel">Cancel</button>
      <button type="submit" id="series-modal-save">Save series</button>
    </div>
  </form>
</dialog>

<dialog id="footer-modal" class="create-modal footer-modal">
  <div class="create-modal-form">
    <h2>Pie de página estático</h2>
    <p class="create-modal-hint" id="footer-modal-hint">Crea pies reutilizables (la info). Con un panfleto abierto puedes copiarlos o vincularlos.</p>
    <div id="footer-profile-list" class="footer-profile-list" role="list"></div>
    <form id="footer-profile-form" class="footer-profile-form">
      <input type="hidden" id="footer-form-id" value="" />
      <label>
        Nombre
        <input id="footer-form-name" name="name" type="text" required autocomplete="off" />
      </label>
      <label>
        Acción
        <input id="footer-form-action" name="action" type="text" autocomplete="off" />
      </label>
      <label>
        Mensaje
        <input id="footer-form-message" name="message" type="text" autocomplete="off" />
      </label>
      <label>
        WhatsApp
        <input id="footer-form-value1" name="value1" type="text" autocomplete="off" />
      </label>
      <label>
        Teléfono
        <input id="footer-form-value2" name="value2" type="text" autocomplete="off" />
      </label>
      <label>
        Dirección
        <input id="footer-form-value3" name="value3" type="text" autocomplete="off" />
      </label>
      <label>
        Actividades
        <input id="footer-form-value4" name="value4" type="text" autocomplete="off" />
      </label>
      <div class="create-modal-actions">
        <button type="button" id="footer-form-reset">Nuevo</button>
        <button type="button" id="footer-form-from-sheet">Usar pie actual</button>
        <button type="submit" id="footer-form-save">Guardar pie</button>
      </div>
    </form>
    <div class="create-modal-actions">
      <button type="button" id="footer-modal-cancel">Cerrar</button>
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

<div id="pamphlet-chrome-status" class="pamphlet-chrome-status" hidden aria-live="polite"></div>
<main class="pamphlet-sheet"></main>
`.trim();
}
