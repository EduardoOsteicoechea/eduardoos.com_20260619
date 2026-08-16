/**
 * Admin-only mic recorder for Music / PlaylistBuilder.
 * Uses MediaRecorder, uploads the blob to S3 via POST /api/media/audio/upload,
 * then hands the new library track to the parent so it can land in the playlist
 * and open the existing lyrics (.emusic) flow.
 */

import { useEffect, useRef, useState } from "react";
import { getAuthEmailFromToken, isApsAdminEmail } from "../../lib/auth";
import {
  extensionForAudioBlob,
  uploadWorshipRecording,
  type AudioLibraryItem,
} from "../../lib/mediaLibrary";
import { openApiErrorModal } from "../ServerErrorModal/ServerErrorModal";
import { IconMic, IconStop } from "./PlaylistIcons";
import "./SongRecorder.css";

export type SongRecorderProps = {
  onRecorded: (track: AudioLibraryItem) => void | Promise<void>;
};

type RecorderPhase = "idle" | "recording" | "uploading";

function pickRecorderMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

export default function SongRecorder({ onRecorded }: SongRecorderProps) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [phase, setPhase] = useState<RecorderPhase>("idle");
  const [title, setTitle] = useState("");
  const [elapsedSec, setElapsedSec] = useState(0);
  const [hint, setHint] = useState("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const tickRef = useRef<number | null>(null);

  useEffect(() => {
    setIsAdmin(isApsAdminEmail(getAuthEmailFromToken()));
  }, []);

  useEffect(() => {
    return () => {
      stopTicker();
      stopStream();
    };
  }, []);

  if (!isAdmin) {
    return null;
  }

  function stopTicker() {
    if (tickRef.current != null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }

  function stopStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    mediaRecorderRef.current = null;
  }

  async function startRecording() {
    setHint("");
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setHint("Este navegador no permite grabar audio.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickRecorderMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onerror = () => {
        setHint("Error al grabar. Intenta de nuevo.");
        setPhase("idle");
        stopTicker();
        stopStream();
      };
      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setElapsedSec(0);
      setPhase("recording");
      stopTicker();
      tickRef.current = window.setInterval(() => {
        setElapsedSec((sec) => sec + 1);
      }, 1000);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setHint(`No se pudo acceder al micrófono: ${message}`);
      openApiErrorModal(`No se pudo iniciar la grabación: ${message}`, {
        title: "Micrófono",
        summary: "El navegador no concedió acceso al micrófono o MediaRecorder falló.",
      });
    }
  }

  async function stopAndUpload() {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      setPhase("idle");
      return;
    }
    stopTicker();
    setPhase("uploading");

    const blob = await new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => {
        const type = recorder.mimeType || "audio/webm";
        resolve(new Blob(chunksRef.current, { type }));
      };
      recorder.onerror = () => reject(new Error("recording failed"));
      try {
        recorder.stop();
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    }).finally(() => {
      stopStream();
    });

    if (blob.size === 0) {
      setPhase("idle");
      setHint("Grabación vacía. Intenta de nuevo.");
      return;
    }

    const ext = extensionForAudioBlob(blob);
    const safeTitle = title.trim() || `Grabacion ${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`;
    try {
      const track = await uploadWorshipRecording(blob, {
        title: safeTitle,
        filename: `${safeTitle}${ext}`,
      });
      setTitle("");
      setElapsedSec(0);
      setHint(`Guardado: ${track.name}`);
      await onRecorded(track);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setHint(message);
      openApiErrorModal(message, {
        title: "Subida de grabación",
        summary: "POST /api/media/audio/upload rechazó la grabación (admin + S3).",
      });
    } finally {
      setPhase("idle");
    }
  }

  const busy = phase === "uploading";
  const recording = phase === "recording";

  return (
    <section className="song-recorder" aria-label="Grabar canción (admin)">
      <div className="song-recorder__row">
        <label className="song-recorder__field">
          <span className="song-recorder__label">Título de la grabación</span>
          <input
            type="text"
            className="song-recorder__input"
            value={title}
            disabled={busy || recording}
            placeholder="Ej. Nueva alabanza"
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        {!recording ? (
          <button
            type="button"
            className="btn btn--primary song-recorder__btn"
            disabled={busy}
            onClick={() => void startRecording()}
            title="Grabar canción"
            aria-label="Grabar canción"
          >
            <IconMic />
            <span>{busy ? "Subiendo…" : "Grabar"}</span>
          </button>
        ) : (
          <button
            type="button"
            className="btn btn--primary song-recorder__btn song-recorder__btn--stop"
            onClick={() => void stopAndUpload()}
            title="Detener y guardar en la lista"
            aria-label="Detener y guardar en la lista"
          >
            <IconStop />
            <span>Detener ({elapsedSec}s)</span>
          </button>
        )}
      </div>
      {hint ? <p className="song-recorder__hint">{hint}</p> : null}
      <p className="song-recorder__note">
        Solo admin. Al detener, el audio va a S3 y entra en la lista; luego puedes editar letras.
      </p>
    </section>
  );
}
