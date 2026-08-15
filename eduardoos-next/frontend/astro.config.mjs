import { defineConfig } from "astro/config";
import react from "@astrojs/react";

// Dev-only proxy to next backend (:3001). Production cutover will use nginx /api/.
export default defineConfig({
  integrations: [react()],
  server: {
    port: 4322,
  },
  vite: {
    server: {
      proxy: {
        "/api": "http://127.0.0.1:3001",
        "/health": "http://127.0.0.1:3001",
      },
    },
  },
});
