import { useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createApiClient, describeStatus, type ApiClient, type ApiResult } from "@easybank/api-client";
import type { CardsDto, ResponseDto } from "@easybank/contracts";
import { apiBaseUrl } from "./env";
import { describeResult, validationFields } from "./failure";
import { coherentAvailable, validateCardAmounts } from "./validate";
import "./styles.css";

const CARDS_ROLE = "CARDS";

export type CardsRemoteProps = {
  mobileNumber?: string;
  roles?: readonly string[];
  authReady?: boolean;
  getAccessToken?: () => string | undefined;
  refreshSession?: () => Promise<unknown>;
  onUpdated?: () => void;
  onDeleted?: () => void;
};

export default function CardsApp(props: CardsRemoteProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <CardsScreen {...props} />
    </QueryClientProvider>
  );
}

function CardsScreen(props: CardsRemoteProps) {
  const tokenRef = useRef(props.getAccessToken);
  const refreshRef = useRef(props.refreshSession);
  tokenRef.current = props.getAccessToken;
  refreshRef.current = props.refreshSession;
  const [client] = useState(() =>
    createApiClient({
      baseUrl: apiBaseUrl,
      getAccessToken: () => tokenRef.current?.(),
    }),
  );
  const [standaloneMobile, setStandaloneMobile] = useState("");
  const embedded = props.mobileNumber != null;
  const mobileNumber = props.mobileNumber ?? standaloneMobile;
  const canWrite = (props.roles ?? []).includes(CARDS_ROLE);
  const authReady = props.authReady ?? true;

  if (!embedded && !/^[0-9]{10}$/.test(mobileNumber)) {
    return <StandaloneMobile value={standaloneMobile} onChange={setStandaloneMobile} />;
  }

  return (
    <CardPanel
      client={client}
      mobileNumber={mobileNumber}
      canWrite={canWrite}
      authReady={authReady}
      refresh={() => refreshRef.current?.()}
      onUpdated={props.onUpdated}
      onDeleted={props.onDeleted}
    />
  );
}

function StandaloneMobile({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^[0-9]{10}$/.test(value.trim())) {
      setError("Il cellulare deve avere 10 cifre.");
      return;
    }
    setError(null);
    onChange(value.trim());
  }

  return (
    <form className="product-form" onSubmit={onSubmit} noValidate>
      <h2>Carta</h2>
      <Field
        label="Cellulare"
        name="mobileNumber"
        inputMode="numeric"
        maxLength={10}
        value={value}
        error={error ?? undefined}
        onChange={(next) => {
          onChange(next);
          setError(null);
        }}
      />
      <div className="product-actions">
        <button type="submit">Apri</button>
      </div>
    </form>
  );
}

