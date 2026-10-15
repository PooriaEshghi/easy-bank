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

### Fase 9 — RabbitMQ tra i microservizi

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

## Fuori da questa roadmap

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

## Diario di lavoro — 2026-09-28

Aggiunta al piano l'implementazione RabbitMQ: bus interno (fase 9) e stream SSE sul gateway consumato dalla shell (fase 10). Nessun codice, nessun compose modificato. La prossima sessione resta la **fase 1**.
