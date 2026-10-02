import { createApiClient } from "@easybank/api-client";
import { createAuthClient } from "@easybank/auth";
import { apiBaseUrl, keycloakClientId, keycloakRealm, keycloakUrl } from "./env";

export const authClient = createAuthClient({
  url: keycloakUrl,
  realm: keycloakRealm,
  clientId: keycloakClientId,
  redirectUri: `${window.location.origin}/`,
  silentCheckSsoRedirectUri: `${window.location.origin}/silent-check-sso.html`,
});

export const apiClient = createApiClient({
  baseUrl: apiBaseUrl,
  getAccessToken: () => authClient.getSession().accessToken ?? undefined,
});
