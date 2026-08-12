import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // @eirms/i18n-strings is a workspace package emitting CommonJS. Vite treats
  // linked workspace packages as source, so its resolved path lives outside
  // node_modules and the default commonjs plugin (which only scans
  // node_modules) skips it — leaving `exports.X` named exports unresolvable.
  // Pre-bundle it in dev and run it through the commonjs plugin at build so
  // the named exports (BASE_STRINGS, SUPPORTED_LANGUAGES, …) resolve.
  optimizeDeps: {
    include: ["@eirms/i18n-strings"],
  },
  build: {
    commonjsOptions: {
      include: [/i18n-strings/, /node_modules/],
    },
  },
  server: {
    host: true,
    port: 4999,
  },
  preview: {
    host: true,
    port: 4999,
  },
});
