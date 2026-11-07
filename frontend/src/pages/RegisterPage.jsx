import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth, API } from "@/App";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Eye, EyeOff, Mail, Lock, Building2, Users } from "lucide-react";

const TAX_REGIMES = [
  { value: "forfettario_5", label: "Forfettario 5%" },
  { value: "forfettario_15", label: "Forfettario 15%" },
  { value: "ordinario", label: "Regime ordinario" },
  { value: "non_so", label: "Non lo so" },
  { value: "preferisco_non_rispondere", label: "Preferisco non rispondere" },
];
const SERVICES = [["ppf", "PPF (Pellicola Protettiva)"], ["wrap", "Wrap (Decorativo/Commerciale)"], ["tint", "Oscuramento Vetri"], ["upholstery", "Tappezzeria"]];
const MODULES = [["configuratore", "Configuratore veicoli"], ["lavori", "Lavori e clienti"], ["preventivi", "Preventivi"], ["finanza", "Finanza"], ["marketing", "Marketing"]];
const NEEDS = [["acquisizione_clienti", "Acquisire clienti"], ["organizzazione", "Organizzare il lavoro"], ["preventivi", "Creare preventivi"], ["finanza", "Gestire la finanza"], ["marketing", "Marketing"]];

export const RegisterPage = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const oauthLoginUrl = (process.env.REACT_APP_OAUTH_LOGIN_URL || "").trim().replace(/\/+$/, "");
  const [formData, setFormData] = useState({
    email: "", password: "", first_name: "", last_name: "", role: "", location_general: "",
    business_name: "", team_size: 1, services: [], business_status: "attiva", legal_form: "",
    tax_regime: "", sector: "", customer_type: "", revenue_band: "", employees_band: "",
    needs: [], interested_modules: [], monthly_quotes_band: "", terms_accepted: false,
    marketing_emails_opt_in: false, marketing_profiling_opt_in: false,
  });
  const setField = (name, value) => setFormData((current) => ({ ...current, [name]: value }));
  const toggle = (name, value) => setFormData((current) => ({ ...current, [name]: current[name].includes(value) ? current[name].filter((item) => item !== value) : [...current[name], value] }));
  const taxOptions = useMemo(() => ["societa_persone", "societa_capitali"].includes(formData.legal_form) ? [{ value: "ordinario", label: "Regime ordinario" }, { value: "non_so", label: "Non lo so" }, { value: "preferisco_non_rispondere", label: "Preferisco non rispondere" }] : TAX_REGIMES, [formData.legal_form]);
  const checkboxes = (items, name) => <div className="grid gap-2 sm:grid-cols-2">{items.map(([value, label]) => <label key={value} className="flex items-center gap-2 text-sm"><Checkbox checked={formData[name].includes(value)} onCheckedChange={() => toggle(name, value)} />{label}</label>)}</div>;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (step === 1) {
      if (!formData.first_name || !formData.email || !formData.password) return toast.error("Inserisci nome, email e password");
      if (formData.password.length < 10 || !/[A-Za-zÀ-ÖØ-öø-ÿ]/.test(formData.password) || !/\d/.test(formData.password)) return toast.error("La password deve contenere almeno 10 caratteri, una lettera e un numero");
      setStep(2); return;
    }
    if (step === 2) {
      if (!formData.business_name.trim()) return toast.error("Inserisci il nome dell'attività");
      if (!formData.terms_accepted) return toast.error("Accetta i Termini e condizioni per continuare");
      setStep(3); return;
    }
    if (step < 5) { setStep((current) => current + 1); return; }
    setLoading(true);
    try {
      const response = await axios.post(`${API}/auth/register`, { ...formData, onboarding_complete: true });
      if (response.data.email_verification_required) {
        toast.success("Registrazione completata. Controlla la tua email prima di accedere.");
        navigate("/verify-email/pending", { replace: true, state: { email: formData.email } });
        return;
      }
      const loginResponse = await axios.post(`${API}/auth/login`, { email: formData.email, password: formData.password });
      login(loginResponse.data.user);
      navigate("/dashboard", { replace: true });
    } catch (error) {
      toast.error(error.response?.data?.detail || "Errore durante la registrazione");
    } finally { setLoading(false); }
  };
  const handleGoogleLogin = () => { const redirectUrl = `${window.location.origin}/dashboard`; window.location.href = `${oauthLoginUrl}/?redirect=${encodeURIComponent(redirectUrl)}`; };

  return <div className="min-h-screen bg-background flex"><div className="flex-1 flex items-center justify-center p-8"><div className="w-full max-w-md space-y-8"><div className="text-center"><Link to="/"><h1 className="text-3xl font-bold text-primary mb-2" style={{ fontFamily: "Barlow, sans-serif" }}>BESIDE</h1></Link><p className="text-muted-foreground">{step === 1 ? "Crea il tuo account" : "Personalizza la tua esperienza"}</p></div>
    <div className="flex items-center justify-center gap-2">{[1, 2, 3, 4, 5].map((item) => <div key={item} className={`w-8 h-1 rounded-full ${step >= item ? "bg-primary" : "bg-muted"}`} />)}</div>
    <form onSubmit={handleSubmit} className="space-y-6">
      {step === 1 && <><div className="space-y-2"><Label>Il tuo nome</Label><Input value={formData.first_name} onChange={(event) => setField("first_name", event.target.value)} required data-testid="register-name-input" /></div><div className="space-y-2"><Label>Email</Label><div className="relative"><Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input type="email" className="pl-10" value={formData.email} onChange={(event) => setField("email", event.target.value)} required data-testid="register-email-input" /></div></div><div className="space-y-2"><Label>Password</Label><div className="relative"><Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input type={showPassword ? "text" : "password"} minLength={10} maxLength={128} className="pl-10 pr-10" value={formData.password} onChange={(event) => setField("password", event.target.value)} required data-testid="register-password-input" /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">{showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button></div></div><Button type="submit" className="w-full" data-testid="register-next-btn">Continua</Button>{oauthLoginUrl && <Button type="button" variant="outline" className="w-full" onClick={handleGoogleLogin}>Registrati con Google</Button>}</>}
      {step === 2 && <><div className="space-y-2"><Label>Nome attività</Label><div className="relative"><Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input className="pl-10" value={formData.business_name} onChange={(event) => setField("business_name", event.target.value)} required data-testid="register-business-input" /></div></div><div className="space-y-2"><Label>Dimensione team</Label><div className="relative"><Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input type="number" min="1" max="1000" className="pl-10" value={formData.team_size} onChange={(event) => setField("team_size", Number(event.target.value) || 1)} /></div></div><div><Label>Servizi offerti</Label>{checkboxes(SERVICES, "services")}</div><div className="space-y-3 rounded-md border p-3 text-sm"><label className="flex items-start gap-2"><Checkbox checked={formData.terms_accepted} onCheckedChange={(value) => setField("terms_accepted", value === true)} /><span>Accetto i <Link className="text-primary underline" to="/termini">Termini e condizioni</Link> (obbligatorio).</span></label><label className="flex items-start gap-2"><Checkbox checked={formData.marketing_emails_opt_in} onCheckedChange={(value) => setField("marketing_emails_opt_in", value === true)} />Comunicazioni commerciali (facoltativo)</label><label className="flex items-start gap-2"><Checkbox checked={formData.marketing_profiling_opt_in} onCheckedChange={(value) => setField("marketing_profiling_opt_in", value === true)} />Profilazione offerte (facoltativo)</label><p className="text-xs text-muted-foreground">Consulta l'<Link className="text-primary underline" to="/privacy">Informativa privacy</Link>.</p></div><div className="flex gap-3"><Button type="button" variant="outline" className="flex-1" onClick={() => setStep(1)}>Indietro</Button><Button type="submit" className="flex-1">Avanti</Button></div></>}
      {step === 3 && <><div className="grid gap-4 sm:grid-cols-2"><div><Label>Nome</Label><Input value={formData.first_name} onChange={(event) => setField("first_name", event.target.value)} /></div><div><Label>Cognome</Label><Input value={formData.last_name} onChange={(event) => setField("last_name", event.target.value)} /></div><div><Label>Ruolo</Label><Input value={formData.role} onChange={(event) => setField("role", event.target.value)} /></div><div><Label>Zona generale</Label><Input value={formData.location_general} onChange={(event) => setField("location_general", event.target.value)} /></div></div><div className="flex gap-3"><Button type="button" variant="outline" className="flex-1" onClick={() => setStep(2)}>Indietro</Button><Button type="submit" className="flex-1">Avanti</Button></div></>}
      {step === 4 && <><div><Label>Stato attività</Label><Select value={formData.business_status} onValueChange={(value) => setField("business_status", value)}><SelectTrigger><SelectValue placeholder="Seleziona" /></SelectTrigger><SelectContent>{[["attiva", "Attiva"], ["in_avvio", "In avvio"], ["non_so", "Non lo so"]].map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><div><Label>Forma giuridica</Label><Select value={formData.legal_form} onValueChange={(value) => setFormData((current) => ({ ...current, legal_form: value, tax_regime: ["societa_persone", "societa_capitali"].includes(value) ? "ordinario" : current.tax_regime }))}><SelectTrigger><SelectValue placeholder="Seleziona" /></SelectTrigger><SelectContent>{[["ditta_individuale", "Ditta individuale"], ["forfettario", "Regime forfettario"], ["societa_persone", "Società di persone"], ["societa_capitali", "Società di capitali"], ["non_so", "Non lo so"], ["preferisco_non_rispondere", "Preferisco non rispondere"]].map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><div><Label>Regime fiscale (facoltativo)</Label><Select value={formData.tax_regime} onValueChange={(value) => setField("tax_regime", value)}><SelectTrigger><SelectValue placeholder="Seleziona o salta" /></SelectTrigger><SelectContent>{taxOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div><div><Label>Settore</Label><Input value={formData.sector} onChange={(event) => setField("sector", event.target.value)} /></div><div><Label>Clientela</Label><Select value={formData.customer_type} onValueChange={(value) => setField("customer_type", value)}><SelectTrigger><SelectValue placeholder="Seleziona" /></SelectTrigger><SelectContent>{[["b2b", "B2B"], ["b2c", "B2C"], ["b2b_b2c", "B2B e B2C"], ["non_so", "Non lo so"], ["preferisco_non_rispondere", "Preferisco non rispondere"]].map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><div className="flex gap-3"><Button type="button" variant="outline" className="flex-1" onClick={() => setStep(3)}>Indietro</Button><Button type="submit" className="flex-1">Avanti</Button></div></>}
      {step === 5 && <><div><Label>Fascia fatturato annuo</Label><Input value={formData.revenue_band} placeholder="Facoltativo" onChange={(event) => setField("revenue_band", event.target.value)} /></div><div><Label>Addetti</Label><Input value={formData.employees_band} placeholder="Facoltativo" onChange={(event) => setField("employees_band", event.target.value)} /></div><div><Label>Preventivi mensili</Label><Input value={formData.monthly_quotes_band} placeholder="Facoltativo" onChange={(event) => setField("monthly_quotes_band", event.target.value)} /></div><div><Label>Esigenze principali</Label>{checkboxes(NEEDS, "needs")}</div><div><Label>Moduli di interesse</Label>{checkboxes(MODULES, "interested_modules")}</div><div className="flex gap-3"><Button type="button" variant="outline" className="flex-1" onClick={() => setStep(4)}>Indietro</Button><Button type="submit" className="flex-1" disabled={loading}>{loading ? "Registrazione..." : "Completa registrazione"}</Button></div></>}
    </form><p className="text-center text-sm text-muted-foreground">Hai già un account? <Link to="/login" className="text-primary font-medium hover:underline">Accedi</Link></p></div></div><div className="hidden lg:flex flex-1 bg-primary items-center justify-center p-12"><div className="max-w-md text-white text-center"><h2 className="text-3xl font-bold mb-4" style={{ fontFamily: "Barlow, sans-serif" }}>Unisciti a BESIDE</h2><p className="text-white/80">7 giorni di prova gratuita. Nessuna carta richiesta.</p></div></div></div>;
};
