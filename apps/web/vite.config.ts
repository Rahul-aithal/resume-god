import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// Dev API target: set VITE_API_PROXY=http://api:8000 when running inside
// docker compose dev; the default suits `bun run dev` on the host.
const apiTarget = process.env.VITE_API_PROXY ?? "http://localhost:8000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": { target: apiTarget, changeOrigin: false },
      "/files": { target: apiTarget, changeOrigin: false },
    },
  },
  test: {
    environment: "happy-dom",
  },
});
