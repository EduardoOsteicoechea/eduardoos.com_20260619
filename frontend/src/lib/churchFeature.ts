/**
 * Temporary Church product kill-switch (spec 004).
 * When false: Services menu hides Church; Astro /church* pages redirect home.
 * Backend uses env CHURCH_ENABLED independently (default off).
 * Flip to true (and CHURCH_ENABLED=1) to restore the product surface.
 */
export const CHURCH_FEATURE_ENABLED = false;
