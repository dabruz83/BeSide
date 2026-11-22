## Stato implementazione — 22 novembre 2026

**Ramo canonico Agency**: `staging/agency` (creato dal ramo snapshot `staging/beside-agency-demo-2026-11-22`, derivato dallo staging funzionante). Il ramo wrapping `staging/2026-11-09-mfa-recovery` è invariato. Non fondere i due branch automaticamente.

### Implementato solo su `staging/agency`
- `frontend/src/components/Layout.jsx`: voce Configuratore sostituita da Marketing AI nella nav desktop/mobile, etichetta Agency.
- `frontend/src/App.js`: la vecchia rotta `/configurator` reindirizza a `/marketing`.
- `frontend/src/pages/MarketingPage.jsx`: cinque aree (Panoramica, Assistente AI, I miei contenuti, Calendario editoriale, Guida), domande guidate, quattro generazioni AI, editor, bozze, stati, programmazione manuale e copia testo.
- `backend/agency_marketing.py`: REST API con CRUD persistente di contenuti per azienda e generazione Gemini per web agency, massimo 20 richieste/giorno/azienda (quando RATE_LIMITING_ENABLED=true).
- `backend/server.py`: router registrato, CORS Agency separato dai domini produzione, origine passkey Agency esattamente configurabile con APP_ENV=agency e controlli Railway.
- `backend/multitenancy.py`: collection di contenuti inclusa nell'indicizzazione per azienda. Anche la cancellazione account elimina i dati marketing.
- `frontend/src/pages/CalendarPage.jsx`: UX agenda precedente conservata; opzioni lavorazioni aggiornate a sito web, e-commerce, SEO ecc.
- `JobsPage.jsx`, `OnboardingPage.jsx`, `DashboardPage.jsx`, `QuotePage.jsx`: etichette/servizi per web agency, con compatibilità per voci legacy.

### NON ancora verificato / NON ancora attivo
- **Non è stato eseguito un build/test runtime** in questo aggiornamento: al momento solo verifica statica del codice e dei riferimenti GitHub.
- **Non esiste ancora un ambiente Railway Agency** né un link demo testato. Non riconnettere gli attuali servizi staging/production a questo branch.
- Prima del deploy, provisionare ambiente separato e database isolato, settare variabili senza copiare segreti o dati da produzione, impostare FRONTEND_PUBLIC_URL/PUBLIC_APP_URL/CORS_ORIGINS e login del test tenant.
- Per attivare Gemini: EXTERNAL_SERVICES_ENABLED=true e GEMINI_API_KEY in ambiente Agency (GEMINI_MODEL facoltativo). Se assenti, l'interfaccia segnala errore esplicito.
- Per attivare Face ID/passkey nel nuovo dominio Railway: APP_ENV=agency, WEBAUTHN_ENABLED=true, WEBAUTHN_RP_ID uguale al dominio frontend Agency, WEBAUTHN_ORIGIN uguale all'origin HTTPS, AGENCY_WEBAUTHN_ORIGIN uguale all'origin HTTPS e AGENCY_RAILWAY_ENVIRONMENT_ID uguale all'ID del **nuovo** ambiente Railway. Registrare una passkey nuova sul dominio della demo e testarla; non riusare passkey del dominio wrapping.
- Calendario editoriale e agenda lavorativa sono raggiungibili dalla stessa app, ma **non condividono ancora eventi automatici nella griglia**; il calendario editoriale memorizza e mostra le date programmate e offre collegamento all'agenda. Pubblicazione social automatica non inclusa.
- Prima di presentare la demo: lanciare `npm run build` e `npm test` in `frontend`; test Python esistenti backend con ambiente test isolato, prova autenticazione MFA/passkey, creazione preventivo, modifica appuntamento, salvataggio bozza, approvazione, programmazione, generazione AI, isolamento aziende.

---

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

Riutilizzare l'endpoint Gemini e i prompt esistenti, adattandoli ad Agency, mantenendo 4 strumenti AI utilizzabili autonomamente, più un mini-percorso guidato iniziale con poche domande e possibilità di saltare i passaggi. Parametri essenziali, limiti di lunghezza e costi; errore chiaro per provider non configurato, zero output AI simulati spacciati per reali. I dati esempio sono esplicitamente `Dati dimostrativi`.

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

## Revisione 22/11 — Sezione Marketing AI completa ma minimale (prioritaria)
Questa revisione sostituisce la struttura 'una sola pagina con quattro pulsanti' laddove confligge con essa. Il requisito ora è un'area Marketing AI con percorso guidato, raccolta persistente di contenuti, stati, agenda editoriale e piccole guide. Mantenerla leggera e implementarla prima degli extra.

