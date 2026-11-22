# Beside Agency — Piano A, rilascio indipendente (22/11/2026)

## Obiettivo e vincoli assoluti
Creare **un nuovo progetto Railway** chiamato `Beside-Agency` separato dal progetto Railway `BeSide` esistente, con 3 servizi `frontend`, `backend`, `MongoDB` e con dati, volumi, segreti e deployment propri. Dominio pubblico finale `https://agency.mybeside.pro`. Il codice di partenza è il branch GitHub `staging/agency` del repo `dabruz83/BeSide`.
NON modificare/migrare/copiare dati o credenziali da `production` o `staging` esistenti. NON collegare Agency ai loro MongoDB o backend. NON fare merge su Wrapping/main. NON creare servizi a pagamento né distribuire senza un'esplicita fase di deploy autorizzata. Mantieni i costi minimi, verifica il consumo del piano Railway Hobby.

## Stato verificato
- `staging/agency` deriva dal branch funzionante `staging/2026-11-09-mfa-recovery`, conserva agenda, autenticazione, MFA, passkey e infrastruttura app.
- Aggiunti `backend/agency_marketing.py` e `frontend/src/pages/MarketingPage.jsx` con cinque tab: Panoramica, Assistente AI, I miei contenuti, Calendario editoriale, Guida. Backend API `/api/agency/marketing/*`, CRUD scoped per company e AI Gemini; stato contenuti Bozze/Da approvare/Pronti/Programmati/Pubblicati, calendario editoriale e scrittura manuale.
- `frontend/src/App.js` usa la API same-origin `/api`; `frontend/server.js` effettua reverse-proxy dell'API verso `REACT_APP_BACKEND_URL`.
- Il calendario lavorativo è preservato e adattato a web agency, **ma** il calendario editoriale è solo collegato alla pagina agenda: non ci sono ancora eventi editoriali integrati nella griglia; non promettere il contrario.
- Nel backend `server.py` il controllo `WEBAUTHN_ENABLED` / `AGENCY_RAILWAY_ENVIRONMENT_ID` / `AGENCY_WEBAUTHN_ORIGIN` al momento accetta solo origin Agency `*.up.railway.app`. **BLOCCO da correggere prima di attivare Face ID sul dominio custom** `agency.mybeside.pro`. Non disabilitare controlli sicurezza esistenti.
- Per generare contenuti realmente serve `EXTERNAL_SERVICES_ENABLED=true`, `GEMINI_API_KEY` valida e un modello `GEMINI_MODEL` realmente disponibile. Non simulare risultati reali.
- Repo GitHub risulta **public**: non salvare alcun secret, file .env, credenziali, URL Mongo o dati cliente nel repo.

## Fase 1 — Codex, SOLO CODICE, senza creare risorse esterne
1. Checkout esclusivamente branch `staging/agency`; verifica che working tree sia pulito.
2. Leggi soltanto questo runbook e i file modificati pertinenti: `backend/server.py` (blocchi WebAuthn, CORS e auth), `backend/agency_marketing.py`, `backend/multitenancy.py`, `frontend/server.js`, `frontend/src/pages/MarketingPage.jsx`, `frontend/src/App.js`, `frontend/src/components/Layout.jsx`, test pertinenti. Evita scansioni ripetute di tutto il repository.
3. Correggi i guard di WebAuthn per `APP_ENV=agency` e origin custom HTTPS `https://agency.mybeside.pro`, pinning esatto di `WEBAUTHN_RP_ID=agency.mybeside.pro`, `WEBAUTHN_ORIGIN` e `AGENCY_WEBAUTHN_ORIGIN` a quello stesso origin e `AGENCY_RAILWAY_ENVIRONMENT_ID` all'ID del nuovo environment. Conserva controlli attuali per Wrapping; non permettere wildcard, origin arbitrari o fallback impliciti. Fino alla disponibilità del dominio, `WEBAUTHN_ENABLED=false`.
4. Verifica `MONGO_URL`/`DB_NAME`, cookie Secure/HttpOnly/SameSite, login MFA TOTP, CORS, proxy /api, origine nuova, account deletion, protezioni company-scoped, e gestione errore Gemini senza esporre segreti.
5. Limita il lavoro alla demo; risolvi solo blocchi reali. Testa `python -m compileall -q backend`; `npm --prefix frontend run build`; `npm --prefix frontend test`; test Python backend pertinenti con DB di test isolato, se possibile. Se dipendenze mancano, installale una volta sola, no loops.
6. Commit solo su `staging/agency`; report: file cambiati, esito test, eventuali problemi reali, niente dump dei log interi.
7. NON creare progetto Railway né domini, NON impostare chiavi durante questa fase.

