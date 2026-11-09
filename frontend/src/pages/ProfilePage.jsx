import { useState, useEffect } from "react";
import { useAuth, API } from "@/App";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { 
  UserCog, 
  Building2,
  Users,
  Mail,
  Save,
  CreditCard,
  LogOut,
  FileText,
  MapPin,
  Phone,
  Search,
  Loader2,
  ShieldCheck
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";

const TAX_REGIMES = [
  { value: "forfettario_5", label: "Forfettario 5%" },
  { value: "forfettario_15", label: "Forfettario 15%" },
  { value: "ordinario", label: "Regime Ordinario" }
];

const BUSINESS_TYPES = [
  { value: "ditta_individuale", label: "Ditta Individuale" },
  { value: "forfettario", label: "Forfettario" },
  { value: "societa_persone", label: "Società di Persone (SNC, SAS)" },
  { value: "societa_capitali", label: "Società di Capitali (SRL, SRLS, SPA)" }
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
  const [searchingCompany, setSearchingCompany] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [twoFactorPassword, setTwoFactorPassword] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [twoFactorSetup, setTwoFactorSetup] = useState(null);
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [twoFactorBusy, setTwoFactorBusy] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState(user?.recovery_email || "");
  const [recoveryEmailPassword, setRecoveryEmailPassword] = useState("");
  const [recoveryEmailCode, setRecoveryEmailCode] = useState("");
  const [recoveryEmailBusy, setRecoveryEmailBusy] = useState(false);
  const [recoveryContact, setRecoveryContact] = useState(null);
  const [recoveryContactEmail, setRecoveryContactEmail] = useState("");
  const [recoveryContactPassword, setRecoveryContactPassword] = useState("");
  const [recoveryContactCode, setRecoveryContactCode] = useState("");
  const [recoveryContactBusy, setRecoveryContactBusy] = useState(false);
  
  const [formData, setFormData] = useState({
    business_name: user?.business_name || "",
    team_size: user?.team_size || 1,
    services: user?.services || [],
    tax_regime: user?.tax_regime || "forfettario_15"
  });
  const [marketingPreferences, setMarketingPreferences] = useState({
    email_opt_in: user?.marketing_preferences?.email_opt_in || false,
    profiling_opt_in: user?.marketing_preferences?.profiling_opt_in || false,
  });

  const [businessInfo, setBusinessInfo] = useState({
    business_type: user?.business_info?.business_type || "",
    partita_iva: user?.business_info?.partita_iva || "",
    codice_fiscale: user?.business_info?.codice_fiscale || "",
    indirizzo: user?.business_info?.indirizzo || "",
    citta: user?.business_info?.citta || "",
    cap: user?.business_info?.cap || "",
    provincia: user?.business_info?.provincia || "",
    sdi: user?.business_info?.sdi || "",
    pec: user?.business_info?.pec || "",
    email: user?.business_info?.email || "",
    telefono: user?.business_info?.telefono || "",
    iban: user?.business_info?.iban || "",
    banca: user?.business_info?.banca || "",
    logo_url: user?.business_info?.logo_url || "",
    logo_width: user?.business_info?.logo_width || 150,
    intestazione_extra: user?.business_info?.intestazione_extra || ""
  });

  useEffect(() => {
    if (user?.business_info) {
      setBusinessInfo(prev => ({
        ...prev,
        ...user.business_info
      }));
    }
    if (user?.marketing_preferences) {
      setMarketingPreferences({
        email_opt_in: Boolean(user.marketing_preferences.email_opt_in),
        profiling_opt_in: Boolean(user.marketing_preferences.profiling_opt_in),
      });
    }
  }, [user]);

  useEffect(() => {
    axios.get(`${API}/auth/recovery-contact`)
      .then((response) => setRecoveryContact(response.data.contact))
      .catch(() => setRecoveryContact(null));
  }, [user]);

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
      await axios.put(`${API}/auth/profile`, {
        ...formData,
        business_info: businessInfo,
        marketing_emails_opt_in: marketingPreferences.email_opt_in,
        marketing_profiling_opt_in: marketingPreferences.profiling_opt_in,
      });
      await checkAuth();
      toast.success("Profilo aggiornato!");
    } catch (error) {
      toast.error("Errore nell'aggiornamento");
    } finally {
      setSaving(false);
    }
  };

  const handleConsentSave = async () => {
    try {
      await axios.put(`${API}/auth/privacy-preferences`, marketingPreferences);
      await checkAuth();
      toast.success("Preferenze aggiornate");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Errore nell'aggiornamento delle preferenze");
    }
  };

  const handleSearchCompany = async () => {
    if (!searchQuery.trim()) {
      toast.error("Inserisci un termine di ricerca");
      return;
    }
    
    setSearchingCompany(true);
    try {
      // Note: This would need a real Registro Imprese API integration
      // For now, we show a placeholder message
      toast.info("Funzione in fase di attivazione. Contatta il supporto per l'integrazione con il Registro Imprese.");
    } catch (error) {
      toast.error("Errore nella ricerca");
    } finally {
      setSearchingCompany(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const handleTwoFactorSetup = async () => {
    if (!twoFactorPassword) {
      toast.error("Inserisci la password per confermare la tua identità");
      return;
    }
    setTwoFactorBusy(true);
    try {
      const response = await axios.post(`${API}/auth/2fa/setup`, { password: twoFactorPassword });
      setTwoFactorSetup(response.data);
      setTwoFactorCode("");
      toast.success("Scansiona il QR e inserisci il codice generato");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Impossibile predisporre il 2FA");
    } finally {
      setTwoFactorBusy(false);
    }
  };

  const handleTwoFactorConfirm = async () => {
    if (!twoFactorSetup || !/^\d{6}$/.test(twoFactorCode)) {
      toast.error("Inserisci un codice TOTP di 6 cifre");
      return;
    }
    setTwoFactorBusy(true);
    try {
      const response = await axios.post(`${API}/auth/2fa/confirm`, {
        password: twoFactorPassword,
        code: twoFactorCode,
      });
      setRecoveryCodes(response.data.recovery_codes || []);
      setTwoFactorSetup(null);
      setTwoFactorPassword("");
      setTwoFactorCode("");
      toast.success("Autenticazione a due fattori attivata");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Codice non valido o scaduto");
    } finally {
      setTwoFactorBusy(false);
    }
  };

  const handleRecoveryEmailSetup = async () => {
    if (!recoveryEmail || !recoveryEmailPassword || (user?.totp_enabled && recoveryEmailCode.length !== 6)) {
      toast.error(user?.totp_enabled ? "Inserisci email, password e codice TOTP" : "Inserisci email e password");
      return;
    }
    setRecoveryEmailBusy(true);
    try {
      const response = await axios.post(`${API}/auth/recovery-email/setup`, {
        email: recoveryEmail,
        password: recoveryEmailPassword,
        ...(user?.totp_enabled ? { code: recoveryEmailCode } : {}),
      });
      toast.success(response.data.message);
      setRecoveryEmailPassword("");
      setRecoveryEmailCode("");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Impossibile configurare l'email di recupero");
    } finally {
      setRecoveryEmailBusy(false);
    }
  };

  const handleRecoveryContactInvite = async () => {
    if (!recoveryContactEmail || !recoveryContactPassword || (user?.totp_enabled && recoveryContactCode.length !== 6)) {
      toast.error(user?.totp_enabled ? "Inserisci email, password e codice TOTP" : "Inserisci email e password");
      return;
    }
    setRecoveryContactBusy(true);
    try {
      const response = await axios.post(`${API}/auth/recovery-contact/invite`, {
        email: recoveryContactEmail,
        password: recoveryContactPassword,
        ...(user?.totp_enabled ? { code: recoveryContactCode } : {}),
      });
      setRecoveryContact({ contact_email: recoveryContactEmail, status: response.data.status });
      setRecoveryContactPassword("");
      setRecoveryContactCode("");
      toast.success(response.data.message);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Impossibile inviare l'invito");
    } finally {
      setRecoveryContactBusy(false);
    }
  };

  const handleRecoveryContactRevoke = async () => {
    setRecoveryContactBusy(true);
    try {
      await axios.post(`${API}/auth/recovery-contact/revoke`);
      setRecoveryContact(null);
      toast.success("Contatto fidato revocato");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Impossibile revocare il contatto");
    } finally {
      setRecoveryContactBusy(false);
    }
  };

  const getInitials = (name) => {
    if (!name) return "U";
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const getSubscriptionLabel = (tier) => {
    switch (tier) {
      case "essential": return "Essential";
      case "professional": return "Professional";
      case "elite": return "Elite";
      default: return tier;
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case "trial":
      case "trialing": return "Prova Gratuita";
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
        <p className="text-muted-foreground">Gestisci le impostazioni del tuo account e i dati aziendali</p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Main Profile Section */}
        <div className="md:col-span-2 space-y-6">
          {/* Avatar Section */}
          <Card>
            <CardContent className="pt-6">
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
            </CardContent>
          </Card>

          <Tabs defaultValue="attivita" className="space-y-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="attivita">Attività</TabsTrigger>
              <TabsTrigger value="dati_fiscali">Dati Fiscali</TabsTrigger>
            </TabsList>

            {/* Tab Attività */}
            <TabsContent value="attivita">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <UserCog className="w-5 h-5 text-secondary" />
                    Informazioni Attività
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
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

                  <div className="grid grid-cols-2 gap-4">
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
                      <Label>Tipo Azienda</Label>
                      <Select
                        value={businessInfo.business_type}
                        onValueChange={(value) => setBusinessInfo({ ...businessInfo, business_type: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Seleziona tipo" />
                        </SelectTrigger>
                        <SelectContent>
                          {BUSINESS_TYPES.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                </CardContent>
              </Card>
            </TabsContent>

            {/* Tab Dati Fiscali */}
            <TabsContent value="dati_fiscali">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="w-5 h-5 text-secondary" />
                    Dati Fiscali e Contatti
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Company Search */}
                  <div className="p-4 bg-muted/50 rounded-lg space-y-3">
                    <Label className="flex items-center gap-2">
                      <Search className="w-4 h-4" />
                      Cerca Azienda nel Registro Imprese
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Nome azienda, P.IVA o città..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                      <Button onClick={handleSearchCompany} disabled={searchingCompany}>
                        {searchingCompany ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="partita_iva">Partita IVA</Label>
                      <Input
                        id="partita_iva"
                        value={businessInfo.partita_iva}
                        onChange={(e) => setBusinessInfo({ ...businessInfo, partita_iva: e.target.value })}
                        placeholder="IT12345678901"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="codice_fiscale">Codice Fiscale</Label>
                      <Input
                        id="codice_fiscale"
                        value={businessInfo.codice_fiscale}
                        onChange={(e) => setBusinessInfo({ ...businessInfo, codice_fiscale: e.target.value })}
                        placeholder="RSSMRA80A01H501Z"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="indirizzo">Indirizzo</Label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="indirizzo"
                        value={businessInfo.indirizzo}
                        onChange={(e) => setBusinessInfo({ ...businessInfo, indirizzo: e.target.value })}
                        className="pl-10"
                        placeholder="Via Roma 1"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="citta">Città</Label>
                      <Input
                        id="citta"
                        value={businessInfo.citta}
                        onChange={(e) => setBusinessInfo({ ...businessInfo, citta: e.target.value })}
                        placeholder="Milano"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cap">CAP</Label>
                      <Input
                        id="cap"
                        value={businessInfo.cap}
                        onChange={(e) => setBusinessInfo({ ...businessInfo, cap: e.target.value })}
                        placeholder="20100"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="provincia">Provincia</Label>
                      <Input
                        id="provincia"
                        value={businessInfo.provincia}
                        onChange={(e) => setBusinessInfo({ ...businessInfo, provincia: e.target.value })}
                        placeholder="MI"
                        maxLength={2}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="sdi">Codice SDI</Label>
                      <Input
                        id="sdi"
                        value={businessInfo.sdi}
                        onChange={(e) => setBusinessInfo({ ...businessInfo, sdi: e.target.value })}
                        placeholder="XXXXXXX"
                        maxLength={7}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pec">PEC</Label>
                      <Input
                        id="pec"
                        type="email"
                        value={businessInfo.pec}
                        onChange={(e) => setBusinessInfo({ ...businessInfo, pec: e.target.value })}
                        placeholder="azienda@pec.it"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="email_business">Email</Label>
                      <Input
                        id="email_business"
                        type="email"
                        value={businessInfo.email}
                        onChange={(e) => setBusinessInfo({ ...businessInfo, email: e.target.value })}
                        placeholder="info@azienda.it"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="telefono">Telefono</Label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="telefono"
                          value={businessInfo.telefono}
                          onChange={(e) => setBusinessInfo({ ...businessInfo, telefono: e.target.value })}
                          className="pl-10"
                          placeholder="+39 02 1234567"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="iban">IBAN</Label>
                      <Input
                        id="iban"
                        value={businessInfo.iban}
                        onChange={(e) => setBusinessInfo({ ...businessInfo, iban: e.target.value })}
                        placeholder="IT60X0542811101000000123456"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="banca">Banca</Label>
                      <Input
                        id="banca"
                        value={businessInfo.banca}
                        onChange={(e) => setBusinessInfo({ ...businessInfo, banca: e.target.value })}
                        placeholder="Intesa San Paolo"
                      />
                    </div>
                  </div>

                  <div className="border-t border-border pt-4 mt-4">
                    <h4 className="font-medium mb-3">Personalizzazione Preventivi</h4>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="logo_url">URL Logo</Label>
                        <Input
                          id="logo_url"
                          value={businessInfo.logo_url}
                          onChange={(e) => setBusinessInfo({ ...businessInfo, logo_url: e.target.value })}
                          placeholder="https://esempio.it/logo.png"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="logo_width">Larghezza Logo (px)</Label>
                        <Input
                          id="logo_width"
                          type="number"
                          min="50"
                          max="300"
                          value={businessInfo.logo_width}
                          onChange={(e) => setBusinessInfo({ ...businessInfo, logo_width: parseInt(e.target.value) || 150 })}
                        />
                      </div>
                    </div>

                    <div className="space-y-2 mt-4">
                      <Label htmlFor="intestazione_extra">Righe Extra Intestazione</Label>
                      <Textarea
                        id="intestazione_extra"
                        value={businessInfo.intestazione_extra}
                        onChange={(e) => setBusinessInfo({ ...businessInfo, intestazione_extra: e.target.value })}
                        placeholder="Righe aggiuntive per l'intestazione del preventivo..."
                        rows={3}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <Card>
            <CardHeader><CardTitle className="text-lg">Preferenze privacy e comunicazioni</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <label className="flex items-start gap-2"><Checkbox checked={marketingPreferences.email_opt_in} onCheckedChange={(value) => setMarketingPreferences((current) => ({ ...current, email_opt_in: value === true }))} /><span>Ricevere comunicazioni commerciali via email (facoltativo).</span></label>
              <label className="flex items-start gap-2"><Checkbox checked={marketingPreferences.profiling_opt_in} onCheckedChange={(value) => setMarketingPreferences((current) => ({ ...current, profiling_opt_in: value === true }))} /><span>Profilazione per offerte commerciali personalizzate (facoltativo).</span></label>
              <p className="text-xs text-muted-foreground">Puoi modificare o revocare queste preferenze in qualsiasi momento. L'accesso a Beside non dipende da esse.</p>
              <Button type="button" variant="outline" onClick={handleConsentSave}>Salva preferenze</Button>
            </CardContent>
          </Card>

          <Button onClick={handleSave} disabled={saving} className="w-full" data-testid="profile-save-btn">
            <Save className="w-4 h-4 mr-2" />
            {saving ? "Salvataggio..." : "Salva Tutte le Modifiche"}
          </Button>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-secondary" />
                Sicurezza account
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {user?.totp_enabled ? (
                <p className="text-sm text-success">Autenticazione a due fattori attiva.</p>
              ) : recoveryCodes.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-sm font-medium">Salva questi codici di recupero. Saranno mostrati una sola volta.</p>
                  <div className="grid grid-cols-2 gap-2 rounded-md bg-muted p-3 font-mono text-xs">
                    {recoveryCodes.map((code) => <span key={code}>{code}</span>)}
                  </div>
                  <p className="text-xs text-muted-foreground">Per completare l'attivazione, accedi di nuovo.</p>
                </div>
              ) : !twoFactorSetup ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">Proteggi l'accesso con Google Authenticator o Microsoft Authenticator.</p>
                  <Label htmlFor="two-factor-password">Password attuale</Label>
                  <Input
                    id="two-factor-password"
                    type="password"
                    value={twoFactorPassword}
                    onChange={(event) => setTwoFactorPassword(event.target.value)}
                    autoComplete="current-password"
                  />
                  <Button onClick={handleTwoFactorSetup} disabled={twoFactorBusy} className="w-full">
                    {twoFactorBusy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
                    Attiva autenticazione a due fattori
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm">Scansiona il QR code, oppure inserisci manualmente la chiave nell'app.</p>
                  <div className="flex justify-center rounded-md bg-white p-3">
                    <QRCodeSVG value={twoFactorSetup.otpauth_uri} size={180} includeMargin />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="two-factor-secret">Chiave di configurazione</Label>
                    <Input id="two-factor-secret" value={twoFactorSetup.secret} readOnly className="font-mono text-xs" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="two-factor-code">Codice TOTP (6 cifre)</Label>
                    <Input
                      id="two-factor-code"
                      inputMode="numeric"
                      maxLength={6}
                      value={twoFactorCode}
                      onChange={(event) => setTwoFactorCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                      autoComplete="one-time-code"
                    />
                  </div>
                  <Button onClick={handleTwoFactorConfirm} disabled={twoFactorBusy || twoFactorCode.length !== 6} className="w-full">
                    {twoFactorBusy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Conferma attivazione
                  </Button>
                </div>
              )}
              <div className="border-t border-border pt-4 space-y-3">
                <div>
                  <p className="font-medium">Email di recupero</p>
                  <p className="text-xs text-muted-foreground">Riceverai un link di verifica; non sostituisce il secondo fattore.</p>
                </div>
                {user?.recovery_email_verified && (
                  <p className="text-sm text-success">{user.recovery_email}</p>
                )}
                <Input
                  type="email"
                  placeholder="recupero@esempio.it"
                  value={recoveryEmail}
                  onChange={(event) => setRecoveryEmail(event.target.value)}
                  autoComplete="email"
                />
                <Input
                  type="password"
                  placeholder="Password attuale"
                  value={recoveryEmailPassword}
                  onChange={(event) => setRecoveryEmailPassword(event.target.value)}
                  autoComplete="current-password"
                />
                {user?.totp_enabled && (
                  <Input
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="Codice TOTP (6 cifre)"
                    value={recoveryEmailCode}
                    onChange={(event) => setRecoveryEmailCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    autoComplete="one-time-code"
                  />
                )}
                <Button onClick={handleRecoveryEmailSetup} disabled={recoveryEmailBusy} variant="outline" className="w-full">
                  {recoveryEmailBusy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Invia verifica email di recupero
                </Button>
              </div>
              <div className="border-t border-border pt-4 space-y-3">
                <div>
                  <p className="font-medium">Contatto di recupero</p>
                  <p className="text-xs text-muted-foreground">Il contatto non accede all'account. L'attivazione richiede accettazione e 7 giorni di sicurezza.</p>
                </div>
                {recoveryContact && (
                  <div className="rounded-md bg-muted p-3 text-sm space-y-1">
                    <p>{recoveryContact.contact_email}</p>
                    <p className="text-xs text-muted-foreground">Stato: {recoveryContact.status}</p>
                    <Button onClick={handleRecoveryContactRevoke} disabled={recoveryContactBusy} variant="ghost" size="sm" className="px-0 text-destructive">Revoca contatto</Button>
                  </div>
                )}
                <Input type="email" placeholder="persona-fidata@esempio.it" value={recoveryContactEmail} onChange={(event) => setRecoveryContactEmail(event.target.value)} autoComplete="email" />
                <Input type="password" placeholder="Password attuale" value={recoveryContactPassword} onChange={(event) => setRecoveryContactPassword(event.target.value)} autoComplete="current-password" />
                {user?.totp_enabled && <Input inputMode="numeric" maxLength={6} placeholder="Codice TOTP (6 cifre)" value={recoveryContactCode} onChange={(event) => setRecoveryContactCode(event.target.value.replace(/\D/g, "").slice(0, 6))} autoComplete="one-time-code" />}
                <Button onClick={handleRecoveryContactInvite} disabled={recoveryContactBusy} variant="outline" className="w-full">
                  {recoveryContactBusy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Invia invito contatto fidato
                </Button>
              </div>
            </CardContent>
          </Card>

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
                    : ["trial", "trialing"].includes(user?.subscription_status)
                    ? "bg-warning/10 text-warning"
                    : "bg-muted text-muted-foreground"
                }`}>
                  {getStatusLabel(user?.subscription_status)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                La gestione degli abbonamenti non è ancora attiva.
              </p>
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
