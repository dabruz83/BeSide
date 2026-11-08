import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import axios from "axios";
import { API } from "@/App";
import { Button } from "@/components/ui/button";

const maskEmail = (value) => {
  const [local, domain] = value.split("@");
  if (!local || !domain) return "indirizzo associato alla registrazione";
  const visible = local.length <= 2 ? local[0] : local.slice(0, 2);
  return `${visible}${"•".repeat(Math.max(1, local.length - visible.length))}@${domain}`;
};

export const EmailVerificationPendingPage = () => {
  const location = useLocation();
  const email = useMemo(() => {
    const fromState = location.state?.email || "";
    if (fromState) sessionStorage.setItem("beside_verification_email", fromState);
    return fromState || sessionStorage.getItem("beside_verification_email") || "";
  }, [location.state]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [retryAfter, setRetryAfter] = useState(0);

  useEffect(() => {
    if (!retryAfter) return undefined;
    const timer = window.setInterval(() => setRetryAfter((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [retryAfter]);

  const resend = async () => {
    if (!email || retryAfter || busy) return;
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

  return <main className="min-h-screen bg-background flex items-center justify-center p-6"><section className="w-full max-w-md space-y-5 text-center"><Link to="/" className="text-3xl font-bold text-primary">BESIDE</Link><h1 className="text-2xl font-semibold">Controlla la tua email</h1><p className="text-muted-foreground">Ti abbiamo inviato un messaggio con il link per verificare il tuo indirizzo. Apri la tua casella di posta e segui le istruzioni per completare la registrazione.</p><p className="font-medium">{maskEmail(email)}</p><Button className="w-full" onClick={resend} disabled={!email || busy || retryAfter}>{busy ? "Invio..." : retryAfter ? `Riprova tra ${retryAfter}s` : "Invia nuovamente l'email"}</Button><Link to="/login" className="block text-sm text-primary underline">Hai già verificato l'email? Accedi</Link>{status && <p className="text-sm text-muted-foreground">{status}</p>}{retryAfter > 0 && <p className="text-sm"><Link to="/support" className="text-primary underline">Hai bisogno di assistenza? Apri una richiesta</Link></p>}<Link to="/login" className="text-primary underline">Vai al login</Link></section></main>;
};
