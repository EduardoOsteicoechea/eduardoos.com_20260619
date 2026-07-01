/**
 * PamphletV2Page.tsx — Pamphlet route shell: global activity bar + generator workspace.
 */
import { ActivityBar } from "../ActivityBar/ActivityBar";
import PamphletV2 from "./PamphletV2";
import "./PamphletV2Page.css";

export default function PamphletV2Page() {
  return (
    <div className="pamphlet-v2-page">
      <div className="pamphlet-no-print">
        <ActivityBar buttons={[]} ariaLabel="Pamphlet actions" />
      </div>
      <PamphletV2 />
    </div>
  );
}
