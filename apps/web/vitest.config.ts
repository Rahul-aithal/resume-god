import { defineConfig } from "vitest/config";

// Standalone so Vitest 5's config types never fight Vite 8's plugin types.
// TS/TSX transform is handled by Vitest's own pipeline (tsconfig jsx).
export default defineConfig({
  test: {
    environment: "happy-dom",
  },
});
