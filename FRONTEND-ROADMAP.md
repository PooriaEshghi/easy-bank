# Roadmap frontend — React microfrontend per Easy Bank

Piano per costruire il frontend di Easy Bank come shell React che compone tre microfrontend, uno per ciascun microservizio di dominio già presente nel backend: **accounts**, **cards** e **loans**. Il browser parla solo con il **gatewayserver**. I servizi Spring restano indipendenti e non conoscono il frontend.

Questo documento ha due prodotti. Le fasi 0–10 sono il **back office** degli sportellisti, su `http://localhost:3000`. Il **front office** dei clienti della banca è la sezione in fondo, fasi F0–F6, su `http://localhost:3010`. Non riusa i remote dello sportello e non sostituisce le fasi 9 e 10.

## Contesto backend da rispettare

| Servizio | Porta diretta | Percorso sul gateway (`8072`) |
| --- | --- | --- |
| configserver | 8071 | non esposto al browser |
| eurekaserver | 8070 | non esposto al browser |
| accounts | 8080 | `/eazybank/accounts/**` → `lb://ACCOUNTS` |
| loans | 8090 | `/eazybank/loans/**` → `lb://LOANS` |
| cards | 9000 | `/eazybank/cards/**` → `lb://CARDS` |
| gatewayserver | 8072 | unico entry point del frontend |
| rabbitmq | 5672 AMQP, 15672 management | non esposto al browser; vedi fase 9 |
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
| Eventi del cliente | `GET /eazybank/events/stream?mobileNumber=` | token valido, nessun realm role | `text/event-stream`, servito dal gateway, fase 10 |

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

## Implementazione RabbitMQ

RabbitMQ è il bus interno tra accounts, cards, loans e il gateway. Il browser continua a parlare solo con `8072`. Il messaggio porta il fatto che un `mobileNumber` è cambiato; il dato lo rilegge chi già oggi lo legge via REST. `fetchCustomerDetails` resta sulle due chiamate Feign (`CardsFeignClient`, `LoansFeignClient`).

Si usa `spring-boot-starter-amqp` sul parent Boot 4.0 già presente, nei quattro servizi accounts, cards, loans e gatewayserver. Spring Cloud Stream non entra: le routing key sono nove e i listener sono tre.

### Broker

Servizio `rabbitmq` in `docker-compose/default/docker-compose.yml` (e gli equivalenti `qa` e `prod`):

| | |
| --- | --- |
| Immagine | `rabbitmq:4-management` |
| AMQP | `5672`, in rete `eazybank`; pubblicato sull'host solo nel compose locale, per i servizi avviati con Maven |
| Management | `15672`, solo rete locale |
| Vhost | `eazybank` |
| Utente | `eazybank` |
| Password | `eazybank` nel compose locale. In `qa` e `prod` la variabile `RABBITMQ_DEFAULT_PASS` è obbligatoria e ha un altro valore |

Healthcheck: `rabbitmq-diagnostics -q ping`. I quattro servizi dipendono da quel healthcheck.

Il config server attivo importa il git `eazybytes-config` (`spring.profiles.active: git` in `configserver`). I file `configserver/src/main/resources/config/*.yml` di questo repository non sono il profilo in esecuzione, e la password non va messa in quel git. La configurazione vive in due punti che questo progetto controlla:

- `application.yml` di accounts, cards, loans e gatewayserver, per l'avvio da Maven verso `localhost:5672`;
- nel compose, le variabili `SPRING_RABBITMQ_HOST=rabbitmq`, `SPRING_RABBITMQ_PORT=5672`, `SPRING_RABBITMQ_USERNAME`, `SPRING_RABBITMQ_PASSWORD`, `SPRING_RABBITMQ_VIRTUAL_HOST=eazybank`. L'env batte sia lo yaml locale sia un eventuale valore arrivato dal config server.

```yaml
spring:
  rabbitmq:
    host: localhost
    port: 5672
    username: eazybank
    password: eazybank
    virtual-host: eazybank
    publisher-confirm-type: correlated
    listener:
      simple:
        acknowledge-mode: manual
```

Lo starter registra l'indicatore di health `rabbit`. Non va aggiunto al gruppo readiness: un broker fermo porta l'health complessivo a `DOWN` e lascia la readiness `UP`, lo stesso comportamento già visto con Redis sul gateway. Le mutazioni HTTP restano servite.

Converter JSON fornito dallo starter per il Jackson del parent Boot 4.0. Exchange, code e binding sono bean dichiarati all'avvio (`RabbitAdmin`): niente code create a mano dalla management UI.

### Topologia

Topic exchange durevole `eazybank.events`. Dead-letter exchange `eazybank.events.dlx`.

| Routing key | Produttore | Quando |
| --- | --- | --- |
| `accounts.created` | accounts | dopo `createAccount`, con cliente e conto salvati |
| `accounts.updated` | accounts | dopo `updateAccount` che ritorna true |
| `accounts.deleted` | accounts | dopo `deleteAccount` |
| `cards.created`, `cards.updated`, `cards.deleted` | cards | dopo la mutazione corrispondente |
| `loans.created`, `loans.updated`, `loans.deleted` | loans | dopo la mutazione corrispondente |

Un update che risponde **417** non pubblica: il salvataggio non c'è stato.

| Coda | Binding | Consumatore |
| --- | --- | --- |
| `cards.accounts` | `accounts.deleted` | cards |
| `loans.accounts` | `accounts.deleted` | loans |
| `gatewayserver.events.<instanceId>` | `accounts.*`, `cards.*`, `loans.*` | quel processo del gateway |

