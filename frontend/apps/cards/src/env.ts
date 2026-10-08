function readEnv(name: keyof ImportMetaEnv, fallback: string): string {
  const value = import.meta.env[name];
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

export const apiBaseUrl = readEnv("VITE_API_BASE_URL", "http://localhost:8072");
