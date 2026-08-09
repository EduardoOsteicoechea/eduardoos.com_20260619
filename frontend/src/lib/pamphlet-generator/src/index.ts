/**
 * Portable pamphlet generator for Vite/Astro hosts.
 *
 * @example
 * ```ts
 * import { mountPamphletGenerator } from "./pamphlet-generator";
 * const handle = mountPamphletGenerator(document.getElementById("pamphlet-root")!);
 * // later: handle.destroy();
 * ```
 */
export {
    mountPamphletGenerator,
    type PamphletMountHandle,
} from "./main";

export type {
    PamphletStructure,
    PamphletItem,
    PamphletItemType,
} from "./pamphlet_schema";
