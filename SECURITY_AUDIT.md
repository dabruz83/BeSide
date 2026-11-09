# BeSide — Security Audit locale

Data: 2026-10-28  
Ambiente: codice del ramo `recovery/beside`, database e servizi locali soltanto. Nessuna richiesta verso produzione, Railway o sistemi di terzi.

## Sintesi

| Gravità | Confermate | Rischi potenziali / non verificati |
|---|---:|---:|
| Critica | 0 | 0 |
| Alta | 0 aperte (2 corrette) | 0 |
| Media | 1 | 1 |
| Bassa | 0 | 2 |

**Bloccanti per la pubblicazione:** sì. La sessione emessa dopo MFA non consente l’accesso alle API protette; il problema runtime deve essere risolto prima del deployment.

## Vulnerabilità confermate

### A-01 — JWT legacy privi di `jti` non revocabili (ALTA) — RISOLTA

- **Componente:** `backend/server.py`, `get_current_user()` (righe 863–868).
- **Evidenza riproducibile:** il ramo `if payload.get("jti")` esegue i controlli su `user_sessions`; un JWT valido senza `jti` viene invece accettato dopo `logout`, revoca sessioni, reset password o sostituzione TOTP, fino alla propria scadenza.
- **Impatto:** una sessione legacy eventualmente ancora in circolazione può restare utilizzabile dopo gli eventi che dovrebbero invalidare tutte le sessioni.
- **Correzione effettuata:** `get_current_user()` ora richiede `jti`, una sessione DB corrispondente di tipo `jwt`, `revoked_at=None` e non scaduta. I JWT legacy privi di `jti` vengono rifiutati senza percorso alternativo.
- **Test mirati:** token moderno con sessione attiva accettato; JWT senza `jti`, con `jti` inesistente, con sessione revocata o dopo logout/revoca rifiutati.
- **Esito:** vulnerabilità risolta e verificata sui controlli mirati; resta da confermare solo il test HTTP contro un MongoDB locale attivo.

### A-02 — MFA non obbligatorio per il login dell’amministratore principale (ALTA) — RISOLTA

- **Componente:** `backend/server.py`, `admin_login()` (righe 4484–4493).
- **Evidenza originaria:** prima della correzione, dopo la verifica di `ADMIN_PASSWORD`, se `admin_user.totp_enabled` era falso il codice chiamava direttamente `create_authenticated_session()` e restituiva una sessione completa.
- **Impatto:** la compromissione della password amministrativa è sufficiente per ottenere privilegi platform-wide; la variabile `ADMIN_PASSWORD` non dovrebbe costituire l’unico fattore in produzione.
- **Correzione effettuata:** `admin_login()` ora rifiuta con 403 ogni `super_admin` senza TOTP e non crea alcuna sessione completa. Gli account con TOTP ricevono soltanto la sessione MFA pendente fino alla verifica del codice.
- **Bootstrap sicuro:** aggiunto `backend/scripts/initialize_admin_totp.py`, eseguibile solo con `APP_ENV=local`; usa un file temporaneo 0600 per l'URI, verifica il codice inserito dall'operatore, salva il segreto cifrato e revoca le sessioni precedenti. Non è un endpoint pubblico e non modifica la password admin.
- **Test mirati:** admin con TOTP/codice corretto accede alla sessione MFA pendente; codice errato negato; admin senza TOTP negato senza sessione; password sola insufficiente; nessun percorso alternativo rilevato.
- **Esito:** vulnerabilità risolta e verificata sui controlli mirati; resta da eseguire il test HTTP con il database locale attivo.

### A-03 — Revoca del contatto fidato senza riautenticazione forte (MEDIA) — RISOLTA

- **Componente:** `backend/server.py`, `POST /api/auth/recovery-contact/revoke` (righe 2907–2925).
- **Evidenza originaria:** prima della correzione l’endpoint richiedeva soltanto `Depends(get_current_user)` e non password/TOTP recenti, mentre invito e modifica del contatto richiedevano riautenticazione.
- **Impatto:** un session cookie rubato può revocare il contatto fidato e impedire il recupero futuro; non concede direttamente accesso ai dati.
- **Correzione effettuata:** `POST /api/auth/recovery-contact/revoke` richiede ora password recente e, se `totp_enabled`, un codice TOTP valido e non riutilizzato. La query di revoca resta vincolata a `current_user.user_id`; l’audit e la notifica esistenti sono invariati.
- **Test mirati:** password + TOTP corretti consentiti; password errata rifiutata; TOTP errato/mancante rifiutato; altro utente senza contatto proprio rifiutato; sessione senza riautenticazione rifiutata.
- **Esito:** vulnerabilità risolta e verificata sui controlli mirati.

