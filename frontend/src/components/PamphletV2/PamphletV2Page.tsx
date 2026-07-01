/**
 * PamphletV2Page.tsx — Pamphlet route shell: global activity bar + generator workspace.
 */
import { ActivityBar } from "../ActivityBar/ActivityBar";
import PamphletV2 from "./PamphletV2";
import "./PamphletV2Page.css";

export default function PamphletV2Page() {
  return (
    <div className="pamphlet-v2-page">
      <ActivityBar buttons={[]} ariaLabel="Pamphlet actions" />
      <PamphletV2 />
    </div>
  );
}
