/**
 * Public reader for Calvin’s Institutes — sidebar index + section panel.
 * Content comes from S3 via /api/latin/calvins-institutes (OCR text as-is).
 */

import { useEffect, useState } from "react";
import {
  fetchInstitutesIndex,
  fetchInstitutesSection,
  type InstitutesIndexSection,
  type InstitutesSection,
} from "../../lib/calvinsInstitutes";
import "./CalvinsInstitutes.css";

export default function CalvinsInstitutesReader() {
  const [sections, setSections] = useState<InstitutesIndexSection[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [section, setSection] = useState<InstitutesSection | null>(null);
  const [error, setError] = useState("");
  const [loadingIndex, setLoadingIndex] = useState(true);
  const [loadingSection, setLoadingSection] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const idx = await fetchInstitutesIndex();
        if (cancelled) return;
        const list = idx.sections ?? [];
        setSections(list);
        if (list.length) setSelectedId(list[0].id);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load index");
        }
      } finally {
        if (!cancelled) setLoadingIndex(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setLoadingSection(true);
    setError("");
    void (async () => {
      try {
        const data = await fetchInstitutesSection(selectedId);
        if (!cancelled) setSection(data);
      } catch (err) {
        if (!cancelled) {
          setSection(null);
          setError(err instanceof Error ? err.message : "Could not load section");
        }
      } finally {
        if (!cancelled) setLoadingSection(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  return (
    <section className="calvins-institutes" aria-labelledby="calvins-title">
      <header className="calvins-institutes__head">
        <h1 id="calvins-title">Calvin’s Institutes</h1>
        <p className="calvins-institutes__lead">
          Allen English translation (from the Latin). Text is historical OCR — spacing artifacts
          are expected. Source objects live under S3 prefix <code>calvin-institutes/</code>.
        </p>
      </header>

      {loadingIndex ? <p className="calvins-institutes__status">Loading index…</p> : null}
      {error ? <p className="calvins-institutes__error">{error}</p> : null}

      <div className="calvins-institutes__layout">
        <nav className="calvins-institutes__nav" aria-label="Sections">
          <ol>
            {sections.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className={
                    s.id === selectedId
                      ? "calvins-institutes__nav-btn is-active"
                      : "calvins-institutes__nav-btn"
                  }
                  onClick={() => setSelectedId(s.id)}
                >
                  <span className="calvins-institutes__nav-order">{s.order}</span>
                  <span className="calvins-institutes__nav-heading">{s.heading}</span>
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <article className="calvins-institutes__panel">
          {loadingSection ? <p className="calvins-institutes__status">Loading section…</p> : null}
          {section && !loadingSection ? (
            <>
              <h2>{section.heading}</h2>
              <pre className="calvins-institutes__text">{section.text}</pre>
            </>
          ) : null}
        </article>
      </div>
    </section>
  );
}
