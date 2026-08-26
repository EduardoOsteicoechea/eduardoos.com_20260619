/**
 * Scrib dashboard — books as containers with sheet cards + new sheet.
 * Book and sheet names are inline-editable (blur / Enter persist).
 */

import { useCallback, useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import ServiceGate from "../ServiceGate/ServiceGate";
import {
  createScribBook,
  createScribSheet,
  deleteScribBook,
  deleteScribSheet,
  fetchScribLibrary,
  renameScribBook,
  renameScribSheet,
  scribSheetHref,
  type ScribBookCard,
} from "../../lib/scrib";
import "./Scrib.css";

export default function ScribDashboard() {
  const [userSafe, setUserSafe] = useState("");
  const [books, setBooks] = useState<ScribBookCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [bookName, setBookName] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    const res = await fetchScribLibrary();
    if (res.error) {
      setError(res.error);
      setBooks([]);
    } else {
      setUserSafe(res.userSafe);
      setBooks(res.books);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function onCreateBook(e: FormEvent) {
    e.preventDefault();
    const name = bookName.trim();
    if (!name || busy) return;
    setBusy(true);
    const res = await createScribBook(name);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setBookName("");
    await reload();
  }

  async function onNewSheet(bookId: string) {
    if (busy || !userSafe) return;
    setBusy(true);
    const res = await createScribSheet(bookId, "Hoja nueva");
    setBusy(false);
    if (res.error || !res.sheet) {
      setError(res.error ?? "Could not create sheet");
      return;
    }
    window.location.href = scribSheetHref(userSafe, bookId, res.sheet.id);
  }

  async function onDeleteBook(bookId: string) {
    if (busy || !window.confirm("¿Eliminar este libro y todas sus hojas?")) return;
    setBusy(true);
    const res = await deleteScribBook(bookId);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    await reload();
  }

  async function onDeleteSheet(bookId: string, sheetId: string) {
    if (busy || !window.confirm("¿Eliminar esta hoja?")) return;
    setBusy(true);
    const res = await deleteScribSheet(bookId, sheetId);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    await reload();
  }

  async function commitBookName(bookId: string, previous: string, nextRaw: string) {
    const next = nextRaw.trim();
    if (!next || next === previous || busy) {
      if (!next) await reload();
      return;
    }
    setBusy(true);
    setBooks((prev) =>
      prev.map((b) => (b.id === bookId ? { ...b, name: next } : b)),
    );
    const res = await renameScribBook(bookId, next);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      await reload();
      return;
    }
  }

  async function commitSheetName(
    bookId: string,
    sheetId: string,
    previous: string,
    nextRaw: string,
  ) {
    const next = nextRaw.trim();
    if (!next || next === previous || busy) {
      if (!next) await reload();
      return;
    }
    setBusy(true);
    setBooks((prev) =>
      prev.map((b) =>
        b.id !== bookId
          ? b
          : {
              ...b,
              sheets: b.sheets.map((s) =>
                s.id === sheetId ? { ...s, name: next } : s,
              ),
            },
      ),
    );
    const res = await renameScribSheet(bookId, sheetId, next);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      await reload();
      return;
    }
  }

  function onNameKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      (e.target as HTMLInputElement).blur();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      void reload();
      (e.target as HTMLInputElement).blur();
    }
  }

  return (
    <ServiceGate serviceId="scrib" serviceLabel="Scrib" requireSubscription>
      <article className="scrib-dashboard">
        <header className="scrib-dashboard__head">
          <p className="product-page__brand">Services</p>
          <h1 className="scrib-dashboard__title">Scrib</h1>
          <p className="scrib-dashboard__lead">
            Libros de hojas US Letter con capas de manuscrito. Todo se guarda
            bajo <code>scrib/</code> en la nube. Haz clic en el nombre de un
            libro o una hoja para editarlo.
          </p>
        </header>

        <form className="scrib-dashboard__new-book" onSubmit={onCreateBook}>
          <label className="scrib-dashboard__label" htmlFor="scrib-book-name">
            Nuevo libro
          </label>
          <div className="scrib-dashboard__row">
            <input
              id="scrib-book-name"
              className="scrib-dashboard__input"
              value={bookName}
              onChange={(e) => setBookName(e.target.value)}
              placeholder="Nombre del libro"
              maxLength={120}
              required
            />
            <button className="btn btn--primary" type="submit" disabled={busy}>
              Crear libro
            </button>
          </div>
        </form>

        {error ? <p className="scrib-dashboard__error">{error}</p> : null}
        {loading ? <p className="scrib-dashboard__empty">Cargando…</p> : null}

        {!loading && books.length === 0 ? (
          <p className="scrib-dashboard__empty">
            Aún no hay libros. Crea el primero arriba.
          </p>
        ) : null}

        <div className="scrib-books">
          {books.map((book) => (
            <section key={book.id} className="scrib-book" aria-label={book.name}>
              <div className="scrib-book__head">
                <input
                  className="scrib-book__title-input"
                  aria-label="Nombre del libro"
                  defaultValue={book.name}
                  key={`${book.id}:${book.name}`}
                  maxLength={120}
                  disabled={busy}
                  onBlur={(e) =>
                    void commitBookName(book.id, book.name, e.target.value)
                  }
                  onKeyDown={onNameKeyDown}
                />
                <button
                  type="button"
                  className="btn scrib-book__delete"
                  onClick={() => void onDeleteBook(book.id)}
                  disabled={busy}
                >
                  Eliminar
                </button>
              </div>
              <div className="scrib-sheets" role="list">
                {(book.sheets ?? []).map((sheet) => (
                  <div key={sheet.id} className="scrib-sheet-card" role="listitem">
                    <div className="scrib-sheet-card__body">
                      <input
                        className="scrib-sheet-card__name-input"
                        aria-label="Nombre de la hoja"
                        defaultValue={sheet.name}
                        key={`${sheet.id}:${sheet.name}`}
                        maxLength={120}
                        disabled={busy}
                        onBlur={(e) =>
                          void commitSheetName(
                            book.id,
                            sheet.id,
                            sheet.name,
                            e.target.value,
                          )
                        }
                        onKeyDown={onNameKeyDown}
                      />
                      <span className="scrib-sheet-card__meta">
                        {sheet.updatedAt
                          ? new Date(sheet.updatedAt).toLocaleString()
                          : ""}
                      </span>
                      {userSafe ? (
                        <a
                          className="scrib-sheet-card__open"
                          href={scribSheetHref(userSafe, book.id, sheet.id)}
                        >
                          Abrir
                        </a>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="scrib-sheet-card__remove"
                      aria-label={`Eliminar ${sheet.name}`}
                      onClick={() => void onDeleteSheet(book.id, sheet.id)}
                      disabled={busy}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="scrib-sheet-card scrib-sheet-card--new"
                  onClick={() => void onNewSheet(book.id)}
                  disabled={busy || !userSafe}
                >
                  + Nueva hoja
                </button>
              </div>
            </section>
          ))}
        </div>
      </article>
    </ServiceGate>
  );
}
