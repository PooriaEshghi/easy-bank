/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_KEYCLOAK_URL: string;
  readonly VITE_KEYCLOAK_REALM: string;
  readonly VITE_KEYCLOAK_CLIENT_ID: string;
  readonly VITE_ACCOUNTS_REMOTE: string;
  readonly VITE_CARDS_REMOTE: string;
  readonly VITE_LOANS_REMOTE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
