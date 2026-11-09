import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import axios from "axios";
import { QRCodeSVG } from "qrcode.react";
import { API } from "@/App";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const shell = "min-h-screen bg-background flex items-center justify-center p-4 sm:p-8";

export const RecoveryContactAcceptPage = () => {
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get("token") || "", [searchParams]);
  const [code, setCode] = useState("");
  const [phase, setPhase] = useState(token ? "accept" : "error");
  const [message, setMessage] = useState(token ? "Inserisci il codice ricevuto nell'email per accettare l'invito." : "Link mancante.");
  const [contactId, setContactId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [totpSetup, setTotpSetup] = useState(null);
  const [accountFlow, setAccountFlow] = useState("existing");

  const accept = async () => {
    if (!/^\d{6}$/.test(code)) return setMessage("Inserisci un codice di 6 cifre.");
    setPhase("loading");
    try {
      const response = await axios.post(`${API}/auth/recovery-contact/accept`, { token, acceptance_code: code });
      setContactId(response.data.contact_id || "");
      setMessage(response.data.message);
      setPhase("choice");
    } catch (error) {
      setPhase("error");
      setMessage(error.response?.data?.detail || "Invito non valido o scaduto.");
    }
  };

  const createAccount = async () => {
    if (password.length < 10) return setMessage("La password deve contenere almeno 10 caratteri.");
    setPhase("loading");
    try {
      const response = await axios.post(`${API}/auth/recovery-contact/create-account`, { token, acceptance_code: code, password });
      setEmail(response.data.email);
      setAccountFlow("new");
      setMessage("Account creato. Verifica l'indirizzo email dal messaggio ricevuto, poi continua qui.");
      setPhase("email");
    } catch (error) {
      setPhase("create");
      setMessage(error.response?.data?.detail || "Impossibile creare l'account di recupero.");
    }
  };

  const startTotp = async () => {
    setPhase("loading");
    try {
      const login = await axios.post(`${API}/auth/login`, { email, password });
      if (login.data.mfa_required) {
        setPhase("login-mfa");
        setMessage("Inserisci il codice Authenticator del tuo account Beside esistente.");
        return;
      }
      if (!login.data.mfa_setup_required) {
        setPhase("login");
        setMessage("L'account non richiede la configurazione MFA. Verifica l'account prima dell'associazione.");
        return;
      }
      const response = await axios.post(`${API}/auth/2fa/setup`, {});
      setTotpSetup(response.data);
      setTotpCode("");
      setPhase("totp");
      setMessage("Scansiona il QR code con Google Authenticator o Microsoft Authenticator.");
    } catch (error) {
      setPhase("login");
      setMessage(error.response?.data?.detail || "Verifica email e credenziali prima di continuare.");
    }
  };

  const verifyLoginMfa = async () => {
    setPhase("loading");
    try {
      // Login TOTP is verified once; do NOT start an MFA setup for an account
      // whose authenticator is already active. Use the short-lived verified
      // session to link the invitation, alongside the contact's password.
      await axios.post(`${API}/auth/2fa/verify`, { code: totpCode });
      if (!contactId) throw new Error("Identificativo dell'invito mancante");
      const linked = await axios.post(`${API}/auth/recovery-contact/link-account`, {
        contact_id: contactId, password,
      });
      setTotpCode("");
      setPassword("");
      setPhase("done");
      setMessage(linked.data.message || "Contatto fidato associato correttamente.");
    } catch (error) {
      setTotpCode("");
      setPhase("login-mfa");
      setMessage(error.response?.data?.detail || error.message || "Impossibile associare il contatto. Riprova.");
    }
  };

  const confirmTotp = async () => {
    if (!/^\d{6}$/.test(totpCode)) return setMessage("Inserisci un codice TOTP di 6 cifre.");
    setPhase("loading");
    try {
      await axios.post(`${API}/auth/2fa/confirm`, { code: totpCode });
      setPassword("");
      setTotpSetup(null);
      setPhase("done");
      setMessage("Authenticator attivato. L'account contatto sarà utilizzabile dopo il periodo di sicurezza previsto.");
    } catch (error) {
      setPhase("totp");
      setMessage(error.response?.data?.detail || "Codice TOTP non valido o scaduto.");
    }
  };

  return (
    <div className={shell}>
      <div className="w-full max-w-md space-y-5 rounded-xl border border-border bg-card p-5 shadow-sm sm:p-8">
        <Link to="/" className="block text-center text-3xl font-bold text-primary">BESIDE</Link>
        <h1 className="text-xl font-semibold text-center sm:text-2xl">Contatto di recupero</h1>
        <p className={phase === "error" ? "text-destructive text-center" : "text-muted-foreground text-center"}>{message}</p>
        {phase === "accept" && <><Input inputMode="numeric" maxLength={6} placeholder="Codice di accettazione" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} /><Button onClick={accept} className="w-full">Conferma invito</Button></>}
        {phase === "choice" && <div className="grid gap-3 sm:grid-cols-2"><Button variant="outline" disabled={!contactId} onClick={() => { setAccountFlow("existing"); setPhase("login"); }}>Account Beside esistente</Button><Button onClick={() => setPhase("create")}>Crea account gratuito</Button>{!contactId && <p className="text-xs text-muted-foreground sm:col-span-2">Il collegamento a un account esistente richiede l'identificativo restituito dal backend.</p>}</div>}
        {phase === "create" && <div className="space-y-3"><Input type="password" placeholder="Scegli una password personale" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" /><Button onClick={createAccount} className="w-full">Crea account gratuito</Button></div>}
        {(phase === "email" || phase === "login") && <div className="space-y-3"><Input type="email" placeholder="Email verificata" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /><Input type="password" placeholder="Password personale" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />{phase === "email" && <p className="text-xs text-muted-foreground">Dopo aver cliccato il link di verifica nella tua email, continua per configurare l'Authenticator.</p>}<Button onClick={startTotp} className="w-full">Continua</Button></div>}
        {phase === "login-mfa" && <div className="space-y-3"><Input inputMode="numeric" maxLength={6} placeholder="Codice TOTP account esistente" value={totpCode} onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, "").slice(0, 6))} autoComplete="one-time-code" /><Button onClick={verifyLoginMfa} className="w-full">Verifica account</Button></div>}
        {phase === "totp" && totpSetup && <div className="space-y-4"><div className="flex justify-center rounded-md bg-white p-3"><QRCodeSVG value={totpSetup.otpauth_uri} size={190} includeMargin /></div><p className="text-xs text-muted-foreground break-all">Chiave manuale: {totpSetup.secret}</p><Input inputMode="numeric" maxLength={6} placeholder="Codice TOTP (6 cifre)" value={totpCode} onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, "").slice(0, 6))} autoComplete="one-time-code" /><Button onClick={confirmTotp} className="w-full">Conferma Authenticator</Button></div>}
        {phase === "done" && <p className="text-center text-sm text-success">Il contatto non dispone di accesso a dashboard, clienti o dati aziendali. Il periodo di sicurezza partirà solo quando sono soddisfatti i requisiti di verifica.</p>}
      </div>
    </div>
  );
};