### Conferma agenda
- Confrontato `frontend/src/pages/CalendarPage.jsx` sui rami `staging/2026-11-09-mfa-recovery` e `staging/beside-agency-demo-2026-11-22`: stesso blob SHA `42c7bcfb0293a4c170e5d0af25e629036d63d39c`.
- Compare-commits: ramo Agency avanti di soli commit documentali, nessun commit mancante dal ramo staging originale al momento della verifica.
- L'agenda esistente contiene ancora tipologie per wrapping/PPF: nella versione Agency adattare le etichette pertinenti per web agency, senza riscrivere la UX calendario e senza modificare l'originale.

### Menù interno Marketing AI
Mantenere la sezione singola in navigazione principale al posto di Configuratore. All'interno, tab leggere:
1. **Panoramica** (landing): pulsante grande `Crea con AI`, contatori Bozze / Da approvare / Programmati / Pubblicati, prossimi post e suggerimento pratico.
2. **Assistente AI**: mini wizard progressivo + quattro strumenti Cliente ideale, Idee contenuti, Crea post, Script reel. Consentire modifica manuale testo e `Salva bozza` in ogni momento.
3. **Contenuti**: libreria ricercabile/filtrabile con card contenuto, titolo, canale, formato, status, data, modifica, duplica, copia; no contenuti fake mescolati a reali.
4. **Calendario editoriale**: vista semplice per data, selezione giorno e contenuti previsti, con collegamento all'agenda lavorativa esistente.
5. **Guida e consigli**: onboarding in 3–5 schede compatte, spiegazioni di post/reel/CTA/tono, buone pratiche di revisione e non pubblicazione automatica.

### Domande guidate iniziali (solo pochi tap)
- Cosa vuoi promuovere? (Sito vetrina / E-commerce / SEO / Manutenzione / Altro)
- Qual è l'obiettivo? (Far conoscere / Ottenere contatti / Vendere / Fidelizzare)
- A chi ti rivolgi? (Professionisti / Attività locali / Aziende / Altro; città facoltativa)
- Dove pubblicherai? (Instagram / LinkedIn / Facebook / Altro)
- Che formato e tono vuoi? (Post / Carosello / Reel; Professionale / Semplice / Creativo)
Pulsante `Genera`; suggerire un template coerente e generare contenuto con API AI reale. Permettere di saltare, tornare indietro o cambiare risposte. Salvare preferenze minime per futuri contenuti se l'utente lo decide; niente generazioni automatiche costose all'apertura.

### Stato e modello persistente contenuto
Stati chiari: `draft` (bozza/incompleto), `pending_approval` (da approvare), `ready` (approvato/pronto), `scheduled` (programmato), `published` (pubblicato, marcato manualmente). Il menu home mostra 4 gruppi, `ready` confluisce nei `Pronti per pubblicazione` nella libreria. Nome social, content_type (post/carousel/reel_script), titolo, testo, prompt/context minimale, owner_company_id, owner_user_id, timestamp creazione/modifica, scheduled_at opzionale e published_at opzionale.
- Tutte le scritture e letture devono rispettare il perimetro company/utente già definito da Beside. Validazioni e autorizzazioni server-side.
- Riapri una bozza esattamente da dove era rimasta (domande e testo già presenti); il testo generato resta modificabile e salvabile. Stato cambia solo per azione esplicita.
- Il processo `Da approvare` nella prima demo è un'etichetta di stato, non un sistema multi-utente di approvazione; nessun invio automatico a revisori.

### Integrazione agenda
- **Agenda operativa originale** resta per appuntamenti/scadenze; **calendario editoriale** per date di pubblicazione. Non trasformare i post in appuntamenti con postazioni o ore di lavorazione.
- Se tecnicamente poco costoso, visualizzare nel calendario operativo gli eventi editoriali come categoria `Marketing` filtrabile, non sovrapposti alle ore e con stile distinto. Per la demo il collegamento dalla sezione Marketing a /calendar e la visualizzazione di una data pianificata in entrambe le aree sono sufficienti se gestiti senza duplicazione o conflitti.
- Programmazione = pianificazione interna/reminder visivo, **non** auto-pubblicazione su Instagram/Facebook/LinkedIn. Marcatura pubblicato manuale; nessuna integrazione social esterna necessaria nella demo.

### Ottimizzazione per la demo domenicale
Ordine reale MVP: (1) navigazione e landing, (2) wizard e 4 generazioni Gemini, (3) salvataggio/modifica stati bozza/da approvare/pronto/programmato/pubblicato, (4) calendario editoriale con data, (5) guida corta.
Usare dati test esplicitamente dimostrativi. Nessuna modifica alla produzione o allo staging originale, nessun nuovo costo senza consenso. Se l'integrazione visuale nel calendario operativo comporta rischio di regressioni, rimandare il doppio display: non rinviare il salvataggio delle date né rompere l'agenda esistente.
