// Astro configuration: React islands, static output for Nginx, and Vite PWA integration.
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import AstroPWA from "@vite-pwa/astro";

export default defineConfig({
  integrations: [
    react(),
    AstroPWA({
      registerType: "autoUpdate",
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
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2}"],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        ignoreURLParametersMatching: [/./],
        navigateFallback: null,
      },
    }),
  ],
  output: "static",
  build: {
    assets: "assets",
  },
  vite: {
    optimizeDeps: {
      include: ["toastify-js"],
    },
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