### A-04 — Webhook Stripe verificato incompatibile con `StripeObject` (MEDIA, disponibilità/integrità billing) — RISOLTA

- **Componente:** `backend/billing.py`, `POST /api/webhook/stripe` (righe 99–119).
- **Evidenza originaria:** `backend/tests/test_billing.py::test_verified_webhook_activates_once` falliva con `AttributeError: 'get' ... StripeObject`; il codice usava `obj.get(...)`, ma lo SDK restituisce un oggetto Stripe non assimilabile a `dict` in questa versione.
- **Impatto:** eventi firmati validi possono restituire 500 prima dell’aggiornamento dell’abbonamento; la fatturazione può rimanere in stato pendente e Stripe può ritentare l’evento.
- **Correzione effettuata:** aggiunto accesso indicizzato compatibile sia con `StripeObject` sia con dizionari, validazione dei campi obbligatori e gestione degli eventi incompleti senza attivazioni. La verifica della firma, l’idempotenza e il vincolo `company_id` sono invariati.
- **Test mirati:** firma valida e aggiornamento abbonamento; firma non valida; evento duplicato; dati mancanti/mismatch/importo non valido senza attivazione indebita.
- **Esito:** vulnerabilità risolta e verificata con simulazioni locali dello SDK, senza credenziali o rete Stripe.

## Risultati nuovi — campagna dinamica locale

Database usato: `beside_test_dynamic_20261029`, creato e rimosso al termine. Nessun dato del database di sviluppo è stato usato o modificato.

### D-01 — Sessione post-MFA rifiutata dalle API protette (MEDIA) — RISOLTA

- **Evidenza originaria:** login admin con TOTP corretto restituiva una sessione completa tramite `POST /api/auth/2fa/verify` (HTTP 200), ma una successiva `GET /api/admin/stats` con quella sessione restituiva HTTP 401 `Verifica 2FA richiesta`.
- **Componente:** controllo `get_current_user()` applicato anche a sessioni JWT già emesse dopo la verifica MFA.
- **Impatto:** gli utenti con 2FA non possono utilizzare dashboard e API protette dopo un login riuscito; non è stato osservato un bypass del secondo fattore.
- **Correzione effettuata:** le sessioni JWT create dal flusso server-side di verifica TOTP sono marcate `mfa_verified`; `get_current_user()` consente solo sessioni JWT attive, con `jti` valido, non scadute e con tale marcatura quando l'utente ha TOTP attivo. Le sessioni `mfa_pending` restano escluse e il client non può impostare il flag.
- **Test mirati:** admin con password+TOTP corretto accede alle API; password senza TOTP rifiutata; sessione pendente, revocata o scaduta rifiutata; TOTP errato rifiutato; utente normale con sessione valida senza regressioni.
- **Esito:** vulnerabilità risolta e verificata con 7 scenari HTTP su database locale isolato, tutte le asserzioni superate.

### D-02 — MongoDB locale raggiungibile senza autenticazione (MEDIA, locale verificato / Railway da verificare)

- **Evidenza riproducibile:** su un database temporaneo, una connessione PyMongo senza credenziali a `127.0.0.1:27018` ha potuto leggere, inserire e modificare documenti. Il database di prova è stato eliminato al termine.
- **Protezione locale verificata:** il processo ascolta esclusivamente su `127.0.0.1:27018`; non è stata rilevata un'esposizione su interfacce esterne. L'autenticazione non è attiva nel servizio locale condiviso.
- **Correzione:** nessuna modifica automatica applicata: attivare autenticazione sul servizio esistente richiederebbe nuove credenziali/configurazioni condivise e potrebbe interrompere lo sviluppo. Il rischio è confinato al Mac/loopback.
- **Prerequisiti Railway:** database nuovo con autenticazione e credenziali separate; connessione privata backend-MongoDB tramite riferimento dinamico `MONGO_URL`; nessun accesso pubblico; volume persistente e backup; verifica di TLS/ACL/rete prima dell'apertura del backend.
- **Stato:** sicurezza locale di rete verificata; autenticazione, TLS, ACL e backup dell'istanza Railway restano non verificati. Le vecchie credenziali Railway non sono state utilizzate.

