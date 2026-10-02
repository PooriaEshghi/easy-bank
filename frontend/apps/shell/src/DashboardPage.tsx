import { lazy, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import type { ApiResult } from "@easybank/api-client";
import type { AccountsDto, CardsDto, CustomerDetailsDto, LoansDto } from "@easybank/contracts";
import { describeFailure } from "./apiMessage";
import { isMobileNumber } from "./mobileNumber";
import { RemotePanel } from "./RemotePanel";
import { apiClient, authClient } from "./session";
import { useAuth } from "./useAuth";

const AccountsRemote = lazy(() => import("accounts/App"));
const CardsRemote = lazy(() => import("cards/App"));
const LoansRemote = lazy(() => import("loans/App"));

export function DashboardPage() {
  const navigate = useNavigate();
  const { ready, session } = useAuth();
  const { mobileNumber = "" } = useParams();
  const valid = isMobileNumber(mobileNumber);
  const [result, setResult] = useState<ApiResult<CustomerDetailsDto> | null>(null);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [loading, setLoading] = useState(valid);
  const [attempt, setAttempt] = useState(0);
  const correlationId = useRef<string | null>(null);
  const mobileRef = useRef(mobileNumber);

  if (mobileRef.current !== mobileNumber) {
    mobileRef.current = mobileNumber;
    correlationId.current = null;
  }

  useEffect(() => {
    if (!valid) {
      return;
    }
    const controller = new AbortController();
    const requestCorrelationId = correlationId.current ?? crypto.randomUUID();
    correlationId.current = requestCorrelationId;
    let active = true;
    setLoading(true);
    setResult(null);
    setNetworkError(null);

    void (async () => {
      try {
        await authClient.refresh();
        const response = await apiClient.request<CustomerDetailsDto>(
          `/eazybank/accounts/api/fetchCustomerDetails?mobileNumber=${encodeURIComponent(mobileNumber)}`,
          { correlationId: requestCorrelationId, signal: controller.signal },
        );
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
  }, [attempt, mobileNumber, valid]);

  if (!valid) {
    return (
      <section className="panel" aria-label="Cliente">
        <h2>Cliente</h2>
        <p className="fallback" role="alert">
          Il cellulare deve avere 10 cifre.
        </p>
        <p>
          <Link to="/">Torna alla ricerca</Link>
        </p>
      </section>
    );
  }

  const notFound = result != null && !result.ok && result.status === 404;
  const failed = networkError != null || (result != null && !result.ok && !notFound);

  return (
    <>
      <section className="panel" aria-label="Cliente" aria-busy={loading}>
        <h2>Cliente {mobileNumber}</h2>
        {loading ? <p>Lettura in corso…</p> : null}
        {notFound && result ? (
          <>
            <p className="fallback" role="status">
              Cliente non trovato.
            </p>
            <p>
              <span className="label">eazybank-correlation-id</span> {result.correlationId}
            </p>
            <p className="actions">
              <Link to="/">Torna alla ricerca</Link>
              <Link to="/clienti/nuovo">Nuovo cliente</Link>
            </p>
          </>
        ) : null}
        {failed ? (
          <FailurePanel
            message={
              networkError ??
              (result && !result.ok ? describeFailure(result.status, result.failure) : "Gateway non raggiungibile")
            }
            correlationId={result?.correlationId ?? correlationId.current ?? ""}
            loading={loading}
            onRetry={() => setAttempt((value) => value + 1)}
          />
        ) : null}
        {result?.ok && result.data ? (
          <CustomerIdentity customer={result.data} correlationId={result.correlationId} />
        ) : null}
      </section>
      {result?.ok && result.data ? (
        <>
          <div className="grid">
            <AccountCard account={result.data.accountsDto} />
            <CardCard card={result.data.cardsDto} />
            <LoanCard loan={result.data.loansDto} />
          </div>
          <ProductRemotes
            mobileNumber={mobileNumber}
            roles={session.roles}
            authReady={ready}
            onDeleted={() => navigate("/")}
            onUpdated={() => {
              correlationId.current = null;
              setAttempt((value) => value + 1);
            }}
          />
        </>
      ) : null}
    </>
  );
}

function FailurePanel({
  message,
  correlationId,
  loading,
  onRetry,
}: {
  message: string;
  correlationId: string;
  loading: boolean;
  onRetry: () => void;
}) {
  return (
    <>
      <p className="fallback" role="alert">
        {message}
      </p>
      <p>
        <span className="label">eazybank-correlation-id</span> {correlationId}
      </p>
      <button type="button" onClick={onRetry} disabled={loading}>
        Riprova
      </button>
    </>
  );
}

function CustomerIdentity({ customer, correlationId }: { customer: CustomerDetailsDto; correlationId: string }) {
  return (
    <>
      <p>
        <span className="label">Nome</span> {customer.name}
      </p>
      <p>
        <span className="label">Email</span> {customer.email}
      </p>
      <p>
        <span className="label">Cellulare</span> {customer.mobileNumber}
      </p>
      <p>
        <span className="label">eazybank-correlation-id</span> {correlationId}
      </p>
    </>
  );
}

function AccountCard({ account }: { account: AccountsDto | null | undefined }) {
  return (
    <section className="panel" aria-label="Conto">
      <h2>Conto</h2>
      {account ? (
        <dl className="facts">
          <dt>Numero</dt>
          <dd>{account.accountNumber}</dd>
          <dt>Tipo</dt>
          <dd>{account.accountType}</dd>
          <dt>Filiale</dt>
          <dd>{account.branchAddress}</dd>
        </dl>
      ) : (
        <>
          <p>Conto assente.</p>
          <p>
            <Link to="/clienti/nuovo">Crea</Link>
          </p>
        </>
      )}
    </section>
  );
}

function CardCard({ card }: { card: CardsDto | null | undefined }) {
  return (
    <section className="panel" aria-label="Carta">
      <h2>Carta</h2>
      {card ? (
        <dl className="facts">
          <dt>Numero</dt>
          <dd>{card.cardNumber}</dd>
          <dt>Tipo</dt>
          <dd>{card.cardType}</dd>
          <dt>Plafond</dt>
          <dd>{card.totalLimit}</dd>
          <dt>Utilizzato</dt>
          <dd>{card.amountUsed}</dd>
          <dt>Disponibile</dt>
          <dd>{card.availableAmount}</dd>
        </dl>
      ) : (
        <>
          <p>Carta assente.</p>
          <p>
            <a href="#remote-cards">Crea</a>
          </p>
        </>
      )}
    </section>
  );
}

function LoanCard({ loan }: { loan: LoansDto | null | undefined }) {
  return (
    <section className="panel" aria-label="Prestito">
      <h2>Prestito</h2>
      {loan ? (
        <dl className="facts">
          <dt>Numero</dt>
          <dd>{loan.loanNumber}</dd>
          <dt>Tipo</dt>
          <dd>{loan.loanType}</dd>
          <dt>Importo</dt>
          <dd>{loan.totalLoan}</dd>
          <dt>Pagato</dt>
          <dd>{loan.amountPaid}</dd>
          <dt>Residuo</dt>
          <dd>{loan.outstandingAmount}</dd>
        </dl>
      ) : (
        <>
          <p>Prestito assente.</p>
          <p>
            <a href="#remote-loans">Crea</a>
          </p>
        </>
      )}
    </section>
  );
}

function ProductRemotes({
  mobileNumber,
  roles,
  authReady,
  onDeleted,
  onUpdated,
}: {
  mobileNumber: string;
  roles: readonly string[];
  authReady: boolean;
  onDeleted: () => void;
  onUpdated: () => void;
}) {
  return (
    <div className="grid">
      <div id="remote-accounts">
        <RemotePanel title="accounts">
          <AccountsRemote
            mode="view"
            mobileNumber={mobileNumber}
            roles={roles}
            authReady={authReady}
            getAccessToken={() => authClient.getSession().accessToken ?? undefined}
            refreshSession={() => authClient.refresh()}
            onDeleted={onDeleted}
            onUpdated={onUpdated}
          />
        </RemotePanel>
      </div>
      <div id="remote-cards">
        <RemotePanel title="cards">
          <CardsRemote />
        </RemotePanel>
      </div>
      <div id="remote-loans">
        <RemotePanel title="loans">
          <LoansRemote />
        </RemotePanel>
      </div>
    </div>
  );
}
