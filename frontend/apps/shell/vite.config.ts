import { federation } from "@module-federation/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: "shell",
      remotes: {
        accounts: {
          type: "module",
          name: "accounts",
          entry: "http://localhost:3001/remoteEntry.js",
        },
        cards: {
          type: "module",
          name: "cards",
          entry: "http://localhost:3002/remoteEntry.js",
        },
        loans: {
          type: "module",
          name: "loans",
          entry: "http://localhost:3003/remoteEntry.js",
        },
      },
      shared: {
        react: { singleton: true },
        "react-dom": { singleton: true },
      },
      dts: false,
    }),
  ],
  server: {
    port: 3000,
    strictPort: true,
    origin: "http://localhost:3000",
  },
  preview: {
    port: 3000,
    strictPort: true,
  },
  build: {
    target: "chrome89",
  },
});
