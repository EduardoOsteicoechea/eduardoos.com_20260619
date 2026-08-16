import ServiceGate from "../ServiceGate/ServiceGate";
import PlaylistBuilder from "../PlaylistBuilder/PlaylistBuilder";

/** Music route shell with subscription gate (admin bypass). */
export default function MusicPage() {
  return (
    <ServiceGate serviceId="playlist" serviceLabel="Music">
      <PlaylistBuilder />
    </ServiceGate>
  );
}
