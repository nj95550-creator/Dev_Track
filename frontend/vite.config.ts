import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Configures the React development server and forwards API requests
 * to the DevTrack backend running on port 3000.
 */
export default defineConfig({
  plugins: [react()],

  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});