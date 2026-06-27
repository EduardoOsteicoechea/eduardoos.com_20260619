/**
 * audioPlaylist.ts — Static playlist sourced from files in frontend/public/.
 * Each `path` is served at the site root after `astro build` (no /api prefix).
 */

export interface AudioTrack {
  /** Stable key for IndexedDB and Media Session identity. */
  id: string;
  /** Human-readable title shown in the player chrome. */
  title: string;
  /** Absolute path from site root, e.g. "/song.mp3". */
  path: string;
}

/** MP3 files currently shipped in frontend/public/. */
export const PUBLIC_AUDIO_PLAYLIST: AudioTrack[] = [
  {
    id: "ayudame",
    title: "Ayúdame",
    path: "/Ayúdame. Cánticos espirituales..mp3",
  },
  {
    id: "cuanto-me-cuesta",
    title: "Cuánto Me Cuesta",
    path: "/Cuánto Me Cuesta. Cánticos Espirituales..mp3",
  },
  {
    id: "no-olvidare",
    title: "No Olvidaré",
    path: "/No Olvidare. Cánticos Espirituales.mp3",
  },
  {
    id: "reposo-salmo-3",
    title: "Reposo (Salmo 3)",
    path: "/Reposo (Salmo 3)..mp3",
  },
  {
    id: "ten-misericordia",
    title: "Ten Misericordia",
    path: "/Ten Misericordia. Cánticos Espirituales..mp3",
  },
];

/** Encodes public paths so fetch() and <audio src> work with spaces and accents. */
export function encodePublicAudioPath(path: string): string {
  return encodeURI(path);
}
