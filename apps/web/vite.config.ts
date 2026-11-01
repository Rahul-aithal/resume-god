import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { defineConfig } from "vite";

// Dev API target: set VITE_API_PROXY=http://server:3000 when running inside
// docker compose dev; the default is the NestJS server (apps/server) for
// `bun run dev` on the host. All API endpoints are native TypeScript.
const apiTarget = process.env.VITE_API_PROXY ?? "http://localhost:3000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": { target: apiTarget, changeOrigin: false },
      "/files": { target: apiTarget, changeOrigin: false },
    },
  },
  build: {
    rolldownOptions: {
      output: {
        // Stable vendor chunks: app code changes don't invalidate the
        // framework cache, and framework updates don't invalidate routes.
        codeSplitting: {
          groups: [
            {
              name: "react-vendor",
              test: /node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom)[\\/]/,
            },
            {
              name: "query-vendor",
              test: /node_modules[\\/]@tanstack[\\/](react-query|query-core)[\\/]/,
            },
            {
              // The knowledge-graph canvas is the heaviest dependency;
              // keep it isolated to its route chunk's group.
              name: "flow",
              test: /node_modules[\\/]@xyflow[\\/]/,
            },
          ],
        },
      },
    },
  },
});
