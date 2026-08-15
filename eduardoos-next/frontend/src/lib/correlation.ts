/**
 * Correlation IDs tag each browser → API hop so operators can stitch logs.
 * Format: eosn-<timestamp-base36>-<random>
 */

export function createCorrelationId(): string {
  const stamp = Date.now().toString(36);
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `eosn-${stamp}-${rand}`;
}
