import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { QRCodeSVG } from "qrcode.react";
import { CheckCircle2, Copy, Loader2, ShieldCheck } from "lucide-react";
import { API, useAuth } from "@/App";
import { ActivationProgress } from "@/components/ActivationProgress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const errorMessage = (error, fallback) => error.response?.data?.detail || fallback;

export const MfaSetupPage = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const setupStarted = useRef(false);
  const confirmInFlight = useRef(false);
  const inputRef = useRef(null);
  const [code, setCode] = useState("");
  const [setup, setSetup] = useState(null);
  const [configured, setConfigured] = useState(false);
  const [message, setMessage] = useState("Preparazione del codice QR per il tuo Authenticator...");
  const [error, setError] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const beginSetup = async () => {
    if (confirmInFlight.current) return;
    setLoading(true);
    setError("");
    setCopyMessage("");
    try {
      const response = await axios.post(`${API}/auth/2fa/setup`, {});
      setSetup(response.data);
      setMessage("Scansiona il QR code con Google Authenticator o Microsoft Authenticator, poi inserisci il codice visualizzato.");
    } catch (requestError) {
      setError(errorMessage(requestError, "Impossibile avviare la configurazione MFA. Effettua nuovamente il login."));
    } finally {
      setLoading(false);
    }
  };

  // Password and verified email were checked before the limited MFA setup session.
  useEffect(() => {
    if (setupStarted.current) return;
    setupStarted.current = true;
    void beginSetup();
  }, []);

  useEffect(() => {
    if (setup && !loading && !configured) inputRef.current?.focus();
  }, [setup, loading, configured]);

  const confirmSetup = async (event, providedCode = null) => {
    event?.preventDefault();
    const candidate = providedCode ?? code;
    if (confirmInFlight.current || loading || !setup || configured) return;
    if (!/^\d{6}$/.test(candidate)) {
      setError("Inserisci un codice TOTP di 6 cifre.");
      return;
    }
    // Lock synchronously so the automatic timer and manual submit cannot overlap.
    confirmInFlight.current = true;
    setLoading(true);
    setError("");
    try {
      const response = await axios.post(`${API}/auth/2fa/confirm`, { code: candidate });
      setCode("");
      setSetup(null);
      setConfigured(true);
      if (response.data.user) login(response.data.user);
      setMessage("Autenticazione a due fattori attivata.");
    } catch (requestError) {
      setCode("");
      setError(errorMessage(requestError, "Codice TOTP non valido o configurazione scaduta."));
      window.requestAnimationFrame(() => inputRef.current?.focus());
    } finally {
      confirmInFlight.current = false;
      setLoading(false);
    }
  };

  // Auto-confirm after six digits; cancel the timer when editing or submitting.
  // Never retry an invalid code automatically or issue parallel confirmation calls.
  useEffect(() => {
    if (!setup || configured || loading || code.length !== 6) return undefined;
    const timer = window.setTimeout(() => { void confirmSetup(null, code); }, 350);
    return () => window.clearTimeout(timer);
  }, [code, setup, configured, loading]);

  const copySetupSecret = async () => {
    if (!setup?.secret) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(setup.secret);
      setCopyMessage("Chiave copiata. Incollala nel tuo Authenticator.");
    } catch {
      setCopyMessage("Copia non disponibile: tieni premuto sulla chiave per selezionarla.");
    }
  };

  if (configured) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center p-6">
        <section className="w-full max-w-lg space-y-5 rounded-xl border bg-card p-6 shadow-sm">
          <ActivationProgress current={3} />
          <div className="flex justify-center"><CheckCircle2 aria-hidden="true" className="h-11 w-11 text-secondary" /></div>
          <h1 className="text-2xl font-semibold text-center">Il tuo account è pronto!</h1>
          <p className="text-sm text-muted-foreground text-center">Email verificata e autenticazione a due fattori attiva. Ora puoi entrare in Beside.</p>
          <Button className="w-full" onClick={() => navigate("/dashboard", { replace: true })}>Entra in Beside</Button>
          <Button variant="outline" className="w-full" onClick={() => navigate("/profile#sicurezza", { replace: true })}>Configura contatto fidato</Button>
          <p className="text-xs text-muted-foreground text-center">Il contatto fidato è consigliato per recuperare l'accesso, ma puoi configurarlo anche più tardi.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-6">
      <section className="w-full max-w-md space-y-5 rounded-xl border bg-card p-6 shadow-sm">
        <Link to="/" className="block text-center text-3xl font-bold text-primary">BESIDE</Link>
        <ActivationProgress current={2} />
        <div className="text-center space-y-2">
          <div className="flex justify-center"><ShieldCheck aria-hidden="true" className="h-8 w-8 text-secondary" /></div>
          <h1 className="text-2xl font-semibold">Proteggi il tuo account</h1>
          <p className="text-sm text-muted-foreground">Email verificata. Prima di accedere attiva l'autenticazione a due fattori.</p>
        </div>
        <p role={error ? "alert" : "status"} className={error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>{error || message}</p>
        {!setup ? (
          <div className="space-y-4">
            {loading ? (
              <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Preparazione del QR code...</p>
            ) : (
              <Button className="w-full" type="button" onClick={beginSetup}>Riprova la configurazione</Button>
            )}
          </div>
        ) : (
          <form onSubmit={confirmSetup} className="space-y-4">
            <div className="flex justify-center rounded-md bg-white p-4"><QRCodeSVG value={setup.otpauth_uri} size={220} includeMargin /></div>
            <div className="space-y-1">
              <Label>Configurazione manuale (se usi un solo telefono)</Label>
              <div className="flex items-start gap-2">
                <p className="min-w-0 flex-1 select-text break-all rounded bg-muted p-2 font-mono text-xs">{setup.secret}</p>
                <Button type="button" variant="outline" size="sm" onClick={copySetupSecret} aria-label="Copia chiave Authenticator"><Copy className="h-4 w-4" aria-hidden="true" /></Button>
              </div>
              {copyMessage && <p className="text-xs text-muted-foreground" role="status">{copyMessage}</p>}
              <p className="text-xs text-muted-foreground">La chiave è privata: non condividerla né inviarla in chat.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="mfa-setup-code">Codice Authenticator (6 cifre)</Label>
              <Input ref={inputRef} id="mfa-setup-code" inputMode="numeric" maxLength={6} value={code}
                onChange={(event) => { setError(""); setCode(event.target.value.replace(/\D/g, "").slice(0, 6)); }}
                autoComplete="one-time-code" disabled={loading} required />
              {loading && <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Verifica in corso...</p>}
              <p className="text-xs text-muted-foreground">La verifica parte automaticamente alla sesta cifra.</p>
            </div>
            <Button className="w-full" type="submit" disabled={loading || code.length !== 6}>{loading ? "Attivazione..." : "Attiva MFA"}</Button>
          </form>
        )}
        <p className="text-center text-xs text-muted-foreground"><Link to="/login" className="text-primary hover:underline">Torna al login</Link></p>
      </section>
    </main>
  );
};
