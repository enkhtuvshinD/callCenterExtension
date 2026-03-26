import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        sidepanel: "sidepanel.html",
        offscreen: "offscreen.html",
        background: "src/background/index.ts"
      },
      output: {
        entryFileNames: (chunkInfo) =>
          chunkInfo.name === "background" ? "background.js" : "assets/[name].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]"
      }
    }
  }
});
