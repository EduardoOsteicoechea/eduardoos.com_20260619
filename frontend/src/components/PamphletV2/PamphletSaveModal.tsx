/**
 * PamphletSaveModal.tsx — Saves the current pamphlet as new or overwrites an existing draft.
 */
import { useCallback, useEffect, useState } from "react";
import { getAuthToken } from "../../lib/auth";
import { slugifyPamphletId } from "../../lib/pamphletPersistence";
import { fetchPamphletRegistry, type PamphletRegistryItem } from "../../lib/pamphlets";
import PamphletModal from "./PamphletModal";

type SaveMode = "new" | "overwrite";

interface PamphletSaveModalProps {
  open: boolean;
  activePamphletId: string | null;
  activeTitle: string;
  onClose: () => void;
  onSave: (options: { pamphletId: string; title: string; overwrite: boolean }) => Promise<void>;
}

export default function PamphletSaveModal({
  open,
  activePamphletId,
  activeTitle,
  onClose,
  onSave,
}: PamphletSaveModalProps) {
  const [mode, setMode] = useState<SaveMode>("new");
  const [title, setTitle] = useState(activeTitle);
  const [overwriteId, setOverwriteId] = useState(activePamphletId ?? "");
  const [pamphlets, setPamphlets] = useState<PamphletRegistryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadRegistry = useCallback(async () => {
    if (!getAuthToken()) {
      setError("Sign in to save pamphlets to the cloud.");
      setPamphlets([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const items = await fetchPamphletRegistry("alpha");
      setPamphlets(items);
      if (activePamphletId && items.some((entry) => entry.pamphletId === activePamphletId)) {
        setMode("overwrite");
        setOverwriteId(activePamphletId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pamphlets");
      setPamphlets([]);
    } finally {
      setLoading(false);
    }
  }, [activePamphletId]);

  useEffect(() => {
    if (open) {
      setTitle(activeTitle);
      setError("");
      void loadRegistry();
    }
  }, [activeTitle, loadRegistry, open]);

  async function handleSave() {
    if (!getAuthToken()) {
      setError("Sign in to save pamphlets to the cloud.");
      return;
    }
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Enter a pamphlet title.");
      return;
    }
    const pamphletId =
      mode === "overwrite" && overwriteId.trim()
        ? overwriteId.trim()
        : slugifyPamphletId(trimmedTitle);
    if (mode === "overwrite" && !overwriteId.trim()) {
      setError("Select a pamphlet to overwrite.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await onSave({
        pamphletId,
        title: trimmedTitle,
        overwrite: mode === "overwrite",
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save pamphlet");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PamphletModal open={open} title="Save pamphlet" onClose={onClose}>
      {error ? <p className="pamphlet-modal__error">{error}</p> : null}
      <label className="pamphlet-modal__field">
        Title
        <input
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          disabled={saving}
          aria-label="Pamphlet title"
        />
      </label>
      <div className="pamphlet-modal__mode">
        <label>
          <input
            type="radio"
            name="pamphlet-save-mode"
            checked={mode === "new"}
            onChange={() => setMode("new")}
            disabled={saving}
          />
          Save as new pamphlet
        </label>
        <label>
          <input
            type="radio"
            name="pamphlet-save-mode"
            checked={mode === "overwrite"}
            onChange={() => setMode("overwrite")}
            disabled={saving || pamphlets.length === 0}
          />
          Overwrite existing pamphlet
        </label>
      </div>
      {mode === "overwrite" ? (
        <label className="pamphlet-modal__field">
          Pamphlet
          <select
            value={overwriteId}
            onChange={(event) => setOverwriteId(event.target.value)}
            disabled={saving || loading}
          >
            <option value="">Select pamphlet…</option>
            {pamphlets.map((entry) => (
              <option key={entry.pamphletId} value={entry.pamphletId}>
                {entry.title?.trim() || entry.pamphletId}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="pamphlet-modal__actions">
        <button type="button" disabled={saving} onClick={() => void handleSave()}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" disabled={saving} onClick={onClose}>
          Cancel
        </button>
      </div>
    </PamphletModal>
  );
}
