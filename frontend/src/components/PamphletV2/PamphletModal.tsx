/**
 * PamphletModal.tsx — Centered dialog with backdrop dismiss and top-right close control.
 */
import type { ReactNode } from "react";
import "./PamphletModal.css";

interface PamphletModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export default function PamphletModal({ open, title, onClose, children }: PamphletModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="pamphlet-modal pamphlet-no-print" role="presentation" onClick={onClose}>
      <div
        className="pamphlet-modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="pamphlet-modal__header">
          <h2 className="pamphlet-modal__title">{title}</h2>
          <button type="button" className="pamphlet-modal__close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="pamphlet-modal__body">{children}</div>
      </div>
    </div>
  );
}
