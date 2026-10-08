import { useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createApiClient, describeStatus, type ApiClient, type ApiResult } from "@easybank/api-client";
import type { CustomerDto, ResponseDto } from "@easybank/contracts";
import { apiBaseUrl } from "./env";
import { describeResult, validationFields } from "./failure";
import { validateBranch, validateCustomer } from "./validate";
import "./styles.css";

const ACCOUNTS_ROLE = "ACCOUNTS";

export type AccountsRemoteProps = {
  mode?: "create" | "view";
  mobileNumber?: string;
  roles?: readonly string[];
  authReady?: boolean;
  getAccessToken?: () => string | undefined;
  refreshSession?: () => Promise<unknown>;
  onCreated?: (mobileNumber: string) => void;
  onDeleted?: () => void;
  onUpdated?: () => void;
};

export default function AccountsApp(props: AccountsRemoteProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <AccountsScreen {...props} />
    </QueryClientProvider>
  );
}

function AccountsScreen(props: AccountsRemoteProps) {
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
  const canWrite = (props.roles ?? []).includes(ACCOUNTS_ROLE);
  const authReady = props.authReady ?? true;

  if ((props.mode ?? "create") === "view") {
    return (
      <CustomerView
        client={client}
        mobileNumber={props.mobileNumber ?? ""}
        canWrite={canWrite}
        authReady={authReady}
        refresh={() => refreshRef.current?.()}
        onDeleted={props.onDeleted}
        onUpdated={props.onUpdated}
      />
    );
  }

  return (
    <CustomerCreate
      client={client}
      canWrite={canWrite}
      authReady={authReady}
      refresh={() => refreshRef.current?.()}
      onCreated={props.onCreated}
    />
  );
}

function CustomerCreate({
  client,
  canWrite,
  authReady,
  refresh,
  onCreated,
}: {
  client: ApiClient;
  canWrite: boolean;
  authReady: boolean;
  refresh: () => Promise<unknown> | undefined;
  onCreated?: (mobileNumber: string) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [networkError, setNetworkError] = useState<string | null>(null);
  const correlationId = useRef<string | null>(null);

  const create = useMutation({
    mutationFn: async (body: CustomerDto) => {
      await refresh();
      const result = await client.request<ResponseDto>("/eazybank/accounts/api/create", {
        method: "POST",
        body,
        correlationId: correlationId.current ?? undefined,
      });
      return result;
    },
    onSuccess: (result, body) => {
      if (result.ok) {
        onCreated?.(body.mobileNumber);
      }
    },
  });

  function resetCorrelation() {
    correlationId.current = null;
    setNetworkError(null);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = { name, email, mobileNumber };
    const errors = validateCustomer(fields);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }
    correlationId.current ??= crypto.randomUUID();
    const body: CustomerDto = {
      name: name.trim(),
      email: email.trim(),
      mobileNumber: mobileNumber.trim(),
    };
    try {
      setNetworkError(null);
      await create.mutateAsync(body);
    } catch (caught) {
      setNetworkError(caught instanceof Error ? caught.message : "Gateway non raggiungibile");
    }
  }

  const result = create.data;
  const serverFields = result ? validationFields(result) : {};

  return (
    <form className="account-form" onSubmit={(event) => void onSubmit(event)} noValidate>
      <h2>Nuovo cliente</h2>
      <Field
        label="Nome"
        name="name"
        value={name}
        error={fieldErrors.name ?? serverFields.name}
        onChange={(value) => {
          setName(value);
          resetCorrelation();
        }}
      />
      <Field
        label="Email"
        name="email"
        type="email"
        value={email}
        error={fieldErrors.email ?? serverFields.email}
        onChange={(value) => {
          setEmail(value);
          resetCorrelation();
        }}
      />
      <Field
        label="Cellulare"
        name="mobileNumber"
        inputMode="numeric"
        maxLength={10}
        value={mobileNumber}
        error={fieldErrors.mobileNumber ?? serverFields.mobileNumber}
        onChange={(value) => {
          setMobileNumber(value);
          resetCorrelation();
        }}
      />
      <WriteNotice authReady={authReady} canWrite={canWrite} action="creare" />
      {canWrite ? (
        <div className="account-actions">
          <button type="submit" disabled={create.isPending}>
            Crea cliente
          </button>
        </div>
      ) : null}
      <ResultLine result={result} networkError={networkError} correlationId={correlationId.current} />
    </form>
  );
}

