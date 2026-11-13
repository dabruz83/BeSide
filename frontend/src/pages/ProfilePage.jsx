import { useState, useEffect } from "react";
import { useAuth, API } from "@/App";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
  ShieldCheck,
  ArrowLeft, ChevronRight, Settings2, UserRound, Landmark, CalendarDays, Bell, PauseCircle, Trash2, LifeBuoy
} from "lucide-react";
import { useNavigate } from "react-router-dom";

const TAX_REGIMES = [
  { value: "forfettario_5", label: "Forfettario 5%" },
  { value: "forfettario_15", label: "Forfettario 15%" },
  { value: "ordinario", label: "Regime Ordinario" }
];

const BUSINESS_TYPES = [
  { value: "ditta_individuale", label: "Ditta Individuale" },
  { value: "societa_persone", label: "Società di Persone (SNC, SAS)" },
  { value: "societa_capitali", label: "Società di Capitali (SRL, SRLS, SPA)" }
];

const SERVICES = [
  { id: "ppf", label: "PPF (Pellicola Protettiva)" },
  { id: "wrap", label: "Wrapping" },
  { id: "tint", label: "Oscuramento Vetri" },
  { id: "upholstery", label: "Tappezzeria" }
];

const SUPPORT_CATEGORIES = [
  ["technical", "Problema tecnico"],
  ["authentication", "Accesso/autenticazione"],
  ["password", "Password"],
  ["billing", "Abbonamenti/pagamenti"],
  ["privacy", "Privacy"],
  ["other", "Altro"],
];

const SUPPORT_STATUS_LABELS = { open: "Aperto", pending: "In lavorazione", closed: "Chiuso" };
const WEEK_DAYS = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
const emptyWorkHours = () => WEEK_DAYS.map((_, day) => ({ day, enabled: false, start: "", end: "", break_start: "", break_end: "" }));

