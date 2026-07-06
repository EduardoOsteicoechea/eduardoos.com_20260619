/**
 * PamphletV2Page.tsx — Activity bar controls + content insertion preview.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ActivityBar } from "../ActivityBar/ActivityBar";
import {
  addContentItemAfter,
  addContentListItem,
  adjustImageHeight,
  buildFakePamphletContentDocument,
  findContentItemLocation,
  getStreamItems,
  moveContentItemDown,
  moveContentItemUp,
  recalculateContentHeights,
  recalculatePamphletDocument,
  removeContentItem,
  removeContentListItem,
  resolveActionBarPlacement,
  setContentItemType,
  setStreamItems,
  updateContentItemDescription,
  updateContentItemImageUrl,
  updateContentItemListHeader,
  updateContentItemReferences,
  updateContentItemText,
  updateContentListItemText,
  type PamphletContentDocument,
  type PamphletContentItemType,
} from "../../lib/pamphletContent";
import { getAuthEmailFromToken, isAuthenticated } from "../../lib/auth";
import {
  applyPamphletSetting,
  computeSheet1Layout,
  DEFAULT_PAMPHLET_LAYOUT_SETTINGS,
  layoutSettingsToApiLayout,
  PAMPHLET_LAYOUT_SETTING_DEFINITIONS,
  type PamphletLayoutSettings,
  type PamphletSettingKey,
} from "../../lib/pamphletLayout";
import { bootstrapPamphletFromCloud, loadPamphletBundle, persistActivePamphletId, savePamphletBundle } from "../../lib/pamphletPersistence";
import {
  applyPreviewZoomIn,
  applyPreviewZoomOut,
  type PreviewInteractionMode,
} from "../../lib/pamphletPreviewInteraction";
import {
  DEFAULT_PAMPHLET_FONT_SETTINGS,
  type PamphletFontSettings,
} from "../../lib/pamphletFontSettings";
import { marginSettingIcon } from "./PamphletMarginIcons";
import { IconFontSize } from "./PamphletContentIcons";
import type { PamphletContentZoneHandlers } from "./PamphletContentZone";
import PamphletFontSettingsPanel from "./PamphletFontSettingsPanel";
import PamphletOpenModal from "./PamphletOpenModal";
import PamphletSaveModal from "./PamphletSaveModal";
import PamphletSettingPanel from "./PamphletSettingPanel";
import PamphletV2, { type PamphletEditorViewMode } from "./PamphletV2";
import { PamphletImageProvider } from "./PamphletImageContext";
import { IconDragMove, IconImmersiveEdit, IconOpenFolder, IconPreviewLayout, IconSaveCloud, IconZoomIn, IconZoomOut } from "./PamphletViewIcons";
import { uploadPamphletImage } from "../../lib/pamphlets";
import "./PamphletV2Page.css";

const PAMPHLET_AUTH_REQUIRED_MESSAGE = "Sign in to open and save pamphlets from the cloud.";

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

function streamWidthForZone(
  settings: PamphletLayoutSettings,
  stream: "header" | "footer" | "body",
): number {
  const sheet = computeSheet1Layout(settings);
  if (stream === "header" || stream === "footer") {
    return sheet.contentWidthMm / 2 - settings.pageLateralInternalMarginMm;
  }
  return sheet.rightColumns.col1WidthMm;
}

export default function PamphletV2Page() {
  const [settings, setSettings] = useState<PamphletLayoutSettings>(DEFAULT_PAMPHLET_LAYOUT_SETTINGS);
  const [fontSettings, setFontSettings] = useState<PamphletFontSettings>(DEFAULT_PAMPHLET_FONT_SETTINGS);
  const [contentDocument, setContentDocument] = useState<PamphletContentDocument>(() =>
    buildFakePamphletContentDocument(DEFAULT_PAMPHLET_LAYOUT_SETTINGS, DEFAULT_PAMPHLET_FONT_SETTINGS),
  );
  const [openSetting, setOpenSetting] = useState<PamphletSettingKey | null>(null);
  const [fontPanelOpen, setFontPanelOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState<PreviewInteractionMode | null>(null);
  const [viewMode, setViewMode] = useState<PamphletEditorViewMode>("preview");
  const [zoomScale, setZoomScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [actionPlacement, setActionPlacement] = useState<"top" | "bottom">("top");
  const [openModalVisible, setOpenModalVisible] = useState(false);
  const [saveModalVisible, setSaveModalVisible] = useState(false);
  const [activePamphletId, setActivePamphletId] = useState<string | null>(null);
  const [activePamphletTitle, setActivePamphletTitle] = useState("Untitled pamphlet");
  const [cloudHydrated, setCloudHydrated] = useState(false);
  const [cloudStatus, setCloudStatus] = useState("");
  const [imageUploadingItemId, setImageUploadingItemId] = useState<string | null>(null);
  const [imageUploadError, setImageUploadError] = useState("");

  const activeDefinition = PAMPHLET_LAYOUT_SETTING_DEFINITIONS.find((item) => item.key === openSetting);

  useEffect(() => {
    let cancelled = false;
    void bootstrapPamphletFromCloud(DEFAULT_PAMPHLET_FONT_SETTINGS, DEFAULT_PAMPHLET_LAYOUT_SETTINGS)
      .then((boot) => {
        if (cancelled || !boot) {
          return;
        }
        setContentDocument(boot.contentDocument);
        setSettings(boot.settings);
        setActivePamphletId(boot.pamphletId);
        setActivePamphletTitle(boot.title);
        setCloudStatus(`Loaded ${boot.title}`);
      })
      .catch((err) => {
        if (cancelled) {
          return;
        }
        setCloudStatus(err instanceof Error ? err.message : "Could not load pamphlet from cloud");
      })
      .finally(() => {
        if (!cancelled) {
          setCloudHydrated(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const closePanels = useCallback(() => {
    setOpenSetting(null);
    setFontPanelOpen(false);
    setPreviewMode(null);
  }, []);

  const handleOpenPamphlet = useCallback(
    async (pamphletId: string, title: string) => {
      const bundle = await loadPamphletBundle(pamphletId, fontSettings, DEFAULT_PAMPHLET_LAYOUT_SETTINGS);
      setContentDocument(bundle.contentDocument);
      setSettings(bundle.settings);
      setActivePamphletId(pamphletId);
      setActivePamphletTitle(title);
      persistActivePamphletId(pamphletId);
      setCloudStatus(`Loaded ${title}`);
      setSelectedItemId(null);
      closePanels();
    },
    [closePanels, fontSettings],
  );

  const handleSavePamphlet = useCallback(
    async (options: { pamphletId: string; title: string; overwrite: boolean }) => {
      const response = await savePamphletBundle({
        pamphletId: options.pamphletId,
        title: options.title,
        contentDocument,
        layoutSettings: settings,
      });
      setActivePamphletId(options.pamphletId);
      setActivePamphletTitle(options.title);
      persistActivePamphletId(options.pamphletId);
      const logTail = response.logs?.length ? ` Logs: ${response.logs.join(" | ")}` : "";
      setCloudStatus(`Saved ${options.title}.${logTail}`);
    },
    [contentDocument, settings],
  );

  const activatePreviewMode = useCallback((mode: PreviewInteractionMode) => {
    setOpenSetting(null);
    setFontPanelOpen(false);
    setViewMode("preview");
    setPreviewMode(mode);
  }, []);

  const enterImmersiveView = useCallback(() => {
    setOpenSetting(null);
    setFontPanelOpen(false);
    setPreviewMode(null);
    setViewMode("immersive");
  }, []);

  const enterPreviewView = useCallback(() => {
    setViewMode("preview");
  }, []);

  const exitPreviewMode = useCallback(() => {
    setPreviewMode(null);
  }, []);

  const mutateStream = useCallback(
    (itemId: string, updater: (items: PamphletContentDocument["bodyItems"]) => PamphletContentDocument["bodyItems"]) => {
      const location = findContentItemLocation(contentDocument, itemId);
      if (!location) {
        return;
      }
      const streamItems = getStreamItems(contentDocument, location.stream);
      const width = streamWidthForZone(settings, location.stream);
      const nextItems = recalculateContentHeights(updater(streamItems), () => width, fontSettings);
      setContentDocument(setStreamItems(contentDocument, location.stream, nextItems));
    },
    [contentDocument, fontSettings, settings],
  );

  const contentHandlers = useMemo<PamphletContentZoneHandlers>(
    () => ({
      onSelectItem: (itemId, _zoneId, elementTopPx, elementBottomPx) => {
        if (previewMode && viewMode === "preview") {
          return;
        }
        setSelectedItemId(itemId);
        setActionPlacement(resolveActionBarPlacement(elementTopPx, elementBottomPx));
      },
      onSetType: (itemId, _zoneId, type: PamphletContentItemType) => {
        const location = findContentItemLocation(contentDocument, itemId);
        const width = streamWidthForZone(settings, location?.stream ?? "body");
        mutateStream(itemId, (items) => setContentItemType(items, itemId, type, width, fontSettings));
      },
      onAddBelow: (itemId) => {
        const location = findContentItemLocation(contentDocument, itemId);
        const width = streamWidthForZone(settings, location?.stream ?? "body");
        mutateStream(itemId, (items) => addContentItemAfter(items, itemId, width, fontSettings));
      },
      onMoveUp: (itemId) => {
        mutateStream(itemId, (items) => moveContentItemUp(items, itemId));
      },
      onMoveDown: (itemId) => {
        mutateStream(itemId, (items) => moveContentItemDown(items, itemId));
      },
      onRemove: (itemId) => {
        mutateStream(itemId, (items) => removeContentItem(items, itemId));
        setSelectedItemId((current) => (current === itemId ? null : current));
      },
      onBold: () => {},
      onIncreaseImageHeight: (itemId) => {
        const location = findContentItemLocation(contentDocument, itemId);
        const width = streamWidthForZone(settings, location?.stream ?? "body");
        mutateStream(itemId, (items) => adjustImageHeight(items, itemId, 2, width, fontSettings));
      },
      onDecreaseImageHeight: (itemId) => {
        const location = findContentItemLocation(contentDocument, itemId);
        const width = streamWidthForZone(settings, location?.stream ?? "body");
        mutateStream(itemId, (items) => adjustImageHeight(items, itemId, -2, width, fontSettings));
      },
      onTextChange: (itemId, _zoneId, text) => {
        setContentDocument((current) => updateContentItemText(current, itemId, text, settings, fontSettings));
      },
      onImageReferenceChange: (itemId, _zoneId, value) => {
        setContentDocument((current) =>
          updateContentItemDescription(current, itemId, value, settings, fontSettings),
        );
      },
      onQuoteReferenceChange: (itemId, _zoneId, value) => {
        setContentDocument((current) =>
          updateContentItemReferences(current, itemId, value.trim() ? [value] : [], settings, fontSettings),
        );
      },
      onListHeaderChange: (itemId, _zoneId, value) => {
        setContentDocument((current) =>
          updateContentItemListHeader(current, itemId, value, settings, fontSettings),
        );
      },
      onListItemChange: (itemId, _zoneId, index, value) => {
        setContentDocument((current) =>
          updateContentListItemText(current, itemId, index, value, settings, fontSettings),
        );
      },
      onAddListItem: (itemId) => {
        setContentDocument((current) => addContentListItem(current, itemId, settings, fontSettings));
      },
      onRemoveListItem: (itemId, _zoneId, index) => {
        setContentDocument((current) => removeContentListItem(current, itemId, index, settings, fontSettings));
      },
      onImageUpload: (itemId, _zoneId, file) => {
        const location = findContentItemLocation(contentDocument, itemId);
        const contentRef = location
          ? getStreamItems(contentDocument, location.stream).find((entry) => entry.id === itemId)?.contentRef
          : "";
        if (!contentRef) {
          setImageUploadError("This image block has no content reference.");
          return;
        }
        if (!isAuthenticated()) {
          setImageUploadError(PAMPHLET_AUTH_REQUIRED_MESSAGE);
          return;
        }
        setImageUploadingItemId(itemId);
        setImageUploadError("");
        void uploadPamphletImage(
          contentRef,
          file,
          layoutSettingsToApiLayout(settings),
          activePamphletId ?? "active",
        )
          .then((result) => {
            const imageKey = result.imageKey ?? result.imageUrl ?? "";
            if (!imageKey) {
              throw new Error("Upload succeeded but no image key was returned.");
            }
            setContentDocument((current) =>
              updateContentItemImageUrl(current, itemId, imageKey, settings, fontSettings),
            );
            setCloudStatus("Image uploaded to cloud storage.");
          })
          .catch((err) => {
            setImageUploadError(err instanceof Error ? err.message : "Image upload failed");
          })
          .finally(() => {
            setImageUploadingItemId(null);
          });
      },
    }),
    [contentDocument, fontSettings, mutateStream, previewMode, settings, activePamphletId, viewMode],
  );

  const viewModeButtons = useMemo(
    () => [
      {
        id: "immersive-edit",
        label: "Immersive edit",
        title: "Stack all columns vertically for focused editing",
        icon: <IconImmersiveEdit />,
        active: viewMode === "immersive",
        onClick: enterImmersiveView,
      },
      {
        id: "preview-view",
        label: "Preview view",
        title: "Return to the sheet preview layout",
        icon: <IconPreviewLayout />,
        active: viewMode === "preview",
        onClick: enterPreviewView,
      },
    ],
    [enterImmersiveView, enterPreviewView, viewMode],
  );

  const previewModeButtons = useMemo(
    () =>
      PREVIEW_MODE_BUTTONS.map((button) => ({
        id: button.id,
        label: button.label,
        title: button.title,
        icon: button.icon,
        active: previewMode === button.id && viewMode === "preview",
        onClick: () => activatePreviewMode(button.id),
      })),
    [activatePreviewMode, previewMode, viewMode],
  );

  const marginAndFontButtons = useMemo(
    () => [
      ...PAMPHLET_LAYOUT_SETTING_DEFINITIONS.map((def) => ({
        id: def.key,
        label: def.label,
        title: def.tooltip,
        icon: marginSettingIcon(def.key),
        active: openSetting === def.key,
        onClick: () => {
          setPreviewMode(null);
          setFontPanelOpen(false);
          setOpenSetting(def.key);
        },
      })),
      {
        id: "font-sizes",
        label: "Font sizes",
        title: "Preview font sizes in millimeters",
        icon: <IconFontSize />,
        active: fontPanelOpen,
        onClick: () => {
          setPreviewMode(null);
          setOpenSetting(null);
          setFontPanelOpen(true);
        },
      },
    ],
    [fontPanelOpen, openSetting],
  );

  const pinnedActivityButtons = useMemo(
    () => [
      {
        id: "open-pamphlet",
        label: "Open",
        title: "Open a saved pamphlet from the cloud",
        icon: <IconOpenFolder />,
        active: openModalVisible,
        onClick: () => {
          if (!isAuthenticated()) {
            setCloudStatus(PAMPHLET_AUTH_REQUIRED_MESSAGE);
            return;
          }
          closePanels();
          setSaveModalVisible(false);
          setOpenModalVisible(true);
        },
      },
      {
        id: "save-pamphlet",
        label: "Save to cloud",
        title: "Save this pamphlet to the cloud",
        icon: <IconSaveCloud />,
        active: saveModalVisible,
        onClick: () => {
          if (!isAuthenticated()) {
            setCloudStatus(PAMPHLET_AUTH_REQUIRED_MESSAGE);
            return;
          }
          closePanels();
          setOpenModalVisible(false);
          setSaveModalVisible(true);
        },
      },
    ],
    [closePanels, openModalVisible, saveModalVisible],
  );

  const activityButtons = useMemo(
    () => [...marginAndFontButtons, ...viewModeButtons, ...previewModeButtons],
    [marginAndFontButtons, previewModeButtons, viewModeButtons],
  );

  const mobileOverflowButtons = useMemo(
    () => [...marginAndFontButtons, ...viewModeButtons],
    [marginAndFontButtons, viewModeButtons],
  );

  function handleSave(valueMm: number) {
    if (!openSetting) {
      return;
    }
    setSettings((current) => {
      const next = applyPamphletSetting(current, openSetting, valueMm);
      setContentDocument((doc) => recalculatePamphletDocument(doc, next, fontSettings));
      return next;
    });
  }

  function handleFontSave(nextFonts: PamphletFontSettings) {
    setFontSettings(nextFonts);
    setContentDocument((current) => recalculatePamphletDocument(current, settings, nextFonts));
  }

  return (
    <PamphletImageProvider
      pamphletId={activePamphletId ?? "active"}
      userEmail={getAuthEmailFromToken()}
    >
      <div className="pamphlet-v2-page">
      <div className="pamphlet-no-print">
        <ActivityBar
          pinnedButtons={pinnedActivityButtons}
          buttons={activityButtons}
          mobilePrimaryButtons={previewModeButtons}
          mobileOverflowButtons={mobileOverflowButtons}
          ariaLabel="Pamphlet actions"
        />
        {activeDefinition ? (
          <PamphletSettingPanel
            open
            label={activeDefinition.label}
            valueMm={settings[activeDefinition.key]}
            onSave={handleSave}
            onClose={() => setOpenSetting(null)}
          />
        ) : null}
        <PamphletFontSettingsPanel
          open={fontPanelOpen}
          settings={fontSettings}
          onSave={handleFontSave}
          onClose={() => setFontPanelOpen(false)}
        />
        <PamphletOpenModal
          open={openModalVisible}
          onClose={() => setOpenModalVisible(false)}
          onOpen={handleOpenPamphlet}
        />
        <PamphletSaveModal
          open={saveModalVisible}
          activePamphletId={activePamphletId}
          activeTitle={activePamphletTitle}
          onClose={() => setSaveModalVisible(false)}
          onSave={handleSavePamphlet}
        />
        {cloudStatus ? (
          <p className="pamphlet-v2-page__status pamphlet-no-print" aria-live="polite">
            {cloudStatus}
          </p>
        ) : null}
      </div>
      <PamphletV2
        settings={settings}
        contentDocument={contentDocument}
        fontSettings={fontSettings}
        selectedItemId={selectedItemId}
        actionPlacement={actionPlacement}
        contentHandlers={contentHandlers}
        imageUploadingItemId={imageUploadingItemId}
        imageUploadError={imageUploadError}
        viewMode={viewMode}
        previewMode={previewMode}
        zoomScale={zoomScale}
        pan={pan}
        onZoomIn={() => setZoomScale((current) => applyPreviewZoomIn(current))}
        onZoomOut={() => setZoomScale((current) => applyPreviewZoomOut(current))}
        onPanChange={(x, y) => setPan({ x, y })}
        onExitPreviewMode={exitPreviewMode}
      />
      </div>
    </PamphletImageProvider>
  );
}
