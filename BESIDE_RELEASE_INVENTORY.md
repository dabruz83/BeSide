# BeSide — inventario di rilascio

Ricognizione eseguita il 6 novembre 2026. Il report è locale, non tracciato e non è stato incluso in alcun commit.

## Riferimenti Git

| Riferimento | Stato |
|---|---|
| Repository | `https://github.com/dabruz83/BeSide.git` |
| Checkout principale | `/Users/davidebruzzese/Documents/BeSide`, branch `recovery/beside` |
| Branch Railway/GitHub | `codex/auth-multitenant-foundation` |
| Commit distribuito | `a9931c53e3222195fa5dfec65fd632f1a9494893` (`security: consolidate authentication and MFA flow`) |
| Branch locali/remoti | `main`, `recovery/beside`, `origin/main`, `origin/codex/auth-multitenant-foundation`, `origin/codex/railway-deploy` |
| Stash | Nessuno |
| Worktree ancora presenti | `/private/tmp/beside-onboarding-release` a `31375b0`; `/private/tmp/beside-privacy-release` a `8da01f1` |

Il fetch remoto è stato eseguito senza modificare il checkout principale. Il commit remoto `a9931c5` è il riferimento corretto; il precedente `af56bfc` era obsoleto.

## Stato delle funzionalità

| Funzionalità | Stato locale | Stato GitHub | Stato Railway | Azione / priorità |
|---|---|---|---|---|
| Login clienti, sessioni JWT/cookie, verifica email, MFA utenti | Modifiche locali storiche e file condivisi modificati | **Presente** in `a9931c5` | **Pubblicata** | D: mantenere; aggiornare solo test legacy |
| MFA Platform Owner e blocco sessioni `mfa_pending` | Presente nel blocco consolidato locale | **Presente** in `a9931c5` | **Pubblicata** | D |
| Beta privata e `BETA_ALLOWED_EMAILS` | Il `server.py` del checkout locale ha rimosso i controlli beta rispetto al remoto | **Presente** in `a9931c5` | **Pubblicata** | B: non pubblicare il `server.py` locale senza ripristinare i controlli |
| Resend e reinvio verifica email | Presente; helper con 3 reinvii/10 minuti, attesa 60 s e `Retry-After` | **Presente** in `a9931c5` | **Pubblicata** | D; verificare solo configurazione reale quando necessario |
| Pagina `Controlla la tua email` e Support Center | Presente localmente e nel remoto | **Presente** in `a9931c5` | **Pubblicata** | D |
| Privacy, consensi e pagine legali provvisorie | Presente localmente e nel remoto | **Presente** in `a9931c5` | **Pubblicata** | D; testi legali da revisionare prima del pubblico |
| Onboarding personalizzato | Presente localmente e nel remoto; flag predefinito disattivato | **Presente** in `a9931c5` | **Pubblicata** | D/B: abilitare solo dopo prova controllata |
| Multi-tenant e ruoli Company Admin/Platform Owner | Presente nel backend remoto e locale | **Presente** in `a9931c5` | **Pubblicata** | D |
| Billing/Stripe/webhook idempotente | `backend/billing.py` presente e usato dal server | **Presente** in `a9931c5` | **Pubblicata**, integrazione reale disattivata finché non configurata | D/B |
| Trial | Trial standard di 7 giorni in registrazione | **Presente** | **Pubblicato** | B: nessun pannello per durata personalizzata |
| Referral, promozioni, pacchetti e concessione moduli | Nessuna implementazione completa individuata | Assenti | Assenti | C: sviluppo futuro |
| Pannello Platform Owner/AdminPage | Utenti, piani/stati, pagamenti, statistiche, chat, Support Center | **Presente** in `a9931c5` | **Pubblicato** | D |
| Configuratore 2D e asset veicoli | 257 asset locali e modifiche UI/zone/colore | Non presenti nel branch Railway | Non pubblicati | A/B: consolidare separatamente dopo verifica |
| Photo AI fotografico | Adapter/backend presente nel remoto; UI avanzata e maschere locali | Backend presente; UI foto completa solo in locale | Backend pubblicato, flusso UI incompleto | B/C: testare e collegare progressivamente |
| Audit sicurezza | `SECURITY_AUDIT.md` solo locale | Assente | Assente | B: conservare come documento di lavoro |
| Script inizializzazione MFA admin | `backend/scripts/initialize_admin_totp.py` solo locale | Assente | Assente | A/B: valutare prima di pubblicare |

## Modifiche locali non pubblicate

