import { useState } from "react";
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
  { value: "ordinario", label: "Regime Ordinario" }
];

const SERVICES = [
  { id: "ppf", label: "PPF (Pellicola Protettiva)" },
  { id: "wrap", label: "Wrap (Decorativo/Commerciale)" },
  { id: "tint", label: "Oscuramento Vetri" },
  { id: "upholstery", label: "Tappezzeria" }
];

export const RegisterPage = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    business_name: "",
    team_size: 1,
    services: [],
    tax_regime: "forfettario_15"
  });

  const handleServiceToggle = (serviceId) => {
    setFormData(prev => ({
      ...prev,
      services: prev.services.includes(serviceId)
        ? prev.services.filter(s => s !== serviceId)
        : [...prev.services, serviceId]
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (step === 1) {
      if (!formData.email || !formData.password) {
        toast.error("Inserisci email e password");
        return;
      }
      if (formData.password.length < 6) {
        toast.error("La password deve essere di almeno 6 caratteri");
        return;
      }
      setStep(2);
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${API}/auth/register`, formData);
      
      // Auto login after registration
      const loginResponse = await axios.post(
        `${API}/auth/login`,
        { email: formData.email, password: formData.password },
        { withCredentials: true }
      );
      
      login(loginResponse.data.user);
      toast.success("Registrazione completata! Benvenuto in BESIDE");
      navigate("/dashboard");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Errore durante la registrazione");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + '/dashboard';
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left side - Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <Link to="/">
              <h1 className="text-3xl font-bold text-primary mb-2" style={{ fontFamily: 'Barlow, sans-serif' }}>
                BESIDE
              </h1>
            </Link>
            <p className="text-muted-foreground">
              {step === 1 ? "Crea il tuo account" : "Configura la tua attività"}
            </p>
          </div>

          {/* Progress indicator */}
          <div className="flex items-center justify-center gap-2">
            <div className={`w-8 h-1 rounded-full ${step >= 1 ? "bg-primary" : "bg-muted"}`}></div>
            <div className={`w-8 h-1 rounded-full ${step >= 2 ? "bg-primary" : "bg-muted"}`}></div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {step === 1 ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="tuaemail@esempio.it"
                      className="pl-10"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      required
                      data-testid="register-email-input"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Minimo 6 caratteri"
                      className="pl-10 pr-10"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      required
                      data-testid="register-password-input"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <Button type="submit" className="w-full" data-testid="register-next-btn">
                  Continua
                </Button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border"></div>
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">Oppure</span>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={handleGoogleLogin}
                  data-testid="google-register-btn"
                >
                  <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Registrati con Google
                </Button>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="business_name">Nome Attività</Label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="business_name"
                      type="text"
                      placeholder="Es: Auto Wrap Milano"
                      className="pl-10"
                      value={formData.business_name}
                      onChange={(e) => setFormData({ ...formData, business_name: e.target.value })}
                      required
                      data-testid="register-business-input"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="team_size">Dimensione Team</Label>
                  <div className="relative">
                    <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="team_size"
                      type="number"
                      min="1"
                      max="50"
                      className="pl-10"
                      value={formData.team_size}
                      onChange={(e) => setFormData({ ...formData, team_size: parseInt(e.target.value) || 1 })}
                      data-testid="register-team-input"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Servizi Offerti</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {SERVICES.map((service) => (
                      <div
                        key={service.id}
                        className="flex items-center space-x-2"
                      >
                        <Checkbox
                          id={service.id}
                          checked={formData.services.includes(service.id)}
                          onCheckedChange={() => handleServiceToggle(service.id)}
                          data-testid={`service-${service.id}`}
                        />
                        <label
                          htmlFor={service.id}
                          className="text-sm cursor-pointer"
                        >
                          {service.label}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tax_regime">Regime Fiscale</Label>
                  <Select
                    value={formData.tax_regime}
                    onValueChange={(value) => setFormData({ ...formData, tax_regime: value })}
                  >
                    <SelectTrigger data-testid="register-tax-select">
                      <SelectValue placeholder="Seleziona regime" />
                    </SelectTrigger>
                    <SelectContent>
                      {TAX_REGIMES.map((regime) => (
                        <SelectItem key={regime.value} value={regime.value}>
                          {regime.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setStep(1)}
                  >
                    Indietro
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={loading}
                    data-testid="register-submit-btn"
                  >
                    {loading ? "Registrazione..." : "Completa"}
                  </Button>
                </div>
              </>
            )}
          </form>

          <p className="text-center text-sm text-muted-foreground">
            Hai già un account?{" "}
            <Link to="/login" className="text-primary font-medium hover:underline">
              Accedi
            </Link>
          </p>
        </div>
      </div>

      {/* Right side - Image/Brand */}
      <div className="hidden lg:flex flex-1 bg-primary items-center justify-center p-12">
        <div className="max-w-md text-white text-center">
          <h2 className="text-3xl font-bold mb-4" style={{ fontFamily: 'Barlow, sans-serif' }}>
            Unisciti a BESIDE
          </h2>
          <p className="text-white/80">
            14 giorni di prova gratuita. Nessuna carta richiesta. 
            Scopri quanto guadagni davvero dai tuoi lavori.
          </p>
        </div>
      </div>
    </div>
  );
};
