import { defineConfig } from "vite";

// Tauri expects a fixed port and no screen-clearing.
export default defineConfig({
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ["VITE_", "TAURI_"],
  build: { target: "safari15", minify: false, sourcemap: true },
});
