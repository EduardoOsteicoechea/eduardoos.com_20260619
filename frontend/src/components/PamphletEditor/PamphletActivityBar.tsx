/**
 * PamphletActivityBar.tsx — Bottom activity bar with tooltip panels for the pamphlet editor.
 */
import type { CapacityTelemetry, LayoutFields } from "../../lib/pamphlets";
import "./PamphletActivityBar.css";

export type ActivityPanel = "layout" | "capacity" | "documents" | "pages" | null;

export interface PamphletListItem {
  pamphletId: string;
  title: string;
  updatedAt?: string;
}

interface LayoutFieldDef {
  key: keyof LayoutFields;
  label: string;
  step?: number;
}

interface PamphletActivityBarProps {
  activePanel: ActivityPanel;
  onPanelToggle: (panel: ActivityPanel) => void;
  layout: LayoutFields;
  layoutFields: LayoutFieldDef[];
  onLayoutChange: (key: keyof LayoutFields, raw: string) => void;
  capacity: CapacityTelemetry | null;
  pamphlets: PamphletListItem[];
  sortBy: "alpha" | "date";
  onSortChange: (sort: "alpha" | "date") => void;
  onSelectPamphlet: (id: string) => void;
  onSaveLayout: () => void;
  pageCount: number;
  onJumpToPage: (index: number) => void;
  userZoom: number;
  onZoomChange: (next: number) => void;
  onReset: () => void;
  onPrint: () => void;
  refreshing: boolean;
  status: string;
  error: string;
}

export default function PamphletActivityBar({
  activePanel,
  onPanelToggle,
  layout,
  layoutFields,
  onLayoutChange,
  capacity,
  pamphlets,
  sortBy,
  onSortChange,
  onSelectPamphlet,
  onSaveLayout,
  pageCount,
  onJumpToPage,
  userZoom,
  onZoomChange,
  onReset,
  onPrint,
  refreshing,
  status,
  error,
}: PamphletActivityBarProps) {
  return (
    <footer className="pamphlet-activity" aria-label="Pamphlet tools">
      {activePanel ? (
        <div className="pamphlet-activity__panel" role="region" aria-label={`${activePanel} panel`}>
          {activePanel === "layout" ? (
            <div className="pamphlet-activity__layout-grid">
              {layoutFields.map((field) => (
                <label key={field.key} className="pamphlet-activity__field">
                  <span>{field.label}</span>
                  <input
                    type="number"
                    value={layout[field.key]}
                    step={field.step ?? 1}
                    onChange={(e) => onLayoutChange(field.key, e.target.value)}
                  />
                </label>
              ))}
              <button type="button" className="pamphlet-activity__save" onClick={onSaveLayout}>
                Save layout settings
              </button>
            </div>
          ) : null}
          {activePanel === "capacity" && capacity ? (
            <div
              className="pamphlet-activity__capacity"
              dangerouslySetInnerHTML={{ __html: capacity.readout_html }}
            />
          ) : null}
          {activePanel === "documents" ? (
            <div className="pamphlet-activity__docs">
              <label>
                Sort
                <select
                  value={sortBy}
                  onChange={(e) => onSortChange(e.target.value as "alpha" | "date")}
                >
                  <option value="alpha">Alphabetic</option>
                  <option value="date">Date</option>
                </select>
              </label>
              <ul>
                {pamphlets.map((p) => (
                  <li key={p.pamphletId}>
                    <button type="button" onClick={() => onSelectPamphlet(p.pamphletId)}>
                      {p.title || p.pamphletId}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {activePanel === "pages" ? (
            <div className="pamphlet-activity__pages">
              {Array.from({ length: pageCount }, (_, i) => (
                <button key={i} type="button" onClick={() => onJumpToPage(i)}>
                  Page {i + 1}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="pamphlet-activity__bar" role="toolbar">
        <button type="button" title="Layout" onClick={() => onPanelToggle(activePanel === "layout" ? null : "layout")}>
          Layout
        </button>
        <button type="button" title="Capacity" onClick={() => onPanelToggle(activePanel === "capacity" ? null : "capacity")}>
          Stats
        </button>
        <button type="button" title="Pamphlets" onClick={() => onPanelToggle(activePanel === "documents" ? null : "documents")}>
          Docs
        </button>
        <button type="button" title="Pages" onClick={() => onPanelToggle(activePanel === "pages" ? null : "pages")}>
          Pages
        </button>
        <button type="button" title="Zoom out" onClick={() => onZoomChange(userZoom - 0.1)}>
          −
        </button>
        <span className="pamphlet-activity__zoom">{Math.round(userZoom * 100)}%</span>
        <button type="button" title="Zoom in" onClick={() => onZoomChange(userZoom + 0.1)}>
          +
        </button>
        <button type="button" title="Reset JSON" onClick={onReset} disabled={refreshing}>
          Reset
        </button>
        <button type="button" title="Print" onClick={onPrint}>
          Print
        </button>
      </div>
      <p className="pamphlet-activity__status" aria-live="polite">
        {refreshing ? "Refreshing…" : status}
        {error ? ` · ${error}` : ""}
      </p>
    </footer>
  );
}
