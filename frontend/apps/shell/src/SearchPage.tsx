import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router";
import { isMobileNumber } from "./mobileNumber";

export function SearchPage() {
  const navigate = useNavigate();
  const [mobileNumber, setMobileNumber] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = mobileNumber.trim();
    if (!isMobileNumber(value)) {
      setError("Il cellulare deve avere 10 cifre.");
      return;
    }
    setError(null);
    navigate(`/clienti/${value}`);
  }

  return (
    <section className="panel" aria-label="Ricerca cliente">
      <h2>Ricerca cliente</h2>
      <form className="search-form" onSubmit={onSubmit}>
        <label>
          Cellulare
          <input
            name="mobileNumber"
            inputMode="numeric"
            autoComplete="off"
            maxLength={10}
            value={mobileNumber}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "mobile-error" : undefined}
            onChange={(event) => {
              setMobileNumber(event.target.value);
              setError(null);
            }}
          />
        </label>
        <button type="submit">Cerca</button>
      </form>
      {error ? (
        <p id="mobile-error" className="fallback" role="alert">
          {error}
        </p>
      ) : (
        <p>Inserisci le 10 cifre del cellulare.</p>
      )}
    </section>
  );
}
