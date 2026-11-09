import { Link } from "react-router-dom";

export const LegalPrivacyPage = () => (
  <main className="min-h-screen bg-background p-6 md:p-12">
    <article className="mx-auto max-w-3xl space-y-5">
      <Link to="/register" className="text-primary underline">Torna alla registrazione</Link>
      <h1 className="text-3xl font-bold">Informativa privacy</h1>
      <p className="rounded border border-amber-400/50 bg-amber-50 p-3 text-sm">Contenuto provvisorio — richiede revisione legale professionale prima della pubblicazione.</p>
      <p>Beside tratta i dati necessari per creare e proteggere l'account, verificare l'indirizzo email e fornire le funzionalità richieste. Questi trattamenti sono distinti dal marketing.</p>
      <p>Le comunicazioni promozionali e la profilazione per offerte personalizzate sono facoltative, inizialmente disattivate e revocabili dalle impostazioni dell'account.</p>
    </article>
  </main>
);
