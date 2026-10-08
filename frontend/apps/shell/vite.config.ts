import { federation } from "@module-federation/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

function remoteEntry(env: Record<string, string>, name: string, fallback: string) {
  const fromProcess = process.env[name];
  if (fromProcess && fromProcess.length > 0) {
    return fromProcess;
  }
  const fromFile = env[name];
  return fromFile && fromFile.length > 0 ? fromFile : fallback;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  return {
    plugins: [
      react(),
      federation({
        name: "shell",
        remotes: {
          accounts: {
            type: "module",
            name: "accounts",
            entry: remoteEntry(env, "VITE_ACCOUNTS_REMOTE", "http://localhost:3001/remoteEntry.js"),
          },
          cards: {
            type: "module",
            name: "cards",
            entry: remoteEntry(env, "VITE_CARDS_REMOTE", "http://localhost:3002/remoteEntry.js"),
          },
          loans: {
            type: "module",
            name: "loans",
            entry: remoteEntry(env, "VITE_LOANS_REMOTE", "http://localhost:3003/remoteEntry.js"),
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
  };
});
