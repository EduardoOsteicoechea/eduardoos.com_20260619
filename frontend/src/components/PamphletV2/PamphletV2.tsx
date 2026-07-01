/**
 * PamphletV2.tsx — Initial pamphlet generator shell (v2).
 * Page chrome: header, main content area, fixed bottom activity bar.
 */
import "./PamphletV2.css";

export default function PamphletV2() {
  return (
    <div className="pamphlet-v2">
      <header className="pamphlet-v2__header">
        <h1 className="pamphlet-v2__title">Pamphlet</h1>
      </header>

      <main className="pamphlet-v2__main" aria-label="Pamphlet workspace" />

      <footer
        className="pamphlet-v2__activity"
        role="toolbar"
        aria-label="Pamphlet activity bar"
      />
    </div>
  );
}
