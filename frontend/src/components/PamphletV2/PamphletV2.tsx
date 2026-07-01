/**
 * PamphletV2.tsx — Pamphlet generator workspace (sheet DOM + mm layout).
 */
import "./PamphletV2.css";
import "./pamphlet-print.css";

function PamphletSheetPage1() {
  return (
    <article className="pamphlet-sheet" id="sheet1" data-sheet-index="1">
      <div className="pamphlet-sheet__inner">
        <header className="pamphlet-sheet__header" id="zone-header">
          <div className="pamphlet-sheet__title">Pamphlet title</div>
          <div className="pamphlet-sheet__subheading">Subtitle</div>
          <div className="pamphlet-sheet__meta">Author · Date</div>
        </header>

        <div className="pamphlet-sheet__hf-gap" aria-hidden="true" />

        <div className="pamphlet-sheet__halves">
          <div className="pamphlet-sheet__half pamphlet-sheet__half--back">
            <div className="pamphlet-sheet__body" id="s1-left-body">
              <div className="pamphlet-sheet__column" id="s1l-col0" />
              <div className="pamphlet-sheet__column" id="s1l-col1" />
            </div>
            <div className="pamphlet-sheet__hf-gap" aria-hidden="true" />
            <footer className="pamphlet-sheet__footer" id="zone-footer">
              <div className="pamphlet-sheet__title">Contact</div>
            </footer>
          </div>

          <div className="pamphlet-sheet__gutter" id="mid-gutter" aria-hidden="true" />

          <div className="pamphlet-sheet__half pamphlet-sheet__half--front">
            <div className="pamphlet-sheet__body" id="s1-right-body">
              <div className="pamphlet-sheet__column" id="s1r-col0" />
              <div className="pamphlet-sheet__column" id="s1r-col1" />
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

export default function PamphletV2() {
  return (
    <div className="pamphlet-v2" aria-label="Pamphlet generator">
      <div className="pamphlet-v2__canvas">
        <PamphletSheetPage1 />
      </div>
    </div>
  );
}
