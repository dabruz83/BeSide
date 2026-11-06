import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import axios from "axios";
import { API } from "@/App";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QRCodeSVG } from "qrcode.react";

export const Recovery2FARequestPage = () => {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState(searchParams.get("email") || "");
  const [password, setPassword] = useState("");
  const [state, setState] = useState("idle");
  const [message, setMessage] = useState("Avvia una richiesta senza creare una sessione completa.");
  const [verificationNumber, setVerificationNumber] = useState("");
  const [expiresIn, setExpiresIn] = useState(null);
  const [requestCredential, setRequestCredential] = useState("");
  const [statusPassword, setStatusPassword] = useState("");
  const [recoveryStatus, setRecoveryStatus] = useState(null);
  const [securityEndsAt, setSecurityEndsAt] = useState(null);
  const [statusExpiry, setStatusExpiry] = useState(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [continuationToken, setContinuationToken] = useState("");
  const [authorizationToken, setAuthorizationToken] = useState("");
  const [totpSetup, setTotpSetup] = useState(null);
  const [totpCode, setTotpCode] = useState("");
  const [flowLoading, setFlowLoading] = useState(false);

  const expiryLabel = useMemo(() => {
    if (!expiresIn) return "";
    const minutes = Math.max(1, Math.ceil(expiresIn / 60));
    return `Scadenza indicata dal backend: tra ${minutes} minuti`;
  }, [expiresIn]);

  const submit = async (event) => {
    event.preventDefault();
    setState("loading");
    try {
      const response = await axios.post(`${API}/auth/2fa/recovery/request`, { email, password });
      setVerificationNumber(response.data.verification_number || "");
      setExpiresIn(response.data.expires_in || null);
      setRequestCredential(response.data.request_token || "");
      setMessage(response.data.message || "Richiesta di recupero avviata.");
      setPassword("");
      setState("pending");
    } catch (error) {
      setState("error");
      setMessage(error.response?.data?.detail || "Impossibile avviare la richiesta di recupero.");
    }
  };

  const refreshStatus = async () => {
    const credential = continuationToken || requestCredential;
    if (!credential || !statusPassword) {
      setMessage("Inserisci la credenziale temporanea e la password per aggiornare lo stato.");
      return;
    }
    setStatusLoading(true);
    try {
      const response = await axios.get(`${API}/auth/2fa/recovery/status`, {
        headers: {
          "X-Recovery-Credential": credential,
          "X-Recovery-Password": statusPassword,
        },
      });
      setRecoveryStatus(response.data.status);
      setStatusExpiry(response.data.expires_at);
      setSecurityEndsAt(response.data.security_period_ends_at);
      setMessage("Stato aggiornato dal backend.");
    } catch (error) {
      setRecoveryStatus(null);
      setMessage(error.response?.data?.detail || "Impossibile aggiornare lo stato della richiesta.");
    } finally {
      setStatusPassword("");
      setStatusLoading(false);
    }
  };

  const prepareRecovery = async () => {
    if (!requestCredential || !statusPassword) {
      setMessage("Inserisci la password per avviare il periodo di sicurezza.");
      return;
    }
    setFlowLoading(true);
    try {
      const response = await axios.post(`${API}/auth/2fa/recovery/prepare`, {
        request_token: requestCredential,
        email,
        password: statusPassword,
      });
      setContinuationToken(response.data.continuation_token || "");
      setSecurityEndsAt(response.data.hold_expires_at || null);
      setRecoveryStatus(response.data.status || "security_period");
      setMessage(response.data.message || "Periodo di sicurezza avviato.");
    } catch (error) {
      setMessage(error.response?.data?.detail || "Impossibile avviare il periodo di sicurezza.");
    } finally {
      setStatusPassword("");
      setFlowLoading(false);
    }
  };

  const authorizeAndSetup = async () => {
    if (!continuationToken || !statusPassword) {
      setMessage("Inserisci la password per autorizzare la configurazione del nuovo Authenticator.");
      return;
    }
    setFlowLoading(true);
    try {
      const authorization = await axios.post(`${API}/auth/2fa/recovery/authorize-totp`, {
        continuation_token: continuationToken,
        email,
        password: statusPassword,
      });
      const nextAuthorizationToken = authorization.data.totp_authorization_token || "";
      const setup = await axios.post(`${API}/auth/2fa/recovery/setup-totp`, {
        continuation_token: nextAuthorizationToken,
        email,
        password: statusPassword,
      });
      setAuthorizationToken(nextAuthorizationToken);
      setTotpSetup(setup.data);
      setRecoveryStatus("totp_setup_pending");
      setMessage(setup.data.message || "Configura il nuovo Authenticator e inserisci il codice.");
    } catch (error) {
      setMessage(error.response?.data?.detail || "La configurazione del nuovo Authenticator non è disponibile.");
    } finally {
      setStatusPassword("");
      setFlowLoading(false);
    }
  };

  const confirmReplacement = async () => {
    if (!authorizationToken || !statusPassword || !/^\d{6}$/.test(totpCode)) {
      setMessage("Inserisci password e un codice TOTP valido di 6 cifre.");
      return;
    }
    setFlowLoading(true);
    try {
      const response = await axios.post(`${API}/auth/2fa/recovery/confirm-totp`, {
        continuation_token: authorizationToken,
        email,
        password: statusPassword,
        code: totpCode,
      });
      setRecoveryStatus("completed");
      setMessage(response.data.message || "Authenticator sostituito. Effettua un nuovo login completo.");
      setTotpSetup(null);
      setAuthorizationToken("");
      setTotpCode("");
    } catch (error) {
      setMessage(error.response?.data?.detail || "Codice TOTP non valido o autorizzazione scaduta.");
    } finally {
      setStatusPassword("");
      setFlowLoading(false);
    }
  };

  const statusLabel = {
    pending: "Richiesta in attesa",
    approved: "Approvata dal contatto fidato",
    approved_hold: "Periodo di sicurezza di 24 ore",
    security_period: "Periodo di sicurezza di 24 ore",
    ready: "Recupero disponibile",
    expired: "Richiesta scaduta",
    cancelled: "Richiesta annullata",
    authorization_issued: "Recupero disponibile",
    totp_setup_pending: "Configurazione TOTP in corso",
    completed: "Recupero completato",
  }[recoveryStatus] || recoveryStatus;

  const formatDate = (value) => value ? new Date(value).toLocaleString("it-IT") : "";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-md space-y-6 rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <Link to="/login" className="block text-center text-3xl font-bold text-primary">BESIDE</Link>
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold">Recupero autenticazione 2FA</h1>
          <p className="text-sm text-muted-foreground">La richiesta sarà verificata dal tuo contatto fidato. Non viene creata una sessione completa.</p>
        </div>

        {state !== "pending" && <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="recovery-email">Email account</Label>
            <Input id="recovery-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="recovery-password">Password attuale</Label>
            <Input id="recovery-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" />
          </div>
          <Button type="submit" className="w-full" disabled={state === "loading"}>
            {state === "loading" ? "Verifica in corso..." : "Avvia recupero"}
          </Button>
        </form>}

        <p className={state === "error" ? "text-sm text-center text-destructive" : "text-sm text-center text-muted-foreground"}>{message}</p>

        {state === "pending" && <div className="space-y-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
          <p className="text-sm font-medium">Stato: {statusLabel || "Richiesta in attesa"}</p>
          {verificationNumber && <div className="space-y-1 text-center"><p className="text-xs text-muted-foreground">Numero temporaneo da comunicare al contatto fidato</p><p className="font-mono text-2xl tracking-[0.25em] text-primary">{verificationNumber}</p></div>}
          <p className="text-xs text-muted-foreground">Il contatto dovrà autenticarsi e approvare la richiesta. Non condividere password, token o codici TOTP.</p>
          {expiryLabel && <p className="text-xs text-muted-foreground">{expiryLabel}</p>}
          <div className="space-y-2 border-t border-border/60 pt-3">
            <Label htmlFor="recovery-credential">Credenziale temporanea</Label>
            <Input id="recovery-credential" type="password" value={requestCredential} onChange={(event) => setRequestCredential(event.target.value)} placeholder="Reinseriscila per riprendere la procedura" autoComplete="off" />
            <Label htmlFor="status-password">Password attuale</Label>
            <Input id="status-password" type="password" value={statusPassword} onChange={(event) => setStatusPassword(event.target.value)} autoComplete="current-password" />
            <Button type="button" variant="outline" className="w-full" onClick={refreshStatus} disabled={statusLoading}>
              {statusLoading ? "Aggiornamento..." : "Aggiorna stato"}
            </Button>
            {statusExpiry && <p className="text-xs text-muted-foreground">Scadenza effettiva: {formatDate(statusExpiry)}</p>}
            {securityEndsAt && <p className="text-xs text-muted-foreground">Periodo di sicurezza fino a: {formatDate(securityEndsAt)}</p>}
            {recoveryStatus === "approved" && <Button type="button" className="w-full" onClick={prepareRecovery} disabled={flowLoading || !statusPassword}>
              {flowLoading ? "Avvio..." : "Avvia periodo di sicurezza"}
            </Button>}
            {recoveryStatus === "ready" && <Button type="button" className="w-full" onClick={authorizeAndSetup} disabled={flowLoading || !statusPassword}>
              {flowLoading ? "Preparazione..." : "Configura nuovo Authenticator"}
            </Button>}
            {recoveryStatus === "security_period" && <p className="text-xs text-muted-foreground">La configurazione sarà disponibile solo al termine del periodo di sicurezza indicato dal backend.</p>}
            {recoveryStatus === "totp_setup_pending" && totpSetup && <div className="space-y-3 border-t border-border/60 pt-3">
              <p className="text-sm font-medium">Scansiona il QR code con Google Authenticator o Microsoft Authenticator.</p>
              <div className="flex justify-center rounded-md bg-white p-3"><QRCodeSVG value={totpSetup.otpauth_uri} size={190} includeMargin /></div>
              {totpSetup.secret && <p className="break-all text-xs text-muted-foreground">Configurazione manuale: {totpSetup.secret}</p>}
              <Label htmlFor="new-totp-code">Codice TOTP</Label>
              <Input id="new-totp-code" inputMode="numeric" maxLength={6} value={totpCode} onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, ""))} autoComplete="one-time-code" />
              <Label htmlFor="confirm-password">Password attuale</Label>
              <Input id="confirm-password" type="password" value={statusPassword} onChange={(event) => setStatusPassword(event.target.value)} autoComplete="current-password" />
              <Button type="button" className="w-full" onClick={confirmReplacement} disabled={flowLoading || totpCode.length !== 6 || !statusPassword}>
                {flowLoading ? "Conferma..." : "Conferma nuovo Authenticator"}
              </Button>
            </div>}
            {recoveryStatus === "completed" && <p className="text-sm font-medium text-primary">Authenticator sostituito. Effettua un nuovo login completo.</p>}
          </div>
          <p className="text-xs text-muted-foreground">La password viene richiesta solo quando premi “Aggiorna stato” e non viene conservata.</p>
          <Link to="/login" className="block text-center text-sm text-primary hover:underline">Torna al login</Link>
        </div>}
      </div>
    </div>
  );
};
