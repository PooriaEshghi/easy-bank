import Keycloak from "keycloak-js";

export type AuthSession = {
  authenticated: boolean;
  username: string | null;
  roles: readonly string[];
  accessToken: string | null;
};

export type AuthClient = {
  init: () => Promise<AuthSession>;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<AuthSession>;
  getSession: () => AuthSession;
  subscribe: (listener: (session: AuthSession) => void) => () => void;
};

const anonymousSession: AuthSession = {
  authenticated: false,
  username: null,
  roles: [],
  accessToken: null,
};

type TokenPayload = {
  preferred_username?: string;
  realm_access?: { roles?: string[] };
};

export function createAuthClient(config: {
  url: string;
  realm: string;
  clientId: string;
  redirectUri: string;
  silentCheckSsoRedirectUri: string;
}): AuthClient {
  const keycloak = new Keycloak({
    url: config.url,
    realm: config.realm,
    clientId: config.clientId,
  });
  const listeners = new Set<(session: AuthSession) => void>();
  let session = anonymousSession;
  let initPromise: Promise<AuthSession> | null = null;

  const publish = (next: AuthSession) => {
    session = next;
    for (const listener of listeners) {
      listener(session);
    }
  };

  const readSession = (): AuthSession => {
    if (!keycloak.authenticated || !keycloak.token) {
      return anonymousSession;
    }
    const parsed = keycloak.tokenParsed as TokenPayload | undefined;
    return {
      authenticated: true,
      username: parsed?.preferred_username ?? null,
      roles: parsed?.realm_access?.roles ?? [],
      accessToken: keycloak.token,
    };
  };

  keycloak.onAuthSuccess = () => publish(readSession());
  keycloak.onAuthRefreshSuccess = () => publish(readSession());
  keycloak.onAuthLogout = () => publish(anonymousSession);
  keycloak.onTokenExpired = () => {
    void keycloak.updateToken(30).then(() => publish(readSession())).catch(() => publish(anonymousSession));
  };

  return {
    init() {
      initPromise ??= keycloak
        .init({
          onLoad: "check-sso",
          pkceMethod: "S256",
          redirectUri: config.redirectUri,
          silentCheckSsoRedirectUri: config.silentCheckSsoRedirectUri,
          checkLoginIframe: false,
        })
        .then(() => {
          const next = readSession();
          publish(next);
          return next;
        });
      return initPromise;
    },
    async login() {
      await keycloak.login({ redirectUri: config.redirectUri });
    },
    async logout() {
      await keycloak.logout({ redirectUri: config.redirectUri });
    },
    async refresh() {
      if (!keycloak.authenticated) {
        publish(anonymousSession);
        return anonymousSession;
      }
      await keycloak.updateToken(30);
      const next = readSession();
      publish(next);
      return next;
    },
    getSession: () => session,
    subscribe(listener) {
      listeners.add(listener);
      listener(session);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
