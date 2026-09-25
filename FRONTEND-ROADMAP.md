# Roadmap frontend — React microfrontend per Easy Bank

Piano per costruire il frontend di Easy Bank come shell React che compone tre microfrontend, uno per ciascun microservizio di dominio già presente nel backend: **accounts**, **cards** e **loans**. Il browser parla solo con il **gatewayserver**. I servizi Spring restano indipendenti e non conoscono il frontend.

## Contesto backend da rispettare

| Servizio | Porta diretta | Percorso sul gateway (`8072`) |
| --- | --- | --- |
| configserver | 8071 | non esposto al browser |
| eurekaserver | 8070 | non esposto al browser |
| accounts | 8080 | `/eazybank/accounts/**` → `lb://ACCOUNTS` |
| loans | 8090 | `/eazybank/loans/**` → `lb://LOANS` |
| cards | 9000 | `/eazybank/cards/**` → `lb://CARDS` |
| gatewayserver | 8072 | unico entry point del frontend |
| Keycloak | 7080 | realm `master`, JWKS `http://localhost:7080/realms/master/protocol/openid-connect/certs` |

Il gateway riscrive il prefisso. Una chiamata a `GET /eazybank/accounts/api/fetch` arriva al servizio accounts come `GET /api/fetch`.

Sicurezza attuale in `SecurityConfig`:

- ogni `GET` è pubblico;
- `POST`, `PUT` e `DELETE` su `/eazybank/accounts/**` richiedono il realm role Keycloak `ACCOUNTS`;
- lo stesso vale per `CARDS` e `LOANS` sui rispettivi prefissi;
- `KeycloakRoleConverter` legge `realm_access.roles` e li espone come `ROLE_<nome>`.

Header di tracciamento: `eazybank-correlation-id`. `RequestTraceFilter` lo genera se manca. `GET /api/fetch` di loans e `GET /api/fetchCustomerDetails` di accounts lo dichiarano obbligatorio sul controller: il frontend lo invia comunque, così il trace resta stabile anche se il filtro cambia.

Risposte di successo delle mutazioni: `{ "statusCode": "201"|"200"|"417", "statusMsg": "..." }`. Gli errori di validazione e di business arrivano come `ErrorResponseDto` (`apiPath`, `errorCode`, `errorMessage`, `errorTime`).

Il gateway oggi non ha CORS. Va aggiunto prima che il browser su un'origine diversa da `8072` possa chiamare le API.

## Architettura frontend

Un host (**shell**) possiede layout, login, ricerca cliente e routing. Tre remote coprono il dominio dei tre microservizi. Un pacchetto condiviso tiene tipi, client HTTP e il piccolo bus di contesto. I remote non si importano tra loro.

```text
frontend/
  apps/
    shell/          host, porta 3000
    accounts/       remote, porta 3001
    cards/          remote, porta 3002
    loans/          remote, porta 3003
  packages/
    contracts/      tipi TypeScript allineati ai DTO Java
    api-client/     fetch verso il gateway, header, errori
    auth/           init Keycloak e lettura ruoli
    ui/             layout, form, stati vuoto/errore/loading
  package.json      workspace pnpm
  pnpm-workspace.yaml
```

Composizione con **Vite** e **Module Federation** (`@module-federation/vite`). La shell carica a runtime:

- `accounts/App`
- `cards/App`
- `loans/App`

Ogni remote riceve `mobileNumber` come prop. La fonte di verità del cliente selezionato è l'URL della shell, `/clienti/:mobileNumber`. Niente store globale condiviso tra i remote: ognuno chiede i propri dati al gateway. La dashboard aggregata usa l'endpoint già esistente `fetchCustomerDetails`, che sul backend compone account, carta e prestito.

Se un remote non si carica, la shell mostra un riquadro di fallback e il resto della pagina resta usabile. Lo stesso comportamento vale quando il circuit breaker del gateway (`accountCircuitBreaker`, `loanCircuitBreaker`, `cardCircuitBreaker`) risponde in errore.

## Contratti da modellare in `packages/contracts`

Validazioni da replicare nei form, uguali ai constraint Jakarta.

**Cliente** (`CustomerDto`), body di create/update accounts:

| Campo | Regola |
| --- | --- |
| `name` | obbligatorio, 5–30 caratteri |
| `email` | obbligatorio, email valida |
| `mobileNumber` | 10 cifre |
| `accountsDto` | presente in fetch e update; in create lo genera il server |

**Conto** (`AccountsDto`): `accountNumber` (10 cifre, `Long` nel JSON), `accountType` (il server crea `"Savings"`), `branchAddress`.

