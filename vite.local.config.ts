import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "pages-app",
  base: "/",
  publicDir: "../public",
  plugins: [react()],
  build: {
    outDir: "../local-dist",
    emptyOutDir: true,
  },
});
