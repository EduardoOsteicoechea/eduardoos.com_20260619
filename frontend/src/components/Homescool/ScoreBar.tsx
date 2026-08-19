/**
 * 5-segment score bar — fill level colored by band:
 * 1 mínimo (red), 2 pobre (yellow), 3 aprobado (pale lime), 4–5 bueno (green).
 */

import { HOMESCOOL_MAX_SCORE, scoreBand, scoreBandLabel } from "../../lib/homescool";
import "./Homescool.css";

type Props = {
  score: number;
  maxScore?: number;
  showLabel?: boolean;
};

export default function ScoreBar({
  score,
  maxScore = HOMESCOOL_MAX_SCORE,
  showLabel = true,
}: Props) {
  const cappedMax = Math.max(1, Math.min(maxScore, HOMESCOOL_MAX_SCORE));
  const capped = Math.max(0, Math.min(score, cappedMax));
  const band = scoreBand(capped);
  const segments = Array.from({ length: HOMESCOOL_MAX_SCORE }, (_, i) => i + 1);

  return (
    <div
      className={`homescool-score-bar homescool-score-bar--${band || "empty"}`}
      role="img"
      aria-label={`Score ${capped} of ${cappedMax}${band ? `, ${scoreBandLabel(band)}` : ""}`}
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
          {capped}/{cappedMax}
          {band ? ` · ${scoreBandLabel(band)}` : ""}
        </span>
      ) : null}
    </div>
  );
}
