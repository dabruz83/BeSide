import { useState } from "react";
import { useAuth, API } from "@/App";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { 
  UserCog, 
  Building2,
  Users,
  Mail,
  Save,
  CreditCard,
  LogOut
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

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

export const ProfilePage = () => {
  const { user, logout, checkAuth } = useAuth();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    business_name: user?.business_name || "",
    team_size: user?.team_size || 1,
    services: user?.services || [],
    tax_regime: user?.tax_regime || "forfettario_15"
  });

  const handleServiceToggle = (serviceId) => {
    setFormData(prev => ({
      ...prev,
      services: prev.services.includes(serviceId)
        ? prev.services.filter(s => s !== serviceId)
        : [...prev.services, serviceId]
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.put(`${API}/auth/profile`, formData, { withCredentials: true });
      await checkAuth();
      toast.success("Profilo aggiornato!");
    } catch (error) {
      toast.error("Errore nell'aggiornamento");
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const getInitials = (name) => {
    if (!name) return "U";
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const getSubscriptionLabel = (tier) => {
    switch (tier) {
      case "essential": return "Essential - €97/mese";
      case "professional": return "Professional - €197/mese";
      case "elite": return "Elite - €397/mese";
      default: return tier;
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case "trial": return "Prova Gratuita";
      case "active": return "Attivo";
      case "cancelled": return "Cancellato";
      default: return status;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-heading-2 text-primary" data-testid="profile-title">Profilo</h1>
        <p className="text-muted-foreground">Gestisci le impostazioni del tuo account</p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Profile Info */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <UserCog className="w-5 h-5 text-secondary" />
              Informazioni Attività
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Avatar Section */}
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarImage src={user?.picture} alt={user?.name} />
                <AvatarFallback className="bg-primary/10 text-primary text-lg">
                  {getInitials(user?.name || user?.business_name)}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold text-lg">{user?.name || user?.business_name}</p>
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Mail className="w-3 h-3" />
                  {user?.email}
                </p>
              </div>
            </div>

            {/* Form */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="business_name">Nome Attività</Label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="business_name"
                    value={formData.business_name}
                    onChange={(e) => setFormData({ ...formData, business_name: e.target.value })}
                    className="pl-10"
                    data-testid="profile-business-input"
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
                    value={formData.team_size}
                    onChange={(e) => setFormData({ ...formData, team_size: parseInt(e.target.value) || 1 })}
                    className="pl-10"
                    data-testid="profile-team-input"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Servizi Offerti</Label>
                <div className="grid grid-cols-2 gap-3">
                  {SERVICES.map((service) => (
                    <label
                      key={service.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        formData.services.includes(service.id)
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={formData.services.includes(service.id)}
                        onChange={() => handleServiceToggle(service.id)}
                        className="sr-only"
                      />
                      <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                        formData.services.includes(service.id)
                          ? "bg-primary border-primary text-white"
                          : "border-muted-foreground"
                      }`}>
                        {formData.services.includes(service.id) && (
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <span className="text-sm">{service.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Regime Fiscale</Label>
                <Select
                  value={formData.tax_regime}
                  onValueChange={(value) => setFormData({ ...formData, tax_regime: value })}
                >
                  <SelectTrigger data-testid="profile-tax-select">
                    <SelectValue />
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

              <Button onClick={handleSave} disabled={saving} data-testid="profile-save-btn">
                <Save className="w-4 h-4 mr-2" />
                {saving ? "Salvataggio..." : "Salva Modifiche"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Subscription Card */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-secondary" />
                Abbonamento
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Piano attuale</p>
                <p className="font-semibold">{getSubscriptionLabel(user?.subscription_tier)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Stato</p>
                <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                  user?.subscription_status === "active" 
                    ? "bg-success/10 text-success"
                    : user?.subscription_status === "trial"
                    ? "bg-warning/10 text-warning"
                    : "bg-muted text-muted-foreground"
                }`}>
                  {getStatusLabel(user?.subscription_status)}
                </span>
              </div>
              <Link to="/subscription">
                <Button variant="outline" className="w-full" data-testid="upgrade-btn">
                  {user?.subscription_status === "trial" ? "Attiva Abbonamento" : "Gestisci Piano"}
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <Button 
                variant="outline" 
                className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={handleLogout}
                data-testid="logout-btn"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Esci dall'Account
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
