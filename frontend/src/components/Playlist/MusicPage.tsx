import PlaylistBuilder from "../PlaylistBuilder/PlaylistBuilder";

/**
 * Music route shell. Subscription ServiceGate can wrap this once entitlements land;
 * keep PlaylistBuilder reachable so activity-bar icons stay testable.
 */
export default function MusicPage() {
  return <PlaylistBuilder />;
}
