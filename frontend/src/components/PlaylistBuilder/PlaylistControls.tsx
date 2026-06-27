/**
 * PlaylistControls.tsx — Play / pause / stop / seek transport with volume, speed, and loop.
 *
 * Layout:
 * - Mobile: seek bar on top; transport row + mixer tray icon; tray for track/volume/speed.
 * - Tablet/desktop: single activity bar — transport | seek (center) | meta.
 */

import { useEffect, useId, useRef, useState } from "react";
import { formatPlaybackTime } from "../../lib/formatTime";
import {
  IconLoop,
  IconMixer,
  IconNext,
  IconPause,
  IconPlay,
  IconPrevious,
  IconStop,
} from "./PlaylistIcons";
import "./PlaylistControls.css";

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

export interface PlaylistControlsProps {
  nowPlayingLabel: string;
  isPlaying: boolean;
  canPlay: boolean;
  volume: number;
  playbackRate: number;
  currentTime: number;
  duration: number;
  loopPlaylist: boolean;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onVolumeChange: (value: number) => void;
  onSpeedChange: (rate: number) => void;
  onSeek: (seconds: number) => void;
  onSeekStart: () => void;
  onSeekEnd: (seconds: number) => void;
  onLoopToggle: () => void;
}

function SeekBar({
  canPlay,
  currentTime,
  duration,
  onSeek,
  onSeekStart,
  onSeekEnd,
}: Pick<
  PlaylistControlsProps,
  "canPlay" | "currentTime" | "duration" | "onSeek" | "onSeekStart" | "onSeekEnd"
>) {
  const maxDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const seekValue = maxDuration > 0 ? Math.min(currentTime, maxDuration) : 0;
  const progressPercent = maxDuration > 0 ? (seekValue / maxDuration) * 100 : 0;

  return (
    <div className="playlist-controls__progress">
      <span className="playlist-controls__time" aria-hidden="true">
        {formatPlaybackTime(currentTime)}
      </span>
      <div className="playlist-controls__seek-wrap">
        <div
          className="playlist-controls__seek-fill"
          style={{ width: `${progressPercent}%` }}
          aria-hidden="true"
        />
        <input
          className="playlist-controls__seek"
          type="range"
          min={0}
          max={maxDuration}
          step={0.1}
          value={seekValue}
          disabled={!canPlay || maxDuration <= 0}
          aria-label="Playback position"
          aria-valuetext={`${formatPlaybackTime(currentTime)} of ${formatPlaybackTime(duration)}`}
          onPointerDown={onSeekStart}
          onChange={(e) => onSeek(Number(e.target.value))}
          onPointerUp={(e) => onSeekEnd(Number((e.target as HTMLInputElement).value))}
          onKeyUp={(e) => {
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
              onSeekEnd(Number((e.target as HTMLInputElement).value));
            }
          }}
        />
      </div>
      <span className="playlist-controls__time" aria-hidden="true">
        {formatPlaybackTime(duration)}
      </span>
    </div>
  );
}

interface MetaPanelProps {
  nowPlayingLabel: string;
  volume: number;
  playbackRate: number;
  volumeId: string;
  speedId: string;
  onVolumeChange: (value: number) => void;
  onSpeedChange: (rate: number) => void;
}

function MetaPanel({
  nowPlayingLabel,
  volume,
  playbackRate,
  volumeId,
  speedId,
  onVolumeChange,
  onSpeedChange,
}: MetaPanelProps) {
  return (
    <>
      <span className="playlist-controls__now">{nowPlayingLabel}</span>
      <div className="playlist-controls__group">
        <label className="playlist-controls__label" htmlFor={volumeId} title="Volume">
          Vol
        </label>
        <input
          id={volumeId}
          className="playlist-controls__slider"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          title="Volume"
          onChange={(e) => onVolumeChange(Number(e.target.value))}
        />
      </div>
      <div className="playlist-controls__group">
        <label className="playlist-controls__label" htmlFor={speedId} title="Playback speed">
          Speed
        </label>
        <select
          id={speedId}
          className="playlist-controls__select"
          value={playbackRate}
          title="Playback speed"
          onChange={(e) => onSpeedChange(Number(e.target.value))}
        >
          {SPEED_OPTIONS.map((rate) => (
            <option key={rate} value={rate}>
              {rate}x
            </option>
          ))}
        </select>
      </div>
    </>
  );
}

