import { Link, NavLink, Route, Routes } from "react-router";
import { apiBaseUrl, keycloakClientId, keycloakRealm, keycloakUrl } from "./env";

function EntraPage() {
  return (
    <section className="panel" aria-label="Entra">
      <h2>Entra</h2>
      <dl className="config">
        <div>
          <dt>Gateway</dt>
          <dd>{apiBaseUrl}</dd>
        </div>
        <div>
          <dt>Keycloak</dt>
          <dd>{keycloakUrl}</dd>
        </div>
        <div>
          <dt>Realm</dt>
          <dd>{keycloakRealm}</dd>
        </div>
        <div>
          <dt>Client</dt>
          <dd>{keycloakClientId}</dd>
        </div>
      </dl>
    </section>
  );
}

function Page({ title }: { title: string }) {
  return (
    <section className="panel" aria-label={title}>
      <h2>{title}</h2>
    </section>
  );
}

export default function App() {
  return (
    <>
      <header className="header-bar">
        <div className="header-title">
          <h1>
            <Link to="/">Area clienti</Link>
          </h1>
          <nav className="header-nav" aria-label="Pagine">
            <NavLink to="/" end>
              Entra
            </NavLink>
            <NavLink to="/home">Rapporto</NavLink>
            <NavLink to="/profilo">Profilo</NavLink>
            <NavLink to="/contatti">Contatti</NavLink>
          </nav>
        </div>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<EntraPage />} />
          <Route path="/home" element={<Page title="Rapporto" />} />
          <Route path="/profilo" element={<Page title="Profilo" />} />
          <Route path="/contatti" element={<Page title="Contatti" />} />
          <Route
            path="*"
            element={
              <section className="panel" aria-label="Pagina non trovata">
                <h2>Pagina non trovata</h2>
                <p>
                  <Link to="/">Torna a Entra</Link>
                </p>
              </section>
            }
          />
        </Routes>
      </main>
    </>
  );
}
