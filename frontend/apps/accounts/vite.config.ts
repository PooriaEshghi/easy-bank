import { federation } from "@module-federation/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: "accounts",
      filename: "remoteEntry.js",
      exposes: {
        "./App": "./src/App.tsx",
      },
      shared: {
        react: { singleton: true },
        "react-dom": { singleton: true },
      },
      dts: false,
    }),
  ],
  server: {
    port: 3001,
    strictPort: true,
    origin: "http://localhost:3001",
    cors: true,
  },
  preview: {
    port: 3001,
    strictPort: true,
  },
  build: {
    target: "chrome89",
  },
});
