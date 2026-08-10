import { useEffect, useMemo, useRef, useState } from "react";
import {
    activeOccurrenceKeys,
    fetchEmusicForTrack,
    flattenResolvedWords,
    resolveEmusicSections,
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

    const sections = useMemo(() => (doc ? resolveEmusicSections(doc) : []), [doc]);
    const flatWords = useMemo(() => flattenResolvedWords(sections), [sections]);
    const activeKeys = useMemo(
        () => activeOccurrenceKeys(flatWords, currentTime),
        [flatWords, currentTime],
    );
    const scrollKey = useMemo(() => {
        for (const word of flatWords) {
            if (activeKeys.has(word.occurrenceKey)) return word.occurrenceKey;
        }
        return "";
    }, [flatWords, activeKeys]);

    useEffect(() => {
        activeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, [scrollKey]);

    const title =
        doc?.title?.trim() ||
        (trackKey ? trackDisplayName(trackKey).replace(/\.mp3$/i, "") : "");

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
                    {sections.map((section) => (
                        <div key={`${section.label}-${section.words[0]?.occurrenceKey ?? "empty"}`} className="playlist-lyrics__section">
                            <p className="playlist-lyrics__section-label">[{section.label}]</p>
                            <p className="playlist-lyrics__section-words">
                                {section.words.map((word) => {
                                    const isActive = activeKeys.has(word.occurrenceKey);
                                    return (
                                        <span
                                            key={word.occurrenceKey}
                                            ref={word.occurrenceKey === scrollKey ? activeRef : undefined}
                                            className={`playlist-lyrics__word${isActive ? " is-active" : ""}`}
                                        >
                                            {word.text}{" "}
                                        </span>
                                    );
                                })}
                            </p>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}