**Carta** (`CardsDto`): `mobileNumber` (10), `cardNumber` (12), `cardType` (il server crea `"Credit Card"`), `totalLimit` > 0, `amountUsed` ≥ 0, `availableAmount` ≥ 0.

**Prestito** (`LoansDto`): `mobileNumber` (10), `loanNumber` (12), `loanType` (il server crea `"Home Loan"`), `totalLoan` > 0, `amountPaid` ≥ 0, `outstandingAmount` ≥ 0.

**Dettaglio aggregato** (`CustomerDetailsDto`): i campi cliente più `accountsDto`, `loansDto`, `cardsDto`. I due ultimi possono mancare se il cliente non ha ancora carta o prestito.

### API usate dal frontend

Base URL di sviluppo: `http://localhost:8072`.

| Azione | Metodo e path | Auth | Note |
| --- | --- | --- | --- |
| Crea cliente e conto | `POST /eazybank/accounts/api/create` | ruolo `ACCOUNTS` | body `CustomerDto`, risposta 201 |
| Leggi cliente e conto | `GET /eazybank/accounts/api/fetch?mobileNumber=` | pubblica | |
| Aggiorna cliente e conto | `PUT /eazybank/accounts/api/update` | `ACCOUNTS` | body `CustomerDto` |
| Elimina cliente e conto | `DELETE /eazybank/accounts/api/delete?mobileNumber=` | `ACCOUNTS` | |
| Dashboard | `GET /eazybank/accounts/api/fetchCustomerDetails?mobileNumber=` | pubblica | header `eazybank-correlation-id` |
| Contatti accounts | `GET /eazybank/accounts/api/contact-info` | pubblica | messaggio, contatti, reperibilità |
| Crea carta | `POST /eazybank/cards/api/create?mobileNumber=` | `CARDS` | nessun body |
| Leggi carta | `GET /eazybank/cards/api/fetch?mobileNumber=` | pubblica | |
| Aggiorna carta | `PUT /eazybank/cards/api/update` | `CARDS` | body `CardsDto` |
| Elimina carta | `DELETE /eazybank/cards/api/delete?mobileNumber=` | `CARDS` | |
| Contatti cards | `GET /eazybank/cards/api/contact-info` | pubblica | |
| Crea prestito | `POST /eazybank/loans/api/create?mobileNumber=` | `LOANS` | nessun body |
| Leggi prestito | `GET /eazybank/loans/api/fetch?mobileNumber=` | pubblica | header `eazybank-correlation-id` |
| Aggiorna prestito | `PUT /eazybank/loans/api/update` | `LOANS` | body `LoansDto` |
| Elimina prestito | `DELETE /eazybank/loans/api/delete?mobileNumber=` | `LOANS` | |
| Contatti loans | `GET /eazybank/loans/api/contact-info` | pubblica | |

`build-info` e `java-version` restano fuori dal prodotto: sono diagnostica dei microservizi.

In update il backend risponde **417** con `ResponseDto` quando il salvataggio non avviene, oltre ai 4xx/5xx di `ErrorResponseDto`. Il client deve distinguere i due formati.

## Principi di implementazione

- TypeScript strict in tutte le app.
- React Router solo nella shell. I remote esportano un componente pagina, non un router proprio.
- TanStack Query dentro ogni remote, con `queryKey` che include il microservizio e `mobileNumber`.
- Un solo `api-client`: base URL da `VITE_API_BASE_URL`, `Authorization: Bearer <accessToken>` se la sessione Keycloak è attiva, `eazybank-correlation-id` generato per ogni richiesta e riusato nei retry della stessa azione.
- I pulsanti di scrittura compaiono solo se il token ha il realm role del microservizio. Il gateway resta il controllo reale: un 401/403 mostra il messaggio di permesso negato.
- Stili nel pacchetto `ui` (CSS modules o un unico foglio). Niente libreria UI pesante nella prima versione: i tre remote devono sembrare la stessa applicazione.
- Il numero di cellulare è la chiave cliente, come nel backend. La shell lo valida a 10 cifre prima di navigare.

## Modifica backend, da fare nella fase 1

Sul `gatewayserver`, CORS per l'origine della shell:

- origini: `http://localhost:3000` in sviluppo; in seguito l'origine pubblica del frontend;
- metodi: `GET`, `POST`, `PUT`, `DELETE`, `OPTIONS`;
- header ammessi: `Authorization`, `Content-Type`, `eazybank-correlation-id`;
- header esposti utili in UI: `X-Response-Time`, `eazybank-correlation-id`.

