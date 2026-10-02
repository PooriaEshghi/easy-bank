import { useEffect, useState } from "react";
import type { AuthSession } from "@easybank/auth";
import { authClient } from "./session";

export function useAuth() {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<AuthSession>(authClient.getSession());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = authClient.subscribe(setSession);
    authClient
      .init()
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : "Keycloak non raggiungibile");
      })
      .finally(() => setReady(true));
    return unsubscribe;
  }, []);

  return { ready, session, error };
}
