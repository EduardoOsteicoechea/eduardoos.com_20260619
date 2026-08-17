/**
 * 10-segment score bar — fill level colored by band:
 * 1–3 mínimo (red), 4–5 pobre (yellow), 6–7 aprobado (pale lime), 8–10 bueno (green).
 */

import { scoreBand, scoreBandLabel } from "../../lib/homescool";
import "./Homescool.css";

type Props = {
  score: number;
  maxScore?: number;
  showLabel?: boolean;
};

export default function ScoreBar({ score, maxScore = 10, showLabel = true }: Props) {
  const capped = Math.max(0, Math.min(score, maxScore, 10));
  const band = scoreBand(capped);
  const segments = Array.from({ length: 10 }, (_, i) => i + 1);

  return (
    <div
      className={`homescool-score-bar homescool-score-bar--${band || "empty"}`}
      role="img"
      aria-label={`Score ${capped} of ${maxScore}${band ? `, ${scoreBandLabel(band)}` : ""}`}
    >
      <div className="homescool-score-bar__segments">
        {segments.map((n) => (
          <span
            key={n}
            className={`homescool-score-bar__seg${n <= capped ? " homescool-score-bar__seg--filled" : ""}`}
          />
        ))}
      </div>
      {showLabel ? (
        <span className="homescool-score-bar__meta">
          {capped}/{maxScore}
          {band ? ` · ${scoreBandLabel(band)}` : ""}
        </span>
      ) : null}
    </div>
  );
}