Nessun altro cambiamento alle API. I remote non chiamano `8080`, `8090` o `9000`.

In Keycloak, realm `master`, creare un client public `easybank-shell` con redirect `http://localhost:3000/*` e tre utenti di prova (o un utente con più ruoli):

| Utente di prova | Realm roles | Può scrivere su |
| --- | --- | --- |
| operatore conti | `ACCOUNTS` | accounts |
| operatore carte | `CARDS` | cards |
| operatore prestiti | `LOANS` | loans |
| sportello completo | `ACCOUNTS`, `CARDS`, `LOANS` | tutti |

Le letture restano utilizzabili anche senza login, in linea con `permitAll` sui `GET`.

## Fasi

Ogni fase si chiude quando i criteri di quella fase sono veri nel browser, contro il backend locale già avviato (configserver, eureka, accounts, loans, cards, gateway, Keycloak).

### Fase 0 — Scheletro del workspace

Stato: **fatta il 2026-09-24**.

- Workspace pnpm sotto `frontend/`, con le quattro app e i quattro pacchetti vuoti.
- Shell su `http://localhost:3000` che monta i tre remote in tre riquadri, anche se mostrano solo il proprio nome.
- `pnpm dev` avvia shell e remote insieme.
- Typecheck del workspace verde.

Criterio verificato: le quattro app si buildano da sole (`vite build`). Con il remote loans spento, la shell mostra «Remote loans non disponibile» e accounts e cards restano visibili.

### Fase 1 — Client HTTP, CORS e sessione

- Tipi in `packages/contracts` per i DTO di questa roadmap.
- `api-client` con gestione di `ResponseDto`, `ErrorResponseDto` e body vuoto.
- CORS sul gateway come sopra.
- `packages/auth` con `keycloak-js`: login, logout, refresh, elenco ruoli.
- Shell con header (nome app, utente, entra/esci) e variabile `VITE_API_BASE_URL=http://localhost:8072`.

Criterio: da loggato, una `GET /eazybank/accounts/api/contact-info` fatta dalla shell restituisce il JSON di configurazione e il backend vede `eazybank-correlation-id`.

### Fase 2 — Shell e dashboard cliente

Pagine della shell:

- `/` ricerca per cellulare;
- `/clienti/nuovo` delegata al remote accounts (fase 3), nel frattempo un placeholder;
- `/clienti/:mobileNumber` dashboard.

La dashboard chiama `fetchCustomerDetails` e mostra nome, email, cellulare e tre schede riepilogative (conto, carta, prestito). Scheda assente se il relativo DTO è nullo, con azione "Crea" verso il remote giusto. Errore di rete o circuit breaker: messaggio nel riquadro, correlation id visibile per il supporto.

Criterio: un cellulare già presente in accounts apre la dashboard. Un cellulare inesistente mostra lo stato "cliente non trovato" senza rompere il layout.

### Fase 3 — Remote accounts

Esportare `./App` con le viste:

- creazione cliente (`name`, `email`, `mobileNumber`) → `POST /api/create`;
- dettaglio e modifica di nome, email, indirizzo filiale → `PUT /api/update`;
- eliminazione → `DELETE /api/delete`, con conferma, poi ritorno alla ricerca.

La shell passa `mobileNumber` e la modalità (`create` | `view`). I campi numerici di conto restano in sola lettura: li assegna il server (`Savings`, numero conto, indirizzo iniziale `123 Main Street, New York`).

Criterio: creando un cliente nuovo, la dashboard della shell lo rilegge. Senza ruolo `ACCOUNTS` i pulsanti di scrittura non ci sono e una chiamata forzata riceve 403 dal gateway.

### Fase 4 — Remote cards

- Crea carta con il solo `mobileNumber` (`POST /api/create`).
- Dettaglio: numero, tipo `Credit Card`, plafond, utilizzato, disponibile.
- Update dei soli importi, con la regola `availableAmount` coerente con plafond e utilizzato prima dell'invio.
- Delete per cellulare.

Criterio: dopo la creazione, `fetchCustomerDetails` nella dashboard mostra `cardsDto`. Un operatore solo `ACCOUNTS` vede la carta e non può modificarla.

### Fase 5 — Remote loans

Stesso disegno delle carte, sul contratto prestiti:

- create con `mobileNumber`;
- dettaglio `Home Loan`, importo, pagato, residuo;
- update importi;
- delete;
- ogni `GET /api/fetch` invia `eazybank-correlation-id`.

