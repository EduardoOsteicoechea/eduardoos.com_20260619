import { useEffect, useMemo, useRef, useState } from "react";
import {
    activeWordIndex,
    fetchEmusicForTrack,
    flattenSectionWords,
    normalizeEmusicSections,
    type EmusicDocument,
} from "../../lib/emusic";
import { trackDisplayName } from "../../lib/mediaLibrary";
import "./PlaylistLyrics.css";

interface PlaylistLyricsProps {
    trackKey: string | null;
    currentTime: number;
}

export default function PlaylistLyrics({ trackKey, currentTime }: PlaylistLyricsProps) {
    const [doc, setDoc] = useState<EmusicDocument | null>(null);
    const [status, setStatus] = useState<"idle" | "loading" | "missing" | "ready">("idle");
    const activeRef = useRef<HTMLSpanElement | null>(null);

    useEffect(() => {
        let cancelled = false;
        if (!trackKey) {
            setDoc(null);
            setStatus("idle");
            return;
        }
        setStatus("loading");
        void fetchEmusicForTrack(trackKey).then((loaded) => {
            if (cancelled) return;
            if (!loaded) {
                setDoc(null);
                setStatus("missing");
                return;
            }
            setDoc(loaded);
            setStatus("ready");
        });
        return () => {
            cancelled = true;
        };
    }, [trackKey]);

    const sections = useMemo(() => (doc ? normalizeEmusicSections(doc) : []), [doc]);
    const flatWords = useMemo(() => flattenSectionWords(sections), [sections]);
    const activeIndex = useMemo(
        () => activeWordIndex(flatWords, currentTime),
        [flatWords, currentTime],
    );

    useEffect(() => {
        activeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, [activeIndex]);

    const title =
        doc?.title?.trim() ||
        (trackKey ? trackDisplayName(trackKey).replace(/\.mp3$/i, "") : "");

    let wordCursor = 0;

    return (
        <section className="playlist-lyrics" aria-label="Lyrics">
            {!trackKey ? (
                <p className="playlist-lyrics__empty">Selecciona o reproduce una canción.</p>
            ) : status === "loading" ? (
                <p className="playlist-lyrics__empty">Cargando…</p>
            ) : status === "missing" ? (
                <p className="playlist-lyrics__empty">
                    Sin archivo <code>.emusic</code> para esta pista.
                </p>
            ) : (
                <div className="playlist-lyrics__scroll">
                    <h3 className="playlist-lyrics__title">{title}</h3>
                    {sections.map((section) => {
                        const sectionStart = wordCursor;
                        const nodes = section.words.map((word, i) => {
                            const globalIndex = sectionStart + i;
                            const isActive = globalIndex === activeIndex;
                            return (
                                <span
                                    key={`${section.label}-${globalIndex}`}
                                    ref={isActive ? activeRef : undefined}
                                    className={`playlist-lyrics__word${isActive ? " is-active" : ""}`}
                                >
                                    {word.w}{" "}
                                </span>
                            );
                        });
                        wordCursor += section.words.length;
                        return (
                            <div key={`${section.label}-${sectionStart}`} className="playlist-lyrics__section">
                                <p className="playlist-lyrics__section-label">[{section.label}]</p>
                                <p className="playlist-lyrics__section-words">{nodes}</p>
                            </div>
                        );
                    })}
                </div>
            )}
        </section>
    );
}
