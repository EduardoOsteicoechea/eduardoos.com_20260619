/**
 * The Instrumentalist — default: topic + formal-logic chat.
 * Belief tree canvas toggles from Header Dynamic Menu (“Beliefs”).
 * One default .instru per user (load on open, upsert on save).
 */

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  analyzeInstrumentalistDoc,
  chatInstrumentalistDoc,
  createInstrumentalistDoc,
  downloadInstruFile,
  emptyBeliefTree,
  getInstrumentalistDoc,
  listInstrumentalistDocs,
  newGroupNode,
  newIdeaNode,
  updateInstrumentalistDoc,
  type BeliefTree,
  type InstruAnalysis,
  type InstruDocument,
} from "../../lib/instrumentalist";
import { INSTRUMENTALIST_AGENT_WELCOME } from "../../lib/agentVoice";
import ChatMarkdown from "../Chat/ChatMarkdown";
import BeliefTreeEditor from "./BeliefTreeEditor";
import InstrumentalistHeaderMenu from "./InstrumentalistHeaderMenu";
import "./InstrumentalistPage.css";

export default function InstrumentalistPage() {
  const [doc, setDoc] = useState<InstruDocument | null>(null);
  const [tree, setTree] = useState<BeliefTree>(emptyBeliefTree());
  const [topic, setTopic] = useState("");
  const [title, setTitle] = useState("Untitled hierarchy");
  const [connectKind, setConnectKind] = useState<"hierarchy" | "group">("hierarchy");
  const [treeOpen, setTreeOpen] = useState(false);
  const [analyzeOpen, setAnalyzeOpen] = useState(false);
  const [latestAnalysis, setLatestAnalysis] = useState<InstruAnalysis | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const threadRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function applyDoc(full: InstruDocument) {
    setDoc(full);
    setTree(full.beliefTree ?? emptyBeliefTree());
    setTopic(full.topic ?? "");
    setTitle(full.title ?? "Untitled hierarchy");
    const analyses = full.analyses ?? [];
    setLatestAnalysis(analyses.length ? analyses[analyses.length - 1] : null);
  }

  /** Load the single default hierarchy for this user, or create it once. */
  const bootstrap = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listInstrumentalistDocs();
      if (list.length > 0) {
        // Prefer most recently updated as the canonical default.
        const full = await getInstrumentalistDoc(list[0].id);
        applyDoc(full);
      } else {
        const created = await createInstrumentalistDoc({
          title: "Untitled hierarchy",
          topic: "",
          beliefTree: emptyBeliefTree(),
        });
        applyDoc(created);
      }
    } catch {
      // ServerErrorModal already opened by client helpers.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [doc?.messages]);

  const scheduleSave = useCallback(
    (next: { title?: string; topic?: string; beliefTree?: BeliefTree }) => {
      if (!doc?.id) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void (async () => {
          try {
            const saved = await updateInstrumentalistDoc(doc.id, {
              title: next.title ?? title,
              topic: next.topic ?? topic,
              beliefTree: next.beliefTree ?? tree,
            });
            setDoc(saved);
            setStatus("Saved");
          } catch {
            /* modal */
          }
        })();
      }, 700);
    },
    [doc?.id, title, topic, tree],
  );

  function handleTreeChange(next: BeliefTree) {
    setTree(next);
    scheduleSave({ beliefTree: next });
  }

  async function handleSaveNow() {
    if (!doc?.id) return;
    setBusy(true);
    try {
      const saved = await updateInstrumentalistDoc(doc.id, {
        title,
        topic,
        beliefTree: tree,
      });
      applyDoc(saved);
      setStatus("Saved to cloud / memory");
    } catch {
      /* modal */
    } finally {
      setBusy(false);
    }
  }

  function handleDownload() {
    if (!doc) return;
    downloadInstruFile({
      ...doc,
      title,
      topic,
      beliefTree: tree,
    });
    setStatus("Downloaded .instru");
  }

  function handleAddIdea() {
    // Functional update so Add idea/group never drops nodes if tree state is mid-flight
    // (e.g. concurrent canvas sync after a mistaken keyboard delete).
    setTree((prev) => {
      const node = newIdeaNode({
        position: { x: 80 + prev.nodes.length * 24, y: 60 + prev.nodes.length * 18 },
      });
      const next = { ...prev, nodes: [...prev.nodes, node] };
      scheduleSave({ beliefTree: next });
      return next;
    });
  }

  function handleAddGroup() {
    setTree((prev) => {
      const node = newGroupNode({
        position: { x: 40 + prev.nodes.length * 20, y: 40 + prev.nodes.length * 16 },
      });
      const next = { ...prev, nodes: [...prev.nodes, node] };
      scheduleSave({ beliefTree: next });
      return next;
    });
  }

  async function handleAnalyze() {
    if (!doc?.id) return;
    setBusy(true);
    setAnalyzeOpen(true);
    try {
      await updateInstrumentalistDoc(doc.id, { title, topic, beliefTree: tree });
      const { document: saved, analysis } = await analyzeInstrumentalistDoc(
        doc.id,
        tree,
        topic,
      );
      applyDoc(saved);
      setLatestAnalysis(analysis);
      setStatus("Analysis ready");
    } catch {
      /* modal — LLM missing or network */
    } finally {
      setBusy(false);
    }
  }

  async function handleChat(e: FormEvent) {
    e.preventDefault();
    if (!doc?.id || !draft.trim()) return;
    const message = draft.trim();
    setDraft("");
    setBusy(true);
    try {
      const { document: saved } = await chatInstrumentalistDoc(
        doc.id,
        message,
        tree,
        topic,
      );
      applyDoc(saved);
    } catch {
      setDraft(message);
    } finally {
      setBusy(false);
    }
  }

  function toggleTree() {
    setTreeOpen((open) => {
      const next = !open;
      if (!next) setAnalyzeOpen(false);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="instru-page">
        <p className="instru-page__status">Loading Instrumentalist…</p>
      </div>
    );
  }

  const messages = doc?.messages?.length
    ? doc.messages
    : [{ role: "assistant" as const, text: INSTRUMENTALIST_AGENT_WELCOME, at: "" }];

  const workspaceClass = [
    "instru-page__workspace",
    treeOpen ? "instru-page__workspace--tree-open" : "instru-page__workspace--chat-only",
    treeOpen && analyzeOpen ? "instru-page__workspace--analyze-open" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={`instru-page${treeOpen ? " instru-page--tree-open" : ""}${
        treeOpen && analyzeOpen ? " instru-page--analyze-open" : ""
      }`}
    >
      <InstrumentalistHeaderMenu treeOpen={treeOpen} onToggleTree={toggleTree} />

      <header className="instru-page__chrome">
        <div className="instru-page__brand">
          <h1 className="instru-page__title">The Instrumentalist</h1>
          <p className="instru-page__lead">
            Evaluate a topic against your belief hierarchy with a formal-logic AI agent.
            Open Beliefs in the header to edit the tree.
          </p>
        </div>
        <div className="instru-page__session">
          <label className="instru-page__field">
            <span>Title</span>
            <input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                scheduleSave({ title: e.target.value });
              }}
            />
          </label>
          <label className="instru-page__field instru-page__field--grow">
            <span>Topic</span>
            <input
              value={topic}
              placeholder="Proposed topic to validate or refute"
              onChange={(e) => {
                setTopic(e.target.value);
                scheduleSave({ topic: e.target.value });
              }}
            />
          </label>
          <div className="instru-page__actions">
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => void handleSaveNow()}
            >
              Save
            </button>
            <button type="button" className="btn" disabled={!doc} onClick={handleDownload}>
              Download .instru
            </button>
          </div>
        </div>
        {status && <p className="instru-page__status">{status}</p>}
      </header>

      <div className={workspaceClass}>
        {treeOpen && (
          <aside className="instru-panel instru-panel--tree" aria-label="Belief tree">
            <div className="instru-panel__toolbar">
              <h2 className="instru-panel__heading">Belief tree</h2>
              <div className="instru-panel__tools">
                <button type="button" className="btn" onClick={handleAddIdea} disabled={busy}>
                  Add idea
                </button>
                <button type="button" className="btn" onClick={handleAddGroup} disabled={busy}>
                  Add group
                </button>
                <label className="instru-panel__connect">
                  <span>Cable</span>
                  <select
                    value={connectKind}
                    onChange={(e) => setConnectKind(e.target.value as "hierarchy" | "group")}
                  >
                    <option value="hierarchy">Hierarchy</option>
                    <option value="group">Group</option>
                  </select>
                </label>
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={busy || !doc}
                  onClick={() => void handleAnalyze()}
                >
                  Analyze
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setTreeOpen(false);
                    setAnalyzeOpen(false);
                  }}
                >
                  Close
                </button>
              </div>
            </div>
            <p className="instru-panel__hint">
              Drag from the dots on a card to connect. Hierarchy stays inside a group; use group
              cables for membership. Delete with ×, or Backspace/Delete only while the canvas
              (not an idea text/weight field or toolbar button) is focused.
            </p>
            <div className="instru-panel__canvas">
              <BeliefTreeEditor tree={tree} onChange={handleTreeChange} connectKind={connectKind} />
            </div>
          </aside>
        )}

        <section className="instru-panel instru-panel--chat" aria-label="Formal logic chat">
          <h2 className="instru-panel__heading">Formal-logic agent</h2>
          <p className="instru-panel__hint">
            Eduardo’s AI agent — not Eduardo. Hierarchy weights guide the reply
            {tree.nodes.length === 0 ? " (add beliefs via the header Beliefs control)." : "."}
          </p>
          <div className="instru-chat__thread" ref={threadRef}>
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div
                  key={`${m.at}-${i}`}
                  className="instru-chat__bubble instru-chat__bubble--user"
                >
                  {m.text}
                </div>
              ) : (
                <ChatMarkdown
                  key={`${m.at}-${i}`}
                  className={`instru-chat__bubble instru-chat__bubble--${m.role}`}
                  text={m.text}
                />
              ),
            )}
          </div>
          <form className="instru-chat__form" onSubmit={(e) => void handleChat(e)}>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask to validate or refute the topic…"
              disabled={busy || !doc}
              aria-label="Chat message"
            />
            <button
              type="submit"
              className="btn btn--primary"
              disabled={busy || !draft.trim()}
            >
              Send
            </button>
          </form>
        </section>

        {treeOpen && analyzeOpen && (
          <aside className="instru-panel instru-panel--analyze" aria-label="Coherence analysis">
            <div className="instru-panel__toolbar">
              <h2 className="instru-panel__heading">Analysis</h2>
              <div className="instru-panel__tools">
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => void handleAnalyze()}
                >
                  Re-analyze
                </button>
                <button type="button" className="btn" onClick={() => setAnalyzeOpen(false)}>
                  Close
                </button>
              </div>
            </div>
            {latestAnalysis ? (
              <div className="instru-analyze">
                <p className="instru-analyze__summary">{latestAnalysis.summary}</p>
                <div className="instru-analyze__detail">{latestAnalysis.detail}</div>
                {latestAnalysis.at && (
                  <p className="instru-analyze__meta">{latestAnalysis.at}</p>
                )}
              </div>
            ) : (
              <p className="instru-panel__hint">Run Analyze to evaluate belief-tree coherence.</p>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
