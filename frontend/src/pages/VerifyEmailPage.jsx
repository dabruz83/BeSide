import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import axios from "axios";
import { API } from "@/App";

export const VerifyEmailPage = () => {
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get("token") || "", [searchParams]);
  const [status, setStatus] = useState(token ? "loading" : "error");
  const [message, setMessage] = useState(token ? "Verifica in corso..." : "Token mancante.");

  useEffect(() => {
    if (!token) return;
    axios.post(`${API}/auth/email-verification/verify`, { token })
      .then((response) => {
        setStatus("success");
        setMessage(response.data.message);
      })
      .catch((error) => {
        setStatus("error");
        if (!error.response) {
          setMessage("Impossibile contattare il servizio di verifica. Controlla la connessione e riprova.");
        } else {
          setMessage(error.response?.data?.detail || "Link non valido o scaduto");
        }
      });
  }, [token]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-8">
      <div className="w-full max-w-md space-y-6 text-center">
        <Link to="/" className="text-3xl font-bold text-primary">BESIDE</Link>
        <h1 className="text-2xl font-semibold">Verifica email</h1>
        <p className={status === "error" ? "text-destructive" : "text-muted-foreground"}>{message}</p>
        {status === "success" && <Link to="/login" className="text-primary hover:underline">Vai al login</Link>}
        {status === "error" && <Link to="/verify-email/pending" className="text-primary hover:underline">Richiedi un nuovo link</Link>}
      </div>
    </div>
  );
};
