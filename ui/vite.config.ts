import { defineConfig } from "vite";

// Dev proxy: local http_api by default, or KEEP_HTTP_PROXY for fortress.
const apiTarget = process.env.KEEP_HTTP_PROXY || "http://127.0.0.1:8120";

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
