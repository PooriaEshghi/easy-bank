import { Fragment, useEffect, useRef, useState } from "react";
import type { ApiResult } from "@easybank/api-client";
import type { ContactInfoDto } from "@easybank/contracts";
import { describeFailure } from "./apiMessage";
import { apiClient, authClient } from "./session";

type Props = {
  title: string;
  path: string;
};

export function ContactInfoPanel({ title, path }: Props) {
  const [result, setResult] = useState<ApiResult<ContactInfoDto> | null>(null);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const correlationId = useRef<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const requestCorrelationId = correlationId.current ?? crypto.randomUUID();
    correlationId.current = requestCorrelationId;
    let active = true;
    setLoading(true);
    setNetworkError(null);

    void (async () => {
      try {
        await authClient.refresh();
        const response = await apiClient.request<ContactInfoDto>(path, {
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
  }, [attempt, path]);

  return (
    <section className="panel" aria-label={title} aria-busy={loading}>
      <h2>{title}</h2>
      {loading ? <p>Lettura in corso…</p> : null}
      {networkError ? (
        <>
          <p className="fallback" role="alert">
            {networkError}
          </p>
          {correlationId.current ? (
            <p>
              <span className="label">eazybank-correlation-id</span> {correlationId.current}
            </p>
          ) : null}
        </>
      ) : null}
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
      {result.ok && result.data ? <ContactBody info={result.data} /> : null}
      {result.ok && !result.data ? <p>Nessun contatto.</p> : null}
      {!result.ok ? (
        <p className="fallback" role="alert">
          {describeFailure(result.status, result.failure)}
        </p>
      ) : null}
    </>
  );
}

function ContactBody({ info }: { info: ContactInfoDto }) {
  const details = info.contactDetails ? Object.entries(info.contactDetails) : [];
  return (
    <>
      {info.message ? <p>{info.message}</p> : <p>Nessun messaggio.</p>}
      {details.length > 0 ? (
        <dl className="facts">
          {details.map(([key, value]) => (
            <Fragment key={key}>
              <dt>{key}</dt>
              <dd>{value}</dd>
            </Fragment>
          ))}
        </dl>
      ) : (
        <p>Nessun recapito.</p>
      )}
      {info.onCallSupport && info.onCallSupport.length > 0 ? (
        <ul>
          {info.onCallSupport.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p>Nessuna reperibilità.</p>
      )}
    </>
  );
}
