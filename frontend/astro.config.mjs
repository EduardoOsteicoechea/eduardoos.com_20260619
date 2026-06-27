// Astro configuration: React islands, static output for Nginx, and Vite PWA integration.
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import AstroPWA from "@vite-pwa/astro";

export default defineConfig({
  integrations: [
    react(),
    AstroPWA({
      // Prompt the user before activating a waiting service worker (see BaseLayout toast).
      registerType: "prompt",
      manifest: {
        name: "Eduardo OS",
        short_name: "Eduardo OS",
        description:
          "Licensed Architect & Software Developer — offline-capable spiritual audio and microservices platform.",
        theme_color: "#000000",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/favicon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/favicon-180.png",
            sizes: "180x180",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        // Precache hashed Astro build assets and static public files matching these extensions.
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2}"],
        // SPA fallback for document navigations only — not for /api/* proxy routes.
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        // Never treat query-string variants as separate cache keys (avoids stale API caching).
        ignoreURLParametersMatching: [/./],
      },
    }),
  ],
  output: "static",
  build: {
    assets: "assets",
  },
  server: {
    port: 4321,
    /** Proxy API to nginx when Docker stack is up (https://localhost). */
    proxy: {
      "/api": {
        target: "https://localhost",
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
