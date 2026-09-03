/**
 * Music header tools — portal into #header-dynamic-menu-host (spec 043).
 * Admin-only: button opens a modal to upload an audio file with a display name.
 */

import { useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  uploadWorshipRecording,
  type AudioLibraryItem,
} from "../../lib/mediaLibrary";
import { useHeaderDynamicHost } from "../HeaderDynamicMenu/HeaderDynamicMenu";
import { openApiErrorModal } from "../ServerErrorModal/ServerErrorModal";
import "../HeaderDynamicMenu/HeaderDynamicMenu.css";
import "./MusicHeaderMenu.css";

export type MusicHeaderMenuProps = {
  isAdmin: boolean;
  onUploaded: (track: AudioLibraryItem) => void | Promise<void>;
};

function IconUpload() {
  return (
    <svg
      className="header-dynamic-menu__icon header-dynamic-menu__icon--svg"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z"
      />
    </svg>
  );
}

const AUDIO_ACCEPT = "audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,audio/aac,audio/ogg,audio/webm,.mp3,.wav,.m4a,.aac,.ogg,.webm";

export default function MusicHeaderMenu({ isAdmin, onUploaded }: MusicHeaderMenuProps) {
  const host = useHeaderDynamicHost("music-header-menu");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [open]);

  if (!isAdmin || !host) {
    return null;
  }

  function closeModal(force = false) {
    if (busy && !force) return;
    setOpen(false);
    setBusy(false);
    setHint("");
    setName("");
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const title = name.trim();
    if (!title) {
      setHint("Escribe el nombre de la canción.");
      return;
    }
    if (!file) {
      setHint("Selecciona un archivo de audio.");
      return;
    }
    setBusy(true);
    setHint("");
    try {
      const track = await uploadWorshipRecording(file, {
        title,
        filename: file.name,
      });
      await onUploaded(track);
      closeModal(true);
    } catch (err) {
      setBusy(false);
      const message = err instanceof Error ? err.message : String(err);
      setHint(message);
      openApiErrorModal(message, {
        title: "Music upload failed",
        summary: "POST /api/media/audio/upload rechazó el archivo (admin + S3).",
      });
    }
  }

  const menu: ReactNode = (
    <section
      id="music-header-menu"
      className="header-dynamic-menu"
      aria-label="Music tools"
      ref={(node) => {
        if (node) window.__eduardoosHeaderDynamicMenu = node;
      }}
    >
      <div className="header-dynamic-menu__inner">
        <div className="header-dynamic-menu__actions" role="toolbar" aria-label="Music actions">
          <button
            type="button"
            className={`header-dynamic-menu__btn${open ? " header-dynamic-menu__btn--active is-active" : ""}`}
            title="Subir canción"
            aria-label="Subir canción"
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            <IconUpload />
          </button>
        </div>
      </div>
    </section>
  );

  const modal = (
    <dialog
      ref={dialogRef}
      className="music-upload-modal"
      aria-labelledby="music-upload-modal-title"
      onCancel={(e) => {
        if (busy) {
          e.preventDefault();
          return;
        }
        closeModal();
      }}
      onClose={() => {
        if (open) setOpen(false);
      }}
    >
      <form className="music-upload-modal__form" onSubmit={(e) => void handleSubmit(e)}>
        <h2 id="music-upload-modal-title" className="music-upload-modal__title">
          Subir canción
        </h2>
        <p className="music-upload-modal__hint">
          Elige un nombre y un archivo de audio. Se guarda en la biblioteca de worship.
        </p>
        <label className="music-upload-modal__field">
          <span className="music-upload-modal__label">Nombre</span>
          <input
            className="music-upload-modal__input"
            type="text"
            name="title"
            autoComplete="off"
            required
            disabled={busy}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej. Ayúdame"
          />
        </label>
        <label className="music-upload-modal__field">
          <span className="music-upload-modal__label">Archivo</span>
          <input
            ref={fileInputRef}
            className="music-upload-modal__input"
            type="file"
            name="file"
            accept={AUDIO_ACCEPT}
            required
            disabled={busy}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        {hint ? <p className="music-upload-modal__error">{hint}</p> : null}
        <div className="music-upload-modal__actions">
          <button type="button" className="music-upload-modal__btn" disabled={busy} onClick={closeModal}>
            Cancelar
          </button>
          <button type="submit" className="music-upload-modal__btn music-upload-modal__btn--primary" disabled={busy}>
            {busy ? "Subiendo…" : "Subir"}
          </button>
        </div>
      </form>
    </dialog>
  );

  return (
    <>
      {createPortal(menu, host)}
      {createPortal(modal, document.body)}
    </>
  );
}
