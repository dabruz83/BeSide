import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import axios from "axios";
import { API } from "@/App";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MailCheck } from "lucide-react";
import { ActivationProgress } from "@/components/ActivationProgress";

const maskEmail = (value) => {
  const [local, domain] = value.split("@");
  if (!local || !domain) return "indirizzo associato alla registrazione";
  const visible = local.length <= 2 ? local[0] : local.slice(0, 2);
  return `${visible}${"•".repeat(Math.max(1, local.length - visible.length))}@${domain}`;
};

export const EmailVerificationPendingPage = () => {
  const location = useLocation();
  const initialEmail = useMemo(() => {
    const fromState = location.state?.email || "";
    if (fromState) sessionStorage.setItem("beside_verification_email", fromState);
    return fromState || sessionStorage.getItem("beside_verification_email") || "";
  }, [location.state]);
  const [email, setEmail] = useState(initialEmail);
  useEffect(() => { if (initialEmail) setEmail(initialEmail); }, [initialEmail]);
  const validEmail = /^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(email.trim());
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [retryAfter, setRetryAfter] = useState(0);

  useEffect(() => {
    if (!retryAfter) return undefined;
    const timer = window.setInterval(() => setRetryAfter((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [retryAfter]);

  const resend = async () => {
    if (!validEmail || retryAfter || busy) return;
    setBusy(true); setStatus("");
    try {
      const response = await axios.post(`${API}/auth/email-verification/request`, { email });
      setStatus(response.data.message || "Se l'indirizzo è registrato e non verificato, riceverai una nuova email.");
      setRetryAfter(60);
    } catch (error) {
      const retry = Number(error.response?.headers?.["retry-after"] || 0);
      if (error.response?.status === 429) setRetryAfter(retry || 60);
      setStatus(error.response?.data?.detail || "Richiesta non disponibile. Attendi prima di riprovare.");
    } finally { setBusy(false); }
  };

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-6">
      <section className="w-full max-w-md space-y-5 rounded-xl border bg-card p-6 text-center shadow-sm">
        <Link to="/" className="text-3xl font-bold text-primary">BESIDE</Link>
        <ActivationProgress current={1} />
        <div className="flex justify-center"><MailCheck aria-hidden="true" className="h-11 w-11 text-secondary" /></div>
        <h1 className="text-2xl font-semibold">Controlla la tua email</h1>
        <p className="text-sm text-muted-foreground">Ti abbiamo inviato un link per verificare il tuo indirizzo. Apri Mail, Gmail o la tua casella di posta e completa la verifica per proseguire.</p>
        {initialEmail ? <p className="break-all font-medium">{maskEmail(email)}</p> : (
          <div className="space-y-2 text-left">
            <label htmlFor="verification-resend-email" className="text-sm font-medium">Email da verificare</label>
            <Input id="verification-resend-email" type="email" autoComplete="email" value={email}
              onChange={(event) => setEmail(event.target.value)} placeholder="tuaemail@esempio.it" />
            <p className="text-xs text-muted-foreground">Indica l'indirizzo usato durante la registrazione per ricevere un nuovo link.</p>
          </div>
        )}
        <Button className="w-full" onClick={resend} disabled={!validEmail || busy || retryAfter > 0}>
          {busy ? "Invio in corso..." : retryAfter ? `Puoi reinviare tra ${retryAfter}s` : "Reinvia link di verifica"}
        </Button>
        {status && <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{status}</p>}
        <Link to="/login" className="block text-sm font-medium text-primary underline">Hai già verificato l'email? Accedi</Link>
        <Link to="/support" className="block text-xs text-muted-foreground underline">Hai bisogno di assistenza?</Link>
      </section>
    </main>
  );
};
