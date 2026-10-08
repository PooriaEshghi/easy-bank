import { Link, Route, Routes } from "react-router";
import { ContactsPage } from "./ContactsPage";
import { DashboardPage } from "./DashboardPage";
import { NewCustomerPage } from "./NewCustomerPage";
import { SearchPage } from "./SearchPage";
import { authClient } from "./session";
import { useAuth } from "./useAuth";

export default function App() {
  const { ready, session, error } = useAuth();

  return (
    <>
      <header className="header-bar">
        <div className="header-title">
          <h1>
            <Link to="/">Easy Bank</Link>
          </h1>
          <nav className="header-nav" aria-label="Pagine">
            <Link to="/">Ricerca</Link>
            <Link to="/clienti/nuovo">Nuovo cliente</Link>
            <Link to="/contatti">Contatti</Link>
          </nav>
        </div>
        <div className="session">
          {error ? <span className="header-error">{error}</span> : null}
          {session.authenticated ? (
            <>
              <span>{session.username ?? "Utente"}</span>
              <span className="roles">{session.roles.join(", ")}</span>
              <button type="button" onClick={() => void authClient.logout()}>
                Esci
              </button>
            </>
          ) : (
            <button type="button" onClick={() => void authClient.login()} disabled={!ready}>
              Entra
            </button>
          )}
        </div>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<SearchPage />} />
          <Route path="/contatti" element={<ContactsPage />} />
          <Route path="/clienti/nuovo" element={<NewCustomerPage />} />
          <Route path="/clienti/:mobileNumber" element={<DashboardPage />} />
          <Route
            path="*"
            element={
              <section className="panel" aria-label="Pagina non trovata">
                <h2>Pagina non trovata</h2>
                <p>
                  <Link to="/">Torna alla ricerca</Link>
                </p>
              </section>
            }
          />
        </Routes>
      </main>
    </>
  );
}
