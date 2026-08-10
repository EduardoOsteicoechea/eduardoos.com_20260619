/** Chrome markup injected into the host mount node (Astro layout slot). */
export function renderShell(menuIconSrc: string): string {
    return `
<header id="file-toolbar">
  <button type="button" id="btn-menu" class="menu-toggle" aria-label="Menú" aria-expanded="false" aria-controls="app-sidebar">
    <img src="${menuIconSrc}" alt="" class="menu-toggle-icon" />
  </button>
</header>

<div id="sidebar-backdrop" class="sidebar-backdrop" hidden></div>
<aside id="app-sidebar" class="app-sidebar" aria-hidden="true">
  <nav class="app-sidebar-nav">
    <button type="button" id="btn-open">Abrir archivo</button>
    <button type="button" id="btn-create">Nuevo panfleto</button>
    <button type="button" id="btn-save-cloud">Guardar en la nube</button>
    <button type="button" id="btn-print" disabled>Imprimir</button>
    <button type="button" id="btn-view-desktop" class="is-active" aria-pressed="true">Vista escritorio</button>
    <button type="button" id="btn-view-mobile" aria-pressed="false">Vista móvil</button>
  </nav>
</aside>

<dialog id="open-source-modal" class="create-modal">
  <div class="create-modal-form">
    <h2>Abrir panfleto</h2>
    <p class="create-modal-hint">Elige de dónde cargar el archivo .epam.</p>
    <div class="item-type-options">
      <button type="button" id="open-source-local">Desde este dispositivo</button>
      <button type="button" id="open-source-cloud">Desde la nube</button>
    </div>
    <div class="create-modal-actions">
      <button type="button" id="open-source-cancel">Cancelar</button>
    </div>
  </div>
</dialog>

<dialog id="open-cloud-modal" class="create-modal open-cloud-modal">
  <div class="create-modal-form">
    <h2>Mis panfletos en la nube</h2>
    <p class="create-modal-hint" id="open-cloud-hint">Selecciona un .epam asociado a tu cuenta.</p>
    <div id="open-cloud-list" class="open-cloud-list" role="list"></div>
    <div class="create-modal-actions">
      <button type="button" id="open-cloud-cancel">Cancelar</button>
    </div>
  </div>
</dialog>

<dialog id="create-modal" class="create-modal">
  <form id="create-form" class="create-modal-form">
    <h2>Nuevo panfleto</h2>
    <p class="create-modal-hint">Completa los datos del header. Luego elige dónde guardar el archivo .epam.</p>
    <label>
      Título
      <input id="modal-title" name="title" type="text" required autocomplete="off" />
    </label>
    <label>
      Nombre de serie
      <input id="modal-series" name="series" type="text" required autocomplete="off" />
    </label>
    <label>
      Capítulo
      <input id="modal-chapter" name="series_chapter" type="text" required autocomplete="off" />
    </label>
    <label>
      Autor
      <input id="modal-author" name="author" type="text" required autocomplete="off" />
    </label>
    <div class="create-modal-actions">
      <button type="button" id="modal-cancel" value="cancel">Cancelar</button>
      <button type="submit" id="modal-confirm">Crear y guardar</button>
    </div>
  </form>
</dialog>

<dialog id="create-save-modal" class="create-modal">
  <div class="create-modal-form">
    <h2>Guardar panfleto</h2>
    <p class="create-modal-hint">Elige dónde guardar el nuevo archivo .epam.</p>
    <div class="item-type-options">
      <button type="button" id="create-save-local">En este dispositivo</button>
      <button type="button" id="create-save-cloud">En la nube</button>
    </div>
    <p class="create-modal-hint" id="create-save-cloud-hint" hidden>Inicia sesión para guardar en la nube.</p>
    <div class="create-modal-actions">
      <button type="button" id="create-save-cancel">Cancelar</button>
    </div>
  </div>
</dialog>

<dialog id="item-type-modal" class="create-modal item-type-modal">
  <div class="create-modal-form">
    <h2>Tipo de elemento</h2>
    <p class="create-modal-hint">Elige qué quieres insertar.</p>
    <div class="item-type-options">
      <button type="button" data-item-type="paragraph">Párrafo</button>
      <button type="button" data-item-type="heading_1">Heading</button>
      <button type="button" data-item-type="image">Imagen</button>
    </div>
    <div class="create-modal-actions">
      <button type="button" id="item-type-cancel">Cancelar</button>
    </div>
  </div>
</dialog>

<main class="pamphlet-sheet"></main>
`.trim();
}