## Esiti della campagna dinamica

- **24 test/assertion superati:** isolamento tenant A/B, ruoli e injection privilegi, cookie HttpOnly/SameSite, CSRF Origin, logout/revoca sessione, blocco recovery senza contatto, scope `RECOVERY_CONTACT`, stati simulati pre/post 24 ore, P-01 (header non riflessi e `no-store`), MFA admin password-only bloccato e codice TOTP errato rifiutato.
- **1 test fallito:** accesso admin/API dopo verifica TOTP corretta (D-01).
- **Dipendenze:** `pip-audit` in ambiente temporaneo isolato: nessuna vulnerabilità nota; `npm audit --offline`: 0 vulnerabilità.
- **MongoDB/servizi:** backend dinamico avviato sulla porta 18100; database di test eliminato al termine. Il backend/DB di sviluppo non è stato alterato.
- **Non completato:** verifica TLS/autenticazione/ACL del MongoDB Railway e test di invio email reale; nessun servizio esterno è stato contattato.

## Rischi potenziali e controlli non completati

### P-01 — Password nei request header del consulto recovery (MEDIA, rischio residuo)

`GET /api/auth/2fa/recovery/status` riceve la password in `X-Recovery-Password`. Il test locale ha confermato `401`, assenza del valore nella risposta e `Cache-Control: no-store`; resta da verificare che proxy e access log di produzione non registrino header sensibili. Preferire un meccanismo di prova temporaneo non riutilizzabile.

### P-02 — Configurazione TLS/MongoDB di produzione (MEDIA, non verificato)

Il codice richiede variabili di ambiente ma non può dimostrare da solo TLS, autenticazione e ACL del MongoDB Railway né il terminatore HTTPS. Verificare `MONGO_URL` con TLS/autenticazione, certificati, rete privata e `COOKIE_SECURE=true` prima del deployment.

### P-03 — Dipendenze (BASSA, verificata localmente)

`pip check` ha restituito **No broken requirements found**; `pip-audit -r backend/requirements.txt` nell’ambiente temporaneo isolato e `npm audit --offline` sul frontend hanno restituito zero vulnerabilità note. Bandit/Semgrep non sono stati eseguiti; il controllo SAST resta non verificato.

### P-04 — Runtime MongoDB e isolamento tenant (BASSA, verificato localmente)

I test HTTP locali hanno confermato isolamento tra aziende A/B, rifiuto dell’escalation dei ruoli e blocco delle API aziendali per `RECOVERY_CONTACT`. La connessione MongoDB locale senza autenticazione su loopback è stata rilevata e documentata come D-02; TLS/ACL del database di produzione restano da verificare.

## Controlli superati

- `backend/tests/test_deployment.py` e `backend/tests/test_billing.py`: **32 superati**, 1 escluso per isolamento mirato del test webhook fallito.
- Test Stripe firmato contraffatto: superato (rifiuto HTTP 400).
- Test di isolamento tenant per lo stato subscription: superato nei test mockati.
- Test di checkout: prezzo e URL sono presi dal server, non da input client; superato.
- Test statico di header: `X-Content-Type-Options`, `X-Frame-Options`, CSP con `frame-ancestors 'none'`: superato.
- Scansione mirata dei file versionati per chiavi private e pattern di chiavi Stripe/Google: nessun segreto reale rilevato. I valori presenti nella documentazione sono placeholder.
- Nessun file `.env`, database locale, log o ambiente virtuale è versionato.

## Verifiche non completate

- Verifica MongoDB di produzione: autenticazione, TLS, ACL, rete privata, query profiling e redazione dei log.
- Invio email reale per notifiche di sicurezza e recupero.
- Analisi SAST Bandit/Semgrep.
- Simulazione completa del ciclo Stripe con oggetti dello SDK dopo la correzione A-04.
- Percorso completo di approvazione/sostituzione 2FA oltre gli stati simulati del periodo di 24 ore.

## Ordine consigliato delle correzioni

1. Correggere D-01: distinguere il JWT post-MFA dalla sessione `mfa_pending`, così l’admin autenticato può accedere alle API protette.
2. Verificare D-02/P-02 su MongoDB Railway: autenticazione, TLS, ACL e rete privata; mantenere `COOKIE_SECURE=true`.
3. Verificare il logging del proxy per P-01 e configurare il provider email reale.
4. Completare i controlli non eseguiti (SAST, ciclo Stripe e flusso completo di sostituzione 2FA).
