# Pubblicare BESIDE su Railway

Questa procedura crea tre servizi nello stesso progetto Railway:

- `MongoDB`: database persistente, senza dominio HTTP pubblico;
- `backend`: FastAPI, root directory `/backend`;
- `frontend`: React, root directory `/frontend` e link per i beta tester.

Per questa fase usa il branch `codex/auth-multitenant-foundation`. Non è necessario unirlo a `main`.

## 1. Porta il branch su GitHub

Il repository deve essere disponibile su GitHub. Dalla radice del progetto:

```bash
git add .
git commit -m "Prepare Railway deployment"
git push -u origin codex/auth-multitenant-foundation
```

Se `origin` non esiste ancora, crea prima un repository GitHub vuoto e collega il remote indicato da GitHub.

## 2. Crea progetto e database

1. In Railway scegli **New Project** → **Empty Project**.
2. Premi **+ New** → **Database** → **Add MongoDB**.
3. Rinomina il servizio esattamente `MongoDB`.
4. Non generare un dominio HTTP per MongoDB e non eliminare il suo volume: è lì che restano i dati.

Il piano Trial limita il volume a 500 MB, una dimensione inferiore allo spazio libero che
MongoDB richiede per costruire nuovi indici. BESIDE rileva esclusivamente quell'errore e
completa comunque la migrazione, continuando a proteggere email e rate limit con l'indice
`_id` nativo. Prima di usare il progetto con un numero significativo di beta tester,
passa almeno al piano Hobby, porta il volume a **1 GB** e ridistribuisci il backend: gli
indici applicativi e TTL verranno creati automaticamente al nuovo avvio.

## 3. Crea i due servizi applicativi

Nel medesimo progetto Railway crea due **Empty Service** e chiamali esattamente:

- `backend`
- `frontend`

Per entrambi, in **Settings → Source** collega lo stesso repository GitHub e seleziona il branch `codex/auth-multitenant-foundation`.

Configura poi:

| Servizio | Root Directory | Railway Config File | Watch Paths |
| --- | --- | --- | --- |
| `backend` | `/backend` | `/backend/railway.json` | `/backend/**` |
| `frontend` | `/frontend` | `/frontend/railway.json` | `/frontend/**` |

Il percorso del file Railway deve essere assoluto rispetto al repository, anche quando è impostata una Root Directory.

## 4. Genera i domini

Apri prima `backend`, poi `frontend`:

1. vai in **Settings → Networking**;
2. premi **Generate Domain**;
3. lascia la porta rilevata automaticamente da Railway.

Otterrai due domini simili a:

- `backend-production-xxxx.up.railway.app`
- `frontend-production-xxxx.up.railway.app`

Railway fornisce automaticamente `PORT`; non crearla manualmente.

## 5. Configura il backend

Genera due segreti diversi sul tuo computer:

```bash
openssl rand -hex 32
openssl rand -base64 32
```

Nel servizio `backend`, apri **Variables → RAW Editor** e incolla quanto segue. Sostituisci soltanto i tre valori indicati:

```dotenv
MONGO_URL=${{MongoDB.MONGO_URL}}
DB_NAME=beside
JWT_SECRET_KEY=INCOLLA_IL_PRIMO_SEGRETO
ADMIN_EMAIL=LA_TUA_EMAIL_ADMIN
ADMIN_PASSWORD=INCOLLA_IL_SECONDO_SEGRETO
CORS_ORIGINS=https://${{frontend.RAILWAY_PUBLIC_DOMAIN}}
FRONTEND_PUBLIC_URL=https://${{frontend.RAILWAY_PUBLIC_DOMAIN}}
COOKIE_SECURE=true
COOKIE_SAMESITE=lax
RATE_LIMITING_ENABLED=true
EMAIL_VERIFICATION_REQUIRED=false
```

Non aggiungere virgolette e non aggiungere `/` alla fine di `CORS_ORIGINS`.

Per rendere operativi recupero password e verifica email aggiungi le credenziali SendGrid:

