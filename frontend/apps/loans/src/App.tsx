import { useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createApiClient, describeStatus, type ApiClient, type ApiResult } from "@easybank/api-client";
import type { LoansDto, ResponseDto } from "@easybank/contracts";
import { apiBaseUrl } from "./env";
import { describeResult, validationFields } from "./failure";
import { coherentOutstanding, validateLoanAmounts } from "./validate";
import "./styles.css";

const LOANS_ROLE = "LOANS";

export type LoansRemoteProps = {
  mobileNumber?: string;
  roles?: readonly string[];
  authReady?: boolean;
  getAccessToken?: () => string | undefined;
  refreshSession?: () => Promise<unknown>;
  onUpdated?: () => void;
  onDeleted?: () => void;
};

export default function LoansApp(props: LoansRemoteProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <LoansScreen {...props} />
    </QueryClientProvider>
  );
}

function LoansScreen(props: LoansRemoteProps) {
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
  const canWrite = (props.roles ?? []).includes(LOANS_ROLE);
  const authReady = props.authReady ?? true;

  if (!embedded && !/^[0-9]{10}$/.test(mobileNumber)) {
    return <StandaloneMobile value={standaloneMobile} onChange={setStandaloneMobile} />;
  }

  return (
    <LoanPanel
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
      <h2>Prestito</h2>
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

function LoanPanel({
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
    queryKey: ["loans", mobileNumber],
    enabled: valid,
    queryFn: async ({ signal }) => {
      await refresh();
      return client.request<LoansDto>(`/eazybank/loans/api/fetch?mobileNumber=${encodeURIComponent(mobileNumber)}`, {
        signal,
      });
    },
  });

  function reload() {
    void queryClient.invalidateQueries({ queryKey: ["loans", mobileNumber] });
  }

  if (!valid) {
    return (
      <form className="product-form">
        <h2>Prestito</h2>
        <p className="fallback" role="alert">
          Il cellulare deve avere 10 cifre.
        </p>
      </form>
    );
  }

  if (query.isPending) {
    return (
      <form className="product-form">
        <h2>Prestito</h2>
        <p>Lettura in corso…</p>
      </form>
    );
  }

  if (query.isError) {
    return (
      <form className="product-form">
        <h2>Prestito</h2>
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
      <LoanCreate
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
        <h2>Prestito</h2>
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
    <LoanEditor
      client={client}
      loan={result.data}
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

function LoanCreate({
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
        `/eazybank/loans/api/create?mobileNumber=${encodeURIComponent(mobileNumber)}`,
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
      <h2>Prestito</h2>
      <p>Prestito assente.</p>
      <p>
        <span className="label">Cellulare</span> {mobileNumber}
      </p>
      <p>
        <span className="label">eazybank-correlation-id</span> {create.data?.correlationId ?? correlationId}
      </p>
      {notice ? <p role="status">{describeStatus(notice)}</p> : null}
      <WriteNotice authReady={authReady} canWrite={canWrite} action="creare un prestito" />
      {canWrite ? (
        <div className="product-actions">
          <button type="submit" disabled={create.isPending}>
            Crea prestito
          </button>
        </div>
      ) : null}
      <ResultLine result={create.data} networkError={networkError} correlationId={actionCorrelationId.current} />
    </form>
  );
}

function LoanEditor({
  client,
  loan,
  correlationId,
  canWrite,
  authReady,
  refresh,
  notice,
  onUpdated,
  onDeleted,
}: {
  client: ApiClient;
  loan: LoansDto;
  correlationId: string;
  canWrite: boolean;
  authReady: boolean;
  refresh: () => Promise<unknown> | undefined;
  notice: ResponseDto | null;
  onUpdated: () => void;
  onDeleted: (notice: ResponseDto) => void;
}) {
  const [totalLoan, setTotalLoan] = useState(String(loan.totalLoan));
  const [amountPaid, setAmountPaid] = useState(String(loan.amountPaid));
  const [outstandingAmount, setOutstandingAmount] = useState(String(loan.outstandingAmount));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<ApiResult<ResponseDto> | null>(null);
  const actionCorrelationId = useRef<string | null>(null);

  const update = useMutation({
    mutationFn: async (body: LoansDto) => {
      await refresh();
      return client.request<ResponseDto>("/eazybank/loans/api/update", {
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
        `/eazybank/loans/api/delete?mobileNumber=${encodeURIComponent(loan.mobileNumber)}`,
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
    const errors = validateLoanAmounts({ totalLoan, amountPaid, outstandingAmount });
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }
    actionCorrelationId.current ??= crypto.randomUUID();
    const body: LoansDto = {
      mobileNumber: loan.mobileNumber,
      loanNumber: loan.loanNumber,
      loanType: loan.loanType,
      totalLoan: Number(totalLoan.trim()),
      amountPaid: Number(amountPaid.trim()),
      outstandingAmount: Number(outstandingAmount.trim()),
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
      <h2>Prestito</h2>
      <p>
        <span className="label">eazybank-correlation-id</span> {actionResult?.correlationId ?? correlationId}
      </p>
      <Field label="Cellulare" name="mobileNumber" value={loan.mobileNumber} readOnly />
      <Field label="Numero" name="loanNumber" value={loan.loanNumber} readOnly />
      <Field label="Tipo" name="loanType" value={loan.loanType} readOnly />
      <Field
        label="Importo"
        name="totalLoan"
        inputMode="numeric"
        value={totalLoan}
        readOnly={!canWrite}
        error={fieldErrors.totalLoan ?? serverFields.totalLoan}
        onChange={(value) => {
          setTotalLoan(value);
          const next = coherentOutstanding(value, amountPaid);
          if (next != null) {
            setOutstandingAmount(next);
          }
          resetAction();
        }}
      />
      <Field
        label="Pagato"
        name="amountPaid"
        inputMode="numeric"
        value={amountPaid}
        readOnly={!canWrite}
        error={fieldErrors.amountPaid ?? serverFields.amountPaid}
        onChange={(value) => {
          setAmountPaid(value);
          const next = coherentOutstanding(totalLoan, value);
          if (next != null) {
            setOutstandingAmount(next);
          }
          resetAction();
        }}
      />
      <Field
        label="Residuo"
        name="outstandingAmount"
        inputMode="numeric"
        value={outstandingAmount}
        readOnly={!canWrite}
        error={fieldErrors.outstandingAmount ?? serverFields.outstandingAmount}
        onChange={(value) => {
          setOutstandingAmount(value);
          resetAction();
        }}
      />
      {canWrite ? <p className="hint">Il residuo deve essere l'importo meno il pagato.</p> : null}
      {!actionResult && notice ? <p role="status">{describeStatus(notice)}</p> : null}
      <WriteNotice authReady={authReady} canWrite={canWrite} action="modificare o eliminare il prestito" />
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
      {confirmingDelete ? <p>Confermi l'eliminazione di questo prestito?</p> : null}
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
    return <p>Per {action} serve il ruolo LOANS.</p>;
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