La coda del gateway è exclusive e auto-delete, una per processo (`instanceId` generato all'avvio). Ogni replica riceve la propria copia. Una coda condivisa consegnerebbe l'evento a una sola replica. Le DLQ sono `cards.accounts.dlq`, `loans.accounts.dlq` e `gatewayserver.events.dlq`.

Il listener di cards e loans ritenta 3 volte, a 2 secondi, poi pubblica sulla DLQ (`RepublishMessageRecoverer`). Il messaggio resta leggibile dalla management UI. Il listener del gateway fa ack anche se nessun browser è collegato: l'aggiornamento perso si recupera alla prossima GET. In DLQ ci finisce un errore del consumatore, non l'assenza di abbonati.

### Contratto del messaggio

Body JSON. Niente nome, email, importi o numeri carta/prestito: chi consuma, se gli serve il dato, chiama la GET che già esiste.

| Campo | Regola |
| --- | --- |
| `eventId` | UUID generato dal produttore |
| `eventType` | la routing key |
| `mobileNumber` | 10 cifre |
| `occurredAt` | ISO-8601 |
| `correlationId` | l'`eazybank-correlation-id` della richiesta HTTP che ha eseguito la mutazione |

Lo stesso valore viaggia nell'header AMQP `eazybank-correlation-id`. In caso di errore e di approdo in DLQ il listener lo scrive nel log.

La pubblicazione avviene dopo il `save` o il `delete` JPA riuscito, nella stessa richiesta. Se il confirm del broker fallisce, la risposta HTTP resta 201 o 200: la scrittura è già fatta. Il fallimento si logga con il correlation id. Un outbox transazionale non fa parte di questa implementazione.

### Cancellazione a cascata

Oggi `deleteAccount` rimuove cliente e conto e lascia carta e prestito. Il listener di cards e quello di loans, su `accounts.deleted`, chiamano il metodo di dominio già usato da `DELETE /api/delete?mobileNumber=`. Se la riga non c'è, ack e stop: la cancellazione è idempotente. Se la riga c'era, dopo la delete locale il servizio pubblica `cards.deleted` o `loans.deleted`. Nessun servizio è in ascolto delle proprie routing key.

### Flusso verso la shell

Il gateway è già WebFlux e serve lui stesso, senza una riga nuova in `eazyBankRouteConfig`:

`GET /eazybank/events/stream?mobileNumber=`

`text/event-stream`. Il `@RabbitListener` consegna a un sink in memoria indicizzato per cellulare e fa ack; il controller restituisce il `Flux` di quella richiesta. Alla chiusura della connessione il sink della richiesta si sgancia. La consegna al sink non gira sul thread di Netty.

In `SecurityConfig` il matcher di questo path va registrato prima di `pathMatchers(HttpMethod.GET).permitAll()`, altrimenti il primo matcher rende pubblico anche lo stream. Regola: `authenticated()`, un JWT valido, senza realm role `ACCOUNTS`, `CARDS` o `LOANS`. Le altre GET restano pubbliche.

`EventSource` non può inviare `Authorization`. Il client è `fetch` con lettura dello stream, gli header già previsti da `api-client` (`Authorization`, `eazybank-correlation-id`) e `AbortSignal` alla chiusura della pagina. CORS di fase 1 copre già questi header; lo stream non ne aggiunge.

La shell, sulla route `/clienti/:mobileNumber`, tiene un solo stream. All'evento pubblica sul bus di `@easybank/api-client` il trio `mobileNumber`, `eventType`, `correlationId`. La dashboard invalida `fetchCustomerDetails`. Il remote il cui nome sta in `eventType` (`accounts`, `cards` o `loans`) invalida la propria query TanStack. Gli altri due non ricaricano.

Il bus funziona solo se shell e remote condividono lo stesso modulo. In `vite.config.ts` dei quattro frontend, `shared` di Module Federation ha già `react` e `react-dom` come singleton: va aggiunto `@easybank/api-client` con `singleton: true`. Senza quella riga ogni remote ha una copia del bus e l'evento della shell non arriva.

Se il broker o lo stream non rispondono, la mutazione HTTP resta valida. La shell segnala lo stream interrotto, correlation id visibile, e il prossimo ingresso sulla dashboard rilegge via REST.

## Fasi

Ogni fase si chiude quando i criteri di quella fase sono veri nel browser, contro il backend locale già avviato (configserver, eureka, accounts, loans, cards, gateway, Keycloak). Dalla fase 9 la stack include anche RabbitMQ.

### Fase 0 — Scheletro del workspace

Stato: **fatta il 2026-09-24**.

- Workspace pnpm sotto `frontend/`, con le quattro app e i quattro pacchetti vuoti.
- Shell su `http://localhost:3000` che monta i tre remote in tre riquadri, anche se mostrano solo il proprio nome.
- `pnpm dev` avvia shell e remote insieme.
- Typecheck del workspace verde.

Criterio verificato: le quattro app si buildano da sole (`vite build`). Con il remote loans spento, la shell mostra «Remote loans non disponibile» e accounts e cards restano visibili.

### Fase 1 — Client HTTP, CORS e sessione

Stato: **fatta il 2026-10-01**.

- Tipi in `packages/contracts` per i DTO di questa roadmap.
- `api-client` con gestione di `ResponseDto`, `ErrorResponseDto` e body vuoto.
- CORS sul gateway come sopra.
- `packages/auth` con `keycloak-js`: login, logout, refresh, elenco ruoli.
- Shell con header (nome app, utente, entra/esci) e variabile `VITE_API_BASE_URL=http://localhost:8072`.

Criterio: da loggato, una `GET /eazybank/accounts/api/contact-info` fatta dalla shell restituisce il JSON di configurazione e il backend vede `eazybank-correlation-id`.

### Fase 2 — Shell e dashboard cliente

Stato: **fatta il 2026-10-01**.

Pagine della shell:

- `/` ricerca per cellulare;
- `/clienti/nuovo` delegata al remote accounts (fase 3), nel frattempo un placeholder;
- `/clienti/:mobileNumber` dashboard.

La dashboard chiama `fetchCustomerDetails` e mostra nome, email, cellulare e tre schede riepilogative (conto, carta, prestito). Scheda assente se il relativo DTO è nullo, con azione "Crea" verso il remote giusto. Errore di rete o circuit breaker: messaggio nel riquadro, correlation id visibile per il supporto.

Criterio: un cellulare già presente in accounts apre la dashboard. Un cellulare inesistente mostra lo stato "cliente non trovato" senza rompere il layout.

### Fase 3 — Remote accounts

Stato: **fatta il 2026-10-01**.

Esportare `./App` con le viste:

- creazione cliente (`name`, `email`, `mobileNumber`) → `POST /api/create`;
- dettaglio e modifica di nome, email, indirizzo filiale → `PUT /api/update`;
- eliminazione → `DELETE /api/delete`, con conferma, poi ritorno alla ricerca.

La shell passa `mobileNumber` e la modalità (`create` | `view`). I campi numerici di conto restano in sola lettura: li assegna il server (`Savings`, numero conto, indirizzo iniziale `123 Main Street, New York`).

Criterio: creando un cliente nuovo, la dashboard della shell lo rilegge. Senza ruolo `ACCOUNTS` i pulsanti di scrittura non ci sono e una chiamata forzata riceve 403 dal gateway.

### Fase 4 — Remote cards

Stato: **fatta il 2026-10-06**.

- Crea carta con il solo `mobileNumber` (`POST /api/create`).
- Dettaglio: numero, tipo `Credit Card`, plafond, utilizzato, disponibile.
- Update dei soli importi, con la regola `availableAmount` coerente con plafond e utilizzato prima dell'invio.
- Delete per cellulare.

Criterio: dopo la creazione, `fetchCustomerDetails` nella dashboard mostra `cardsDto`. Un operatore solo `ACCOUNTS` vede la carta e non può modificarla.

### Fase 5 — Remote loans

Stato: **fatta il 2026-10-06**.

Stesso disegno delle carte, sul contratto prestiti:

- create con `mobileNumber`;
- dettaglio `Home Loan`, importo, pagato, residuo;
- update importi;
- delete;
- ogni `GET /api/fetch` invia `eazybank-correlation-id`.

Criterio: cliente con conto, carta e prestito mostra le tre schede popolate. Lo spegnimento del servizio loans lascia shell, accounts e cards utilizzabili, con il riquadro prestiti in errore.

### Fase 6 — Pagine trasversali e rifinitura

Stato: **fatta il 2026-10-06**.

- Pagina contatti che unisce i tre `contact-info`.
- Messaggi italiani allineati a `statusMsg` del backend (`Account created successfully` e gli equivalenti di cards/loans vanno mostrati, con un'etichetta italiana accanto al codice `statusCode`).
- Stati loading, vuoto, 417, 4xx di validazione (elenco `errorMessage`) e 5xx.
- Layout controllato a larghezza desktop e a 390px: ricerca, dashboard e un form di update per remote.
- Tastiera: focus visibile, label sui campi, conferma esplicita sulle delete.

Criterio: un percorso completo sportello (login con tutti i ruoli → crea cliente → crea carta → crea prestito → modifica un importo → elimina la carta) si completa senza ricaricare l'intera shell.

### Fase 7 — Build, container e compose

Stato: **fatta il 2026-10-06**.

- Build di produzione dei quattro frontend. La shell punta ai remote con URL di ambiente (`VITE_ACCOUNTS_REMOTE`, `VITE_CARDS_REMOTE`, `VITE_LOANS_REMOTE`), non con localhost cablato.
- Immagine nginx per ciascun frontend, porte interne distinte, in `docker-compose` accanto ai microservizi.
- Il gateway, in quel compose, abilita l'origine reale della shell.
- Health: la shell risponde sulla sua porta; i remote servono `remoteEntry`.

Criterio: `docker compose` della stack più i quattro frontend permette il percorso della fase 6 senza processi Node sul host.

### Fase 8 — Verifica automatica

Stato: **fatta il 2026-10-06**.

- Test di `api-client` sui due formati di risposta e sull'header di correlazione (Vitest, mock di fetch).
- Un test di componente per il form cliente (validazione 5–30 / email / 10 cifre) e uno per il form importi carta.
- Una prova end-to-end del percorso sportello (Playwright) contro gateway e Keycloak locali, marcata come opzionale in CI finché la stack non è disponibile nel runner.

### Fase 9 — RabbitMQ tra i microservizi

Stato: **fatta il 2026-10-06**.

Dipende dai tre servizi di dominio e dal compose locale. Può partire prima del frontend.

- Servizio `rabbitmq` nei tre compose, healthcheck, env `SPRING_RABBITMQ_*` su accounts, cards, loans e gatewayserver.
- `spring-boot-starter-amqp` e i bean di exchange, code, binding e DLQ.
- Publish sulle mutazioni riuscite, con il contratto descritto sopra. Il 417 non pubblica.
- Listener `accounts.deleted` in cards e in loans, idempotente, con i tre tentativi e la DLQ.

Criterio: creare un cliente, creare una carta, cancellare il cliente da accounts. `GET /eazybank/cards/api/fetch` non trova più la carta. Sulla management `15672` si vedono `accounts.deleted` consegnato a `cards.accounts` e `cards.deleted` pubblicato. Con cards spento prima della cancellazione, il messaggio resta in coda; a cards riacceso la carta sparisce senza un secondo delete.

### Fase 10 — Stream degli eventi nella shell

Dipende dalla fase 1 (CORS e token), dalla fase 2 (dashboard) e dalle fasi 3–5 (una mutazione visibile). Il punto naturale è dopo la fase 6.

- `GET /eazybank/events/stream` sul gateway, matcher `authenticated()` prima del `permitAll` dei GET.
- Tipo `DomainEvent` in `@easybank/contracts`. Lettura dello stream in `@easybank/api-client`, con `fetch` e `AbortSignal`.
- `@easybank/api-client` singleton nella config Module Federation di shell, accounts, cards e loans.
- La shell si iscrive al cliente aperto e pubblica sul bus. Dashboard e remote del dominio indicato invalidano la query.

Criterio: due schede sullo stesso cellulare, stesso utente loggato. In una si aggiorna un importo della carta. L'altra, senza ricaricare la pagina, mostra l'importo nuovo in dashboard e nel remote cards. Con RabbitMQ spento la `PUT` riesce comunque e la seconda scheda si aggiorna al successivo ingresso sulla dashboard.

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
                  → Fase 9 RabbitMQ
                    → Fase 10 stream sulla shell
```

Le fasi 4 e 5 sono indipendenti tra loro e si possono alternare. La 3 viene prima perché senza cliente non esistono carta e prestito.

La fase 9 non ha bisogno delle app React: può avanzare appena accounts, cards, loans e il compose locale ci sono. La fase 10 ha bisogno della dashboard e dei tre remote, quindi sta dopo la fase 6 anche se nel diagramma è in coda alla 9.

Il front office è un binario a parte. Può partire con le fasi 0–8 già chiuse. La F1 tocca gateway e Keycloak, non i remote dello sportello.

```text
Fase F0 confine
  → Fase F1 identità cliente e /eazybank/me
    → Fase F2 home in sola lettura
      → Fase F3 profilo e contatti
        → Fase F4 nginx
          → Fase F5 test
            → Fase F6 apertura conto, solo con una API nuova
```

## Fuori dal back office

- Autenticazione dentro i microservizi accounts, cards e loans (oggi la protezione è sul gateway).
- Un BFF Node. Il gateway e `fetchCustomerDetails` bastano.
- Condivisione di un design system pubblicato su un registry: il pacchetto `ui` del workspace è sufficiente.
- Operazioni non presenti nelle API: elenco clienti, movimenti, pagamenti, bonifici.
- Request/reply su RabbitMQ al posto delle Feign di `fetchCustomerDetails`.
- Outbox transazionale tra il commit JPA e il confirm del broker.
- Connessioni AMQP aperte da shell o dai remote. La porta `5672` resta interna.

## Definizione di finito

Il frontend è pronto quando uno sportellista, dal solo `http://localhost:3000`, cerca un cliente per cellulare, legge il riepilogo aggregato e — se il suo token ha i ruoli — crea e aggiorna conto, carta e prestito passando esclusivamente da `http://localhost:8072`, con un microfrontend isolato per ciascun microservizio Spring.

Con la fase 10, una seconda scheda aperta sullo stesso cliente vede create, update e delete senza ricaricare la shell. La cancellazione del cliente, via `accounts.deleted`, toglie anche carta e prestito.

## Front office — area clienti

Il back office è lo strumento dei dipendenti. Un operatore, con i realm role `ACCOUNTS`, `CARDS` e `LOANS`, cerca un cellulare qualsiasi, crea il cliente, modifica plafond e residuo, elimina carta e conto. Quelle schermate non si danno a un cliente della banca.

Il front office è un'altra applicazione, usata dal titolare del conto. Nella prima versione **legge solo il proprio rapporto**: anagrafica, conto Savings, carta se c'è, prestito se c'è, e i recapiti della banca. Non crea clienti, non cambia importi, non elimina nulla. Movimenti, pagamenti e bonifici non hanno API: restano fuori, come già per lo sportello.

### Perché non si riusano i remote

I remote `accounts`, `cards` e `loans` sono lo sportello: contengono Crea, Salva ed Elimina. Montarli nel sito del cliente mostrerebbe i pulsanti dei dipendenti, anche se il gateway poi rispondesse 403.

La chiave oggi è il `mobileNumber` passato in query. Le GET sono `permitAll`: chiunque può leggere il rapporto di qualunque cellulare. Un sito clienti che chiedesse «inserisci il tuo cellulare» e chiamasse `fetchCustomerDetails` copierebbe quel buco. Il cliente non digita il cellulare. Il cellulare sta nel token, e il gateway rifiuta una richiesta che ne indica un altro.

I microservizi accounts, cards e loans non cambiano. Non conoscono il frontend e non validano il JWT. Il controllo nuovo sta sul gateway, come il resto della sicurezza.

### Confine

| | Back office | Front office |
| --- | --- | --- |
| Chi entra | dipendente | titolare del conto |
| Origine | `http://localhost:3000` | `http://localhost:3010` |
| App | `frontend/apps/shell` più i tre remote | `frontend/apps/clienti`, una sola app React |
| Client Keycloak | `easybank-shell` | `easybank-clienti`, public, PKCE S256 |
| Redirect | `http://localhost:3000/*` | `http://localhost:3010/*` |
| Ruoli | `ACCOUNTS`, `CARDS`, `LOANS` | `CUSTOMER` |
| Claim | nessuno di dominio | `mobileNumber`, 10 cifre, mapper dal profilo utente |
| API | quelle della tabella sopra | `GET /eazybank/me/api/summary` e le tre `contact-info` |
| Scrittura | sì, col ruolo del servizio | no |

I due siti non condividono origine, quindi non condividono la sessione del browser. Un operatore loggato sullo sportello non risulta loggato nell'area clienti, e il contrario. I pacchetti riusati sono `@easybank/contracts` e `@easybank/api-client`. `@easybank/auth` resta dello sportello: l'area clienti ha il proprio init Keycloak, stesso `keycloak-js`, client id diverso. Niente Module Federation. React Router vive in `apps/clienti`.

Lo stile non si installa in queste fasi. Niente Bootstrap Italia. Le etichette italiane di `describeStatus` e `describeFailure` si riusano.

Utente di prova, password `easybank`: `cliente`. Realm role `CUSTOMER`. Attributo `mobileNumber` uguale a un cliente già presente nell'H2 di accounts (per la prova, un cellulare creato dallo sportello). Senza quell'anagrafica la home è «rapporto non trovato», non una pagina vuota senza spiegazione.

### API nuova, sul gateway

`GET /eazybank/me/api/summary`

- Matcher registrato **prima** di `pathMatchers(HttpMethod.GET).permitAll()`.
- Richiede JWT e realm role `CUSTOMER`. Un token da sportello, anche `sportello` con i tre ruoli, riceve 403.
- Il cellulare si legge dal claim `mobileNumber`. Manca il claim, o non è di 10 cifre: 403, senza chiamare accounts.
- Una query `?mobileNumber=` diversa dal claim: 403. Il gateway non inoltra il cellulare scelto dal browser.
- Se il claim è valido, il gateway chiama in interno `GET /eazybank/accounts/api/fetchCustomerDetails?mobileNumber=<claim>` e copia `eazybank-correlation-id`. La risposta verso il browser è il `CustomerDetailsDto` già esistente. `cardsDto` e `loansDto` null restano «carta assente» e «prestito assente».
- Nessun `POST`, `PUT` o `DELETE` sotto `/eazybank/me/**` in queste fasi.

CORS del gateway, accanto all'origine dello sportello: `http://localhost:3010`. Stessi metodi e header di oggi (`Authorization`, `Content-Type`, `eazybank-correlation-id`). La proprietà è già una lista separata da virgole (`EAZYBANK_CORS_ALLOWED_ORIGINS`).

Lo stream `GET /eazybank/events/stream` della fase 10 **non** si collega dall'area clienti. Quel matcher è `authenticated()` senza controllo del cellulare: un token `CUSTOMER` potrebbe chiedere gli eventi di un altro numero. Si aggiunge all'area clienti solo quando il gateway applica la stessa regola del claim.

### Fase F0 — Confine dell'app

Stato: **fatta il 2026-10-06**.

- App `frontend/apps/clienti` nel workspace pnpm, porta dev `3010`, strict port.
- Env: `VITE_API_BASE_URL` (default `http://localhost:8072`), `VITE_KEYCLOAK_URL`, `VITE_KEYCLOAK_REALM`, `VITE_KEYCLOAK_CLIENT_ID=easybank-clienti`.
- Nessun import da `accounts/App`, `cards/App`, `loans/App`.
- Route previste, anche solo come pagine vuote: `/` entra, `/home` rapporto, `/profilo`, `/contatti`.

Criterio: `pnpm --filter @easybank/clienti dev` risponde su `3010` e non carica remote dello sportello. Lo sportello su `3000` non cambia.

### Fase F1 — Identità e summary proprio

Stato: **non iniziata**. Dipende da F0. Non dipende dalle fasi 9 e 10.

- Client Keycloak `easybank-clienti` e utente `cliente` come in tabella.
- Sul gateway, la route `/eazybank/me/api/summary` descritta sopra. Il filtro legge il claim e chiama `fetchCustomerDetails`. Accounts, cards e loans non si modificano e non si ricostruiscono.
- L'origine `http://localhost:3010` è fra le origini CORS. Lo sportello su `3000` continua a passare.
- Un token senza `CUSTOMER`, un claim assente e un `mobileNumber` in query diverso dal claim ricevono 403. Il correlation id è nella risposta, come per le altre chiamate.

Criterio: con il token di `cliente` la GET torna il `CustomerDetailsDto` del suo cellulare. Con il token di `sportello` la stessa URL è 403. Cambiare il query param non cambia il cliente letto.

### Fase F2 — Home in sola lettura

Stato: **non iniziata**. Dipende da F1.

- Login e logout. Il pulsante Entra resta disabilitato finché Keycloak non ha finito l'init.
- Dopo il login la home chiama solo `/eazybank/me/api/summary`.
- Mostra nome, email, cellulare, conto (numero, Savings, filiale), carta se `cardsDto` c'è, prestito se `loansDto` c'è. Importi in sola lettura.
- Assenze: «Carta assente», «Prestito assente». Errore di rete o 5xx: `describeFailure` e il correlation id, con Riprova. 401 e 403: «Permesso negato», e si torna al login se il token non c'è più.
- Nessun campo modificabile, nessun pulsante Salva, Crea o Elimina.
- A 390px la home non sborda in orizzontale.

Criterio: `cliente` vede il rapporto creato dallo sportello per il suo cellulare. Non esiste un modo, nella UI, di chiedere un altro cellulare.

### Fase F3 — Profilo e contatti

Stato: **non iniziata**. Dipende da F2.

- `/profilo` rilegge lo stesso summary e mostra solo l'anagrafica. Il cellulare non si modifica: è la chiave del conto.
- `/contatti` legge le tre `GET /eazybank/{accounts|cards|loans}/api/contact-info`, già pubbliche. Stessi stati vuoti della pagina contatti dello sportello: messaggio, recapito, reperibilità.
- La home non incorpora i contatti.

Criterio: il profilo mostra il nome del summary. I tre pannelli contatti rispondono anche senza rifare il login, e un errore di rete mostra il correlation id.

### Fase F4 — Build e container

Stato: **non iniziata**. Dipende da F2. F3 può seguire.

- Build di produzione di `apps/clienti`. Immagine nginx `easybank/clienti:local`, porta interna `3010`, nel compose default accanto a `shell-ui`.
- Health: `GET /` sulla `3010` risponde 200.
- Il compose del gateway elenca entrambe le origini, `http://localhost:3000` e `http://localhost:3010`.
- Redirect Keycloak del client `easybank-clienti` resta `http://localhost:3010/*`.

Criterio: la home del cliente si apre da nginx, senza un processo Node sull'host. Lo sportello sulle `3000`–`3003` continua a rispondere.

### Fase F5 — Verifica

Stato: **non iniziata**. Dipende da F2.

- Vitest sul client HTTP dell'area clienti: la summary non accetta un cellulare passato dalla pagina; manda `Authorization` e `eazybank-correlation-id`.
- Un test di componente della home: con `cardsDto` null si legge «Carta assente» e non compare un pulsante di scrittura.
- Playwright del percorso cliente, stesso criterio dello sportello: `EASYBANK_E2E=1` in locale, job CI spento finché la variabile di repository non è `true`. Il test entra come `cliente`, vede il proprio conto, e una URL con un altro cellulare non cambia i dati in pagina.

Criterio: `pnpm test` del workspace resta verde, compreso il test della home. L'end-to-end cliente è saltato se la stack non c'è.

### Fase F6 — Apertura conto, dopo

Stato: **non iniziata**. Non fa parte del primo rilascio. Si scrive solo quando le fasi F0–F5 sono chiuse e si chiede esplicitamente.

Oggi `POST /eazybank/accounts/api/create` assegna Savings e la filiale di default, e il gateway la riserva al ruolo `ACCOUNTS`. Darla al cliente significherebbe dargli il ruolo dello sportellista.

Serve un'altra operazione, per esempio `POST /eazybank/me/api/open`, ruolo `CUSTOMER`, body limitato a nome ed email. Il cellulare arriva dal claim, non dal body. Il gateway, o un endpoint nuovo di accounts dietro il gateway, esegue la stessa creazione di dominio. La risposta 201 porta il cliente sulla home. Un cellulare già registrato resta 400, con il messaggio già previsto da accounts.

Non entra in F6: scelta del tipo di conto, carta, prestito, documenti, pagamento.

### Fuori dal front office

- Montare i remote dello sportello nell'area clienti.
- Ruoli `ACCOUNTS`, `CARDS`, `LOANS` sull'utente cliente.
- Digitare un cellulare per leggere un rapporto.
- Modifica di plafond, utilizzato, importo prestito, filiale, nome conto.
- Eliminazione di carta, prestito o conto.
- Movimenti, pagamenti, bonifici, elenco clienti.
- `GET /eazybank/events/stream` prima del controllo del claim.
- Autenticazione dentro accounts, cards e loans. Resta sul gateway.
- Un BFF Node.
- Stessa origine e stesso client Keycloak dello sportello.

### Definizione di finito del front office

L'area clienti è pronta, per questa prima versione, quando il titolare apre solo `http://localhost:3010`, entra con il ruolo `CUSTOMER` e legge il proprio conto, la propria carta e il proprio prestito passando da `http://localhost:8072`, senza poter chiedere il rapporto di un altro cellulare e senza pulsanti di scrittura. Lo sportello su `3000` resta quello dei dipendenti.

## Diario di lavoro — 2026-09-24

Prossima sessione: **fase 1** (client HTTP, CORS sul gateway, login Keycloak nella shell). Lo stile non è ancora nel codice: vedi la decisione sotto.

### Backend e Docker

- `docker-compose/default/docker-compose.yml` punta a `eazybytes/<servizio>:s13`. La stack è stata avviata: configserver **8071**, eureka **8070**, accounts **8080**, loans **8090**, cards **9000** risultano healthy. Il gateway **8072** è up e non ha healthcheck nel compose.
- L'actuator generale del gateway è `DOWN` perché Redis, configurato su `localhost:6379` dentro il container, rifiuta la connessione. La readiness è `UP` e le rotte verso i microservizi non passano da Redis.
- Le immagini locali `s11` erano tenute da container fermi (`configserver-ms`, `eurekaserver-ms`, `accounts-ms`, `loans-ms`, `cards-ms`, `gatewayserver-ms`). I tag `s9` non erano mai stati scaricati in locale. A fine giornata in locale restano solo i tag `s13`.
- Tag per Docker Hub, utente `pooriaeshghi`: accounts, cards, loans, configserver e gatewayserver `s13` coincidono con le immagini `eazybytes`. **`pooriaeshghi/eurekaserver:s13` è sbagliato**: ha l'id `843b81af2d81`, che è configserver. L'Eureka vera è `eazybytes/eurekaserver:s13` (`42d280b62902`). Prima di un push va rifatto il tag. Il push su Docker Hub non risulta chiuso in questa sessione.
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

## Diario di lavoro — 2026-09-28

Al mattino è stata aggiunta al piano l'implementazione RabbitMQ: bus interno (fase 9) e stream SSE sul gateway consumato dalla shell (fase 10). In quel momento nessun codice e nessun compose erano stati modificati. La fase 1 del frontend resta il passo successivo di quella roadmap.

Nel pomeriggio il lavoro è stato un altro: il servizio `message` della section 13 del corso (`microservices-4.0.0\section_13`). È un progetto di studio: non si continua una feature se non viene chiesta.

### Servizio message

Modulo `message/`, porta `9010`, immagine prevista `eazybytes/message:s13`. Boot 4.0.0, Spring Cloud 2025.1.0. Non si registra su Eureka e non ha database.

Dipendenze: `spring-boot-starter-amqp`, `spring-rabbit-stream`, `spring-cloud-function-context`, `spring-cloud-starter-function-web`, `spring-cloud-stream`, `spring-cloud-stream-binder-rabbit`. Nei test c'è `spring-cloud-stream-test-binder`.

Function composte con `spring.cloud.function.definition: email|sms`:

- `email` riceve `AccountsMsgDto`, scrive nel log `Sending email with the details` e ripassa lo stesso DTO.
- `sms` scrive `Sending sms with the details` e restituisce solo `accountNumber`.

Binding:

| Binding | Destinazione | Coda |
| --- | --- | --- |
| `emailsms-in-0` | exchange `send-communication` | `send-communication.message` |
| `emailsms-out-0` | exchange `communication-sent` | la consuma accounts |

`spring-cloud-starter-function-web` espone le function anche in HTTP. `POST http://localhost:9010/email` esegue solo `email` sul thread Tomcat `nio-9010-exec-1` e risponde con lo stesso JSON. `POST /email|sms` esegue anche `sms` e risponde con il numero di conto. Queste POST non passano da RabbitMQ e non aggiornano `communicationSw`.

Il test `MessageApplicationTests.contextLoads` è verde. Con il broker spento il contesto parte lo stesso e il listener segnala `Connection refused` su `localhost:5672`.

### Accounts, il produttore

Dopo `createAccount`, `StreamBridge.send("sendCommunication-out-0", accountsMsgDto)` pubblica su `send-communication`. Il DTO è il record `AccountsMsgDto`: `accountNumber`, `name`, `email`, `mobileNumber`.

Esempio visto nel log:

```json
{
  "accountNumber": 1234545454,
  "name": "Madan Reddy",
  "email": "tutor@eazybytes",
  "mobileNumber": "4354437687"
}
```

La function `updateCommunication` consuma `communication-sent` (coda `communication-sent.accounts`) e, con quel numero di conto, mette `communicationSw` a `true`. Colonna `communication_sw` aggiunta su `Accounts` e in `schema.sql`.

`AccountsApplicationTests` è verde. Durante il test il processo si è registrato su Eureka locale e poi si è deregistrato.

`RabbitMessagingConfig` di accounts non compilava: le parentesi graffe erano raddoppiate (`{{`). Sono state rimesse singole.

### Flusso sul broker

```text
POST /api/create su accounts
  → salva cliente e conto
  → exchange send-communication
      → coda send-communication.message
          → email (log + DTO)
          → sms (log + numero di conto)
  → exchange communication-sent
      → coda communication-sent.accounts
          → updateCommunication
          → communicationSw = true
```

RabbitMQ trasporta JSON. I due servizi si incontrano solo sui nomi `send-communication` e `communication-sent`.

### Compilazione di loans, cards e gateway

Loans e cards non partivano dall'IDE: il package `messaging` usa Spring AMQP, ma `spring-boot-starter-amqp` non era nel pom. Aggiunta la dipendenza. `RetryInterceptorBuilder.maxAttempts` non esiste in Spring AMQP 4: nei due `RabbitMessagingConfig` è diventato `maxRetries(3)`.

Il gateway non compilava in clean per lo stesso motivo, più Lombok su `DomainEvent` senza dipendenza né annotation processor. Aggiunti `spring-boot-starter-amqp`, `lombok` e il path del compiler plugin. `clean compile` di loans, cards e gateway è verde.

Una rotta `/eazybank/message/**` era stata messa sul gateway e poi tolta: `message` non ha API REST da inoltrare.

### Docker

Nei compose `default`, `qa` e `prod` c'è il servizio `rabbitmq`, immagine `rabbitmq:4-management`, container `rabbitmq`. Non è un microservizio Maven.

| | default | qa e prod |
| --- | --- | --- |
| AMQP | `5672` pubblicato sull'host | solo rete `eazybank` |
| Management | `15672` | non pubblicato |
| Utente / vhost | `eazybank` / `eazybank` | uguale |
| Password | `eazybank` | variabile obbligatoria `RABBITMQ_DEFAULT_PASS` |

Nel corso la password è `guest` e il vhost è quello di default. Qui si usa `eazybank` perché è il broker di questo compose. `application.yml` di accounts e message punta a `localhost:5672` con le stesse credenziali; nel container l'host è sovrascritto con `SPRING_RABBITMQ_HOST=rabbitmq`. accounts dipende da RabbitMQ healthy. message dipende solo da RabbitMQ, senza healthcheck HTTP e senza Eureka.

Le immagini `eazybytes/*:s13` già costruite non contengono il codice di oggi. Per averlo in Docker serve un build Jib nuovo. I container `configserver-ms`, `eurekaserver-ms`, `accounts-ms`, `loans-ms`, `cards-ms` e `gatewayserver-ms` a fine sessione erano spenti.

### Ordine di avvio a mano

1. RabbitMQ (`docker compose up -d rabbitmq` da `docker-compose/default`).
2. Config server, porta `8071`.
3. Eureka, porta `8070`.
4. accounts `8080`, loans `8090`, cards `9000`, anche insieme.
5. message. Gli basta RabbitMQ, può partire insieme al punto 4.
6. Gateway, porta `8072`, quando i tre microservizi sono su Eureka.

Keycloak resta il container `affectionate_easley` sulla porta `7080`, già acceso. Serve per le chiamate con token. Le GET pubbliche no.

A fine sessione, avviati dall'IDE, c'erano config server, Eureka, accounts e message, più il container `rabbitmq` healthy. Loans, cards e gateway erano spenti: l'errore era di compilazione, ora risolto, e vanno riavviati dall'IDE.

### Fuori da questa sessione

Il listener `accounts.deleted` di cards e loans, e lo stream SSE del gateway, restano il disegno della fase 9 e 10. Si accendono solo con `eazybank.messaging.broker=rabbit`. Non sono il flusso `email|sms` della section 13. Il frontend non è stato toccato.

## Diario di lavoro — 2026-10-01

Fase 1 chiusa. Prossima sessione: **fase 2** (ricerca per cellulare e dashboard `fetchCustomerDetails`). Lo stile resta fuori da questa fase.

### Client e shell

- `@easybank/contracts` descrive cliente, conto, carta, prestito, dettaglio aggregato, `ResponseDto`, `ErrorResponseDto` e `ContactInfoDto`. `DomainEvent` resta dov'era, per la fase 10.
- `@easybank/api-client` distingue `ResponseDto` (compreso il 417), `ErrorResponseDto`, la mappa di validazione e il body vuoto. Ogni richiesta manda `eazybank-correlation-id`. Il pulsante Riprova riusa lo stesso id.
- `@easybank/auth` usa `keycloak-js` 26: login, logout, refresh, ruoli del realm. Il client public è `easybank-shell`, redirect `http://localhost:3000/*`, PKCE S256.
- La shell mostra Easy Bank, l'utente, i ruoli e Entra/Esci. Da loggato chiama `GET /eazybank/accounts/api/contact-info` e mostra il JSON insieme al correlation id.
- Le variabili stanno in `frontend/apps/shell/.env.example`. `.env.development` è solo locale: git ignora `.env.*`. Se le variabili mancano, il codice usa gli stessi indirizzi di localhost.

### Gateway

CORS in `SecurityConfig`, così la preflight OPTIONS non prende 401 prima degli header. L'origine è `eazybank.cors.allowed-origins` in `application.yml`, oggi `http://localhost:3000`. Metodi `GET`, `POST`, `PUT`, `DELETE`, `OPTIONS`. Header ammessi: `Authorization`, `Content-Type`, `eazybank-correlation-id`. Header esposti: `X-Response-Time`, `eazybank-correlation-id`.

Una OPTIONS con `Origin: http://localhost:3000` risponde 200 e ripete quegli header. La GET dello stesso percorso, senza Origin, resta 200.

### Keycloak

Container `affectionate_easley` sulla porta `7080`. Client `easybank-shell` creato sul realm `master`. Utenti di prova, password `easybank`:

| Utente | Realm roles |
| --- | --- |
| `operatore-conti` | `ACCOUNTS` |
| `operatore-carte` | `CARDS` |
| `operatore-prestiti` | `LOANS` |
| `sportello` | `ACCOUNTS`, `CARDS`, `LOANS` |

### Verifica

Avviati per la prova: configserver `8071`, Eureka `8070`, accounts `8080` e gateway `8072` da Maven; RabbitMQ e Keycloak dai container già presenti; `pnpm dev` sulle porte `3000`–`3003`. Loans, cards e message restano spenti.

Dal browser, con `sportello`, la shell ha chiamato contact-info con il Bearer. La risposta è il JSON prod (`Hey, welcome to EazyBank accounts related prod APIs`). Nel log del gateway compare `eazybank-correlation-id` `8408028a-87a0-44cf-8738-18fcff11d01d`. I tre remote mostrano il proprio nome. `pnpm typecheck` e `pnpm build` sono verdi.

### Pomeriggio — fase 2

Fase 2 chiusa. Prossima sessione: **fase 3** (creazione, modifica ed eliminazione cliente nel remote accounts). Lo stile resta fuori: niente Bootstrap Italia.

La shell ha tre pagine. `/` cerca per cellulare e rifiuta un valore che non ha 10 cifre, senza chiamare il gateway. `/clienti/nuovo` è il placeholder del remote accounts. `/clienti/:mobileNumber` chiama `GET /eazybank/accounts/api/fetchCustomerDetails` e mostra nome, email, cellulare e le tre schede. Carta o prestito assenti hanno il link Crea verso il remote corrispondente (`#remote-cards`, `#remote-loans`). Il conto assente punta a `/clienti/nuovo`. Un 404 mostra «Cliente non trovato» e lascia l'header al suo posto. Un 500 o un errore di rete mostra il messaggio nel riquadro e `eazybank-correlation-id`. Riprova riusa lo stesso id.

Senza carta o prestito, accounts rispondeva 500 `No fallback available`: OpenFeign ha il circuit breaker acceso e loans/cards rispondono 404. Aggiunti `LoansFallback` e `CardsFallback`, come nel corso: restituiscono `null` e il servizio non copia il DTO. Immagine `eazybytes/accounts:s13` ricostruita con Jib e container `accounts-ms` ricreato. Il database H2 in memoria si è svuotato. Cliente di prova ricreato: `4354437687`, Sportello Demo, conto Savings. La GET sul gateway risponde 200 con `cardsDto` e `loansDto` a `null`.

Verifica nel browser (Chrome headless) contro la stack Docker già avviata e `pnpm dev` sulle porte 3000–3003. Cellulare `0000000000`: cliente non trovato. Cellulare `4354437687`: nome, email, Savings, `123 Main Street, New York`, carta assente, prestito assente, i tre remote visibili. `/clienti/12` resta nel layout con il messaggio delle 10 cifre. A 390px la ricerca e la dashboard non sbordano. `pnpm typecheck` è verde.

### Sera — fase 3

Fase 3 chiusa. Prossima sessione: **fase 4** (remote cards). Lo stile resta fuori.

Il remote `accounts` esporta `./App` con due modalità. La shell passa `mobileNumber`, `create` o `view`, i ruoli e il token. `/clienti/nuovo` è il form di creazione (`nome`, `email`, `cellulare`) e chiama `POST /eazybank/accounts/api/create`. Dopo il 201 la shell apre `/clienti/:mobileNumber` e la dashboard rilegge `fetchCustomerDetails`. Sul cliente aperto, il remote legge `GET /api/fetch` e permette di cambiare nome, email e filiale con `PUT /api/update`. Numero conto e tipo restano in sola lettura. Elimina chiede conferma e poi `DELETE /api/delete`; la shell torna alla ricerca.

Senza il ruolo `ACCOUNTS` i pulsanti Crea cliente, Salva ed Elimina non ci sono. Una POST forzata con il token di `operatore-carte` riceve 403 dal gateway.

Verifica nel browser, stack Docker invariata. Senza login, `/clienti/nuovo` non ha il pulsante di creazione. Con `sportello` un nome corto non parte verso il gateway. Il cliente `4350191001` (Cliente Fase Tre) compare in dashboard con Savings e `123 Main Street, New York`; dopo il salvataggio la filiale è `Via Roma 1, Milano`. Con `operatore-carte` il cliente si legge e i pulsanti di scrittura mancano; la POST forzata è 403. Con `sportello` la conferma di eliminazione riporta alla ricerca e lo stesso cellulare risulta «Cliente non trovato». A 390px la dashboard non sborda. `pnpm typecheck` è verde. Il cliente di prova è stato eliminato.

## Diario di lavoro — 2026-10-06

Fasi 4, 5, 6, 7, 8 e 9 chiuse. Prossima sessione del back office: **fase 10** (stream SSE sulla shell). Lo stile resta fuori. La fase 9 è il bus della roadmap, distinto dal flusso email|sms già presente con Spring Cloud Stream.

### Remote cards e loans

Il remote `cards` esporta `./App`. La shell gli passa cellulare, ruoli e token. Se la GET è 404, il riquadro dice «Carta assente» e, con il ruolo `CARDS`, offre `POST /eazybank/cards/api/create` senza body. Il dettaglio mostra numero, `Credit Card`, plafond, utilizzato e disponibile. Si modificano solo gli importi: il disponibile viene ricalcolato come plafond meno utilizzato e, se non torna, il salvataggio non parte. Elimina chiede conferma. Il remote `loans` fa lo stesso su `Home Loan`, importo, pagato e residuo. Ogni GET, compresa quella di loans, manda `eazybank-correlation-id`.

Cancellare la carta o il prestito non torna alla ricerca: aggiorna la dashboard. Solo l'eliminazione del cliente, nel remote accounts, riporta a `/`.

Un aggiornamento della dashboard non smonta più i remote. Prima il refresh azzerava il cliente e il messaggio di esito spariva insieme al form.

### Contatti e messaggi

`/contatti` legge i tre `contact-info`. La ricerca non tiene più il pannello del solo accounts. La GET è pubblica: la pagina funziona anche senza login e, se la sessione c'è, manda comunque il Bearer. Un errore di rete mostra il correlation id generato dal client.

`describeStatus` in `@easybank/api-client` affianca al `statusCode` un'etichetta italiana e lascia il `statusMsg` del backend. Esempi: `201 · Carta creata · Card created successfully`, `200 · Richiesta completata · Request processed successfully`. Un 401 o 403 è «Permesso negato». Un 5xx è «Errore del servizio».

### Gateway

La prima `POST /eazybank/accounts/api/create` dopo l'avvio superava il secondo e il gateway rispondeva 504, anche se accounts aveva già salvato il cliente. In `docker-compose/default/docker-compose.yml`, sul servizio `gatewayserver`, c'è `RESILIENCE4J_TIMELIMITER_CONFIGS_DEFAULT_TIMEOUTDURATION=10s`, come il customizer del corso. Il container `gatewayserver-ms` è stato ricreato con questa variabile. L'immagine `eazybytes/gatewayserver:s13` non è stata ricostruita.

### Verifica

Stack Docker riavviata (configserver, Eureka, RabbitMQ, accounts, loans, cards, gateway) più Keycloak `affectionate_easley` sulla porta `7080`. `pnpm dev` sulle porte 3000–3003. `pnpm typecheck` è verde.

Nel browser, con `sportello`: un cellulare di meno di 10 cifre non chiama il gateway; `/contatti` mostra i tre pannelli e il correlation id; il cliente `4356416984` (Cliente Fase Quattro) nasce e la dashboard lo rilegge con Savings. Carta e prestito compaiono nelle tre schede, con i messaggi «Carta creata» e «Prestito creato». Un disponibile incoerente non parte. L'utilizzato `1000` salva e la scheda mostra disponibile `99000`. A 390px la dashboard non sborda. Con `operatore-conti` carta e prestito si leggono e non ci sono Salva, Elimina o Crea. La conferma di eliminazione della carta lascia «Carta assente» senza ricaricare la shell.

Con `loans-ms` fermo, la dashboard del cliente resta aperta, accounts e cards rispondono, e il remote prestiti mostra `500 · Errore del servizio` con il correlation id. La scheda riepilogativa dice «Prestito assente»: il fallback Feign di accounts mette `loansDto` a null. `loans-ms` è stato riavviato. Il cliente di prova è ancora nell'H2 di accounts, senza carta.

### Fase 7 — nginx

`frontend/Dockerfile` costruisce un'app del workspace (`APP=shell|accounts|cards|loans`) e la serve con nginx su una porta interna distinta: shell `3000`, accounts `3001`, cards `3002`, loans `3003`. Nel compose default i servizi sono `shell-ui`, `accounts-ui`, `cards-ui` e `loans-ui`, immagini `easybank/*:local`. La shell legge `VITE_ACCOUNTS_REMOTE`, `VITE_CARDS_REMOTE` e `VITE_LOANS_REMOTE`; nel build del compose sono `http://localhost:3001/remoteEntry.js` e le due sorelle. Il gateway del compose ha `EAZYBANK_CORS_ALLOWED_ORIGINS=http://localhost:3000`.

Health: la shell risponde `200` su `/`, i tre remote su `/remoteEntry.js`. `pnpm dev` è stato fermato: sulle porte `3000`–`3003` rispondono i container, non Node.

Il percorso sportello è stato rifatto nel browser contro questi container e contro i processi Java già in ascolto sull'host (le porte `8070`–`8072`, `8080`, `8090` e `9000` erano occupate, quindi i container dei microservizi non sono stati ricreati). RabbitMQ del compose è stato avviato sulla `5672`. Con `sportello`: cliente `4284473247` (Cliente Fase Sette), carta e prestito creati, utilizzato `1000` con disponibile `99000` e «Richiesta completata», poi eliminazione della carta fino a «Carta assente». La shell non si è ricaricata. Il prestito è rimasto nell'H2 di accounts.

### Fase 8 — test

`pnpm test`, dalla cartella `frontend`, esegue Vitest. `@easybank/api-client` copre `ResponseDto` (anche il 417, che non è un successo), `ErrorResponseDto` e l'header `eazybank-correlation-id`. Il form cliente rifiuta nome corto, email e cellulare prima di chiamare il gateway, poi invia il cliente valido. Il form carta ricalcola il disponibile, blocca un valore incoerente e manda la `PUT` solo quando torna il plafond meno l'utilizzato. `pnpm typecheck` è verde.

`pnpm test:e2e` è Playwright sul percorso sportello. Senza `EASYBANK_E2E=1` il test è saltato. Con la variabile, contro la shell nginx e il gateway già in ascolto, il percorso è passato. In `.github/workflows/frontend.yml` il job `e2e` parte solo se la variabile di repository `EASYBANK_E2E` è `true`, e non fa fallire la pipeline.

### Front office, solo roadmap

Aggiunta la sezione «Front office — area clienti», fasi F0–F6. È il sito del titolare del conto, origine `3010`, client Keycloak `easybank-clienti`, ruolo `CUSTOMER`, summary `GET /eazybank/me/api/summary` col cellulare preso dal token. Non riusa i remote dello sportello. Nessuna fase F è stata implementata. Il passo successivo del back office resta la fase 9.

### Fase F0 — area clienti

`frontend/apps/clienti` è nel workspace pnpm come `@easybank/clienti`. `pnpm --filter @easybank/clienti dev` risponde su `http://localhost:3010` con strict port. Le pagine sono `/` Entra, `/home` Rapporto, `/profilo` e `/contatti`. I default sono gateway `http://localhost:8072`, Keycloak `http://localhost:7080`, realm `master`, client `easybank-clienti`. React Router sta nell'app. Non c'è Module Federation e il browser non chiede i remote dello sportello.

`pnpm typecheck` è verde. Nel browser, a 1280px e a 390px, le quattro route e i link della testata funzionano e la pagina non sborda. Una URL sconosciuta mostra «Pagina non trovata». Lo sportello su `3000` risponde ancora, titolo Easy Bank. Il server Vite dell'area clienti è rimasto acceso sulla `3010`.

Prossima fase del front office: **F1** (client Keycloak `easybank-clienti`, ruolo `CUSTOMER`, `GET /eazybank/me/api/summary`). Prossima fase del back office: **fase 9**.

### Fase 9 — bus RabbitMQ

Il bus `eazybank.events` è acceso con `eazybank.messaging.broker=rabbit` su accounts, cards e loans. Dopo un salvataggio riuscito il servizio pubblica `accounts|cards|loans.created|updated|deleted`. Un update che risponde 417 non pubblica. `accounts.deleted` arriva sulle code durevoli `cards.accounts` e `loans.accounts`: se la carta o il prestito c'è, il servizio lo cancella e pubblica `cards.deleted` o `loans.deleted`; se non c'è, fa ack e si ferma. Tre tentativi, poi `RepublishMessageRecoverer` verso `cards.accounts.dlq` e `loans.accounts.dlq`. Il flusso email|sms di Spring Cloud Stream resta com'è. Lo stream SSE del gateway resta spento: è la fase 10.

Nei tre compose, cards, loans e gatewayserver dipendono da RabbitMQ sano e hanno `SPRING_RABBITMQ_*`. Il flag del bus è solo su accounts, cards e loans. Le immagini `eazybytes/*:s13` non sono state ricostruite.

Prova sul gateway, processi Maven sull'host (l'H2 in memoria di accounts e loans si è svuotato al riavvio). Cliente `4356901401`: create, carta e prestito, poi delete del cliente. Le GET `/eazybank/cards/api/fetch` e `/eazybank/loans/api/fetch` passano da 200 a 404. Sulla management `15672` si vedono `accounts.deleted`, `cards.deleted` e `loans.deleted`, con correlation id `fase9-happy`. Un update senza conto risponde 417 e non pubblica. Con cards spento, `accounts.deleted` del cliente `4356901402` resta in `cards.accounts`; al riavvio la carta sparisce senza un secondo delete. La readiness di cards resta `UP`.

Prossima fase del back office: **fase 10**. La F1 del front office resta da chiedere.
