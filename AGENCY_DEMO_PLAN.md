# Beside Agency — piano demo essenziale (22 novembre 2026)

## Obiettivo
Demo funzionante di Beside adattata a un professionista che realizza siti web. Entro domenica 22/11 (fallback lunedì 23/11) un link HTTPS separato su Railway, con accesso di prova, senza toccare l'app wrapping.

## Stato verificato il 20/11
- Repo: dabruz83/BeSide (GitHub riporta visibility=public).
- Ramo sorgente: staging/2026-11-09-mfa-recovery.
- Ramo esclusivo demo: staging/beside-agency-demo-2026-11-22.
- Frontend: frontend/src/pages/MarketingPage.jsx esiste, importa /marketing/ai/generate e /marketing/lead-sources e /marketing/efforts.
- Backend: backend/server.py contiene POST /marketing/ai/generate (Google GenAI/GEMINI_API_KEY, EXTERNAL_SERVICES_ENABLED) e GET /marketing/ai/history. ATTENZIONE: prompt e system_instruction sono hardcoded per wrap/automotive.
- frontend/src/App.js include già route protetta /marketing e /configurator; frontend/src/components/Layout.jsx nasconde /marketing dalla navigazione e mette Configuratore nella nav e nella barra inferiore.
- Railway esistente ha environments `production` e `staging`; entrambi già usati. **Non modificare nessuno dei due.**
- **Verifica Railway staging**: tra i nomi delle variabili del backend non compaiono GEMINI_API_KEY né EXTERNAL_SERVICES_ENABLED. Il generatore AI non è utilizzabile così com'è: configurare il provider nel nuovo ambiente e provarlo prima di dichiarare la demo pronta, senza riportare valori/segreti.
- **WebAuthn**: backend/server.py vincola espressamente WebAuthn al dominio e all'ID dell'attuale ambiente staging. Su un nuovo dominio Agency va progettata/testata una configurazione RP ID e origin sicura senza rimuovere in blocco i controlli; in caso contrario disabilitare passkey nella demo e mantenere login ordinario.

## Ambito minimo e 4 funzioni di Marketing AI
Una sola pagina `Marketing AI`, senza nuove dashboard avanzate. Conservare stile turchese, UX smartphone, pulsanti grandi, output copiabile.

1. **Cliente ideale**: inseriti servizi (siti vetrina, e-commerce, manutenzione, SEO), area, target; AI propone segmenti, bisogni, vantaggi e 3 CTA. Non inventare numeri o dati di mercato certi.
2. **Idee contenuti**: AI genera 5 idee per un'agenzia web, ognuna con titolo, canale e obiettivo.
3. **Scrivi post**: scegliere tema e tono; AI produce un post pronto per LinkedIn/Instagram con CTA. Mostra copia negli appunti.
4. **Script breve video**: AI produce hook + sequenza semplice per reel di 30–45 s + CTA. Mostra copia negli appunti.

Riutilizzare l'endpoint Gemini e i prompt esistenti, adattandoli ad Agency, mantenendo le 4 operazioni indipendenti (nessun wizard a 6 step). Parametri essenziali, limiti di lunghezza e costi; errore chiaro per provider non configurato, zero output AI simulati spacciati per reali. I dati esempio sono esplicitamente `Dati dimostrativi`.

## Modifiche UI indispensabili
- Modifica esclusivamente su questo ramo Agency.
- Label `Beside Agency` in header/descrizioni dove utile, stessi loghi e palette.
- Nav desktop/mobile: togli `Configuratore` e inserisci `Marketing AI` nella stessa posizione (inclusa tab bar inferiore); nel ramo demo la vecchia route /configurator non deve essere usabile e può reindirizzare a /marketing.
- Conserva funzionalità preesistenti: bacheca, clienti, lavori, preventivi, finanza, agenda, profilo, sicurezza, autenticazione, passkey/Face ID, assistenza. Cambia solo testi automotive evidentemente visibili e dati seed demo, se necessario.
- L'area Analytics/ROI preesistente non richiede sviluppo; se non alimentata, nascondila nella demo per privilegiare le quattro funzioni.

## Isolamento e rilascio
- Git: lavora e committa **solo** su `staging/beside-agency-demo-2026-11-22`; non fare merge su main o staging/2026-11-09-mfa-recovery.
- Railway: predisporre ambiente o progetto **distinto** denominato agency-demo; servizi frontend/backend separati; collegare esplicitamente il nuovo branch. Se non possibile da Codex, fornire istruzioni manuali esatte e non alterare staging/production.
- Database **separato** e vuoto o con soli dati fittizi, senza collegamenti a database/dati clienti dei due ambienti esistenti. Non copiare utenze, sessioni o dati di lavoro. Evitare invii reali di email demo/Stripe e webhooks reali; separare secret e URL di callback.
- Passkey/Face ID legati al dominio/RP ID: **non promettere** riuso delle passkey del dominio esistente; testare nuova registrazione sul dominio demo oppure usare login normale.
- Login demo isolato, non esporre password e chiavi nel codice, log o nei commit. La repository risulta pubblica: verificare la visibilità e non scrivere segreti.
- Verificare CORS_ORIGINS, FRONTEND_PUBLIC_URL, PUBLIC_APP_URL, cookies same-site/secure, proxy /api, domini, HTTPS, redirect e healthcheck.
- Costi: evitare nuove risorse di pagamento/AI inconsapevoli e massimizzare riuso; evidenziare eventuale costo Railway/Gemini prima di provisionare.

## Test di accettazione
- Build frontend e test esistenti backend/frontend; verificare regressioni auth.
- Desktop+iPhone: login, bacheca, finanza, clienti, agenda, preventivi e Marketing AI.
- La nuova nav non mostra configuratore; la route /marketing apre dopo autenticazione e la bottom bar funziona.
- Ognuna delle 4 AI produce una risposta vera e copiabile oppure errore esplicito se configurazione assente. Risposte pertinenti ad agenzie web, zero riferimenti involontari a PPF/wrapping.
- Demo visitatore può accedere solo al proprio ambiente/tenant fittizio. Nessuna visibilità di clienti reali.
- Fine: restituire commit SHA, file cambiati, test eseguiti, stato deploy, URL HTTPS **verificato**, credenziali demo tramite canale sicuro (non log/commit), eventuali blocchi. Non dichiarare link funzionante senza test.

## Principio risparmio token
Leggi solo file interessati, modifica localmente, mostra un diff sintetico e riepilogo. Evita refactor, dipendenze nuove, redesign, scanner full repo ripetuti. Stop e chiedi autorizzazione solo per deploy o risorse esterne con costi; il commit sul ramo Agency è autorizzato.