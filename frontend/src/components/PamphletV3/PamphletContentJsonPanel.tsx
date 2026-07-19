/**
 * PamphletContentJsonPanel.tsx — Live JSON preview of distributed pamphlet content.
 */
import type { PamphletV3ContentJson } from "./pamphletV3Content";
import "./PamphletContentJsonPanel.css";

interface PamphletContentJsonPanelProps {
  contentJson: PamphletV3ContentJson;
  saveStatus?: "idle" | "saving" | "saved" | "error";
}

const SAVE_STATUS_LABEL: Record<"idle" | "saving" | "saved" | "error", string> = {
  idle: "",
  saving: "Saving…",
  saved: "Saved",
  error: "Save failed",
};

export default function PamphletContentJsonPanel({
  contentJson,
  saveStatus = "idle",
}: PamphletContentJsonPanelProps) {
  const statusLabel = SAVE_STATUS_LABEL[saveStatus];
  return (
    <aside className="pamphlet_content_json_panel pamphlet-no-print" aria-label="Pamphlet content JSON">
      <h2 className="pamphlet_content_json_panel__title">
        Content JSON
        {statusLabel ? (
          <span className={`pamphlet_content_json_panel__save is-${saveStatus}`} aria-live="polite">
            {statusLabel}
          </span>
        ) : null}
      </h2>
      <pre className="pamphlet_content_json_panel__pre">{JSON.stringify(contentJson, null, 2)}</pre>
    </aside>
  );
}
