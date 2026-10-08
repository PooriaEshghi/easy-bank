import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3010,
    strictPort: true,
    origin: "http://localhost:3010",
  },
  preview: {
    port: 3010,
    strictPort: true,
  },
  build: {
    target: "chrome89",
  },
});
