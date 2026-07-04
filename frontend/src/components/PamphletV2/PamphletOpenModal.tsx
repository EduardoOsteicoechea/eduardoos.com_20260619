/**
 * PamphletOpenModal.tsx — Lists cloud pamphlets and loads the selected draft.
 */
import { useCallback, useEffect, useState } from "react";
import { getAuthToken } from "../../lib/auth";
import { fetchPamphletRegistry, type PamphletRegistryItem } from "../../lib/pamphlets";
import PamphletModal from "./PamphletModal";

interface PamphletOpenModalProps {
  open: boolean;
  onClose: () => void;
  onOpen: (pamphletId: string, title: string) => Promise<void>;
}

export default function PamphletOpenModal({ open, onClose, onOpen }: PamphletOpenModalProps) {
  const [pamphlets, setPamphlets] = useState<PamphletRegistryItem[]>([]);
  const [sortBy, setSortBy] = useState<"alpha" | "date">("alpha");
  const [loading, setLoading] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const loadRegistry = useCallback(async () => {
    if (!getAuthToken()) {
      setError("Sign in to open pamphlets from the cloud.");
      setPamphlets([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const items = await fetchPamphletRegistry(sortBy);
      setPamphlets(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pamphlets");
      setPamphlets([]);
    } finally {
      setLoading(false);
    }
  }, [sortBy]);

  useEffect(() => {
    if (open) {
      void loadRegistry();
    }
  }, [loadRegistry, open]);

  async function handleSelect(pamphletId: string) {
    setOpeningId(pamphletId);
    setError("");
    try {
      await onOpen(entry.pamphletId, entry.title?.trim() || entry.pamphletId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open pamphlet");
    } finally {
      setOpeningId(null);
    }
  }

  return (
    <PamphletModal open={open} title="Open pamphlet" onClose={onClose}>
      {error ? <p className="pamphlet-modal__error">{error}</p> : null}
      <label className="pamphlet-modal__field">
        Sort
        <select
          value={sortBy}
          onChange={(event) => setSortBy(event.target.value as "alpha" | "date")}
          disabled={loading || openingId !== null}
        >
          <option value="alpha">Alphabetic</option>
          <option value="date">Date</option>
        </select>
      </label>
      {loading ? <p className="pamphlet-modal__empty">Loading pamphlets…</p> : null}
      {!loading && pamphlets.length === 0 ? (
        <p className="pamphlet-modal__empty">No saved pamphlets yet.</p>
      ) : null}
      {!loading && pamphlets.length > 0 ? (
        <ul className="pamphlet-modal__list">
          {pamphlets.map((entry) => (
            <li key={entry.pamphletId} className="pamphlet-modal__list-item">
              <button
                type="button"
                disabled={openingId !== null}
                onClick={() => void handleSelect(entry.pamphletId)}
              >
                {entry.title?.trim() || entry.pamphletId}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </PamphletModal>
  );
}