Criterio: cliente con conto, carta e prestito mostra le tre schede popolate. Lo spegnimento del servizio loans lascia shell, accounts e cards utilizzabili, con il riquadro prestiti in errore.

### Fase 6 — Pagine trasversali e rifinitura

- Pagina contatti che unisce i tre `contact-info`.
- Messaggi italiani allineati a `statusMsg` del backend (`Account created successfully` e gli equivalenti di cards/loans vanno mostrati, con un'etichetta italiana accanto al codice `statusCode`).
- Stati loading, vuoto, 417, 4xx di validazione (elenco `errorMessage`) e 5xx.
- Layout controllato a larghezza desktop e a 390px: ricerca, dashboard e un form di update per remote.
- Tastiera: focus visibile, label sui campi, conferma esplicita sulle delete.

Criterio: un percorso completo sportello (login con tutti i ruoli → crea cliente → crea carta → crea prestito → modifica un importo → elimina la carta) si completa senza ricaricare l'intera shell.

### Fase 7 — Build, container e compose

- Build di produzione dei quattro frontend. La shell punta ai remote con URL di ambiente (`VITE_ACCOUNTS_REMOTE`, `VITE_CARDS_REMOTE`, `VITE_LOANS_REMOTE`), non con localhost cablato.
- Immagine nginx per ciascun frontend, porte interne distinte, in `docker-compose` accanto ai microservizi.
- Il gateway, in quel compose, abilita l'origine reale della shell.
- Health: la shell risponde sulla sua porta; i remote servono `remoteEntry`.

Criterio: `docker compose` della stack più i quattro frontend permette il percorso della fase 6 senza processi Node sul host.

### Fase 8 — Verifica automatica

- Test di `api-client` sui due formati di risposta e sull'header di correlazione (Vitest, mock di fetch).
- Un test di componente per il form cliente (validazione 5–30 / email / 10 cifre) e uno per il form importi carta.
- Una prova end-to-end del percorso sportello (Playwright) contro gateway e Keycloak locali, marcata come opzionale in CI finché la stack non è disponibile nel runner.

## Ordine di lavoro consigliato

```text
Fase 0 workspace
  → Fase 1 client, CORS, Keycloak
    → Fase 2 dashboard
      → Fase 3 accounts
        → Fase 4 cards
          → Fase 5 loans
            → Fase 6 rifinitura
              → Fase 7 docker
                → Fase 8 test
```

Le fasi 4 e 5 sono indipendenti tra loro e si possono alternare. La 3 viene prima perché senza cliente non esistono carta e prestito.

## Fuori da questa roadmap

- Autenticazione dentro i microservizi accounts, cards e loans (oggi la protezione è sul gateway).
- Un BFF Node. Il gateway e `fetchCustomerDetails` bastano.
- Condivisione di un design system pubblicato su un registry: il pacchetto `ui` del workspace è sufficiente.
- Operazioni non presenti nelle API: elenco clienti, movimenti, pagamenti, bonifici.

## Definizione di finito

Il frontend è pronto quando uno sportellista, dal solo `http://localhost:3000`, cerca un cliente per cellulare, legge il riepilogo aggregato e — se il suo token ha i ruoli — crea e aggiorna conto, carta e prestito passando esclusivamente da `http://localhost:8072`, con un microfrontend isolato per ciascun microservizio Spring.

## Diario di lavoro — 2026-09-24

Prossima sessione: **fase 1** (client HTTP, CORS sul gateway, login Keycloak nella shell). Lo stile non è ancora nel codice: vedi la decisione sotto.

### Backend e Docker

- `docker-compose/default/docker-compose.yml` punta a `eazybytes/<servizio>:s12`. La stack è stata avviata: configserver **8071**, eureka **8070**, accounts **8080**, loans **8090**, cards **9000** risultano healthy. Il gateway **8072** è up e non ha healthcheck nel compose.
- L'actuator generale del gateway è `DOWN` perché Redis, configurato su `localhost:6379` dentro il container, rifiuta la connessione. La readiness è `UP` e le rotte verso i microservizi non passano da Redis.
- Le immagini locali `s11` erano tenute da container fermi (`configserver-ms`, `eurekaserver-ms`, `accounts-ms`, `loans-ms`, `cards-ms`, `gatewayserver-ms`). I tag `s9` non erano mai stati scaricati in locale. A fine giornata in locale restano solo i tag `s12`.
- Tag per Docker Hub, utente `pooriaeshghi`: accounts, cards, loans, configserver e gatewayserver `s12` coincidono con le immagini `eazybytes`. **`pooriaeshghi/eurekaserver:s12` è sbagliato**: ha l'id `843b81af2d81`, che è configserver. L'Eureka vera è `eazybytes/eurekaserver:s12` (`42d280b62902`). Prima di un push va rifatto il tag. Il push su Docker Hub non risulta chiuso in questa sessione.
- Keycloak di compose (`quay.io/keycloak/keycloak:26.4.7`, container `keycloak`) è stato aggiunto e poi rimosso. Si usa il container già esistente `affectionate_easley` (`keycloak-local:26.3.2`), porta host `7080`.
- Il gateway nel container non raggiunge Keycloak su `localhost:7080`. In compose, sul servizio `gatewayserver`, c'è `SPRING_SECURITY_OAUTH2_RESOURCESERVER_JWT_JWK_SET_URI=http://host.docker.internal:7080/realms/master/protocol/openid-connect/certs`. Dal container quella URL risponde 200. Il container `gatewayserver-ms` è stato ricreato con questa variabile.

### Autorizzazione Keycloak

- Un Bearer copiato dal corso (utente `madan`, agosto 2023) è scaduto: il gateway risponde 401.
- Il token authorization code del client `easybank-callcenter-ac`, utente `admin`, è valido ma non ha il realm role `ACCOUNTS`. I ruoli da amministratore di Keycloak non bastano. Il gateway risponde 403 su `POST /eazybank/accounts/api/create`. Il secret di quel client è accettato; il grant client credentials è spento (`Client not enabled to retrieve service account`).
- La stessa POST passa con il token client credentials del client `easybank-callcenter-cc`. L'identità è `service-account-easybank-callcenter-cc` e `realm_access.roles` contiene `ACCOUNTS`, `CARDS` e `LOANS`.
- Per far passare anche l'authorization code: assegnare il realm role `ACCOUNTS` all'utente che fa il login e richiedere un token nuovo. Il token già salvato in Postman non si aggiorna da solo.

### Frontend, fase 0

Workspace `frontend/`, pnpm 10.18.1 attivato con corepack (non era nel PATH). Catalogo dipendenze in `pnpm-workspace.yaml`. `esbuild` è in `pnpm.onlyBuiltDependencies`, altrimenti pnpm 10 non esegue il suo script di installazione.

| App | Package | Porta |
| --- | --- | --- |
| shell | `@easybank/shell` | 3000 |
| accounts | `@easybank/accounts` | 3001 |
| cards | `@easybank/cards` | 3002 |
| loans | `@easybank/loans` | 3003 |

Pacchetti vuoti, solo `export {}`: `@easybank/contracts`, `@easybank/api-client`, `@easybank/auth`, `@easybank/ui`.

Comandi, dalla cartella `frontend`:

```powershell
pnpm dev
pnpm typecheck
pnpm build
```

`pnpm typecheck` e `pnpm build` sono verdi. In browser la shell mostra Easy Bank e i tre nomi. Avvio: `pnpm dev`. Durante la prova del fallback il processo loans è stato fermato e il `pnpm dev` di gruppo è uscito con errore; loans è stato riavviato a parte. A fine prova le porte 3000–3003 rispondevano.

### Stile, deciso ma non implementato

Se l'interfaccia deve seguire le linee guida della PA, la libreria è **Bootstrap Italia** (2.18, Bootstrap 5.2) più **Design React Kit**. CSS e font (Titillium Web, Lora, Roboto Mono) si importano nel `main.tsx` della shell e nel `main.tsx` di ogni remote per l'avvio standalone. L'`App` esposto non reimporta il CSS. I componenti del kit si usano nei remote. Una sola versione, nel catalogo pnpm. All'installazione va controllato che il kit accetti React 19.

Tailwind resta l'alternativa se non serve l'identità visiva della PA: preset condiviso in `@easybank/ui`, senza il peso di Bootstrap. `@easybank/ui` in entrambi i casi resta un pacchetto del workspace, non un quinto remote.

Niente di questo è stato installato. La fase 1 parte dal client HTTP e da CORS, non dallo stile. Lo stile entra quando si disegnano shell e form, dalla fase 2.

## Diario di lavoro — 2026-09-25

Repository Git privato: https://github.com/PooriaEshghi/easy-bank, branch `main`. Primo commit `4f7ebb9`. Il remoto `origin` segue quel branch.

Fuori dal repository restano `target/`, `node_modules/`, `dist/`, `.idea/` e gli hook locali di upgrade Java. Non c’erano file `.env`.

Prossima sessione invariata: **fase 1**.
