const STEPS = ["Account", "Email", "Sicurezza", "Pronto"];

/** Informational only: never determines authentication or unlocks protected pages. */
export const ActivationProgress = ({ current = 0 }) => (
  <nav aria-label="Avanzamento attivazione account" className="w-full">
    <ol className="grid grid-cols-4 gap-2">
      {STEPS.map((step, index) => (
        <li key={step} className="min-w-0 text-center" aria-current={index === current ? "step" : undefined}>
          <div
            aria-hidden="true"
            className={`h-1.5 rounded-full ${index <= current ? "bg-secondary" : "bg-muted"}`}
          />
          <span className={`mt-2 block text-[11px] sm:text-xs ${index === current ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
            {step}
          </span>
        </li>
      ))}
    </ol>
  </nav>
);
