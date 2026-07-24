# Migrazione autenticazione e multi-tenancy

## Cosa avviene al primo avvio

Il lifespan FastAPI esegue una migrazione idempotente prima di accettare richieste:

1. ogni utente legacy senza `company_id` riceve un identificatore aziendale deterministico;
2. viene creata una `Company` separata per ogni account legacy;
3. `user` diventa `owner`; i vecchi amministratori globali vengono associati all'azienda di sistema e ricevono `platform_role=super_admin`;
4. tutti i documenti aziendali con `user_id` ricevono anche `company_id`;
5. i token preventivo ricevono il tenant ricavato dal lavoro collegato;
6. eventuali documenti orfani vengono conservati in un tenant archiviato di quarantena, mai visibile ai clienti;
7. vengono creati gli indici per utenti, aziende, sessioni e token monouso.

Nessun campo legacy viene eliminato. `user_id`, `business_name`, `subscription_tier` e `subscription_status` rimangono disponibili per compatibilità; la fonte autorevole per piano, trial e stato diventa `companies`.

## Compatibilità e rollback

- I vecchi JWT senza `jti` restano validi fino alla scadenza originaria.
- Le vecchie sessioni OAuth in chiaro vengono convertite in hash al primo utilizzo.
- I nuovi JWT sono revocabili e richiedono una sessione non revocata in MongoDB.
- La scadenza del trial viene registrata ma non blocca l'accesso.
- Un rollback applicativo non richiede la rimozione dei nuovi campi.

Prima del primo deploy in produzione creare un backup MongoDB. Non eseguire pulizie dei campi legacy finché tutti i beta tester non hanno verificato i propri dati.