function CardPanel({
  client,
  mobileNumber,
  canWrite,
  authReady,
  refresh,
  onUpdated,
  onDeleted,
}: {
  client: ApiClient;
  mobileNumber: string;
  canWrite: boolean;
  authReady: boolean;
  refresh: () => Promise<unknown> | undefined;
  onUpdated?: () => void;
  onDeleted?: () => void;
}) {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<ResponseDto | null>(null);
  const valid = /^[0-9]{10}$/.test(mobileNumber);
  const query = useQuery({
    queryKey: ["cards", mobileNumber],
    enabled: valid,
    queryFn: async ({ signal }) => {
      await refresh();
      return client.request<CardsDto>(`/eazybank/cards/api/fetch?mobileNumber=${encodeURIComponent(mobileNumber)}`, {
        signal,
      });
    },
  });

  function reload() {
    void queryClient.invalidateQueries({ queryKey: ["cards", mobileNumber] });
  }

  if (!valid) {
    return (
      <form className="product-form">
        <h2>Carta</h2>
        <p className="fallback" role="alert">
          Il cellulare deve avere 10 cifre.
        </p>
      </form>
    );
  }

  if (query.isPending) {
    return (
      <form className="product-form">
        <h2>Carta</h2>
        <p>Lettura in corso…</p>
      </form>
    );
  }

  if (query.isError) {
    return (
      <form className="product-form">
        <h2>Carta</h2>
        <p className="fallback" role="alert">
          {query.error instanceof Error ? query.error.message : "Gateway non raggiungibile"}
        </p>
        <button type="button" onClick={() => void query.refetch()}>
          Riprova
        </button>
      </form>
    );
  }

  const result = query.data;
  const absent = result != null && !result.ok && result.status === 404;
  if (absent && result) {
    return (
      <CardCreate
        client={client}
        mobileNumber={mobileNumber}
        correlationId={result.correlationId}
        canWrite={canWrite}
        authReady={authReady}
        refresh={refresh}
        notice={notice}
        onCreated={(created) => {
          setNotice(created);
          reload();
          onUpdated?.();
        }}
      />
    );
  }

  if (!result || !result.ok || !result.data) {
    return (
      <form className="product-form">
        <h2>Carta</h2>
        <p className="fallback" role="alert">
          {result ? describeResult(result) : "Risposta vuota"}
        </p>
        {result ? (
          <p>
            <span className="label">eazybank-correlation-id</span> {result.correlationId}
          </p>
        ) : null}
        <button type="button" onClick={() => void query.refetch()}>
          Riprova
        </button>
      </form>
    );
  }

  return (
    <CardEditor
      client={client}
      card={result.data}
      correlationId={result.correlationId}
      canWrite={canWrite}
      authReady={authReady}
      refresh={refresh}
      notice={notice}
      onUpdated={() => {
        reload();
        onUpdated?.();
      }}
      onDeleted={(deleted) => {
        setNotice(deleted);
        reload();
        onDeleted?.();
      }}
    />
  );
}

function CardCreate({
  client,
  mobileNumber,
  correlationId,
  canWrite,
  authReady,
  refresh,
  notice,
  onCreated,
}: {
  client: ApiClient;
  mobileNumber: string;
  correlationId: string;
  canWrite: boolean;
  authReady: boolean;
  refresh: () => Promise<unknown> | undefined;
  notice: ResponseDto | null;
  onCreated: (notice: ResponseDto) => void;
}) {
  const [networkError, setNetworkError] = useState<string | null>(null);
  const actionCorrelationId = useRef<string | null>(null);
  const create = useMutation({
    mutationFn: async () => {
      await refresh();
      return client.request<ResponseDto>(
        `/eazybank/cards/api/create?mobileNumber=${encodeURIComponent(mobileNumber)}`,
        { method: "POST", correlationId: actionCorrelationId.current ?? undefined },
      );
    },
    onSuccess: (result) => {
      if (result.ok && result.data) {
        onCreated(result.data);
      }
    },
  });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    actionCorrelationId.current ??= crypto.randomUUID();
    try {
      setNetworkError(null);
      await create.mutateAsync();
    } catch (caught) {
      setNetworkError(caught instanceof Error ? caught.message : "Gateway non raggiungibile");
    }
  }

  return (
    <form className="product-form" onSubmit={(event) => void onSubmit(event)}>
      <h2>Carta</h2>
      <p>Carta assente.</p>
      <p>
        <span className="label">Cellulare</span> {mobileNumber}
      </p>
      <p>
        <span className="label">eazybank-correlation-id</span> {create.data?.correlationId ?? correlationId}
      </p>
      {notice ? <p role="status">{describeStatus(notice)}</p> : null}
      <WriteNotice authReady={authReady} canWrite={canWrite} action="creare una carta" />
      {canWrite ? (
        <div className="product-actions">
          <button type="submit" disabled={create.isPending}>
            Crea carta
          </button>
        </div>
      ) : null}
      <ResultLine result={create.data} networkError={networkError} correlationId={actionCorrelationId.current} />
    </form>
  );
}

