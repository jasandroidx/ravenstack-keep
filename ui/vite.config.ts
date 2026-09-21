import { defineConfig } from "vite";

// Dev proxy: local http_api by default, or KEEP_HTTP_PROXY for fortress.
const apiTarget = process.env.KEEP_HTTP_PROXY || "http://127.0.0.1:8120";

export default defineConfig({
  server: {
    port: 5173,
    // Tailscale MagicDNS / IP access from Jason's machines
    allowedHosts: [
      "openclaw.tail20a090.ts.net",
      "grok-bot-vm-413820329-1.tail20a090.ts.net",
      ".tail20a090.ts.net",
    ],
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