- Commit locali non presenti nel branch Railway: `303090e`, `8c9d471`, `a04ab25`, `ab0b620`, `48c8f15`. Le loro funzioni di sicurezza sono state consolidate nel commit remoto `a9931c5`; non vanno ripubblicati come cherry-pick duplicati.
- Modifiche non committate: `WrapConfigurator.jsx`, `Personalize.jsx`, `DashboardPage.jsx`, `ProfilePage.jsx`, `LandingPage.jsx`, oltre a `.env.example` e file condivisi già presenti nel remoto.
- Asset configuratore: circa 257 file sotto `frontend/public/assets/vehicles/`, incluse immagini/layer City Car e altre categorie. Non sono nel branch Railway.
- Componenti configuratore locali: `Personalize.jsx`, `BeforeAfterSlider.jsx`, `PhotoMaskEditor.jsx`, `photoAi.js` e relative modifiche a `WrapConfigurator.jsx`.
- File locali non tracciati: `SECURITY_AUDIT.md`, `backend/scripts/initialize_admin_totp.py` e i componenti configuratore sopra indicati. Nessun file `.env` reale è stato incluso o ispezionato nel report.

## File condivisi e rischi di conflitto

- `backend/server.py`: già pubblicato nel blocco consolidato; la copia locale differisce di 10 righe e rimuove i controlli beta. È il rischio principale: non usare il file locale per un nuovo rilascio senza ripristinare `BETA_MODE_ENABLED` e `BETA_ALLOWED_EMAILS`.
- `backend/billing.py`: pubblicato con il blocco consolidato; non risultano modifiche locali funzionali da promuovere separatamente.
- `frontend/src/App.js`, `AdminPage.jsx`: versione funzionale già pubblicata; le modifiche locali del Support Center sono già riflesse nel remoto.
- Componenti configuratore: modifiche locali dipendenti tra loro; richiedono un rilascio separato con asset, dati e stato configuratore coerenti.

## Piano sicuro

### A — Pronto per pubblicazione

Nessun blocco di autenticazione urgente: il blocco MFA/Resend/onboarding è già in `a9931c5`. Eventuali aggiunte future devono partire dal branch remoto aggiornato, non da `recovery/beside` senza fusione.

### B — Da completare prima di pubblicare

1. Aggiornare i due test legacy: uno registra senza `terms_accepted`; l’altro richiede `SameSite=Lax`, mentre la produzione usa `Secure` + `SameSite=None`.
2. Non promuovere il `server.py` locale finché non vengono reintegrati i controlli beta.
3. Verificare la UI Photo AI e le maschere con il backend già pubblicato.
4. Revisionare professionalmente i testi legali provvisori.

### C — Sviluppi futuri

Configuratore completo con tutti gli asset, concessione moduli/pacchetti, trial personalizzati, promozioni/referral, fatturazione avanzata, notifiche email Support Center e collegamento definitivo `admin.mybeside.pro`.

#### Fase commerciale — requisito aggiunto: Entitlement Management

Da sviluppare nel pannello Platform Owner, riutilizzando billing/Stripe e AdminPage senza creare un secondo sistema di autorizzazione:

- catalogo completo dei pacchetti e delle funzionalità per azienda, incluse quelle non acquistate;
- stati distinti: incluso, acquistato, prova gratuita, concessione manuale, disattivato e pagamento da verificare;
- concessioni manuali limitate al Platform Owner, con durata, scadenza, motivazione, revoca e audit log;
- scadenza automatica senza alterare i piani Stripe acquistati e senza addebiti Stripe;
- riconciliazione pagamenti/diritti effettivi con segnalazione delle anomalie;
- enforcement lato backend per azienda, limiti configurabili per funzioni AI e isolamento multi-tenant.

Stato attuale: **non implementato**. `backend/billing.py` gestisce checkout, portale, stato abbonamento e webhook; `AdminPage.jsx` mostra utenti, piani/stati e pagamenti, ma non esiste ancora un modello o endpoint di entitlement/concessione.

### D — Già pubblicato

Autenticazione/MFA, verifica email e reinvio, beta privata, onboarding, consensi privacy, multi-tenant, billing adapter, Platform Owner/AdminPage e Support Center sono inclusi nel commit distribuito `a9931c5`.

## Sequenza consigliata

1. Usare `origin/codex/auth-multitenant-foundation` come unica base.
2. Aggiornare i test legacy senza cambiare i requisiti di sicurezza.
3. Separare il configuratore in un worktree dedicato includendo asset e componenti dipendenti.
4. Eseguire build/test mirati del configuratore e verificare che il `server.py` non perda beta/MFA.
5. Pubblicare il configuratore in un commit isolato; non mischiare billing, autenticazione o Support Center.
6. Solo dopo, configurare `admin.mybeside.pro` e verificare il deploy Railway.