## Fase 2 — Railway, progetto separato (azione esplicita, può generare costi)
In workspace Railway che contiene già `BeSide`, creare **nuovo progetto** `Beside-Agency`, environment `production` solo per Agency, risorse:
- `MongoDB` dal template Railway, **istanza nuova**, volume nuovo e indipendente, nessun TCP proxy pubblico richiesto.
- `backend` dall'origine GitHub `dabruz83/BeSide`, branch `staging/agency`, Root Directory `/backend`.
- `frontend` stesso repo/branch, Root Directory `/frontend`. Deve costruire la UI Agency e avviare `node server.js` (già script `start:railway`). Verificare i comandi d'avvio effettivi e PORT. Una replica per servizio e risorse ridotte quanto compatibili.
- Solo frontend ha dominio pubblico `agency.mybeside.pro`. Backend e MongoDB usano network privato Railway nell'ambiente Agency. Il frontend Node effettua il proxy /api verso il backend Agency, non verso uno Wrapping.
- Non collegare nessun servizio Agency a `app.mybeside.pro`, `admin.mybeside.pro`, frontend-staging o database esistenti.

### Variabili del backend Agency (valori segreti solo in Railway)
`APP_ENV=agency`
`MONGO_URL` = **reference** alla URL privata dell'istanza MongoDB del NUOVO progetto (verificare il nome reale della variabile sul servizio Mongo; ad esempio `${{MongoDB.MONGO_URL}}` solo se esiste).
`DB_NAME=beside_agency`
`JWT_SECRET_KEY` = segreto *nuovo*, casuale, >=32 caratteri.
`ADMIN_EMAIL` = email amministrativa di Agency (può coincidere con una email, non è un trasferimento utenze).
`ADMIN_PASSWORD` = password *nuova*, >=12 caratteri e forte.
`TOTP_ENCRYPTION_KEY` = nuova chiave nel formato effettivamente richiesto dal codice; non riusare la vecchia.
`CORS_ORIGINS=https://agency.mybeside.pro`
`FRONTEND_PUBLIC_URL=https://agency.mybeside.pro`
`PUBLIC_APP_URL=https://agency.mybeside.pro`
`ADMIN_PUBLIC_URL` = definire un URL Agency sicuro solo se realmente necessario; evitare redirect a admin.mybeside.pro.
`COOKIE_SECURE=true`
`COOKIE_SAMESITE=lax` se sessione API passa sullo stesso origin con proxy.
`RATE_LIMITING_ENABLED=true`
`WEBAUTHN_ENABLED=false` fino a DNS e test; poi true e configurare esattamente:
`WEBAUTHN_RP_ID=agency.mybeside.pro`
`WEBAUTHN_ORIGIN=https://agency.mybeside.pro`
`AGENCY_WEBAUTHN_ORIGIN=https://agency.mybeside.pro`
`AGENCY_RAILWAY_ENVIRONMENT_ID` = ID del nuovo environment.
`EMAIL_VERIFICATION_REQUIRED=false`, `RESEND_ENABLED=false` solo per la primissima demo se invio mail non attivo; verificare che i flussi inviti/recupero non siano necessari. Per rilascio reale configurare Resend dedicato e verifica email, senza alterare il vecchio.
`EXTERNAL_SERVICES_ENABLED=false` finché `GEMINI_API_KEY` non è presente e testata, poi true.
`GEMINI_API_KEY` = chiave API nuova o dedicata a Agency, mai pubblicarla.
`GEMINI_MODEL` = modello verificato compatibile col piano/costi.
`BETA_MODE_ENABLED`, `BETA_ALLOWED_EMAILS`, `ONBOARDING_FEATURE_ENABLED` = controllare se necessari per ammettere esattamente gli utenti demo, evitare inviti pubblici.
Servizi front-end:
`REACT_APP_BACKEND_URL` = URL HTTP privato del **backend Agency**, con porta reale (esempio strutturale `http://backend.railway.internal:PORTA_BACKEND`, PORTA_BACKEND da verificare; mai usare URL Wrapping);
`REACT_APP_DIRECT_BACKEND` non settato (usa `/api`).
Confermare build e startup prima di esporre al pubblico.