export default function PlaylistControls({
  nowPlayingLabel,
  isPlaying,
  canPlay,
  volume,
  playbackRate,
  currentTime,
  duration,
  loopPlaylist,
  onPlay,
  onPause,
  onStop,
  onPrevious,
  onNext,
  onVolumeChange,
  onSpeedChange,
  onSeek,
  onSeekStart,
  onSeekEnd,
  onLoopToggle,
}: PlaylistControlsProps) {
  const [trayOpen, setTrayOpen] = useState(false);
  const trayRef = useRef<HTMLDivElement>(null);
  const trayToggleRef = useRef<HTMLButtonElement>(null);
  const uid = useId();
  const volumeId = `playlist-volume${uid}`;
  const speedId = `playlist-speed${uid}`;
  const trayVolumeId = `playlist-tray-volume${uid}`;
  const traySpeedId = `playlist-tray-speed${uid}`;

  const seekProps = {
    canPlay,
    currentTime,
    duration,
    onSeek,
    onSeekStart,
    onSeekEnd,
  };

  const metaProps = {
    nowPlayingLabel,
    volume,
    playbackRate,
    onVolumeChange,
    onSpeedChange,
  };

  useEffect(() => {
    if (!trayOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (trayRef.current?.contains(target) || trayToggleRef.current?.contains(target)) {
        return;
      }
      setTrayOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [trayOpen]);

  return (
    <section
      className={`playlist-controls${trayOpen ? " playlist-controls--tray-open" : ""}`}
      aria-label="Playlist transport"
    >
      <div className="playlist-controls__inner">
        <SeekBar {...seekProps} />

        <div className="playlist-controls__deck">
          <div className="playlist-controls__transport">
            <button
              type="button"
              className="playlist-controls__btn"
              disabled={!canPlay}
              title="Previous track"
              aria-label="Previous track"
              onClick={onPrevious}
            >
              <IconPrevious />
            </button>
            <button
              type="button"
              className="playlist-controls__btn playlist-controls__btn--primary"
              disabled={!canPlay}
              title={isPlaying ? "Pause" : "Play"}
              aria-label={isPlaying ? "Pause" : "Play"}
              onClick={isPlaying ? onPause : onPlay}
            >
              {isPlaying ? <IconPause /> : <IconPlay />}
            </button>
            <button
              type="button"
              className="playlist-controls__btn"
              disabled={!canPlay}
              title="Stop"
              aria-label="Stop"
              onClick={onStop}
            >
              <IconStop />
            </button>
            <button
              type="button"
              className="playlist-controls__btn"
              disabled={!canPlay}
              title="Next track"
              aria-label="Next track"
              onClick={onNext}
            >
              <IconNext />
            </button>
            <button
              type="button"
              className={`playlist-controls__btn playlist-controls__btn--loop${loopPlaylist ? " playlist-controls__btn--loop-on" : ""}`}
              title={loopPlaylist ? "Loop playlist on" : "Loop playlist off"}
              aria-label={loopPlaylist ? "Loop playlist on" : "Loop playlist off"}
              aria-pressed={loopPlaylist}
              onClick={onLoopToggle}
            >
              <IconLoop />
            </button>
          </div>

          <button
            ref={trayToggleRef}
            type="button"
            className={`playlist-controls__btn playlist-controls__tray-toggle${trayOpen ? " playlist-controls__tray-toggle--open" : ""}`}
            title="Track info, volume, and speed"
            aria-label="Track info, volume, and speed"
            aria-expanded={trayOpen}
            aria-controls="playlist-controls-tray"
            onClick={() => setTrayOpen((open) => !open)}
          >
            <IconMixer />
          </button>

          <div className="playlist-controls__meta playlist-controls__meta--bar">
            <MetaPanel volumeId={volumeId} speedId={speedId} {...metaProps} />
          </div>
        </div>

        <div
          ref={trayRef}
          id="playlist-controls-tray"
          className={`playlist-controls__tray${trayOpen ? " playlist-controls__tray--open" : ""}`}
          role="region"
          aria-label="Track info and playback settings"
          hidden={!trayOpen}
        >
          <MetaPanel volumeId={trayVolumeId} speedId={traySpeedId} {...metaProps} />
        </div>
      </div>
    </section>
  );
}
