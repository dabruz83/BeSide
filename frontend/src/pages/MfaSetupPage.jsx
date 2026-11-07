import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { QRCodeSVG } from "qrcode.react";
import { API, useAuth } from "@/App";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const errorMessage = (error, fallback) => error.response?.data?.detail || fallback;

export const MfaSetupPage = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [setup, setSetup] = useState(null);
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [message, setMessage] = useState("Conferma la password per iniziare la configurazione.");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const beginSetup = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await axios.post(`${API}/auth/2fa/setup`, { password });
      setSetup(response.data);
      setMessage("Scansiona il QR code con Google Authenticator o Microsoft Authenticator, poi inserisci il codice visualizzato.");
    } catch (requestError) {
      setError(errorMessage(requestError, "Impossibile avviare la configurazione MFA. Effettua nuovamente il login."));
    } finally {
      setLoading(false);
    }
  };

  const confirmSetup = async (event) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError("Inserisci un codice TOTP di 6 cifre.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await axios.post(`${API}/auth/2fa/confirm`, { password, code });
      setPassword("");
      setCode("");
      setSetup(null);
      setRecoveryCodes(response.data.recovery_codes || []);
      if (response.data.user) login(response.data.user);
      setMessage("Autenticazione a due fattori attivata. Conserva i codici di recupero in un luogo sicuro.");
    } catch (requestError) {
      setError(errorMessage(requestError, "Codice TOTP non valido o configurazione scaduta."));
    } finally {
      setLoading(false);
    }
  };

  if (recoveryCodes.length > 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-lg space-y-5 rounded-xl border bg-card p-6 shadow-sm">
          <h1 className="text-2xl font-semibold">MFA configurata</h1>
          <p className="text-sm text-muted-foreground">Questi codici vengono mostrati una sola volta. Non salvarli nel browser.</p>
          <div className="grid grid-cols-2 gap-2 rounded-md bg-muted p-4 font-mono text-sm">
            {recoveryCodes.map((recoveryCode) => <span key={recoveryCode}>{recoveryCode}</span>)}
          </div>
          <Button className="w-full" onClick={() => navigate("/dashboard", { replace: true })}>Vai alla dashboard</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-5 rounded-xl border bg-card p-6 shadow-sm">
        <Link to="/" className="block text-center text-3xl font-bold text-primary">BESIDE</Link>
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold">Configura autenticazione a due fattori</h1>
          <p className="text-sm text-muted-foreground">Prima di accedere alla dashboard devi attivare un Authenticator.</p>
        </div>
        <p className={error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>{error || message}</p>
        {!setup ? (
          <form onSubmit={beginSetup} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="mfa-setup-password">Password dell'account</Label>
              <Input id="mfa-setup-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
            </div>
            <Button className="w-full" type="submit" disabled={loading}>{loading ? "Verifica..." : "Continua"}</Button>
          </form>
        ) : (
          <form onSubmit={confirmSetup} className="space-y-4">
            <div className="flex justify-center rounded-md bg-white p-4"><QRCodeSVG value={setup.otpauth_uri} size={220} includeMargin /></div>
            <div className="space-y-1"><Label>Configurazione manuale</Label><p className="break-all rounded bg-muted p-2 font-mono text-xs">{setup.secret}</p></div>
            <div className="space-y-2"><Label htmlFor="mfa-setup-code">Codice TOTP</Label><Input id="mfa-setup-code" inputMode="numeric" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} autoComplete="one-time-code" required /></div>
            <Button className="w-full" type="submit" disabled={loading || code.length !== 6}>{loading ? "Attivazione..." : "Attiva MFA"}</Button>
          </form>
        )}
        <p className="text-center text-xs text-muted-foreground"><Link to="/login" className="text-primary hover:underline">Torna al login</Link></p>
      </div>
    </div>
  );
};
