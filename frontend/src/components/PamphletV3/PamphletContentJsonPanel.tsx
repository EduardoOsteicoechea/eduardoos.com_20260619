/**
 * PamphletContentJsonPanel.tsx — Live JSON preview of distributed pamphlet content.
 */
import type { PamphletV3ContentJson } from "./pamphletV3Content";
import "./PamphletContentJsonPanel.css";

interface PamphletContentJsonPanelProps {
  contentJson: PamphletV3ContentJson;
}

export default function PamphletContentJsonPanel({ contentJson }: PamphletContentJsonPanelProps) {
  return (
    <aside className="pamphlet_content_json_panel pamphlet-no-print" aria-label="Pamphlet content JSON">
      <h2 className="pamphlet_content_json_panel__title">Content JSON</h2>
      <pre className="pamphlet_content_json_panel__pre">{JSON.stringify(contentJson, null, 2)}</pre>
    </aside>
  );
}
