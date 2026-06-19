// Astro configuration: enables React islands and static output for Nginx serving.
import { defineConfig } from "astro/config";
import react from "@astrojs/react";

export default defineConfig({
  integrations: [react()],
  output: "static",
  build: {
    assets: "assets",
  },
});
