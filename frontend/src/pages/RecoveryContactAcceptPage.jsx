import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import axios from "axios";
import { API } from "@/App";
import { Button } from "@/components/ui/button";

export const RecoveryContactAcceptPage = () => {
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get("token") || "", [searchParams]);
  const [state, setState] = useState("idle");
  const [message, setMessage] = useState("");
  const [securityEnd, setSecurityEnd] = useState(null);

  const acceptInvite = async () => {
    if (!token || state === "loading") return;
    setState("loading");
    setMessage("");
    try {
      const response = await axios.post(`${API}/auth/recovery-contact/accept-email`, { token });
      setSecurityEnd(response.data.security_period_ends_at || null);
      setMessage(response.data.message || "Invito accettato correttamente.");
      setState("success");
    } catch (error) {
      setMessage(error.response?.data?.detail || "Impossibile accettare l'invito.");
      setState("error");
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-md space-y-5 rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <Link to="/" className="block text-center text-3xl font-bold text-primary">BESIDE</Link>
        <h1 className="text-center text-2xl font-semibold">Invito come contatto fidato</h1>
        {state === "success" ? (
          <>
            <p className="text-center text-sm text-primary font-semibold">{message}</p>
            <p className="text-center text-sm text-muted-foreground">
              Riceverai un'email soltanto se la persona avrà bisogno del tuo aiuto.
              Non hai accesso al suo account e non devi creare un account Beside.
            </p>
            {securityEnd && <p className="text-center text-xs text-muted-foreground">
              Disponibile per il recupero dal: {new Date(securityEnd).toLocaleString("it-IT")}
            </p>}
          </>
        ) : (
          <>
            <p className="text-center text-sm text-muted-foreground">
              Una persona ti ha scelto per aiutarla in caso di perdita dell'Authenticator.
              Ti basta accettare. Non dovrai creare un account, scegliere password o usare codici MFA.
            </p>
            {!token ? <p className="text-center text-sm text-destructive">Link di invito mancante.</p> :
              <Button className="w-full" type="button" onClick={acceptInvite} disabled={state === "loading"}>
                {state === "loading" ? "Conferma in corso..." : "Accetto di essere un contatto fidato"}
              </Button>}
            {state === "error" && <p className="text-center text-sm text-destructive">{message}</p>}
            <p className="text-center text-xs text-muted-foreground">
              Il tuo consenso non concede accesso a dati, password o dashboard.
              Se non conosci la persona che ti ha invitato, chiudi questa pagina.
            </p>
          </>
        )}
      </div>
    </div>
  );
};
