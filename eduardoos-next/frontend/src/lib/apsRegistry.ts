/**
 * APS Design Automation registry helpers.
 *
 * Autodesk DA list endpoints return objects shaped like:
 *   { data: string[] | object[], pagination?: ... }
 * The Next backend historically forwarded those objects under
 * appbundles / activities / engines. The admin UI must never call
 * .map on a non-array — that throws and React blanks the whole page.
 */

export type RegistryPayload = {
  bundles?: unknown;
  appbundles?: unknown;
  activities?: unknown;
  engines?: unknown;
  message?: string;
};

export type NormalizedRegistryLists = {
  bundles: unknown[];
  activities: unknown[];
  engines: unknown[];
};

/**
 * Coerce APS / DM list payloads into a flat array.
 * Accepts: arrays, { data: [] }, { items: [] }, or anything else → [].
 */
export function unwrapList<T = unknown>(payload: unknown): T[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload as T[];
  if (typeof payload !== "object") return [];
  const obj = payload as { data?: unknown; items?: unknown };
  if (Array.isArray(obj.data)) return obj.data as T[];
  if (Array.isArray(obj.items)) return obj.items as T[];
  return [];
}

/**
 * Normalize a registry API body so the UI can safely .map each column.
 */
export function normalizeRegistryLists(
  registry: RegistryPayload | null | undefined,
): NormalizedRegistryLists {
  if (!registry) {
    return { bundles: [], activities: [], engines: [] };
  }
  const bundlesSource =
    registry.bundles !== undefined && registry.bundles !== null
      ? registry.bundles
      : registry.appbundles;
  return {
    bundles: unwrapList(bundlesSource),
    activities: unwrapList(registry.activities),
    engines: unwrapList(registry.engines),
  };
}