function CustomerView({
  client,
  mobileNumber,
  canWrite,
  authReady,
  refresh,
  onDeleted,
  onUpdated,
}: {
  client: ApiClient;
  mobileNumber: string;
  canWrite: boolean;
  authReady: boolean;
  refresh: () => Promise<unknown> | undefined;
  onDeleted?: () => void;
  onUpdated?: () => void;
}) {
  const queryClient = useQueryClient();
  const valid = /^[0-9]{10}$/.test(mobileNumber);
  const query = useQuery({
    queryKey: ["accounts", mobileNumber],
    enabled: valid,
    queryFn: async ({ signal }) => {
      await refresh();
      return client.request<CustomerDto>(
        `/eazybank/accounts/api/fetch?mobileNumber=${encodeURIComponent(mobileNumber)}`,
        { signal },
      );
    },
  });

  if (!valid) {
    return (
      <form className="account-form">
        <h2>Cliente</h2>
        <p className="fallback" role="alert">
          Il cellulare deve avere 10 cifre.
        </p>
      </form>
    );
  }

  if (query.isPending) {
    return (
      <form className="account-form">
        <h2>Cliente</h2>
        <p>Lettura in corso…</p>
      </form>
    );
  }

  if (query.isError) {
    return (
      <form className="account-form">
        <h2>Cliente</h2>
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
  if (!result || !result.ok || !result.data) {
    const notFound = result != null && !result.ok && result.status === 404;
    return (
      <form className="account-form">
        <h2>Cliente</h2>
        <p className="fallback" role={notFound ? "status" : "alert"}>
          {notFound ? "Cliente non trovato." : result ? describeResult(result) : "Risposta vuota"}
        </p>
        {result ? (
          <p>
            <span className="label">eazybank-correlation-id</span> {result.correlationId}
          </p>
        ) : null}
      </form>
    );
  }

  return (
    <CustomerEditor
      client={client}
      customer={result.data}
      correlationId={result.correlationId}
      canWrite={canWrite}
      authReady={authReady}
      refresh={refresh}
      onDeleted={onDeleted}
      onUpdated={() => {
        void queryClient.invalidateQueries({ queryKey: ["accounts", mobileNumber] });
        onUpdated?.();
      }}
    />
  );
}

function CustomerEditor({
  client,
  customer,
  correlationId,
  canWrite,
  authReady,
  refresh,
  onDeleted,
  onUpdated,
}: {
  client: ApiClient;
  customer: CustomerDto;
  correlationId: string;
  canWrite: boolean;
  authReady: boolean;
  refresh: () => Promise<unknown> | undefined;
  onDeleted?: () => void;
  onUpdated: () => void;
}) {
  const [name, setName] = useState(customer.name);
  const [email, setEmail] = useState(customer.email);
  const [branchAddress, setBranchAddress] = useState(customer.accountsDto?.branchAddress ?? "");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<ApiResult<ResponseDto> | null>(null);
  const actionCorrelationId = useRef<string | null>(null);
  const account = customer.accountsDto;

  const update = useMutation({
    mutationFn: async (body: CustomerDto) => {
      await refresh();
      return client.request<ResponseDto>("/eazybank/accounts/api/update", {
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
        `/eazybank/accounts/api/delete?mobileNumber=${encodeURIComponent(customer.mobileNumber)}`,
        { method: "DELETE", correlationId: actionCorrelationId.current ?? undefined },
      );
    },
    onSuccess: (result) => {
      setActionResult(result);
      if (result.ok) {
        onDeleted?.();
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
    if (!account) {
      return;
    }
    const errors = {
      ...validateCustomer({ name, email, mobileNumber: customer.mobileNumber }),
      ...validateBranch(branchAddress),
    };
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }
    actionCorrelationId.current ??= crypto.randomUUID();
    const body: CustomerDto = {
      name: name.trim(),
      email: email.trim(),
      mobileNumber: customer.mobileNumber,
      accountsDto: {
        accountNumber: account.accountNumber,
        accountType: account.accountType,
        branchAddress: branchAddress.trim(),
      },
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
    <form className="account-form" onSubmit={(event) => void onSubmit(event)} noValidate>
      <h2>Cliente</h2>
      <p>
        <span className="label">eazybank-correlation-id</span> {actionResult?.correlationId ?? correlationId}
      </p>
      <Field
        label="Nome"
        name="name"
        value={name}
        readOnly={!canWrite}
        error={fieldErrors.name ?? serverFields.name}
        onChange={(value) => {
          setName(value);
          resetAction();
        }}
      />
      <Field
        label="Email"
        name="email"
        type="email"
        value={email}
        readOnly={!canWrite}
        error={fieldErrors.email ?? serverFields.email}
        onChange={(value) => {
          setEmail(value);
          resetAction();
        }}
      />
      <Field label="Cellulare" name="mobileNumber" value={customer.mobileNumber} readOnly />
      <Field label="Numero conto" name="accountNumber" value={account ? String(account.accountNumber) : ""} readOnly />
      <Field label="Tipo" name="accountType" value={account?.accountType ?? ""} readOnly />
      <Field
        label="Filiale"
        name="branchAddress"
        value={branchAddress}
        readOnly={!canWrite}
        error={fieldErrors.branchAddress ?? serverFields.branchAddress}
        onChange={(value) => {
          setBranchAddress(value);
          resetAction();
        }}
      />
      <WriteNotice authReady={authReady} canWrite={canWrite} action="modificare o eliminare" />
      {canWrite ? (
        <div className="account-actions">
          <button type="submit" disabled={pending || !account}>
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
      {confirmingDelete ? <p>Confermi l'eliminazione di questo cliente e del suo conto?</p> : null}
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
  type,
  inputMode,
  maxLength,
  onChange,
}: {
  label: string;
  name: string;
  value: string;
  error?: string;
  readOnly?: boolean;
  type?: string;
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
        type={type}
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
    return <p>Per {action} un cliente serve il ruolo ACCOUNTS.</p>;
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
      return (
        <p role="status">{describeStatus(result.data)}</p>
      );
    }
    return null;
  }
  return (
    <>
      <p className="fallback" role="alert">
        {describeResult(result)}
      </p>
      <p>
        <span className="label">eazybank-correlation-id</span> {result.correlationId}
      </p>
    </>
  );
}
