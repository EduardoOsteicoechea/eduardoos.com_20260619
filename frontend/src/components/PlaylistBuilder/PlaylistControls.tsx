/**
 * PlaylistControls.tsx — Play / pause / stop / seek transport with volume and speed.
 *
 * This component is presentational: PlaylistBuilder owns the <audio> element and
 * wires these callbacks to real playback state.
 */

import "./PlaylistControls.css";

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

export interface PlaylistControlsProps {
  nowPlayingLabel: string;
  isPlaying: boolean;
  canPlay: boolean;
  volume: number;
  playbackRate: number;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onVolumeChange: (value: number) => void;
  onSpeedChange: (rate: number) => void;
}

export default function PlaylistControls({
  nowPlayingLabel,
  isPlaying,
  canPlay,
  volume,
  playbackRate,
  onPlay,
  onPause,
  onStop,
  onPrevious,
  onNext,
  onVolumeChange,
  onSpeedChange,
}: PlaylistControlsProps) {
  return (
    <section className="playlist-controls" aria-label="Playlist transport">
      <div className="playlist-controls__group">
        <button
          type="button"
          className="playlist-controls__btn"
          disabled={!canPlay}
          aria-label="Previous track"
          onClick={onPrevious}
        >
          Prev
        </button>
        <button
          type="button"
          className="playlist-controls__btn playlist-controls__btn--primary"
          disabled={!canPlay}
          aria-label={isPlaying ? "Pause" : "Play"}
          onClick={isPlaying ? onPause : onPlay}
        >
          {isPlaying ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          className="playlist-controls__btn"
          disabled={!canPlay}
          aria-label="Stop"
          onClick={onStop}
        >
          Stop
        </button>
        <button
          type="button"
          className="playlist-controls__btn"
          disabled={!canPlay}
          aria-label="Next track"
          onClick={onNext}
        >
          Next
        </button>
      </div>

      <span className="playlist-controls__now">{nowPlayingLabel}</span>

      <div className="playlist-controls__group">
        <label className="playlist-controls__label" htmlFor="playlist-volume">
          Vol
        </label>
        <input
          id="playlist-volume"
          className="playlist-controls__slider"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => onVolumeChange(Number(e.target.value))}
        />
      </div>

      <div className="playlist-controls__group">
        <label className="playlist-controls__label" htmlFor="playlist-speed">
          Speed
        </label>
        <select
          id="playlist-speed"
          className="playlist-controls__select"
          value={playbackRate}
          onChange={(e) => onSpeedChange(Number(e.target.value))}
        >
          {SPEED_OPTIONS.map((rate) => (
            <option key={rate} value={rate}>
              {rate}x
            </option>
          ))}
        </select>
      </div>
    </section>
  );
}