```dotenv
SENDGRID_API_KEY=LA_TUA_CHIAVE_SENDGRID
SENDER_EMAIL=MITTENTE_VERIFICATO_IN_SENDGRID
ADMIN_NOTIFICATION_EMAIL=EMAIL_CHE_RICEVE_LE_NUOVE_REGISTRAZIONI
```

Solo dopo aver verificato il mittente SendGrid e inviato con successo una email di prova,
porta `EMAIL_VERIFICATION_REQUIRED` a `true` e ridistribuisci il backend. Il backend rifiuta
l'avvio se la verifica obbligatoria è attiva senza chiave e mittente, così le registrazioni
non possono restare bloccate per errore. Gli utenti presenti prima dell'attivazione restano
compatibili; i nuovi account dovranno verificare l'indirizzo prima del login.

Variabili opzionali per le altre integrazioni già presenti:

```dotenv
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3-flash-preview
```

## 6. Configura il frontend

Nel servizio `frontend`, apri **Variables → RAW Editor** e incolla una sola variabile:

```dotenv
REACT_APP_BACKEND_URL=https://${{backend.RAILWAY_PUBLIC_DOMAIN}}
```

Non aggiungere `/api`: il frontend lo aggiunge già.

PostHog è opzionale. Se vuoi mantenere l'analytics esistente, aggiungi anche le tue credenziali pubbliche del progetto PostHog:

```dotenv
REACT_APP_POSTHOG_KEY=
REACT_APP_POSTHOG_HOST=https://us.i.posthog.com
```

Per mostrare il pulsante Google, configura anche il broker OAuth su backend e frontend:

```dotenv
# backend
OAUTH_SESSION_URL=URL_ENDPOINT_SESSIONE_DEL_PROVIDER

# frontend
REACT_APP_OAUTH_LOGIN_URL=URL_PUBBLICO_LOGIN_DEL_PROVIDER
```

Se queste due variabili non sono presenti, il login email/password continua a funzionare e il pulsante Google rimane nascosto.

## 7. Pubblica e verifica

1. Premi **Deploy** sui cambiamenti staged di Railway.
2. Attendi che `MongoDB`, `backend` e `frontend` risultino attivi.
3. Apri `https://DOMINIO_BACKEND/health`: deve rispondere:

```json
{"status":"healthy","database":"connected"}
```

4. Apri `https://DOMINIO_BACKEND/api/`: deve mostrare il messaggio di benvenuto BESIDE.
5. Apri `https://DOMINIO_FRONTEND/health`: deve rispondere con lo stato del frontend.
6. Apri `https://DOMINIO_FRONTEND`: questo è il link da inviare ai beta tester.
7. Prova registrazione, login, creazione di un lavoro e ricarica diretta di `/dashboard`.
8. Prova “Password dimenticata” e il link di verifica email dopo aver configurato SendGrid.

## Migrazione automatica e rollback

Al primo avvio del backend il servizio crea le aziende e aggiunge `company_id` ai record esistenti. La migrazione è idempotente e non elimina né rinomina campi: può essere eseguita più volte. I vecchi `user_id` restano nei documenti come autore del record. Crea inoltre indici TTL per sessioni e token nuovi, e conserva l'accesso degli utenti storici durante l'introduzione della verifica email.

Prima del primo deploy di questo branch è comunque consigliato creare un backup MongoDB. Se devi tornare indietro, ridistribuisci il commit precedente: i campi aggiunti non impediscono al vecchio codice di leggere i dati.

## Domini personalizzati o più frontend

Se in futuro aggiungi un dominio personalizzato, aggiorna:

- `REACT_APP_BACKEND_URL` con il dominio pubblico definitivo del backend;
- `CORS_ORIGINS` con tutti i frontend autorizzati, separati da virgole.

Ogni modifica a `REACT_APP_BACKEND_URL` richiede un nuovo deploy del frontend. Ogni modifica a `CORS_ORIGINS` richiede un nuovo deploy del backend.

Riferimenti ufficiali: [monorepo Railway](https://docs.railway.com/deployments/monorepo), [MongoDB su Railway](https://docs.railway.com/databases/mongodb), [variabili Railway](https://docs.railway.com/variables), [config-as-code](https://docs.railway.com/config-as-code).
