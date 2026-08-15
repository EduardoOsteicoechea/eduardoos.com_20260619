// Astro configuration: React islands and static output for Nginx.
import { defineConfig } from "astro/config";
import react from "@astrojs/react";

export default defineConfig({
  integrations: [react()],
  output: "static",
  build: {
    assets: "assets",
  },
  vite: {
    optimizeDeps: {
      exclude: ["web-ifc"],
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
