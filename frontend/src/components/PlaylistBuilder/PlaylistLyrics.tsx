import { useEffect, useMemo, useRef, useState } from "react";
import { activeWordIndex, fetchEmusicForTrack, type EmusicDocument } from "../../lib/emusic";
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

    const activeIndex = useMemo(() => {
        if (!doc?.words?.length) return -1;
        return activeWordIndex(doc.words, currentTime);
    }, [doc, currentTime]);

    useEffect(() => {
        activeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, [activeIndex]);

    const title = trackKey ? trackDisplayName(trackKey) : "";

    return (
        <section className="playlist-lyrics" aria-label="Song lyrics">
            <h2 className="playlist-lyrics__heading">Letra</h2>
            {!trackKey ? (
                <p className="playlist-lyrics__empty">Selecciona o reproduce una canción para ver la letra.</p>
            ) : status === "loading" ? (
                <p className="playlist-lyrics__empty">Cargando letra…</p>
            ) : status === "missing" ? (
                <p className="playlist-lyrics__empty">
                    No hay archivo <code>.emusic</code> para <strong>{title}</strong>.
                </p>
            ) : (
                <div className="playlist-lyrics__body" role="text">
                    {doc?.words.map((word, index) => {
                        const isActive = index === activeIndex;
                        return (
                            <span
                                key={`${word.t}-${index}`}
                                ref={isActive ? activeRef : undefined}
                                className={`playlist-lyrics__word${isActive ? " is-active" : ""}`}
                            >
                                {word.w}{" "}
                            </span>
                        );
                    })}
                </div>
            )}
        </section>
    );
}
