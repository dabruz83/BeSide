import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import axios from "axios";
import { API } from "@/App";
import { ActivationProgress } from "@/components/ActivationProgress";
import { Button } from "@/components/ui/button";

export const VerifyEmailPage = () => {
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get("token") || "", [searchParams]);
  const [status, setStatus] = useState(token ? "loading" : "error");
  const [message, setMessage] = useState(token ? "Stiamo verificando il tuo indirizzo email..." : "Link di verifica mancante.");
  const requests = useRef(new Map());

  useEffect(() => {
    let active = true;
    if (!token) {
      setStatus("error");
      setMessage("Link di verifica mancante.");
      return undefined;
    }
    setStatus("loading");
    setMessage("Stiamo verificando il tuo indirizzo email...");
    // A verification token is single-use. Reuse the same request under React
    // StrictMode effect replay; do not submit it a second time after failures.
    if (!requests.current.has(token)) {
      requests.current.set(token, axios.post(`${API}/auth/email-verification/verify`, { token }, { timeout: 15000 }));
    }
    requests.current.get(token)
      .then((response) => {
        if (!active) return;
        setStatus("success");
        setMessage(response.data.mfa_setup_required
          ? "Indirizzo email verificato. Dopo l'accesso configurerai l'autenticazione a due fattori."
          : "Indirizzo email verificato. Ora puoi accedere al tuo account.");
      })
      .catch((error) => {
        if (!active) return;
        setStatus("error");
        if (!error.response) {
          setMessage("Non possiamo confermare l'esito della verifica. Prova ad accedere: l'email potrebbe essere già verificata. In caso contrario richiedi un nuovo link.");
        } else {
          setMessage(error.response?.data?.detail || "Il link non è valido o è scaduto. Richiedine uno nuovo.");
        }
      });
    return () => { active = false; };
  }, [token]);

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-6">
      <section className="w-full max-w-md space-y-6 rounded-xl border bg-card p-6 text-center shadow-sm">
        <Link to="/" className="text-3xl font-bold text-primary">BESIDE</Link>
        <ActivationProgress current={status === "success" ? 2 : 1} />
        <div className="flex justify-center" aria-hidden="true">
          {status === "loading" ? <Loader2 className="h-11 w-11 animate-spin text-secondary" />
            : status === "success" ? <CheckCircle2 className="h-11 w-11 text-secondary" />
            : <AlertCircle className="h-11 w-11 text-destructive" />}
        </div>
        <h1 className="text-2xl font-semibold">
          {status === "loading" ? "Verifica email in corso" : status === "success" ? "Email verificata!" : "Verifica non confermata"}
        </h1>
        <p role={status === "error" ? "alert" : "status"} aria-live="polite" aria-busy={status === "loading"}
          className={status === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>{message}</p>
        {status === "success" && <Button className="w-full" asChild><Link to="/login">Continua con l'accesso</Link></Button>}
        {status === "error" && (
          <div className="space-y-3">
            <Button className="w-full" asChild><Link to="/login">Prova ad accedere</Link></Button>
            <Link to="/verify-email/pending" className="block text-sm text-primary underline">Richiedi un nuovo link</Link>
          </div>
        )}
      </section>
    </main>
  );
};
