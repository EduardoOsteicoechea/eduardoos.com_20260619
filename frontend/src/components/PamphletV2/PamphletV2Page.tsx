/**
 * PamphletV2Page.tsx — Activity bar margin controls + generator preview.
 */
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { ActivityBar } from "../ActivityBar/ActivityBar";
import {
  applyPamphletSetting,
  DEFAULT_PAMPHLET_LAYOUT_SETTINGS,
  PAMPHLET_LAYOUT_SETTING_DEFINITIONS,
  type PamphletLayoutSettings,
  type PamphletSettingKey,
} from "../../lib/pamphletLayout";
import {
  applyPreviewZoomIn,
  applyPreviewZoomOut,
  type PreviewInteractionMode,
} from "../../lib/pamphletPreviewInteraction";
import { marginSettingIcon } from "./PamphletMarginIcons";
import PamphletSettingPanel from "./PamphletSettingPanel";
import PamphletV2 from "./PamphletV2";
import { IconDragMove, IconZoomIn, IconZoomOut } from "./PamphletViewIcons";
import "./PamphletV2Page.css";

const PREVIEW_MODE_BUTTONS: Array<{
  id: PreviewInteractionMode;
  label: string;
  title: string;
  icon: ReactNode;
}> = [
  { id: "zoom-in", label: "Zoom in", title: "Click the preview to zoom in", icon: <IconZoomIn /> },
  { id: "zoom-out", label: "Zoom out", title: "Click the preview to zoom out", icon: <IconZoomOut /> },
  { id: "drag", label: "Drag move", title: "Drag the preview to pan", icon: <IconDragMove /> },
];

export default function PamphletV2Page() {
  const [settings, setSettings] = useState<PamphletLayoutSettings>(DEFAULT_PAMPHLET_LAYOUT_SETTINGS);
  const [openSetting, setOpenSetting] = useState<PamphletSettingKey | null>(null);
  const [previewMode, setPreviewMode] = useState<PreviewInteractionMode | null>(null);
  const [zoomScale, setZoomScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const activeDefinition = PAMPHLET_LAYOUT_SETTING_DEFINITIONS.find((item) => item.key === openSetting);

  const activatePreviewMode = useCallback((mode: PreviewInteractionMode) => {
    setOpenSetting(null);
    setPreviewMode(mode);
  }, []);

  const exitPreviewMode = useCallback(() => {
    setPreviewMode(null);
  }, []);

  const activityButtons = useMemo(
    () => [
      ...PAMPHLET_LAYOUT_SETTING_DEFINITIONS.map((def) => ({
        id: def.key,
        label: def.label,
        title: def.tooltip,
        icon: marginSettingIcon(def.key),
        active: openSetting === def.key,
        onClick: () => {
          setPreviewMode(null);
          setOpenSetting(def.key);
        },
      })),
      ...PREVIEW_MODE_BUTTONS.map((button) => ({
        id: button.id,
        label: button.label,
        title: button.title,
        icon: button.icon,
        active: previewMode === button.id,
        onClick: () => activatePreviewMode(button.id),
      })),
    ],
    [activatePreviewMode, openSetting, previewMode],
  );

  function handleSave(valueMm: number) {
    if (!openSetting) {
      return;
    }
    setSettings((current) => applyPamphletSetting(current, openSetting, valueMm));
  }

  return (
    <div className="pamphlet-v2-page">
      <div className="pamphlet-no-print">
        <ActivityBar buttons={activityButtons} ariaLabel="Pamphlet actions" />
        {activeDefinition ? (
          <PamphletSettingPanel
            open
            label={activeDefinition.label}
            valueMm={settings[activeDefinition.key]}
            onSave={handleSave}
            onClose={() => setOpenSetting(null)}
          />
        ) : null}
      </div>
      <PamphletV2
        settings={settings}
        previewMode={previewMode}
        zoomScale={zoomScale}
        pan={pan}
        onZoomIn={() => setZoomScale((current) => applyPreviewZoomIn(current))}
        onZoomOut={() => setZoomScale((current) => applyPreviewZoomOut(current))}
        onPanChange={(x, y) => setPan({ x, y })}
        onExitPreviewMode={exitPreviewMode}
      />
    </div>
  );
}