function CardEditor({
  client,
  card,
  correlationId,
  canWrite,
  authReady,
  refresh,
  notice,
  onUpdated,
  onDeleted,
}: {
  client: ApiClient;
  card: CardsDto;
  correlationId: string;
  canWrite: boolean;
  authReady: boolean;
  refresh: () => Promise<unknown> | undefined;
  notice: ResponseDto | null;
  onUpdated: () => void;
  onDeleted: (notice: ResponseDto) => void;
}) {
  const [totalLimit, setTotalLimit] = useState(String(card.totalLimit));
  const [amountUsed, setAmountUsed] = useState(String(card.amountUsed));
  const [availableAmount, setAvailableAmount] = useState(String(card.availableAmount));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<ApiResult<ResponseDto> | null>(null);
  const actionCorrelationId = useRef<string | null>(null);

  const update = useMutation({
    mutationFn: async (body: CardsDto) => {
      await refresh();
      return client.request<ResponseDto>("/eazybank/cards/api/update", {
        method: "PUT",
        body,
        correlationId: actionCorrelationId.current ?? undefined,
      });
    },
    onSuccess: (result) => {
      setActionResult(result);
      if (result.ok) {
        onUpdated();
      }
    },
  });

  const remove = useMutation({
    mutationFn: async () => {
      await refresh();
      return client.request<ResponseDto>(
        `/eazybank/cards/api/delete?mobileNumber=${encodeURIComponent(card.mobileNumber)}`,
        { method: "DELETE", correlationId: actionCorrelationId.current ?? undefined },
      );
    },
    onSuccess: (result) => {
      setActionResult(result);
      if (result.ok && result.data) {
        onDeleted(result.data);
      }
    },
  });

  function resetAction() {
    actionCorrelationId.current = null;
    setNetworkError(null);
    setActionResult(null);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors = validateCardAmounts({ totalLimit, amountUsed, availableAmount });
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }
    actionCorrelationId.current ??= crypto.randomUUID();
    const body: CardsDto = {
      mobileNumber: card.mobileNumber,
      cardNumber: card.cardNumber,
      cardType: card.cardType,
      totalLimit: Number(totalLimit.trim()),
      amountUsed: Number(amountUsed.trim()),
      availableAmount: Number(availableAmount.trim()),
    };
    try {
      setNetworkError(null);
      await update.mutateAsync(body);
    } catch (caught) {
      setNetworkError(caught instanceof Error ? caught.message : "Gateway non raggiungibile");
    }
  }

  async function onConfirmDelete() {
    actionCorrelationId.current ??= crypto.randomUUID();
    try {
      setNetworkError(null);
      await remove.mutateAsync();
    } catch (caught) {
      setNetworkError(caught instanceof Error ? caught.message : "Gateway non raggiungibile");
    }
  }

  const serverFields = actionResult ? validationFields(actionResult) : {};
  const pending = update.isPending || remove.isPending;

  return (
    <form className="product-form" onSubmit={(event) => void onSubmit(event)} noValidate>
      <h2>Carta</h2>
      <p>
        <span className="label">eazybank-correlation-id</span> {actionResult?.correlationId ?? correlationId}
      </p>
      <Field label="Cellulare" name="mobileNumber" value={card.mobileNumber} readOnly />
      <Field label="Numero" name="cardNumber" value={card.cardNumber} readOnly />
      <Field label="Tipo" name="cardType" value={card.cardType} readOnly />
      <Field
        label="Plafond"
        name="totalLimit"
        inputMode="numeric"
        value={totalLimit}
        readOnly={!canWrite}
        error={fieldErrors.totalLimit ?? serverFields.totalLimit}
        onChange={(value) => {
          setTotalLimit(value);
          const next = coherentAvailable(value, amountUsed);
          if (next != null) {
            setAvailableAmount(next);
          }
          resetAction();
        }}
      />
      <Field
        label="Utilizzato"
        name="amountUsed"
        inputMode="numeric"
        value={amountUsed}
        readOnly={!canWrite}
        error={fieldErrors.amountUsed ?? serverFields.amountUsed}
        onChange={(value) => {
          setAmountUsed(value);
          const next = coherentAvailable(totalLimit, value);
          if (next != null) {
            setAvailableAmount(next);
          }
          resetAction();
        }}
      />
      <Field
        label="Disponibile"
        name="availableAmount"
        inputMode="numeric"
        value={availableAmount}
        readOnly={!canWrite}
        error={fieldErrors.availableAmount ?? serverFields.availableAmount}
        onChange={(value) => {
          setAvailableAmount(value);
          resetAction();
        }}
      />
      {canWrite ? <p className="hint">Il disponibile deve essere il plafond meno l'utilizzato.</p> : null}
      {!actionResult && notice ? <p role="status">{describeStatus(notice)}</p> : null}
      <WriteNotice authReady={authReady} canWrite={canWrite} action="modificare o eliminare la carta" />
      {canWrite ? (
        <div className="product-actions">
          <button type="submit" disabled={pending}>
            Salva
          </button>
          {confirmingDelete ? (
            <>
              <button type="button" className="button-danger" disabled={pending} onClick={() => void onConfirmDelete()}>
                Conferma eliminazione
              </button>
              <button type="button" className="button-quiet" disabled={pending} onClick={() => setConfirmingDelete(false)}>
                Annulla
              </button>
            </>
          ) : (
            <button type="button" className="button-danger" disabled={pending} onClick={() => setConfirmingDelete(true)}>
              Elimina
            </button>
          )}
        </div>
      ) : null}
      {confirmingDelete ? <p>Confermi l'eliminazione di questa carta?</p> : null}
      <ResultLine result={actionResult} networkError={networkError} correlationId={actionCorrelationId.current} />
    </form>
  );
}

function Field({
  label,
  name,
  value,
  error,
  readOnly,
  inputMode,
  maxLength,
  onChange,
}: {
  label: string;
  name: string;
  value: string;
  error?: string;
  readOnly?: boolean;
  inputMode?: "numeric" | "text";
  maxLength?: number;
  onChange?: (value: string) => void;
}) {
  const errorId = error ? `${name}-error` : undefined;
  return (
    <label>
      {label}
      <input
        name={name}
        inputMode={inputMode}
        maxLength={maxLength}
        value={value}
        readOnly={readOnly}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
      />
      {error ? (
        <span id={errorId} className="field-error" role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}

function WriteNotice({ authReady, canWrite, action }: { authReady: boolean; canWrite: boolean; action: string }) {
  if (!authReady) {
    return <p>Connessione a Keycloak…</p>;
  }
  if (!canWrite) {
    return <p>Per {action} serve il ruolo CARDS.</p>;
  }
  return null;
}

function ResultLine({
  result,
  networkError,
  correlationId,
}: {
  result: ApiResult<ResponseDto> | undefined | null;
  networkError: string | null;
  correlationId: string | null;
}) {
  if (networkError) {
    return (
      <>
        <p className="fallback" role="alert">
          {networkError}
        </p>
        {correlationId ? (
          <p>
            <span className="label">eazybank-correlation-id</span> {correlationId}
          </p>
        ) : null}
      </>
    );
  }
  if (!result || result.ok) {
    if (result?.ok && result.data) {
      return <p role="status">{describeStatus(result.data)}</p>;
    }
    return null;
  }
  return (
    <>
      <p className="fallback" role="alert">
        {describeResult(result)}
      </p>
      {result.failure.kind === "validation" ? (
        <ul>
          {Object.entries(result.failure.body).map(([field, message]) => (
            <li key={field}>
              {field}: {message}
            </li>
          ))}
        </ul>
      ) : null}
      <p>
        <span className="label">eazybank-correlation-id</span> {result.correlationId}
      </p>
    </>
  );
}
