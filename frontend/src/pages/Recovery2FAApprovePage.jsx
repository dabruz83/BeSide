import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import axios from "axios";
import { API } from "@/App";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Recovery2FAApprovePage = () => {
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get("token") || "", [searchParams]);
  const [number, setNumber] = useState("");
  const [state, setState] = useState("idle");
  const [message, setMessage] = useState("");

  const approve = async (event) => {
    event.preventDefault();
    if (!token || !/^\d{8}$/.test(number) || state === "loading") return;
    setState("loading");
    setMessage("");
    try {
      const response = await axios.post(`${API}/auth/2fa/recovery/approve-email`, {
        approval_token: token, verification_number: number,
      });
      if (response.data.status !== "approved") throw new Error("Conferma non riuscita.");
      setState("success");
      setNumber("");
      setMessage("Richiesta confermata. Non hai concesso accesso all'account: il proprietario dovrà completare il proprio periodo di sicurezza.");
    } catch (error) {
      setState("error");
      setMessage(error.response?.data?.detail || error.message || "Impossibile confermare la richiesta.");
      setNumber("");
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-md space-y-5 rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <Link to="/" className="block text-center text-3xl font-bold text-primary">BESIDE</Link>
        <h1 className="text-center text-2xl font-semibold">Aiuta una persona fidata</h1>
        <p className="text-center text-sm text-muted-foreground">
          Conferma solo se hai parlato con la persona che conosci e ti ha richiesto aiuto.
          Non servono account Beside, password o Authenticator.
        </p>
        {state !== "success" && (token ? <form onSubmit={approve} className="space-y-4">
          <Label htmlFor="trusted-recovery-number">Numero di 8 cifre comunicato dalla persona</Label>
          <Input id="trusted-recovery-number" inputMode="numeric" autoComplete="off"
            maxLength={8} value={number}
            onChange={(e) => setNumber(e.target.value.replace(/\D/g, "").slice(0, 8))} required />
          <Button className="w-full" disabled={state === "loading" || number.length !== 8}>
            {state === "loading" ? "Verifica in corso..." : "Conferma la richiesta"}
          </Button>
        </form> : <p className="text-center text-destructive text-sm">Link di verifica mancante.</p>)}
        {message && <p className={`text-center text-sm ${state === "error" ? "text-destructive" : "text-primary"}`}>{message}</p>}
        <p className="text-center text-xs text-muted-foreground">
          In caso di dubbio, non approvare. La richiesta scade automaticamente.
        </p>
      </div>
    </div>
  );
};