### DNS OVHcloud
Sul servizio frontend Agency: Settings > Networking > Public Networking > + Custom Domain `agency.mybeside.pro`. Leggere i record esatti richiesti da Railway. Nella zona DNS `mybeside.pro` del provider DNS autorevole (se OVHcloud: Web Cloud > Domini e DNS > Zona DNS):
- Aggiungere CNAME sul nome `agency` col target **fornito da Railway**.
- Aggiungere TXT di verifica con nome esatto e valore esatto forniti da Railway (non indovinare se si chiama `_railway-verify.agency` o simili).
- Non modificare A/MX/TXT/SPF/DKIM/DMARC di altri servizi o record `app`/`admin`.
- Verificare DNS + TLS fino a Railway status `verified`; considerare propagazione fino a 72h.

### Costi e operatività
Un nuovo progetto NON impone piano Pro, ma ogni replica/volume/disk/egress consuma il budget Hobby; controllare Workspace Usage e impostare alert email. Un hard limit Railway può spegnere tutte le app del workspace, quindi non impostarlo automaticamente.
Non riutilizzare JWT, TOTP, passkeys, credenziali admin, utenti, sessioni o dati Wrapping. Registrare utente demo e nuova passkey sull'origine Agency. La repository è pubblica: controllare e correggere visibilità se richiesto prima di inserire segreti in integrazioni.

## Fase 3 — collaudo e accettazione
1. Conferma su Railway: 3 servizi Agency live, niente variabili riferite a BeSide originale; health frontend /health e backend /api/health se presente.
2. HTTPS `https://agency.mybeside.pro` raggiungibile con TLS valido; proxy `/api` punta esclusivamente al backend Agency.
3. Registrazione/accesso di un utente demo in database Agency, MFA TOTP, passkey/Face ID **dopo** configurazione e registrazione sul nuovo origin.
4. Workflow UI: Marketing AI al posto del Configuratore, percorso guidato, 4 AI Gemini reali, bozza creata/modificata/salvata, stati e filtro, data programmata in calendario editoriale, copia testo e gestione manuale pubblicazioni.
5. Agenda ultima versione, preventivi, bacheca, finanza, clienti; nessun riferimento automotive fuori da etichette legacy.
6. Test isolamento: account demo Agency non vede dati o account Wrapping; verificare Mongo distinto e due backend distinti. Testa errori senza ritorno di stack/segreti.
7. Snapshot del costo attuale e quello dopo attivazione; URL verificato e riepilogo dei test. Nessun claim di "funziona" senza prova.

## Prompt Codex a minimo consumo
Fase 1:
`Lavora SOLO su staging/agency. Leggi AGENCY_DEPLOY_RUNBOOK.md, esegui esclusivamente Fase 1, correggi i blocchi, esegui test mirati, committa. Non deploy, non migrare dati, non modificare Wrapping. Output massimo 15 righe.`
Fase 3:
`Su staging/agency verifica Fase 3 di AGENCY_DEPLOY_RUNBOOK.md. Nessun refactor. Riporta soltanto test PASS/FAIL, blocchi e URL verificato. Non modificare production/staging Wrapping.`

Fonti:
- Railway monorepo: https://docs.railway.com/deployments/monorepo
- Railway dominio: https://docs.railway.com/networking/domains/working-with-domains
- Railway variabili: https://docs.railway.com/variables/reference
- Railway budget: https://docs.railway.com/pricing/cost-control
- OVH DNS: https://docs.ovhcloud.com/it/guides/web-cloud/domains/dns-zone-edit
