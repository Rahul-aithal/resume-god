import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// Dev API target: set VITE_API_PROXY=http://server:3000 when running inside
// docker compose dev; the default is the NestJS server (apps/server) for
// `bun run dev` on the host. All API endpoints are native TypeScript.
const apiTarget = process.env.VITE_API_PROXY ?? "http://localhost:3000";

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
});
