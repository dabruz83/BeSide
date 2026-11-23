import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import axios from "axios";
import { API } from "@/App";

export const VerifyEmailPage = () => {
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get("token") || "", [searchParams]);
  const [status, setStatus] = useState(token ? "loading" : "error");
  const [message, setMessage] = useState(token ? "Verifica in corso..." : "Token mancante.");

  const requests = useRef(new Map());

  useEffect(() => {
    let active = true;
    if (!token) {
      setStatus("error");
      setMessage("Token mancante.");
      return;
    }
    setStatus("loading");
    setMessage("Verifica in corso...");
    // Reuse the same request during effect replay: tokens are single-use.
    if (!requests.current.has(token)) {
      requests.current.set(token, axios.post(`${API}/auth/email-verification/verify`, { token }, { timeout: 15000 }));
    }
    requests.current.get(token)
      .then((response) => {
        if (!active) return;
        setStatus("success");
        setMessage(response.data.mfa_setup_required
          ? `${response.data.message} Dopo il login configurerai l'autenticazione a due fattori.`
          : response.data.message);
      })
      .catch((error) => {
        if (!active) return;
        setStatus("error");
        if (!error.response) {
          setMessage("Impossibile confermare la verifica. Controlla la connessione e prova ad accedere; se l'email non risulta verificata, richiedi un nuovo link.");
        } else {
          setMessage(error.response?.data?.detail || "Link non valido o scaduto");
        }
      });
    return () => { active = false; };
  }, [token]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-8">
      <div className="w-full max-w-md space-y-6 text-center">
        <Link to="/" className="text-3xl font-bold text-primary">BESIDE</Link>
        <h1 className="text-2xl font-semibold">Verifica email</h1>
        <p role={status === "error" ? "alert" : "status"} aria-live="polite" aria-busy={status === "loading"} className={status === "error" ? "text-destructive" : "text-muted-foreground"}>{message}</p>
        {status === "success" && <Link to="/login" className="text-primary hover:underline">Vai al login</Link>}
        {status === "error" && <Link to="/verify-email/pending" className="text-primary hover:underline">Richiedi un nuovo link</Link>}
      </div>
    </div>
  );
};