export const ProfilePage = () => {
  const { user, logout, checkAuth } = useAuth();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [section, setSection] = useState(null);
  const [personal, setPersonal] = useState({ first_name: user?.first_name || "", last_name: "" });
  const [accountReason, setAccountReason] = useState("");
  const [accountReasonDetails, setAccountReasonDetails] = useState("");
  const [searchingCompany, setSearchingCompany] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [recoveryContact, setRecoveryContact] = useState(null);
  const [contactEmail, setContactEmail] = useState("");
  const [contactPassword, setContactPassword] = useState("");
  const [contactTotp, setContactTotp] = useState("");
  const [contactBusy, setContactBusy] = useState(false);
  const [supportCategory, setSupportCategory] = useState("technical");
  const [supportSubject, setSupportSubject] = useState("");
  const [supportMessage, setSupportMessage] = useState("");
  const [supportTickets, setSupportTickets] = useState([]);
  const [supportSelectedTicket, setSupportSelectedTicket] = useState(null);
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportBusy, setSupportBusy] = useState(false);
  const [collaborators, setCollaborators] = useState({ members: [], invitations: [], collaborator_limit: 0, plan: "essential" });
  const [collaboratorEmail, setCollaboratorEmail] = useState("");
  const [collaboratorRole, setCollaboratorRole] = useState("member");
  const [collaboratorBusy, setCollaboratorBusy] = useState(false);
  const [deletionForm, setDeletionForm] = useState({ reason: "", details: "", confirmation: "", code: "" });
  const [deletionBusy, setDeletionBusy] = useState(false);
  const [deletionStatus, setDeletionStatus] = useState(null);
  const [emailChange, setEmailChange] = useState({ status: "none", email: "", expires_at: null });
  const [emailChangeForm, setEmailChangeForm] = useState({ email: "", code: "" });
  const [emailChangeOpen, setEmailChangeOpen] = useState(false);
  const [emailChangeBusy, setEmailChangeBusy] = useState(false);
  const [workHours, setWorkHours] = useState(emptyWorkHours);
  const [workHoursConfigured, setWorkHoursConfigured] = useState(false);
  const [workHoursBusy, setWorkHoursBusy] = useState(false);
  const [workAreas, setWorkAreas] = useState([]);
  const [workAreaDrafts, setWorkAreaDrafts] = useState([]);
  const [workAreasBusy, setWorkAreasBusy] = useState(false);
  
  const [formData, setFormData] = useState({
    business_name: user?.business_name || "",
    team_size: user?.team_size || 1,
    services: user?.services || [],
    tax_regime: user?.tax_regime || "forfettario_15"
  });
  const [marketingPreferences, setMarketingPreferences] = useState({ email_opt_in: Boolean(user?.marketing_preferences?.email_opt_in), profiling_opt_in: Boolean(user?.marketing_preferences?.profiling_opt_in) });

  const [businessInfo, setBusinessInfo] = useState({
    business_type: user?.business_info?.business_type || "",
    partita_iva: user?.business_info?.partita_iva || "",
    codice_fiscale: user?.business_info?.codice_fiscale || "",
    indirizzo: user?.business_info?.indirizzo || "",
    citta: user?.business_info?.citta || "",
    cap: user?.business_info?.cap || "",
    provincia: user?.business_info?.provincia || "",
    commercial_name: user?.business_info?.commercial_name || user?.business_name || "",
    public_address: user?.business_info?.public_address || user?.business_info?.indirizzo || "",
    public_cap: user?.business_info?.public_cap || user?.business_info?.cap || "",
    public_city: user?.business_info?.public_city || user?.business_info?.citta || "",
    public_province: user?.business_info?.public_province || user?.business_info?.provincia || "",
    show_public_address: user?.business_info?.show_public_address ?? Boolean(user?.business_info?.indirizzo),
    show_public_email: user?.business_info?.show_public_email ?? Boolean(user?.business_info?.email),
    show_public_phone: user?.business_info?.show_public_phone ?? Boolean(user?.business_info?.telefono),
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
    axios.get(`${API}/auth/onboarding-profile`).then(({ data }) => {
      const p = data.personal || {};
      setPersonal({ first_name: p.first_name || user?.first_name || "", last_name: p.last_name || "" });
    }).catch(() => {});
  }, [user?.user_id]);

  const handleLogoUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 300 * 1024) {
      toast.error("Usa un'immagine PNG, JPG o WebP di massimo 300 KB.");
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setBusinessInfo(current => ({ ...current, logo_url: String(reader.result) }));
    reader.onerror = () => toast.error("Impossibile caricare il logo.");
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (user?.business_info) {
      setBusinessInfo(prev => ({
        ...prev,
        ...user.business_info
      }));
    }
  }, [user]);

  useEffect(() => {
    if (!user?.totp_enabled) return;
    axios.get(`${API}/auth/recovery-contact`)
      .then((response) => setRecoveryContact(response.data.contact))
      .catch(() => setRecoveryContact(null));
  }, [user?.user_id, user?.totp_enabled]);

  const loadSupportTickets = async () => {
    setSupportLoading(true);
    try {
      const response = await axios.get(`${API}/auth/support/tickets`);
      setSupportTickets(response.data.tickets || []);
      setSupportSelectedTicket((current) => current
        ? (response.data.tickets || []).find((ticket) => ticket.ticket_id === current.ticket_id) || null
        : null);
    } catch (error) {
      setSupportTickets([]);
      toast.error(error.response?.data?.detail || "Impossibile caricare le richieste.");
    } finally {
      setSupportLoading(false);
    }
  };

  useEffect(() => {
    if (section === "support" && user?.user_id) loadSupportTickets();
  }, [section, user?.user_id]);

  useEffect(() => {
    if (section !== "calendar" || !user?.user_id) return;
    Promise.all([
      axios.get(`${API}/calendar/work-hours`),
      axios.get(`${API}/calendar/work-areas`),
    ]).then(([hoursResponse, areasResponse]) => {
      const configuredDays = hoursResponse.data.days || [];
      const byDay = new Map(configuredDays.map((item) => [item.day, item]));
      setWorkHours(emptyWorkHours().map((item) => ({ ...item, ...(byDay.get(item.day) || {}) })));
      setWorkHoursConfigured(Boolean(hoursResponse.data.configured));
      setWorkAreas(areasResponse.data || []);
      setWorkAreaDrafts((areasResponse.data || []).map((item) => ({ ...item })));
    }).catch((error) => toast.error(error.response?.data?.detail || "Impossibile caricare le impostazioni dell'agenda."));
  }, [section, user?.user_id]);

  const loadCollaborators = async () => {
    try {
      const response = await axios.get(`${API}/auth/company/members`);
      setCollaborators(response.data || { members: [], invitations: [], collaborator_limit: 0, plan: "essential" });
    } catch (error) {
      setCollaborators({ members: [], invitations: [], collaborator_limit: 0, plan: "essential" });
      toast.error(error.response?.data?.detail || "Impossibile caricare i collaboratori.");
    }
  };

  useEffect(() => {
    if (section === "personal" && user?.role === "owner") loadCollaborators();
  }, [section, user?.user_id, user?.role]);

  useEffect(() => {
    if (section !== "personal" || !user?.user_id) return;
    axios.get(`${API}/auth/email-change/status`).then(({ data }) => setEmailChange(data)).catch(() => {});
  }, [section, user?.user_id]);

  const inviteCollaborator = async (event) => {
    event.preventDefault();
    if (!collaboratorEmail.trim()) return;
    setCollaboratorBusy(true);
    try {
      await axios.post(`${API}/auth/company/invitations`, { email: collaboratorEmail.trim(), role: collaboratorRole });
      setCollaboratorEmail("");
      await loadCollaborators();
      toast.success("Invito inviato.");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Impossibile inviare l'invito.");
    } finally {
      setCollaboratorBusy(false);
    }
  };

  const cancelCollaboratorInvite = async (invitationId) => {
    setCollaboratorBusy(true);
    try {
      await axios.post(`${API}/auth/company/invitations/${invitationId}/cancel`);
      await loadCollaborators();
      toast.success("Invito annullato.");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Impossibile annullare l'invito.");
    } finally {
      setCollaboratorBusy(false);
    }
  };

  const resendCollaboratorInvite = async (invitationId) => {
    setCollaboratorBusy(true);
    try {
      await axios.post(`${API}/auth/company/invitations/${invitationId}/resend`);
      await loadCollaborators();
      toast.success("Invito reinviato.");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Impossibile reinviare l'invito.");
    } finally {
      setCollaboratorBusy(false);
    }
  };

  const revokeCollaborator = async (userId) => {
    if (!window.confirm("Revocare l'accesso di questo collaboratore?")) return;
    setCollaboratorBusy(true);
    try {
      await axios.delete(`${API}/auth/company/members/${userId}`);
      await loadCollaborators();
      toast.success("Accesso revocato.");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Impossibile revocare l'accesso.");
    } finally {
      setCollaboratorBusy(false);
    }
  };

  const changeCollaboratorRole = async (userId, role) => {
    setCollaboratorBusy(true);
    try {
      await axios.put(`${API}/companies/current/users/${userId}/role`, { role });
      await loadCollaborators();
      toast.success("Ruolo aggiornato.");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Impossibile aggiornare il ruolo.");
    } finally {
      setCollaboratorBusy(false);
    }
  };

  const requestAccountDeletion = async (event) => {
    event.preventDefault();
    if (deletionForm.confirmation !== "ELIMINA" || !/^\d{6}$/.test(deletionForm.code)) {
      toast.error("Digita ELIMINA e inserisci un codice Authenticator valido.");
      return;
    }
    setDeletionBusy(true);
    try {
      const response = await axios.post(`${API}/auth/company/delete`, deletionForm);
      setDeletionStatus(response.data);
      toast.success("Eliminazione avviata.");
    } catch (error) {
      setDeletionForm(current => ({ ...current, code: "" }));
      toast.error(error.response?.data?.detail || "Impossibile avviare l'eliminazione.");
    } finally {
      setDeletionBusy(false);
    }
  };

  const requestEmailChange = async (event) => {
    event.preventDefault();
    if (!emailChangeForm.email.trim() || !/^\d{6}$/.test(emailChangeForm.code)) {
      toast.error("Inserisci il nuovo indirizzo e un codice Authenticator valido.");
      return;
    }
    setEmailChangeBusy(true);
    try {
      const response = await axios.post(`${API}/auth/email-change/request`, emailChangeForm);
      setEmailChange({ status: "pending", email: response.data.email, expires_at: response.data.expires_at });
      setEmailChangeForm({ email: "", code: "" });
      setEmailChangeOpen(false);
      toast.success("Controlla la nuova email per confermare il cambio.");
    } catch (error) {
      setEmailChangeForm(current => ({ ...current, code: "" }));
      toast.error(error.response?.data?.detail || "Impossibile richiedere il cambio email.");
    } finally {
      setEmailChangeBusy(false);
    }
  };

  const cancelEmailChange = async () => {
    setEmailChangeBusy(true);
    try {
      await axios.post(`${API}/auth/email-change/cancel`);
      setEmailChange({ status: "none", email: "", expires_at: null });
      toast.success("Richiesta annullata.");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Impossibile annullare la richiesta.");
    } finally {
      setEmailChangeBusy(false);
    }
  };

  const submitSupportTicket = async (event) => {
    event.preventDefault();
    if (!supportSubject.trim() || !supportMessage.trim()) return;
    setSupportBusy(true);
    try {
      await axios.post(`${API}/auth/support/tickets`, {
        category: supportCategory,
        subject: supportSubject.trim(),
        message: supportMessage.trim(),
      });
      setSupportSubject("");
      setSupportMessage("");
      await loadSupportTickets();
      toast.success("Richiesta inviata.");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Impossibile inviare la richiesta.");
    } finally {
      setSupportBusy(false);
    }
  };

  const handleContactInvite = async () => {
    if (!contactEmail.trim() || !contactPassword || !/^\d{6}$/.test(contactTotp)) {
      toast.error("Inserisci email, password e un codice Authenticator valido.");
      return;
    }
    setContactBusy(true);
    try {
      const response = await axios.post(`${API}/auth/recovery-contact/invite`, {
        email: contactEmail.trim(),
        password: contactPassword,
        code: contactTotp,
      });
      setRecoveryContact({ contact_email: contactEmail.trim(), status: response.data.status });
      setContactPassword("");
      setContactTotp("");
      toast.success(response.data.message || "Invito inviato.");
    } catch (error) {
      // Keep the authenticated profile and invitation fields, but clear the
      // rejected one-time code so the next TOTP can be entered immediately.
      setContactTotp("");
      toast.error(error.response?.data?.detail || "Impossibile inviare l'invito.");
    } finally {
      setContactBusy(false);
    }
  };

  const handleContactRevoke = async () => {
    if (!contactPassword || !/^\d{6}$/.test(contactTotp)) {
      toast.error("Per revocare il contatto inserisci password e codice Authenticator.");
      return;
    }
    setContactBusy(true);
    try {
      const response = await axios.post(`${API}/auth/recovery-contact/revoke`, {
        password: contactPassword,
        code: contactTotp,
      });
      setRecoveryContact(null);
      setContactPassword("");
      setContactTotp("");
      toast.success(response.data.message || "Contatto revocato.");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Impossibile revocare il contatto.");
    } finally {
      setContactBusy(false);
    }
  };

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
      const payload = section === "personal" ? personal
        : section === "activity" ? { business_name: formData.business_name, team_size: formData.team_size, services: formData.services, tax_regime: formData.tax_regime, business_info: businessInfo }
        : section === "fiscal" ? { tax_regime: formData.tax_regime, business_info: businessInfo }
        : section === "quotes" ? { business_info: businessInfo } : null;
      if (!payload) return;
      await axios.put(`${API}/auth/profile`, payload);
      await checkAuth();
      toast.success("Profilo aggiornato!");
    } catch (error) {
      toast.error("Errore nell'aggiornamento");
    } finally {
      setSaving(false);
    }
  };

  const copyBusinessAddress = () => {
    setBusinessInfo((current) => ({
      ...current,
      public_address: current.indirizzo || "",
      public_cap: current.cap || "",
      public_city: current.citta || "",
      public_province: current.provincia || "",
    }));
    toast.success("Indirizzo copiato nei recapiti pubblici");
  };

  const saveWorkHours = async () => {
    const invalid = workHours.some((item) => item.enabled && (!item.start || !item.end || item.start >= item.end));
    if (invalid) { toast.error("Completa inizio e fine per ogni giorno lavorativo."); return; }
    setWorkHoursBusy(true);
    try {
      const response = await axios.put(`${API}/calendar/work-hours`, { days: workHours });
      setWorkHours(response.data.days || workHours);
      setWorkHoursConfigured(true);
      toast.success("Orari lavorativi salvati");
    } catch (error) { toast.error(error.response?.data?.detail || "Impossibile salvare gli orari."); }
    finally { setWorkHoursBusy(false); }
  };

  const saveProfileWorkAreas = async () => {
    const areas = workAreaDrafts.map((area) => ({ area_id: area.area_id || null, name: area.name.trim() }));
    if (areas.some((area) => !area.name)) { toast.error("Inserisci un nome per ogni area."); return; }
    if (new Set(areas.map((area) => area.name.toLowerCase())).size !== areas.length) { toast.error("Ogni area deve avere un nome diverso."); return; }
    setWorkAreasBusy(true);
    try {
      const response = await axios.put(`${API}/calendar/work-areas`, { areas });
      setWorkAreas(response.data || []); setWorkAreaDrafts((response.data || []).map((item) => ({ ...item })));
      toast.success("Aree di lavoro aggiornate");
    } catch (error) { toast.error(error.response?.data?.detail || "Impossibile aggiornare le aree."); }
    finally { setWorkAreasBusy(false); }
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

  const menu = [
    { key: "personal", title: "Profilo personale", subtitle: "Nome e dati di accesso", icon: UserRound },
    { key: "activity", title: "La mia attività", subtitle: "Dati aziendali, fiscali e documenti", icon: Building2 },
    { key: "calendar", title: "Agenda e lavorazioni", subtitle: "Orari, aree e promemoria", icon: CalendarDays },
    { key: "notifications", title: "Notifiche", subtitle: "Promemoria e comunicazioni", icon: Bell },
    { key: "security", title: "Sicurezza e privacy", subtitle: "MFA, contatto fidato e consensi", icon: ShieldCheck },
    { key: "subscription", title: "Abbonamento", subtitle: "Piano e rinnovi", icon: CreditCard },
    { key: "support", title: "Assistenza", subtitle: "Nuove richieste e risposte", icon: LifeBuoy },
    { key: "account", title: "Gestione account", subtitle: "Rinnovi e richieste account", icon: Settings2 },
  ];
  const current = menu.find(item => item.key === section);
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 pb-24 md:pb-8" data-testid="settings-page">
      <div className="flex items-center gap-3">
        {section && <Button variant="ghost" size="icon" aria-label="Torna alle impostazioni" onClick={() => setSection(null)}><ArrowLeft className="h-5 w-5" /></Button>}
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold text-primary" data-testid="profile-title">{current?.title || "Impostazioni"}</h1>
          {!section && <p className="text-sm text-muted-foreground">Gestisci la tua attività e il tuo account</p>}
        </div>
      </div>

      {!section && (
        <>
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center gap-3">
                <Avatar className="h-14 w-14"><AvatarImage src={user?.picture} alt="" /><AvatarFallback className="bg-primary/10 text-primary">{getInitials(user?.name || user?.business_name)}</AvatarFallback></Avatar>
                <div className="min-w-0"><p className="font-semibold truncate">{user?.name || user?.business_name}</p><p className="text-sm text-muted-foreground truncate">{user?.email}</p></div>
              </div>
            </CardContent>
          </Card>
          <Card><CardContent className="p-1">
            {menu.map((item, index) => {
              const Icon = item.icon;
              return <button key={item.key} type="button" onClick={() => setSection(item.key)} className="flex w-full min-h-16 items-center gap-3 rounded-md px-3 py-3 text-left hover:bg-muted/60 active:bg-primary/5" data-testid={"settings-" + item.key}>
                <Icon className="h-5 w-5 shrink-0 text-secondary" />
                <span className="min-w-0 flex-1"><span className="block font-medium text-sm">{item.title}</span><span className="block text-xs text-muted-foreground">{item.subtitle}</span></span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>;
            })}
          </CardContent></Card>
          <div className="space-y-2">
            <Button onClick={handleLogout} variant="ghost" className="w-full text-destructive"><LogOut className="mr-2 h-4 w-4"/>Esci dall'account</Button>
          </div>
        </>
      )}

      {section === "personal" && <Card><CardContent className="space-y-4 pt-5">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label>Nome</Label><Input value={personal.first_name} onChange={e => setPersonal(p => ({...p, first_name: e.target.value}))} /></div>
          <div className="space-y-1"><Label>Cognome</Label><Input value={personal.last_name} onChange={e => setPersonal(p => ({...p, last_name: e.target.value}))} /></div>
        </div>
        <div className="space-y-2"><Label>Email di accesso</Label><div className="flex gap-2"><Input value={user?.email || ""} disabled /><Button type="button" variant="outline" onClick={() => setEmailChangeOpen(value => !value)}>Modifica</Button></div>{emailChange.status === "pending" && <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-xs"><p>Verifica richiesta in attesa per {emailChange.email}.</p><Button type="button" variant="link" className="h-auto px-0" disabled={emailChangeBusy} onClick={cancelEmailChange}>Annulla richiesta</Button></div>}{emailChangeOpen && <form onSubmit={requestEmailChange} className="space-y-2 rounded-md border p-3"><Input type="email" required placeholder="Nuovo indirizzo email" value={emailChangeForm.email} onChange={e => setEmailChangeForm(f => ({ ...f, email: e.target.value }))}/><Input inputMode="numeric" maxLength={6} required placeholder="Codice Authenticator" value={emailChangeForm.code} onChange={e => setEmailChangeForm(f => ({ ...f, code: e.target.value.replace(/\D/g, "").slice(0, 6) }))} autoComplete="one-time-code"/><p className="text-xs text-muted-foreground">L'indirizzo attuale resta attivo fino alla verifica del nuovo.</p><Button type="submit" className="w-full" disabled={emailChangeBusy}>Invia verifica</Button></form>}</div>
        <div className="space-y-1"><Label>Ruolo</Label><Input value={user?.role || ""} disabled /></div>
        <Button onClick={handleSave} disabled={saving} className="w-full" data-testid="profile-save-btn">Salva modifiche</Button>
      </CardContent></Card>}

      {section === "personal" && user?.role === "owner" && <Card>
        <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Users className="h-5 w-5"/>Gestione collaboratori</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Gli utenti Beside sono distinti dal numero di dipendenti. Il piano {collaborators.plan} consente {collaborators.collaborator_limit} collaboratori oltre al titolare.</p>
          <form onSubmit={inviteCollaborator} className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <Input type="email" required placeholder="Email del collaboratore" value={collaboratorEmail} onChange={e => setCollaboratorEmail(e.target.value)} />
            <select className="rounded-md border bg-background px-3 py-2 text-sm" value={collaboratorRole} onChange={e => setCollaboratorRole(e.target.value)} aria-label="Ruolo collaboratore">
              <option value="admin">Amministratore aziendale</option><option value="member">Collaboratore</option><option value="viewer">Sola lettura</option>
            </select>
            <Button type="submit" disabled={collaboratorBusy}>Invia invito</Button>
          </form>
          {collaborators.invitations?.length > 0 && <div className="space-y-2"><p className="text-sm font-medium">Inviti in attesa</p>{collaborators.invitations.map(invite => <div key={invite.invitation_id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"><span className="min-w-0 flex-1 truncate">{invite.email} · {invite.role}</span><div className="flex gap-1"><Button type="button" variant="ghost" size="sm" disabled={collaboratorBusy} onClick={() => resendCollaboratorInvite(invite.invitation_id)}>Reinvia invito</Button><Button type="button" variant="ghost" size="sm" disabled={collaboratorBusy} onClick={() => cancelCollaboratorInvite(invite.invitation_id)}>Annulla</Button></div></div>)}</div>}
          {collaborators.members?.filter(member => member.user_id !== user?.user_id).length > 0 && <div className="space-y-2"><p className="text-sm font-medium">Utenti attivi</p>{collaborators.members.filter(member => member.user_id !== user?.user_id).map(member => <div key={member.user_id} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm"><span className="min-w-0 truncate">{member.email}</span><select className="rounded-md border bg-background px-2 py-1 text-xs" value={member.role} disabled={collaboratorBusy} onChange={e => changeCollaboratorRole(member.user_id, e.target.value)}><option value="admin">Amministratore</option><option value="member">Collaboratore</option><option value="viewer">Sola lettura</option></select><Button type="button" variant="ghost" size="sm" className="text-destructive" disabled={collaboratorBusy} onClick={() => revokeCollaborator(member.user_id)}>Revoca</Button></div>)}</div>}
          {!collaborators.invitations?.length && !collaborators.members?.some(member => member.user_id !== user?.user_id) && <p className="text-sm text-muted-foreground">Nessun collaboratore collegato.</p>}
        </CardContent>
      </Card>}

      {section === "personal" && user?.role === "owner" && <Card className="border-destructive/40">
        <CardHeader><CardTitle className="text-lg flex items-center gap-2 text-destructive"><Trash2 className="h-5 w-5"/>Elimina definitivamente account</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {deletionStatus ? <div className="space-y-3 text-sm"><p className="font-medium text-destructive">Eliminazione avviata</p><p>L'accesso operativo è stato bloccato. Lo stato persistente è: {deletionStatus.status}.</p><Button type="button" className="w-full" onClick={() => logout().then(() => navigate("/login"))}>Torna al login</Button></div> : <>
            <p className="text-sm text-muted-foreground">L'operazione è irreversibile: perderai subito l'accesso e l'eventuale periodo di abbonamento residuo, senza rimborso automatico.</p>
            <form onSubmit={requestAccountDeletion} className="space-y-3">
              <select className="w-full rounded-md border bg-background p-2.5 text-sm" value={deletionForm.reason} onChange={e => setDeletionForm(f => ({ ...f, reason: e.target.value }))}>
                <option value="">Motivo (facoltativo)</option><option value="pausa">Pausa o chiusura attività</option><option value="utilizzo">Utilizzo insufficiente</option><option value="costo">Costo abbonamento</option><option value="funzioni">Funzionalità mancanti</option><option value="alternativa">Altra soluzione</option><option value="altro">Altro</option>
              </select>
              {deletionForm.reason === "altro" && (
                <Textarea rows={2} placeholder="Note facoltative" value={deletionForm.details} onChange={e => setDeletionForm(f => ({ ...f, details: e.target.value }))}/>
              )}
              <Input placeholder="Digita ELIMINA" value={deletionForm.confirmation} onChange={e => setDeletionForm(f => ({ ...f, confirmation: e.target.value }))} autoComplete="off" />
              <Input inputMode="numeric" maxLength={6} placeholder="Codice Authenticator" value={deletionForm.code} onChange={e => setDeletionForm(f => ({ ...f, code: e.target.value.replace(/\D/g, "").slice(0, 6) }))} autoComplete="one-time-code" />
              <Button type="submit" variant="destructive" className="w-full" disabled={deletionBusy}>{deletionBusy ? "Eliminazione in corso…" : "Elimina definitivamente"}</Button>
            </form>
          </>}
        </CardContent>
      </Card>}

      {section === "activity" && <>
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
                </CardContent>
              </Card>
        <Card><CardHeader><CardTitle className="text-lg">Recapiti pubblici</CardTitle></CardHeader><CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="commercial_name">Nome commerciale</Label>
                    <Input
                      id="commercial_name"
                      value={businessInfo.commercial_name}
                      onChange={(e) => setBusinessInfo({ ...businessInfo, commercial_name: e.target.value })}
                      placeholder={formData.business_name || "Nome mostrato ai clienti"}
                    />
                    <p className="text-xs text-muted-foreground">Può essere diverso dalla ragione sociale.</p>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Label>Indirizzo per i clienti</Label>
                    <Button type="button" variant="outline" size="sm" onClick={copyBusinessAddress}>Copia indirizzo dell'attività</Button>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="public_address">Indirizzo pubblico</Label>
                    <Input id="public_address" value={businessInfo.public_address} onChange={(e) => setBusinessInfo({ ...businessInfo, public_address: e.target.value })} placeholder="Via Roma 1" />
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="space-y-2"><Label htmlFor="public_cap">CAP</Label><Input id="public_cap" value={businessInfo.public_cap} onChange={(e) => setBusinessInfo({ ...businessInfo, public_cap: e.target.value })} placeholder="20100" /></div>
                    <div className="space-y-2"><Label htmlFor="public_city">Città</Label><Input id="public_city" value={businessInfo.public_city} onChange={(e) => setBusinessInfo({ ...businessInfo, public_city: e.target.value })} placeholder="Milano" /></div>
                    <div className="space-y-2"><Label htmlFor="public_province">Provincia</Label><Input id="public_province" maxLength={2} value={businessInfo.public_province} onChange={(e) => setBusinessInfo({ ...businessInfo, public_province: e.target.value.toUpperCase() })} placeholder="MI" /></div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                  <div className="space-y-2 rounded-md border bg-muted/20 p-3 text-sm">
                    <p className="font-medium">Mostra nei preventivi e documenti clienti</p>
                    <label className="flex items-center gap-2"><Checkbox checked={businessInfo.show_public_address} onCheckedChange={(value) => setBusinessInfo({ ...businessInfo, show_public_address: value === true })} /> Indirizzo</label>
                    <label className="flex items-center gap-2"><Checkbox checked={businessInfo.show_public_email} onCheckedChange={(value) => setBusinessInfo({ ...businessInfo, show_public_email: value === true })} /> Email</label>
                    <label className="flex items-center gap-2"><Checkbox checked={businessInfo.show_public_phone} onCheckedChange={(value) => setBusinessInfo({ ...businessInfo, show_public_phone: value === true })} /> Telefono</label>
                  </div>

        </CardContent></Card>
        <Button onClick={handleSave} disabled={saving} className="w-full" data-testid="profile-save-btn">Salva attività</Button>
      </>}

      {section === "activity" && <>
        <Card><CardContent className="pt-5 space-y-3">
                    <div className="space-y-2">
                      <Label>Forma giuridica</Label>
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
<div className="space-y-2">
                    <Label>Regime fiscale</Label>
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
                  </div></CardContent></Card>
<Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="w-5 h-5 text-secondary" />
                    Dati fiscali e sede legale
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
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
                </CardContent>
              </Card>
        <Button onClick={handleSave} disabled={saving} className="w-full" data-testid="profile-save-btn">Salva dati fiscali</Button>
      </>}

      {section === "activity" && <>
        <Card><CardHeader><CardTitle className="text-lg">Personalizzazione preventivi</CardTitle></CardHeader><CardContent className="space-y-4">
          <div className="space-y-2"><Label>Carica il logo (PNG, JPG o WebP, massimo 300 KB)</Label><Input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleLogoUpload}/></div>
                  <div className="space-y-4">
                    <h4 className="font-medium mb-3">Aspetto dei documenti</h4>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="logo_url">Indirizzo logo esistente (facoltativo)</Label>
                        {businessInfo.logo_url?.startsWith("data:image/") ? (
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">Logo caricato dal dispositivo</span>
                            <Button type="button" variant="outline" size="sm" onClick={() => setBusinessInfo(v => ({...v, logo_url: ""}))}>Rimuovi</Button>
                          </div>
                        ) : (
                          <Input
                            id="logo_url"
                            value={businessInfo.logo_url}
                            onChange={(e) => setBusinessInfo({ ...businessInfo, logo_url: e.target.value })}
                            placeholder="https://esempio.it/logo.png"
                          />
                        )}
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

          <div className="rounded-md border p-4 bg-white text-slate-900 space-y-3">
            <div className="flex items-start justify-between gap-3">
              {businessInfo.logo_url ? <img alt="Anteprima logo" src={businessInfo.logo_url} style={{width: Math.min(300, Math.max(50, Number(businessInfo.logo_width) || 150))}} className="h-auto max-h-20 object-contain object-left" /> : <span className="text-xs text-slate-500">Logo aziendale</span>}
              <div className="text-right"><p className="font-semibold text-primary">PREVENTIVO</p><p className="text-xs">N. 2026/001 · Esempio</p></div>
            </div>
            <p className="font-semibold">{formData.business_name || "La tua attività"}</p>
            <p className="whitespace-pre-line text-xs text-slate-500">{businessInfo.intestazione_extra || "Intestazione personalizzabile"}</p>
            <div className="border-t pt-2 flex justify-between text-sm"><span>Totale di esempio</span><strong>€ 1.500,00</strong></div>
          </div>
          <p className="text-xs text-muted-foreground">L'anteprima è indicativa. I preventivi reali utilizzano i dati salvati.</p>
        </CardContent></Card>
        <Button className="w-full" onClick={handleSave} disabled={saving} data-testid="profile-save-btn">Salva personalizzazione</Button>
      </>}

      {section === "calendar" && <div className="space-y-4">
        <Card><CardHeader><CardTitle className="text-lg">Orari e giorni lavorativi</CardTitle></CardHeader><CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Se non configuri gli orari, l'Agenda mantiene il comportamento attuale. Gli appuntamenti fuori orario restano consentiti.</p>
          {workHours.map((item) => <div key={item.day} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 font-medium"><Checkbox checked={item.enabled} onCheckedChange={(value) => setWorkHours((current) => current.map((day) => day.day === item.day ? { ...day, enabled: value === true } : day))} />{WEEK_DAYS[item.day]}</label>
              {item.enabled && <div className="grid grid-cols-2 gap-2"><Input type="time" aria-label={`${WEEK_DAYS[item.day]} inizio`} value={item.start || ""} onChange={(event) => setWorkHours((current) => current.map((day) => day.day === item.day ? { ...day, start: event.target.value } : day))} /><Input type="time" aria-label={`${WEEK_DAYS[item.day]} fine`} value={item.end || ""} onChange={(event) => setWorkHours((current) => current.map((day) => day.day === item.day ? { ...day, end: event.target.value } : day))} /></div>}
            </div>
            {item.enabled && <div className="mt-2 grid grid-cols-2 gap-2"><Input type="time" aria-label={`${WEEK_DAYS[item.day]} inizio pausa`} placeholder="Pausa inizio" value={item.break_start || ""} onChange={(event) => setWorkHours((current) => current.map((day) => day.day === item.day ? { ...day, break_start: event.target.value } : day))} /><Input type="time" aria-label={`${WEEK_DAYS[item.day]} fine pausa`} placeholder="Pausa fine" value={item.break_end || ""} onChange={(event) => setWorkHours((current) => current.map((day) => day.day === item.day ? { ...day, break_end: event.target.value } : day))} /></div>}
          </div>)}
          {!workHoursConfigured && <p className="text-xs text-muted-foreground">Nessun orario configurato.</p>}
          <Button type="button" onClick={saveWorkHours} disabled={workHoursBusy}>{workHoursBusy ? "Salvataggio..." : "Salva orari"}</Button>
        </CardContent></Card>
        <Card><CardHeader><CardTitle className="text-lg">Aree di lavoro</CardTitle></CardHeader><CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Le stesse aree vengono utilizzate dagli appuntamenti. La rimozione è bloccata se ci sono appuntamenti futuri.</p>
          {workAreaDrafts.map((area, index) => <div key={area.area_id || index} className="flex items-center gap-2"><Input value={area.name} maxLength={80} onChange={(event) => setWorkAreaDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} /><Button type="button" variant="outline" size="icon" aria-label={`Rimuovi ${area.name || "area"}`} disabled={workAreaDrafts.length === 1} onClick={() => setWorkAreaDrafts((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 className="h-4 w-4" /></Button></div>)}
          <Button type="button" variant="outline" onClick={() => setWorkAreaDrafts((current) => [...current, { area_id: null, name: "" }])} disabled={workAreaDrafts.length >= 12}><Plus className="mr-1 h-4 w-4" />Aggiungi area</Button>
          <Button type="button" className="ml-2" onClick={saveProfileWorkAreas} disabled={workAreasBusy}>{workAreasBusy ? "Salvataggio..." : "Salva aree"}</Button>
        </CardContent></Card>
        <Button variant="outline" onClick={() => navigate("/calendar")}><CalendarDays className="mr-2 h-4 w-4"/>Apri Pianificazione</Button>
      </div>}

      {section === "notifications" && <Card><CardContent className="pt-5 space-y-3">
        <p className="text-sm">Promemoria appuntamenti</p>
        <p className="text-sm text-muted-foreground">Il promemoria iniziale è di 30 minuti. Puoi modificarlo nella scheda di ogni appuntamento.</p>
        <p className="text-xs text-muted-foreground">Le preferenze globali dei canali di notifica saranno disponibili quando i relativi invii saranno attivati.</p>
        <Button variant="outline" onClick={() => navigate("/calendar")}>Apri l'agenda</Button>
      </CardContent></Card>}

      {section === "security" && <>
<Card id="sicurezza">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ShieldCheck className="w-5 h-5" />
                Sicurezza
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Autenticazione MFA: {user?.totp_enabled ? "attiva" : "da configurare"}.
                Il recupero dell'accesso prevede l'aiuto di una persona fidata, senza darle accesso ai tuoi dati.
              </p>
              {user?.totp_enabled ? (
                <>
                  {recoveryContact && (
                    <div className="rounded-md bg-muted p-3 space-y-1 text-sm">
                      <p className="font-medium">Contatto: {recoveryContact.contact_email}</p>
                      <p>Stato: {recoveryContact.status}</p>
                      {recoveryContact.security_period_ends_at && (
                        <p className="text-xs text-muted-foreground">
                          Fine periodo di sicurezza: {new Date(recoveryContact.security_period_ends_at).toLocaleString("it-IT")}
                        </p>
                      )}
                    </div>
                  )}
                  {!recoveryContact && (
                    <>
                      <p className="text-sm">Invita una persona fidata: riceverà un'email e potrà accettare con un clic, senza creare un account Beside. Dopo il periodo di sicurezza potrà confermare soltanto una richiesta di recupero.</p>
                      <Label htmlFor="trusted-contact-email">Email del contatto fidato</Label>
                      <Input id="trusted-contact-email" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="contatto@esempio.it" autoComplete="off" />
                    </>
                  )}
                  <Label htmlFor="trusted-contact-password">Password attuale per autorizzare l'operazione</Label>
                  <Input id="trusted-contact-password" type="password" value={contactPassword} onChange={(e) => setContactPassword(e.target.value)} autoComplete="current-password" />
                  <Label htmlFor="trusted-contact-totp">Nuovo codice Authenticator (6 cifre)</Label>
                  <Input id="trusted-contact-totp" inputMode="numeric" maxLength={6} value={contactTotp} onChange={(e) => setContactTotp(e.target.value.replace(/\D/g, "").slice(0, 6))} autoComplete="one-time-code" />
                  {recoveryContact ? (
                    <Button type="button" variant="destructive" disabled={contactBusy} onClick={handleContactRevoke}>Revoca contatto fidato</Button>
                  ) : (
                    <Button type="button" disabled={contactBusy} onClick={handleContactInvite}>Invita contatto fidato</Button>
                  )}
                  <p className="text-xs text-muted-foreground">Non riutilizzare il codice TOTP appena utilizzato per accedere: inserisci un codice successivo.</p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Completa la configurazione MFA per abilitare un contatto fidato.</p>
              )}
            </CardContent>
          </Card>
<Card><CardHeader><CardTitle className="text-lg">Preferenze privacy e comunicazioni</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><label className="flex items-start gap-2"><Checkbox checked={marketingPreferences.email_opt_in} onCheckedChange={(value) => setMarketingPreferences((current) => ({ ...current, email_opt_in: value === true }))} /><span>Ricevere comunicazioni commerciali via email (facoltativo).</span></label><label className="flex items-start gap-2"><Checkbox checked={marketingPreferences.profiling_opt_in} onCheckedChange={(value) => setMarketingPreferences((current) => ({ ...current, profiling_opt_in: value === true }))} /><span>Profilazione per offerte commerciali personalizzate (facoltativo).</span></label><p className="text-xs text-muted-foreground">Puoi modificare o revocare queste preferenze senza compromettere l'accesso a Beside.</p><Button type="button" variant="outline" onClick={handleConsentSave}>Salva preferenze</Button></CardContent></Card>
      </>}

      {section === "subscription" && <>
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
              <Button type="button" variant="outline" onClick={() => navigate("/subscription")}>Gestisci abbonamento</Button>
            </CardContent>
          </Card>
      </>}

      {section === "support" && <div className="space-y-4">
        <Card><CardHeader><CardTitle className="text-lg">Nuova richiesta</CardTitle></CardHeader><CardContent>
          <form onSubmit={submitSupportTicket} className="space-y-4">
            <div className="space-y-1.5"><Label htmlFor="settings-support-category">Categoria</Label><select id="settings-support-category" className="w-full rounded-md border bg-background p-2.5" value={supportCategory} onChange={(event) => setSupportCategory(event.target.value)}>{SUPPORT_CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
            <div className="space-y-1.5"><Label htmlFor="settings-support-subject">Oggetto</Label><Input id="settings-support-subject" required maxLength={200} value={supportSubject} onChange={(event) => setSupportSubject(event.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="settings-support-message">Descrizione del problema</Label><Textarea id="settings-support-message" required maxLength={4000} rows={5} value={supportMessage} onChange={(event) => setSupportMessage(event.target.value)} /></div>
            <Button type="submit" disabled={supportBusy || !supportSubject.trim() || !supportMessage.trim()} className="w-full">{supportBusy ? "Invio..." : "Invia richiesta"}</Button>
          </form>
        </CardContent></Card>
        <Card><CardHeader><div className="flex items-center justify-between gap-3"><CardTitle className="text-lg">Le mie richieste</CardTitle><Button type="button" variant="ghost" size="sm" onClick={loadSupportTickets} disabled={supportLoading}>{supportLoading ? "Caricamento..." : "Aggiorna"}</Button></div></CardHeader><CardContent className="space-y-3">
          {supportSelectedTicket ? <div className="space-y-4"><Button type="button" variant="ghost" className="px-0" onClick={() => setSupportSelectedTicket(null)}>← Tutte le richieste</Button><div><p className="font-semibold">{supportSelectedTicket.subject}</p><p className="text-xs text-muted-foreground">{supportSelectedTicket.ticket_id} · {new Date(supportSelectedTicket.created_at).toLocaleString("it-IT")}</p></div><div className="space-y-3">{(supportSelectedTicket.messages || []).map((item, index) => <div key={`${supportSelectedTicket.ticket_id}-${index}`} className="rounded-lg border bg-muted/20 p-3"><div className="flex items-center justify-between gap-2 text-xs text-muted-foreground"><span>{item.author_type === "platform_owner" ? "Assistenza Beside" : "Tu"}</span><span>{new Date(item.created_at).toLocaleString("it-IT")}</span></div><p className="mt-1 whitespace-pre-wrap text-sm">{item.message}</p></div>)}</div></div> : supportLoading ? <p className="text-sm text-muted-foreground">Caricamento richieste...</p> : supportTickets.length === 0 ? <p className="text-sm text-muted-foreground">Non hai ancora inviato richieste.</p> : <div className="divide-y rounded-lg border">{supportTickets.map((ticket) => <button key={ticket.ticket_id} type="button" onClick={() => setSupportSelectedTicket(ticket)} className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-muted/40"><span className="min-w-0"><span className="block truncate font-medium">{ticket.subject}</span><span className="block text-xs text-muted-foreground">{ticket.ticket_id} · {new Date(ticket.created_at).toLocaleDateString("it-IT")}</span></span><span className="shrink-0 rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">{SUPPORT_STATUS_LABELS[ticket.status] || ticket.status}</span></button>)}</div>}
        </CardContent></Card>
      </div>}

      {section === "account" && <div className="space-y-4">
        <Card><CardHeader><CardTitle className="text-lg flex items-center gap-2"><PauseCircle className="h-5 w-5"/>Sospendi temporaneamente l’account</CardTitle></CardHeader><CardContent className="space-y-4"><p className="text-sm text-muted-foreground">La sospensione disattiva il rinnovo alla scadenza naturale del periodo pagato, senza perdere i giorni residui. Puoi annullarla finché non è diventata effettiva.</p><Button variant="outline" className="w-full" onClick={() => navigate("/subscription")}>Gestisci sospensione e rinnovo</Button></CardContent></Card>
      </div>}
    </div>
  );
};
