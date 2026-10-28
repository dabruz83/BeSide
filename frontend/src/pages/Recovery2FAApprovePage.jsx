import { useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { API } from "@/App";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Recovery2FAApprovePage = () => {
  const [form, setForm] = useState({ request_token: "", verification_number: "", email: "", password: "", code: "" });
  const [state, setState] = useState("idle");
  const [message, setMessage] = useState("Inserisci i dati ricevuti dal richiedente e verifica la tua identità.");

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const approve = async (event) => {
    event.preventDefault();
    setState("loading");
    try {
      const response = await axios.post(`${API}/auth/2fa/recovery/approve`, form);
      if (response.data.status !== "approved") throw new Error("Risposta inattesa");
      setState("success");
      setMessage("Richiesta approvata. Il richiedente potrà proseguire con il periodo di sicurezza previsto.");
      setForm((current) => ({ ...current, request_token: "", verification_number: "", password: "", code: "" }));
    } catch (error) {
      setState("error");
      const status = error.response?.status;
      const detail = error.response?.data?.detail;
      setMessage(status === 400 ? "Richiesta scaduta, già utilizzata o non valida."
        : status === 401 ? "Password o codice TOTP non validi."
          : status === 403 ? "Non sei il contatto autorizzato per questa richiesta."
            : status === 409 ? "La richiesta è già stata approvata o conclusa."
              : (detail || "Impossibile approvare la richiesta."));
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-md space-y-6 rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <Link to="/login" className="block text-center text-3xl font-bold text-primary">BESIDE</Link>
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold">Assistenza recupero account</h1>
          <p className="text-sm text-muted-foreground">Nessuna richiesta viene mostrata automaticamente. Usa solo i dati comunicati direttamente dal richiedente.</p>
        </div>
        {state !== "success" && <form onSubmit={approve} className="space-y-4">
          <div className="space-y-2"><Label htmlFor="recovery-request-token">Token richiesta</Label><Input id="recovery-request-token" type="password" value={form.request_token} onChange={(event) => update("request_token", event.target.value)} required autoComplete="off" /></div>
          <div className="space-y-2"><Label htmlFor="recovery-verification-number">Numero temporaneo</Label><Input id="recovery-verification-number" inputMode="numeric" maxLength={8} value={form.verification_number} onChange={(event) => update("verification_number", event.target.value.replace(/\D/g, "").slice(0, 8))} required /></div>
          <div className="space-y-2"><Label htmlFor="recovery-contact-email">Email del contatto</Label><Input id="recovery-contact-email" type="email" value={form.email} onChange={(event) => update("email", event.target.value)} required autoComplete="email" /></div>
          <div className="space-y-2"><Label htmlFor="recovery-contact-password">Password</Label><Input id="recovery-contact-password" type="password" value={form.password} onChange={(event) => update("password", event.target.value)} required autoComplete="current-password" /></div>
          <div className="space-y-2"><Label htmlFor="recovery-contact-totp">Codice TOTP (6 cifre)</Label><Input id="recovery-contact-totp" inputMode="numeric" maxLength={6} value={form.code} onChange={(event) => update("code", event.target.value.replace(/\D/g, "").slice(0, 6))} required autoComplete="one-time-code" /></div>
          <Button type="submit" className="w-full" disabled={state === "loading" || form.verification_number.length !== 8 || form.code.length !== 6}>{state === "loading" ? "Verifica in corso..." : "Approva richiesta"}</Button>
        </form>}
        <p className={state === "error" ? "text-sm text-center text-destructive" : "text-sm text-center text-muted-foreground"}>{message}</p>
        {state === "success" && <Link to="/login" className="block text-center text-sm text-primary hover:underline">Torna al login</Link>}
      </div>
    </div>
  );
};
