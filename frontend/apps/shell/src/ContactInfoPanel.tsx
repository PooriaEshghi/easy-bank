import { useEffect, useRef, useState } from "react";
import type { ApiResult } from "@easybank/api-client";
import type { ContactInfoDto } from "@easybank/contracts";
import { describeFailure } from "./apiMessage";
import { apiClient, authClient } from "./session";

type Props = {
  ready: boolean;
  authenticated: boolean;
};

export function ContactInfoPanel({ ready, authenticated }: Props) {
  const [result, setResult] = useState<ApiResult<ContactInfoDto> | null>(null);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const correlationId = useRef<string | null>(null);

  useEffect(() => {
    if (!ready || !authenticated) {
      correlationId.current = null;
      return;
    }
    const controller = new AbortController();
    const requestCorrelationId = correlationId.current ?? crypto.randomUUID();
    correlationId.current = requestCorrelationId;
    let active = true;
    setLoading(true);
    setNetworkError(null);

    void (async () => {
      try {
        await authClient.refresh();
        const response = await apiClient.request<ContactInfoDto>("/eazybank/accounts/api/contact-info", {
          correlationId: requestCorrelationId,
          signal: controller.signal,
        });
        if (active) {
          setResult(response);
        }
      } catch (caught) {
        if (!active || (caught instanceof DOMException && caught.name === "AbortError")) {
          return;
        }
        setResult(null);
        setNetworkError(caught instanceof Error ? caught.message : "Gateway non raggiungibile");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
      controller.abort();
    };
  }, [attempt, authenticated, ready]);

  if (!ready) {
    return (
      <section className="panel" aria-label="Contatti accounts">
        <h2>Contatti accounts</h2>
        <p>Connessione a Keycloak…</p>
      </section>
    );
  }

  if (!authenticated) {
    return (
      <section className="panel" aria-label="Contatti accounts">
        <h2>Contatti accounts</h2>
        <p>Entra per leggere la configurazione dal gateway.</p>
      </section>
    );
  }

  return (
    <section className="panel" aria-label="Contatti accounts">
      <h2>Contatti accounts</h2>
      {loading ? <p>Lettura in corso…</p> : null}
      {networkError ? <p className="fallback">{networkError}</p> : null}
      {result ? <ContactResult result={result} /> : null}
      <button type="button" onClick={() => setAttempt((value) => value + 1)} disabled={loading}>
        Riprova
      </button>
    </section>
  );
}

function ContactResult({ result }: { result: ApiResult<ContactInfoDto> }) {
  return (
    <>
      <p>
        <span className="label">eazybank-correlation-id</span> {result.correlationId}
      </p>
      {result.ok ? (
        <pre>{JSON.stringify(result.data, null, 2)}</pre>
      ) : (
        <p className="fallback">{describeFailure(result.status, result.failure)}</p>
      )}
    </>
  );
}


