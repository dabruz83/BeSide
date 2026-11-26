import { WorkActivitiesSettings } from "@/components/work-time/WorkTime";
import { useState, useEffect, useRef } from "react";
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
  ArrowLeft, ChevronRight, Settings2, UserRound, Landmark, CalendarDays, Bell, PauseCircle, Trash2, LifeBuoy, Plus, Monitor
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useUiPreferences } from "@/lib/uiPreferences";
import { AddCircleButton } from "@/components/AddCircleButton";
import { browserSupportsWebAuthn, startRegistration } from "@simplewebauthn/browser";

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
const NOTIFICATION_DEFAULTS = {
  preferences: {
    installer_quote_accepted: true,
    installer_appointment_reminder: true,
    installer_support_reply: true,
    client_quote: false,
    client_appointment_confirmed: false,
    client_appointment_modified: false,
    client_appointment_cancelled: false,
    client_appointment_reminder: false,
    client_reminder_lead: "24h",
    client_reminder_custom_minutes: null,
    postwork_thanks: false,
    postwork_check_invite: false,
    postwork_invite_lead_days: 3,
  },
  templates: {
    quote_accepted: { subject: "Preventivo accettato • Beside", body: "<p>Il preventivo di {nome_cliente} è stato accettato.</p>" },
    appointment_reminder: { subject: "Promemoria appuntamento • Beside", body: "<p>Promemoria per {nome_cliente}: appuntamento il {data} alle {ora}.</p>" },
    support_reply: { subject: "Risposta alla tua richiesta • Beside", body: "<p>Hai ricevuto una risposta alla tua richiesta di assistenza.</p>" },
    client_quote: { subject: "Il tuo preventivo Beside", body: "<p>Il tuo preventivo è disponibile: {link_preventivo}</p>" },
    client_appointment_confirmed: { subject: "Appuntamento confermato • Beside", body: "<p>Il tuo appuntamento è confermato per {data} alle {ora}.</p>" },
    client_appointment_modified: { subject: "Appuntamento modificato • Beside", body: "<p>Il tuo appuntamento è stato modificato.</p>" },
    client_appointment_cancelled: { subject: "Appuntamento annullato • Beside", body: "<p>Il tuo appuntamento è stato annullato.</p>" },
    client_appointment_reminder: { subject: "Promemoria appuntamento • Beside", body: "<p>Ti ricordiamo l'appuntamento del {data} alle {ora}.</p>" },
    postwork_thanks: { subject: "Grazie per aver scelto Beside", body: "<p>Grazie {nome_cliente} per aver scelto {azienda}.</p>" },
    postwork_check_invite: { subject: "Controllo post-lavorazione", body: "<p>È disponibile il controllo post-lavorazione per il lavoro eseguito.</p>" },
  },
};
const NOTIFICATION_TEMPLATE_LABELS = {
  quote_accepted: "Preventivo accettato",
  appointment_reminder: "Promemoria appuntamento",
  support_reply: "Risposta assistenza",
  client_quote: "Invio preventivo al cliente",
  client_appointment_confirmed: "Conferma appuntamento",
  client_appointment_modified: "Modifica appuntamento",
  client_appointment_cancelled: "Annullamento appuntamento",
  client_appointment_reminder: "Promemoria al cliente",
  postwork_thanks: "Ringraziamento alla consegna",
  postwork_check_invite: "Invito al controllo post-lavorazione",
};
const WEEK_DAYS = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
const emptyWorkHours = () => WEEK_DAYS.map((_, day) => ({ day, enabled: false, start: "", end: "", break_start: "", break_end: "" }));
const timeOptions = () => ["", ...Array.from({ length: 48 }, (_, index) => {
  const minutes = index * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
})];
const TIME_OPTIONS = timeOptions();
const TimeSelect = ({ label, value, onChange }) => (
  <label className="min-w-0 space-y-1">
    <span className="block text-xs font-medium text-muted-foreground">{label}</span>
    <select aria-label={label} value={value || ""} onChange={(event) => onChange(event.target.value)} className="h-11 w-full min-w-0 rounded-xl border bg-background px-2 text-base">
      {TIME_OPTIONS.map((option) => <option key={option || "empty"} value={option}>{option || "--:--"}</option>)}
    </select>
  </label>
);

export const ProfilePage = () => {
  const { user, logout, checkAuth } = useAuth();
  const { preferences, update } = useUiPreferences();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [section, setSection] = useState(null);
  const [activitySubsection, setActivitySubsection] = useState("info");
  const [personal, setPersonal] = useState({ first_name: user?.first_name || "", last_name: "", picture: user?.picture || "" });
  const [securityPanel, setSecurityPanel] = useState(null);
  const [passwordChange, setPasswordChange] = useState({ current_password: "", new_password: "", confirm_password: "", code: "" });
  const [passwordChangeBusy, setPasswordChangeBusy] = useState(false);
  const [passkeyNameModal, setPasskeyNameModal] = useState(null);
  const [passkeyRevokeTarget, setPasskeyRevokeTarget] = useState(null);
  const [accountReason, setAccountReason] = useState("");
  const [accountReasonDetails, setAccountReasonDetails] = useState("");
  const [searchingCompany, setSearchingCompany] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [recoveryContact, setRecoveryContact] = useState(null);
  const [passkeyConfig, setPasskeyConfig] = useState({ enabled: false, supported: false });
  const [passkeys, setPasskeys] = useState([]);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
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
  const [supportFormOpen, setSupportFormOpen] = useState(false);
  const [notificationSettings, setNotificationSettings] = useState(NOTIFICATION_DEFAULTS);
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [notificationOpenTemplate, setNotificationOpenTemplate] = useState(null);
  const [notificationExpanded, setNotificationExpanded] = useState(null);
  const [notificationPreview, setNotificationPreview] = useState(null);
  const [collaborators, setCollaborators] = useState({ members: [], invitations: [], collaborator_limit: 0, plan: "essential" });
  const [collaboratorEmail, setCollaboratorEmail] = useState("");
  const [collaboratorRole, setCollaboratorRole] = useState("member");
  const [collaboratorBusy, setCollaboratorBusy] = useState(false);
  const [collaboratorFormOpen, setCollaboratorFormOpen] = useState(false);
  const [deletionForm, setDeletionForm] = useState({ reason: "", details: "", confirmation: "", code: "" });
  const [deletionBusy, setDeletionBusy] = useState(false);
  const [deletionStatus, setDeletionStatus] = useState(null);
  const [emailChange, setEmailChange] = useState({ status: "none", email: "", expires_at: null });
  const [emailChangeForm, setEmailChangeForm] = useState({ email: "", code: "" });
  const [emailChangeOpen, setEmailChangeOpen] = useState(false);
  const [emailChangeBusy, setEmailChangeBusy] = useState(false);
  const [workHours, setWorkHours] = useState(emptyWorkHours);
  const [savedWorkHours, setSavedWorkHours] = useState(emptyWorkHours);
  const [commonHours, setCommonHours] = useState({ start: "", end: "", break_start: "", break_end: "" });
  const [breakEnabled, setBreakEnabled] = useState(false);
  const [quickPreset, setQuickPreset] = useState("custom");
  const [savedQuickPreset, setSavedQuickPreset] = useState("custom");
  const [savedCommonHours, setSavedCommonHours] = useState({ start: "", end: "", break_start: "", break_end: "" });
  const [savedBreakEnabled, setSavedBreakEnabled] = useState(false);
  const [expandedWorkDays, setExpandedWorkDays] = useState({});
  const [workHoursConfigured, setWorkHoursConfigured] = useState(false);
  const totpTimers = useRef({});
  const totpSubmitted = useRef({});

  const scheduleTotpSubmit = (key, code, canSubmit, submit) => {
    if (totpTimers.current[key]) clearTimeout(totpTimers.current[key]);
    if (!/^\d{6}$/.test(code) || !canSubmit || totpSubmitted.current[key]) return;
    totpTimers.current[key] = setTimeout(() => {
      if (totpSubmitted.current[key]) return;
      totpSubmitted.current[key] = true;
      submit();
    }, 300);
  };

  const resetTotpSubmit = (key) => {
    if (totpTimers.current[key]) clearTimeout(totpTimers.current[key]);
    totpSubmitted.current[key] = false;
  };
  const [workHoursBusy, setWorkHoursBusy] = useState(false);
  const [workAreas, setWorkAreas] = useState([]);
  const [workAreaDrafts, setWorkAreaDrafts] = useState([]);
  const [workAreasBusy, setWorkAreasBusy] = useState(false);
  const [calendarExceptions, setCalendarExceptions] = useState([]);
  const [exceptionBusy, setExceptionBusy] = useState(false);
  const [editingExceptionId, setEditingExceptionId] = useState(null);
  const [exceptionFormOpen, setExceptionFormOpen] = useState(false);
  const [workAreaFormOpen, setWorkAreaFormOpen] = useState(false);
  const [exceptionForm, setExceptionForm] = useState({ kind: "closure", start_date: "", end_date: "", reason: "Ferie", notes: "", recurring: false, start: "", end: "", break_start: "", break_end: "" });
  
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
      setPersonal({ first_name: p.first_name || user?.first_name || "", last_name: p.last_name || "", picture: user?.picture || "" });
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

  const loadPasskeys = async () => {
    if (!browserSupportsWebAuthn()) return;
    try {
      const { data: status } = await axios.get(`${API}/auth/passkeys/status`);
      setPasskeyConfig({ enabled: Boolean(status.enabled), supported: true });
      if (status.enabled) {
        const { data } = await axios.get(`${API}/auth/passkeys`);
        setPasskeys(data.passkeys || []);
      }
    } catch {
      setPasskeyConfig({ enabled: false, supported: true });
    }
  };

  useEffect(() => {
    if (section === "security" && user?.user_id) loadPasskeys();
  }, [section, user?.user_id]);

  const registerPasskey = async () => {
    setPasskeyBusy(true);
    try {
      const { data } = await axios.post(`${API}/auth/passkeys/registration/options`);
      const { challenge_id: challengeId, ...optionsJSON } = data;
      const credential = await startRegistration({ optionsJSON });
      setPasskeyNameModal({ credential: { ...credential, challenge_id: challengeId }, name: "iPhone / Face ID" });
    } catch (error) {
      if (error?.name === "NotAllowedError" || error?.name === "AbortError") toast.info("Registrazione passkey annullata.");
      else toast.error(error.response?.data?.detail || "Impossibile registrare la passkey.");
    } finally {
      setPasskeyBusy(false);
    }
  };

  const completePasskeyRegistration = async () => {
    if (!passkeyNameModal?.name?.trim()) return;
    setPasskeyBusy(true);
    try {
      await axios.post(`${API}/auth/passkeys/registration/verify`, { credential: passkeyNameModal.credential, name: passkeyNameModal.name.trim() });
      setPasskeyNameModal(null);
      toast.success("Passkey registrata.");
      await loadPasskeys();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Impossibile registrare la passkey.");
    } finally { setPasskeyBusy(false); }
  };

  const renamePasskey = async (credentialId, currentName) => {
    const name = currentName || "Passkey";
    setPasskeyNameModal({ credentialId, name, rename: true });
  };

  const completePasskeyRename = async () => {
    if (!passkeyNameModal?.name?.trim() || !passkeyNameModal.credentialId) return;
    try {
      await axios.patch(`${API}/auth/passkeys/${encodeURIComponent(passkeyNameModal.credentialId)}`, { name: passkeyNameModal.name.trim() });
      setPasskeyNameModal(null);
      await loadPasskeys();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Impossibile rinominare la passkey.");
    }
  };

  const revokePasskey = async (credentialId) => {
    setPasskeyRevokeTarget(credentialId);
  };

  const confirmRevokePasskey = async () => {
    if (!passkeyRevokeTarget) return;
    setPasskeyBusy(true);
    try {
      await axios.delete(`${API}/auth/passkeys/${encodeURIComponent(passkeyRevokeTarget)}`);
      setPasskeyRevokeTarget(null);
      toast.success("Passkey revocata.");
      await loadPasskeys();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Impossibile revocare la passkey.");
    } finally {
      setPasskeyBusy(false);
    }
  };

  const handleProfilePhoto = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 300 * 1024) {
      toast.error("Usa un'immagine PNG, JPG o WebP di massimo 300 KB.");
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPersonal((current) => ({ ...current, picture: String(reader.result) }));
    reader.onerror = () => toast.error("Impossibile leggere la foto.");
    reader.readAsDataURL(file);
  };

  const changePassword = async (event, codeOverride = null) => {
    event?.preventDefault();
    const payload = { ...passwordChange, ...(codeOverride !== null ? { code: codeOverride } : {}) };
    const requiresTotp = Boolean(user?.totp_enabled);
    if (!payload.current_password || !payload.new_password || !payload.confirm_password || (requiresTotp && !/^\d{6}$/.test(payload.code))) {
      if (event) toast.error("Completa tutti i campi e inserisci un codice Authenticator valido.");
      return;
    }
    if (payload.new_password !== payload.confirm_password) {
      toast.error("Le nuove password non coincidono.");
      return;
    }
    totpSubmitted.current.password = true;
    setPasswordChangeBusy(true);
    try {
      await axios.post(`${API}/auth/password/change`, payload);
      setPasswordChange({ current_password: "", new_password: "", confirm_password: "", code: "" });
      resetTotpSubmit("password");
      toast.success("Password aggiornata.");
    } catch (error) {
      setPasswordChange((current) => ({ ...current, code: "" }));
      resetTotpSubmit("password");
      toast.error(error.response?.data?.detail || "Impossibile aggiornare la password.");
    } finally { setPasswordChangeBusy(false); }
  };

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
    if (section !== "notifications" || !user?.user_id) return;
    axios.get(`${API}/notifications/settings`).then(({ data }) => {
      setNotificationSettings({
        preferences: { ...NOTIFICATION_DEFAULTS.preferences, ...(data.preferences || {}) },
        templates: { ...NOTIFICATION_DEFAULTS.templates, ...(data.templates || {}) },
      });
    }).catch((error) => toast.error(error.response?.data?.detail || "Impossibile caricare le notifiche."));
  }, [section, user?.user_id]);

  const saveNotificationSettings = async () => {
    setNotificationBusy(true);
    try {
      const { data } = await axios.put(`${API}/notifications/settings`, notificationSettings);
      setNotificationSettings(data);
      toast.success("Preferenze e modelli salvati.");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Impossibile salvare le notifiche.");
    } finally {
      setNotificationBusy(false);
    }
  };

  useEffect(() => {
    if (section !== "calendar" || !user?.user_id) return;
    Promise.all([
      axios.get(`${API}/calendar/work-hours`),
      axios.get(`${API}/calendar/work-areas`),
      axios.get(`${API}/calendar/exceptions`),
    ]).then(([hoursResponse, areasResponse, exceptionsResponse]) => {
      const configuredDays = hoursResponse.data.days || [];
      const byDay = new Map(configuredDays.map((item) => [item.day, item]));
      const loadedHours = emptyWorkHours().map((item) => ({ ...item, ...(byDay.get(item.day) || {}) }));
      const firstOpen = loadedHours.find((item) => item.enabled && item.start && item.end);
      const loadedCommon = firstOpen ? { start: firstOpen.start, end: firstOpen.end, break_start: firstOpen.break_start || "", break_end: firstOpen.break_end || "" } : { start: "", end: "", break_start: "", break_end: "" };
      setWorkHours(loadedHours);
      setSavedWorkHours(loadedHours.map((item) => ({ ...item })));
      setCommonHours(loadedCommon);
      setBreakEnabled(Boolean(loadedCommon.break_start && loadedCommon.break_end));
      setSavedCommonHours(loadedCommon); setSavedBreakEnabled(Boolean(loadedCommon.break_start && loadedCommon.break_end));
      const enabledDays = loadedHours.filter((item) => item.enabled).map((item) => item.day).join(",");
      const preset = enabledDays === "0,1,2,3,4" ? "weekdays" : enabledDays === "0,1,2,3,4,5" ? "weekdays_saturday" : "custom";
      setQuickPreset(preset); setSavedQuickPreset(preset);
      setWorkHoursConfigured(Boolean(hoursResponse.data.configured));
      setWorkAreas(areasResponse.data || []);
      setWorkAreaDrafts((areasResponse.data || []).map((item) => ({ ...item })));
      setCalendarExceptions(exceptionsResponse.data || []);
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
    if (section === "activity" && user?.role === "owner") loadCollaborators();
  }, [section, user?.user_id, user?.role]);

  useEffect(() => {
    if (section !== "security" || !user?.user_id) return;
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

  const requestEmailChange = async (event, codeOverride = null) => {
    event?.preventDefault();
    const payload = { ...emailChangeForm, ...(codeOverride !== null ? { code: codeOverride } : {}) };
    if (!payload.email.trim() || !/^\d{6}$/.test(payload.code)) {
      toast.error("Inserisci il nuovo indirizzo e un codice Authenticator valido.");
      return;
    }
    totpSubmitted.current.email = true;
    setEmailChangeBusy(true);
    try {
      const response = await axios.post(`${API}/auth/email-change/request`, payload);
      setEmailChange({ status: "pending", email: response.data.email, expires_at: response.data.expires_at });
      setEmailChangeForm({ email: "", code: "" });
      resetTotpSubmit("email");
      setEmailChangeOpen(false);
      toast.success("Controlla la nuova email per confermare il cambio.");
    } catch (error) {
      setEmailChangeForm(current => ({ ...current, code: "" }));
      resetTotpSubmit("email");
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

  const handleContactInvite = async (codeOverride = null) => {
    const code = codeOverride ?? contactTotp;
    if (!contactEmail.trim() || !contactPassword || !/^\d{6}$/.test(code)) {
      toast.error("Inserisci email, password e un codice Authenticator valido.");
      return;
    }
    totpSubmitted.current.contact = true;
    setContactBusy(true);
    try {
      const response = await axios.post(`${API}/auth/recovery-contact/invite`, {
        email: contactEmail.trim(),
        password: contactPassword,
        code,
      });
      setRecoveryContact({ contact_email: contactEmail.trim(), status: response.data.status });
      setContactPassword("");
      setContactTotp("");
      resetTotpSubmit("contact");
      toast.success(response.data.message || "Invito inviato.");
    } catch (error) {
      // Keep the authenticated profile and invitation fields, but clear the
      // rejected one-time code so the next TOTP can be entered immediately.
      setContactTotp("");
      resetTotpSubmit("contact");
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
      const payload = section === "personal" ? { first_name: personal.first_name, last_name: personal.last_name, picture: personal.picture }
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
    const invalid = workHours.some((item) => item.enabled && (!item.start || !item.end || item.start >= item.end || (item.break_start && (!item.break_end || item.break_start >= item.break_end))));
    if (invalid) { toast.error("Completa inizio e fine per ogni giorno lavorativo."); return; }
    setWorkHoursBusy(true);
    try {
      const response = await axios.put(`${API}/calendar/work-hours`, { days: workHours });
      setWorkHours(response.data.days || workHours);
      setSavedWorkHours((response.data.days || workHours).map((item) => ({ ...item })));
      setSavedQuickPreset(quickPreset);
      setSavedCommonHours({ ...commonHours }); setSavedBreakEnabled(breakEnabled);
      setWorkHoursConfigured(true);
      toast.success("Orari lavorativi salvati");
    } catch (error) { toast.error(error.response?.data?.detail || "Impossibile salvare gli orari."); }
    finally { setWorkHoursBusy(false); }
  };

  const restoreWorkHours = () => { setWorkHours(savedWorkHours.map((item) => ({ ...item }))); setQuickPreset(savedQuickPreset); setCommonHours({ ...savedCommonHours }); setBreakEnabled(savedBreakEnabled); };
  const removeWorkHours = async () => {
    if (!window.confirm("Rimuovere tutta la configurazione degli orari? L'Agenda tornerà al comportamento attuale.")) return;
    setWorkHoursBusy(true);
    try {
      await axios.delete(`${API}/calendar/work-hours`);
      const empty = emptyWorkHours();
      setWorkHours(empty); setSavedWorkHours(empty); setWorkHoursConfigured(false); setQuickPreset("custom"); setSavedQuickPreset("custom"); setCommonHours({ start: "", end: "", break_start: "", break_end: "" }); setSavedCommonHours({ start: "", end: "", break_start: "", break_end: "" }); setBreakEnabled(false); setSavedBreakEnabled(false);
      setCommonHours({ start: "", end: "", break_start: "", break_end: "" }); setBreakEnabled(false);
      toast.success("Configurazione orari rimossa");
    } catch (error) { toast.error(error.response?.data?.detail || "Impossibile rimuovere la configurazione."); }
    finally { setWorkHoursBusy(false); }
  };
  const updateWorkDay = (day, changes) => { setQuickPreset("custom"); setWorkHours((current) => current.map((item) => item.day === day ? { ...item, ...changes } : item)); };
  const applyDaysPreset = (preset, days) => { setQuickPreset(preset); setWorkHours((current) => current.map((item) => ({ ...item, enabled: days.includes(item.day) }))); };
  const applyCommonHours = () => {
    if (!commonHours.start || !commonHours.end) { toast.error("Imposta apertura e chiusura prima di applicare l'orario comune."); return; }
    if (commonHours.start >= commonHours.end) { toast.error("L'apertura deve precedere la chiusura."); return; }
    if (breakEnabled && (!commonHours.break_start || !commonHours.break_end || commonHours.break_start >= commonHours.break_end || commonHours.break_start < commonHours.start || commonHours.break_end > commonHours.end)) {
      toast.error("La pausa deve essere interna all'orario comune."); return;
    }
    setWorkHours((current) => current.map((item) => item.enabled ? { ...item, start: commonHours.start, end: commonHours.end, break_start: breakEnabled ? commonHours.break_start : "", break_end: breakEnabled ? commonHours.break_end : "" } : item));
    toast.success("Orario comune applicato ai giorni selezionati");
  };
  const resetDayToCommon = (day) => updateWorkDay(day, { enabled: true, ...commonHours, break_start: breakEnabled ? commonHours.break_start : "", break_end: breakEnabled ? commonHours.break_end : "" });
  const saveException = async () => {
    if (!exceptionForm.start_date || !exceptionForm.end_date) { toast.error("Inserisci le date dell'eccezione."); return; }
    setExceptionBusy(true);
    try {
      const nextExceptions = editingExceptionId
        ? calendarExceptions.map((item) => item.exception_id === editingExceptionId ? { ...exceptionForm, exception_id: editingExceptionId } : item)
        : [...calendarExceptions, exceptionForm];
      const response = await axios.put(`${API}/calendar/exceptions`, { exceptions: nextExceptions });
      setCalendarExceptions(response.data || []); setEditingExceptionId(null); toast.success("Eccezione salvata");
    } catch (error) {
      if (error.response?.status === 409 && window.confirm(`${error.response.data.detail?.conflicts || 0} appuntamenti ricadono nella chiusura. Salvare comunque?`)) {
        const nextExceptions = editingExceptionId
          ? calendarExceptions.map((item) => item.exception_id === editingExceptionId ? { ...exceptionForm, exception_id: editingExceptionId } : item)
          : [...calendarExceptions, exceptionForm];
        const response = await axios.put(`${API}/calendar/exceptions`, { exceptions: nextExceptions, confirm_conflicts: true });
        setCalendarExceptions(response.data || []); setEditingExceptionId(null); toast.success("Chiusura salvata con eccezioni esistenti");
      } else toast.error(error.response?.data?.detail?.message || error.response?.data?.detail || "Impossibile salvare l'eccezione.");
    } finally { setExceptionBusy(false); }
  };
  const editException = (item) => { setExceptionForm({ kind: item.kind, start_date: item.start_date, end_date: item.end_date, reason: item.reason || "Altro", notes: item.notes || "", recurring: Boolean(item.recurring), start: item.start || "", end: item.end || "", break_start: item.break_start || "", break_end: item.break_end || "" }); setEditingExceptionId(item.exception_id); setExceptionFormOpen(true); };
  const deleteException = async (id) => {
    if (!window.confirm("Eliminare questa eccezione?")) return;
    setExceptionBusy(true);
    try { const response = await axios.delete(`${API}/calendar/exceptions/${id}`); setCalendarExceptions(response.data || []); toast.success("Eccezione eliminata"); }
    catch (error) { toast.error(error.response?.data?.detail || "Impossibile eliminare l'eccezione."); }
    finally { setExceptionBusy(false); }
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
    { key: "notifications", title: "Notifiche e comunicazioni", subtitle: "Email, promemoria e modelli", icon: Bell },
    { key: "appearance", title: "Aspetto e accessibilità", subtitle: "Tema, icone e dimensione testi", icon: Monitor },
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

      {section === "personal" && <Card><CardContent className="space-y-5 pt-5">
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-muted/30 p-4 sm:flex-row">
          <Avatar className="h-28 w-28"><AvatarImage src={personal.picture || user?.picture} alt="Foto profilo" /><AvatarFallback className="bg-primary/10 text-2xl text-primary">{getInitials(`${personal.first_name} ${personal.last_name}`.trim() || user?.name)}</AvatarFallback></Avatar>
          <div className="flex flex-wrap justify-center gap-2 sm:justify-start"><label className="inline-flex min-h-11 cursor-pointer items-center rounded-full border px-4 py-2 text-sm"><input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={handleProfilePhoto} />Sostituisci foto</label><Button type="button" variant="outline" onClick={() => setPersonal((current) => ({ ...current, picture: "" }))} disabled={!personal.picture && !user?.picture}>Rimuovi foto</Button></div>
        </div>
        <p className="text-xs text-muted-foreground">PNG, JPG o WebP, massimo 300 KB. La foto è personale e non modifica il logo dell'attività.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><div className="space-y-1"><Label>Nome</Label><Input value={personal.first_name} onChange={e => setPersonal(p => ({...p, first_name: e.target.value}))} /></div><div className="space-y-1"><Label>Cognome</Label><Input value={personal.last_name} onChange={e => setPersonal(p => ({...p, last_name: e.target.value}))} /></div></div>
        <div className="space-y-1"><Label>Ruolo aziendale</Label><Input value={user?.role || ""} disabled /></div>
        <div className="space-y-1"><Label>Attività associata</Label><Input value={user?.business_name || ""} disabled /></div>
        <div className="space-y-2"><Label>Email di accesso</Label><div className="flex flex-wrap gap-2"><Input className="min-w-0 flex-1" value={user?.email || ""} disabled /><Button type="button" variant="outline" onClick={() => { setSection("security"); setSecurityPanel("email"); }}>Gestisci email di accesso</Button></div></div>
        <Button onClick={handleSave} disabled={saving} className="w-full" data-testid="profile-save-btn">Salva modifiche</Button>
      </CardContent></Card>}

      {section === "activity" && <>
        <WorkActivitiesSettings />
        <div className="rounded-full border border-border/70 bg-background/80 p-1 shadow-sm backdrop-blur-sm"><div className="grid grid-cols-4 gap-1"><button type="button" onClick={() => setActivitySubsection("info")} className={`min-h-11 min-w-0 rounded-full px-1 text-xs font-medium transition-colors sm:px-2 sm:text-sm ${activitySubsection === "info" ? "bg-secondary text-secondary-foreground" : "text-primary hover:bg-muted/60"}`}>Attività</button><button type="button" onClick={() => setActivitySubsection("contacts")} className={`min-h-11 min-w-0 rounded-full px-1 text-xs font-medium transition-colors sm:px-2 sm:text-sm ${activitySubsection === "contacts" ? "bg-secondary text-secondary-foreground" : "text-primary hover:bg-muted/60"}`}>Recapiti</button><button type="button" onClick={() => setActivitySubsection("fiscal")} className={`min-h-11 min-w-0 rounded-full px-1 text-xs font-medium transition-colors sm:px-2 sm:text-sm ${activitySubsection === "fiscal" ? "bg-secondary text-secondary-foreground" : "text-primary hover:bg-muted/60"}`}>Fiscali</button><button type="button" onClick={() => setActivitySubsection("quotes")} className={`min-h-11 min-w-0 rounded-full px-1 text-xs font-medium transition-colors sm:px-2 sm:text-sm ${activitySubsection === "quotes" ? "bg-secondary text-secondary-foreground" : "text-primary hover:bg-muted/60"}`}>Preventivi</button></div></div>
        {user?.role === "owner" && <Card><CardHeader><div className="flex items-center justify-between gap-3"><CardTitle className="text-lg flex items-center gap-2"><Users className="h-5 w-5"/>Gestione collaboratori</CardTitle><AddCircleButton label="Invita collaboratore" onClick={() => setCollaboratorFormOpen((current) => !current)} /></div></CardHeader><CardContent className="space-y-4"><p className="text-sm text-muted-foreground">Gli utenti Beside sono distinti dal numero di dipendenti. Il piano {collaborators.plan} consente {collaborators.collaborator_limit} collaboratori oltre al titolare.</p>{collaboratorFormOpen && <form onSubmit={inviteCollaborator} className="grid gap-3 rounded-xl border border-secondary/30 p-3 sm:grid-cols-[1fr_auto_auto]"><Input type="email" required placeholder="Email del collaboratore" value={collaboratorEmail} onChange={e => setCollaboratorEmail(e.target.value)} /><select className="rounded-md border bg-background px-3 py-2 text-sm" value={collaboratorRole} onChange={e => setCollaboratorRole(e.target.value)} aria-label="Ruolo collaboratore"><option value="admin">Amministratore aziendale</option><option value="member">Collaboratore</option><option value="viewer">Sola lettura</option></select><Button type="submit" disabled={collaboratorBusy}>Invia invito</Button></form>}{collaborators.invitations?.length > 0 && <div className="space-y-2"><p className="text-sm font-medium">Inviti in attesa</p>{collaborators.invitations.map(invite => <div key={invite.invitation_id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"><span className="min-w-0 flex-1 truncate">{invite.email} · {invite.role}</span><div className="flex gap-1"><Button type="button" variant="ghost" size="sm" disabled={collaboratorBusy} onClick={() => resendCollaboratorInvite(invite.invitation_id)}>Reinvia invito</Button><Button type="button" variant="ghost" size="sm" disabled={collaboratorBusy} onClick={() => cancelCollaboratorInvite(invite.invitation_id)}>Annulla</Button></div></div>)}</div>}{collaborators.members?.filter(member => member.user_id !== user?.user_id).length > 0 && <div className="space-y-2"><p className="text-sm font-medium">Utenti attivi</p>{collaborators.members.filter(member => member.user_id !== user?.user_id).map(member => <div key={member.user_id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm"><span className="min-w-0 truncate">{member.email}</span><select className="rounded-md border bg-background px-2 py-1 text-xs" value={member.role} disabled={collaboratorBusy} onChange={e => changeCollaboratorRole(member.user_id, e.target.value)}><option value="admin">Amministratore</option><option value="member">Collaboratore</option><option value="viewer">Sola lettura</option></select><Button type="button" variant="ghost" size="sm" className="text-destructive" disabled={collaboratorBusy} onClick={() => revokeCollaborator(member.user_id)}>Revoca</Button></div>)}</div>}{!collaborators.invitations?.length && !collaborators.members?.some(member => member.user_id !== user?.user_id) && <p className="text-sm text-muted-foreground">Nessun collaboratore collegato.</p>}</CardContent></Card>}
        <div className={activitySubsection === "info" ? "space-y-4" : "hidden"}>
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
              </Card><Button onClick={handleSave} disabled={saving} className="w-full" data-testid="profile-save-btn">Salva informazioni attività</Button></div>
        <div className={activitySubsection === "contacts" ? "space-y-4" : "hidden"}><Card><CardHeader><CardTitle className="text-lg">Recapiti pubblici</CardTitle></CardHeader><CardContent className="space-y-4">
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
        <Button onClick={handleSave} disabled={saving} className="w-full" data-testid="profile-save-btn">Salva recapiti pubblici</Button></div>

      <div className={activitySubsection === "fiscal" ? "space-y-4" : "hidden"}>
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
        <Button onClick={handleSave} disabled={saving} className="w-full" data-testid="profile-save-btn">Salva dati fiscali</Button></div>

      <div className={activitySubsection === "quotes" ? "space-y-4" : "hidden"}>
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
      </div></>}

      {section === "calendar" && <div className="space-y-4">
        <Card><CardHeader><CardTitle className="text-lg">Orari e giorni lavorativi</CardTitle></CardHeader><CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Se non configuri gli orari, l'Agenda mantiene il comportamento attuale. Gli appuntamenti fuori orario restano consentiti.</p>
          <div className="grid grid-cols-3 gap-2"><Button type="button" variant="outline" className={`h-auto min-h-11 whitespace-normal px-2 text-xs ${quickPreset === "weekdays" ? "border-secondary bg-secondary text-secondary-foreground hover:bg-secondary/90" : ""}`} onClick={() => applyDaysPreset("weekdays", [0, 1, 2, 3, 4])}>Lun–Ven</Button><Button type="button" variant="outline" className={`h-auto min-h-11 whitespace-normal px-2 text-xs ${quickPreset === "weekdays_saturday" ? "border-secondary bg-secondary text-secondary-foreground hover:bg-secondary/90" : ""}`} onClick={() => applyDaysPreset("weekdays_saturday", [0, 1, 2, 3, 4, 5])}>Lun–Sab</Button><Button type="button" variant="outline" className={`h-auto min-h-11 whitespace-normal px-2 text-xs ${quickPreset === "custom" ? "border-secondary bg-secondary text-secondary-foreground hover:bg-secondary/90" : ""}`} onClick={() => { setQuickPreset("custom"); setExpandedWorkDays((current) => ({ ...current, 0: true })); }}>Personalizza</Button></div>
          <div className="grid grid-cols-7 gap-1.5">{workHours.map((item) => <button key={item.day} type="button" onClick={() => updateWorkDay(item.day, { enabled: !item.enabled })} className={`min-w-0 rounded-xl border px-1 py-2 text-center text-xs font-medium ${item.enabled ? "border-secondary bg-secondary text-secondary-foreground hover:bg-secondary/90" : "bg-background text-primary"}`} aria-pressed={item.enabled}>{WEEK_DAYS[item.day].slice(0, 2)}</button>)}</div>
          <div className="rounded-xl border bg-muted/20 p-3 space-y-3"><div><p className="font-medium">Fascia 1 — obbligatoria</p><p className="text-xs text-muted-foreground">Orario continuato per i giorni selezionati.</p></div><div className="grid grid-cols-2 gap-3"><TimeSelect label="Apertura" value={commonHours.start} onChange={(value) => setCommonHours((current) => ({ ...current, start: value }))} /><TimeSelect label="Chiusura" value={commonHours.end} onChange={(value) => setCommonHours((current) => ({ ...current, end: value }))} /></div><Button type="button" variant="outline" className="w-full" onClick={applyCommonHours}>Applica Fascia 1 ai selezionati</Button>{!breakEnabled ? <Button type="button" variant="ghost" className="w-full" onClick={() => setBreakEnabled(true)}>+ Aggiungi fascia oraria</Button> : <div className="space-y-2 rounded-lg border border-dashed p-3"><div className="flex items-center justify-between"><p className="text-sm font-medium">Fascia 2 — facoltativa</p><Button type="button" variant="ghost" size="icon" aria-label="Elimina fascia 2" onClick={() => { setBreakEnabled(false); setCommonHours((current) => ({ ...current, break_start: "", break_end: "" })); }}><Trash2 className="h-4 w-4" /></Button></div><div className="grid grid-cols-2 gap-3"><TimeSelect label="Riapertura" value={commonHours.break_start} onChange={(value) => setCommonHours((current) => ({ ...current, break_start: value }))} /><TimeSelect label="Chiusura" value={commonHours.break_end} onChange={(value) => setCommonHours((current) => ({ ...current, break_end: value }))} /></div><Button type="button" variant="outline" className="w-full" onClick={applyCommonHours}>Applica Fascia 2 ai selezionati</Button></div>}</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3"><Button type="button" onClick={saveWorkHours} disabled={workHoursBusy}>{workHoursBusy ? "Salvataggio..." : "Salva orari"}</Button><Button type="button" variant="outline" onClick={restoreWorkHours} disabled={workHoursBusy}>Ripristina valori salvati</Button><Button type="button" variant="outline" className="text-destructive" onClick={removeWorkHours} disabled={workHoursBusy || !workHoursConfigured}>Cancella orari</Button></div>
          <div className="space-y-2"><p className="text-sm font-medium">Personalizza singoli giorni</p>{workHours.map((item) => <div key={item.day} className="rounded-xl border p-3"><div className="flex items-center justify-between gap-2"><button type="button" className="min-h-11 flex-1 text-left font-medium" onClick={() => setExpandedWorkDays((current) => ({ ...current, [item.day]: !current[item.day] }))}>{WEEK_DAYS[item.day]}</button><span className="text-xs text-muted-foreground">{item.enabled ? "Aperto" : "Chiuso"}</span><Checkbox className="data-[state=checked]:border-secondary data-[state=checked]:bg-secondary data-[state=checked]:text-secondary-foreground" checked={item.enabled} onCheckedChange={(value) => updateWorkDay(item.day, { enabled: value === true })} aria-label={`${WEEK_DAYS[item.day]} aperto`} /></div>{expandedWorkDays[item.day] && item.enabled && <div className="mt-2 space-y-3"><div className="grid grid-cols-2 gap-3"><TimeSelect label="Apertura" value={item.start} onChange={(value) => updateWorkDay(item.day, { start: value })} /><TimeSelect label="Chiusura" value={item.end} onChange={(value) => updateWorkDay(item.day, { end: value })} /></div><div className="grid grid-cols-2 gap-3"><TimeSelect label="Inizio pausa" value={item.break_start} onChange={(value) => updateWorkDay(item.day, { break_start: value })} /><TimeSelect label="Fine pausa" value={item.break_end} onChange={(value) => updateWorkDay(item.day, { break_end: value })} /></div><Button type="button" variant="ghost" size="sm" onClick={() => resetDayToCommon(item.day)}>Rimuovi eccezione</Button></div>}</div>)}</div>
          {!workHoursConfigured && <p className="text-xs text-muted-foreground">Nessuna configurazione salvata.</p>}
        </CardContent></Card>
        <Card><CardHeader><div className="flex items-center justify-between gap-3"><CardTitle className="text-lg">Aperture e chiusure straordinarie</CardTitle><AddCircleButton label="Nuova apertura o chiusura straordinaria" onClick={() => { setEditingExceptionId(null); setExceptionFormOpen((current) => !current); }} /></div></CardHeader><CardContent className="space-y-3">
          {exceptionFormOpen && <>
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2"><Button type="button" variant="outline" className={exceptionForm.kind === "closure" ? "border-secondary bg-secondary text-secondary-foreground hover:bg-secondary/90" : "text-primary"} onClick={() => setExceptionForm((current) => ({ ...current, kind: "closure", reason: "Ferie" }))}>Chiusura straordinaria</Button><Button type="button" variant="outline" className={exceptionForm.kind === "special_opening" ? "border-secondary bg-secondary text-secondary-foreground hover:bg-secondary/90" : "text-primary"} onClick={() => setExceptionForm((current) => ({ ...current, kind: "special_opening", reason: "Lavorazione straordinaria", end_date: current.start_date }))}>Apertura straordinaria</Button></div>
          <div className="grid min-w-0 grid-cols-1 gap-3 min-[420px]:grid-cols-2"><label className="min-w-0 space-y-1 text-xs font-medium">{exceptionForm.kind === "closure" ? "Dal" : "Data dell'apertura"}<input type="date" className="mt-1 h-11 w-full min-w-0 max-w-full rounded-xl border px-2 text-base" value={exceptionForm.start_date} onChange={(event) => setExceptionForm((current) => ({ ...current, start_date: event.target.value, ...(current.kind === "special_opening" ? { end_date: event.target.value } : {}) }))} /></label>{exceptionForm.kind === "closure" && <label className="min-w-0 space-y-1 text-xs font-medium">Al<input type="date" className="mt-1 h-11 w-full min-w-0 max-w-full rounded-xl border px-2 text-base" value={exceptionForm.end_date} min={exceptionForm.start_date || undefined} onChange={(event) => setExceptionForm((current) => ({ ...current, end_date: event.target.value }))} /></label>}</div>
          <select className="h-11 w-full rounded-xl border px-2" value={exceptionForm.reason} onChange={(event) => setExceptionForm((current) => ({ ...current, reason: event.target.value }))}>{(exceptionForm.kind === "closure" ? ["Ferie", "Festività", "Manutenzione", "Motivi personali", "Altro"] : ["Lavorazione straordinaria", "Apertura festiva", "Evento o promozione", "Richiesta particolare di un cliente", "Recupero giornata lavorativa", "Altro"]).map((item) => <option key={item}>{item}</option>)}</select>
          {exceptionForm.kind === "special_opening" && <div className="grid grid-cols-2 gap-3"><TimeSelect label="Apertura" value={exceptionForm.start} onChange={(value) => setExceptionForm((current) => ({ ...current, start: value }))} /><TimeSelect label="Chiusura" value={exceptionForm.end} onChange={(value) => setExceptionForm((current) => ({ ...current, end: value }))} /></div>}
          <Textarea placeholder="Note facoltative" value={exceptionForm.notes} onChange={(event) => setExceptionForm((current) => ({ ...current, notes: event.target.value }))} rows={2} />
          {exceptionForm.kind === "closure" && <label className="flex min-h-11 items-center gap-2 text-sm"><Checkbox checked={exceptionForm.recurring} onCheckedChange={(value) => setExceptionForm((current) => ({ ...current, recurring: value === true }))} />Ripeti ogni anno</label>}
          <Button type="button" className="w-full" onClick={saveException} disabled={exceptionBusy}>{exceptionBusy ? "Salvataggio..." : editingExceptionId ? "Salva modifica" : "Salva eccezione"}</Button></>}
          <div className="space-y-2">{calendarExceptions.length === 0 ? <p className="text-xs text-muted-foreground">Nessuna eccezione configurata.</p> : calendarExceptions.slice().sort((a, b) => a.start_date.localeCompare(b.start_date)).map((item) => <div key={item.exception_id} className="flex items-center justify-between gap-2 rounded-xl border p-3 text-sm"><div><p className="font-medium">{item.kind === "closure" ? "Chiusura straordinaria" : "Apertura straordinaria"} · {item.start_date}{item.end_date !== item.start_date ? ` → ${item.end_date}` : ""}</p><p className="text-xs text-muted-foreground">{item.reason}{item.recurring ? " · annuale" : ""}{item.start ? ` · ${item.start}–${item.end}` : ""}</p></div><div className="flex shrink-0 gap-1"><Button type="button" variant="ghost" size="sm" onClick={() => editException(item)} disabled={exceptionBusy}>Modifica</Button><Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => deleteException(item.exception_id)} disabled={exceptionBusy}>Elimina</Button></div></div>)}</div>
        </CardContent></Card>
        <Card><CardHeader><div className="flex items-center justify-between gap-3"><CardTitle className="text-lg">Aree di lavoro</CardTitle><AddCircleButton label="Aggiungi area di lavoro" onClick={() => { setWorkAreaDrafts((current) => [...current, { area_id: null, name: "" }]); setWorkAreaFormOpen(true); }} disabled={workAreaDrafts.length >= 12} /></div></CardHeader><CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Le stesse aree vengono utilizzate dagli appuntamenti. La rimozione è bloccata se ci sono appuntamenti futuri.</p>
          {workAreaDrafts.filter((area) => area.area_id).map((area, index) => <div key={area.area_id || index} className="flex items-center gap-2"><Input value={area.name} maxLength={80} onChange={(event) => setWorkAreaDrafts((current) => current.map((item) => item.area_id === area.area_id ? { ...item, name: event.target.value } : item))} /><Button type="button" variant="outline" size="icon" aria-label={`Rimuovi ${area.name || "area"}`} disabled={workAreaDrafts.length === 1} onClick={() => setWorkAreaDrafts((current) => current.filter((item) => item.area_id !== area.area_id))}><Trash2 className="h-4 w-4" /></Button></div>)}
          {workAreaFormOpen && <div className="rounded-xl border border-secondary/30 p-3"><p className="mb-2 text-sm font-medium">Nuova area</p><div className="flex items-center gap-2"><Input autoFocus placeholder="Nome area" value={workAreaDrafts[workAreaDrafts.length - 1]?.name || ""} maxLength={80} onChange={(event) => setWorkAreaDrafts((current) => current.map((item, itemIndex) => itemIndex === current.length - 1 ? { ...item, name: event.target.value } : item))} /><Button type="button" variant="ghost" onClick={() => { setWorkAreaDrafts((current) => current.slice(0, -1)); setWorkAreaFormOpen(false); }}>Annulla</Button></div></div>}
          <Button type="button" className="ml-2" onClick={saveProfileWorkAreas} disabled={workAreasBusy}>{workAreasBusy ? "Salvataggio..." : "Salva aree"}</Button>
        </CardContent></Card>
        <Button variant="outline" onClick={() => navigate("/calendar")}><CalendarDays className="mr-2 h-4 w-4"/>Apri Pianificazione</Button>
      </div>}

      {section === "notifications" && <div className="space-y-4">
        <Card><CardHeader><CardTitle className="text-lg">Le mie notifiche</CardTitle></CardHeader><CardContent className="space-y-2">
          {[["installer_quote_accepted", "Preventivo accettato"], ["installer_appointment_reminder", "Promemoria appuntamento"], ["installer_support_reply", "Risposta a ticket di assistenza"]].map(([key, label]) => <label key={key} className="flex min-h-12 items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm"><span>{label}</span><Checkbox checked={Boolean(notificationSettings.preferences[key])} onCheckedChange={(value) => setNotificationSettings((current) => ({ ...current, preferences: { ...current.preferences, [key]: value === true } }))} className="data-[state=checked]:border-secondary data-[state=checked]:bg-secondary data-[state=checked]:text-secondary-foreground" /></label>)}
          <p className="pt-2 text-xs text-muted-foreground">Gli avvisi operativi restano attivi per gli account esistenti finché non li disattivi.</p>
        </CardContent></Card>
        <Card><CardHeader><CardTitle className="text-lg">Comunicazioni ai clienti</CardTitle></CardHeader><CardContent className="space-y-2">
          {[["client_quote", "Invio del preventivo"], ["client_appointment_confirmed", "Conferma appuntamento"], ["client_appointment_modified", "Modifica appuntamento"], ["client_appointment_cancelled", "Annullamento appuntamento"], ["client_appointment_reminder", "Promemoria appuntamento"]].map(([key, label]) => <label key={key} className="flex min-h-12 items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm"><span>{label}</span><Checkbox checked={Boolean(notificationSettings.preferences[key])} onCheckedChange={(value) => setNotificationSettings((current) => ({ ...current, preferences: { ...current.preferences, [key]: value === true } }))} className="data-[state=checked]:border-secondary data-[state=checked]:bg-secondary data-[state=checked]:text-secondary-foreground" /></label>)}
          <label className="block pt-2 text-sm font-medium">Anticipo promemoria cliente<select className="mt-1 h-11 w-full rounded-xl border bg-background px-3" value={notificationSettings.preferences.client_reminder_lead} onChange={(event) => setNotificationSettings((current) => ({ ...current, preferences: { ...current.preferences, client_reminder_lead: event.target.value } }))}><option value="24h">24 ore</option><option value="48h">48 ore</option><option value="custom">Personalizzato</option></select></label>
          {notificationSettings.preferences.client_reminder_lead === "custom" && <label className="block text-sm font-medium">Minuti di anticipo<input type="number" min="15" max="10080" className="mt-1 h-11 w-full rounded-xl border bg-background px-3" value={notificationSettings.preferences.client_reminder_custom_minutes || ""} onChange={(event) => setNotificationSettings((current) => ({ ...current, preferences: { ...current.preferences, client_reminder_custom_minutes: event.target.value ? Number(event.target.value) : null } }))} /></label>}
          {["postwork_thanks", "postwork_check_invite"].map((key) => <div key={key} className="rounded-xl border border-secondary/30 p-3"><label className="flex min-h-11 items-center justify-between gap-3 text-sm"><span>{NOTIFICATION_TEMPLATE_LABELS[key]}</span><Checkbox checked={Boolean(notificationSettings.preferences[key])} onCheckedChange={(value) => { const enabled = value === true; setNotificationSettings((current) => ({ ...current, preferences: { ...current.preferences, [key]: enabled } })); setNotificationExpanded(enabled ? key : null); }} className="data-[state=checked]:border-secondary data-[state=checked]:bg-secondary data-[state=checked]:text-secondary-foreground" /></label>{notificationSettings.preferences[key] && notificationExpanded !== key && <Button type="button" variant="link" size="sm" className="mt-1 h-auto px-0" onClick={() => setNotificationExpanded(key)}>Modifica messaggio</Button>}{notificationSettings.preferences[key] && notificationExpanded === key && <div className="mt-3 space-y-2 border-t pt-3"><Input aria-label={`Oggetto ${key}`} value={notificationSettings.templates[key]?.subject || ""} onChange={(event) => setNotificationSettings((current) => ({ ...current, templates: { ...current.templates, [key]: { ...current.templates[key], subject: event.target.value } } }))} /><Textarea aria-label={`Testo ${key}`} rows={4} value={notificationSettings.templates[key]?.body || ""} onChange={(event) => setNotificationSettings((current) => ({ ...current, templates: { ...current.templates, [key]: { ...current.templates[key], body: event.target.value } } }))} /><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" onClick={() => setNotificationPreview(notificationSettings.templates[key])}>Anteprima</Button><Button type="button" variant="ghost" size="sm" onClick={() => setNotificationSettings((current) => ({ ...current, templates: { ...current.templates, [key]: { ...NOTIFICATION_DEFAULTS.templates[key] } } }))}>Ripristina modello originale</Button></div>{key === "postwork_check_invite" && <label className="block pt-1 text-sm font-medium">Anticipo invito<select className="mt-1 h-11 w-full rounded-xl border bg-background px-3" value={notificationSettings.preferences.postwork_invite_lead_days ?? 3} onChange={(event) => setNotificationSettings((current) => ({ ...current, preferences: { ...current.preferences, postwork_invite_lead_days: Number(event.target.value) } }))}><option value="0">Alla scadenza</option><option value="1">1 giorno prima</option><option value="3">3 giorni prima</option><option value="7">7 giorni prima</option></select></label>}</div>}</div>)}
          <p className="pt-2 text-xs text-muted-foreground">I nuovi invii automatici ai clienti sono disattivati finché non li abiliti. Gli invii manuali restano disponibili.</p>
        </CardContent></Card>
        <Card><CardHeader><CardTitle className="text-lg">Modelli email</CardTitle></CardHeader><CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">Variabili disponibili: {'{nome_cliente}'} {'{azienda}'} {'{tipo_lavoro}'} {'{data}'} {'{ora}'} {'{indirizzo}'} {'{telefono}'} {'{link_preventivo}'} {'{link_assistenza}'}</p>
          {Object.entries(notificationSettings.templates).filter(([key]) => !["postwork_thanks", "postwork_check_invite"].includes(key)).map(([key, template]) => <div key={key} className="rounded-xl border p-3"><button type="button" className="flex min-h-11 w-full items-center justify-between text-left font-medium" onClick={() => setNotificationOpenTemplate((current) => current === key ? null : key)}><span>{NOTIFICATION_TEMPLATE_LABELS[key] || key}</span><span className="text-xs text-muted-foreground">{notificationOpenTemplate === key ? "Chiudi" : "Modifica"}</span></button>{notificationOpenTemplate === key && <div className="mt-2 space-y-2"><Input aria-label={`Oggetto ${key}`} value={template.subject} onChange={(event) => setNotificationSettings((current) => ({ ...current, templates: { ...current.templates, [key]: { ...current.templates[key], subject: event.target.value } } }))} /><Textarea aria-label={`Testo ${key}`} rows={4} value={template.body} onChange={(event) => setNotificationSettings((current) => ({ ...current, templates: { ...current.templates, [key]: { ...current.templates[key], body: event.target.value } } }))} /><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" onClick={() => setNotificationPreview(template)}>Anteprima</Button><Button type="button" variant="ghost" size="sm" onClick={() => setNotificationSettings((current) => ({ ...current, templates: { ...current.templates, [key]: { ...NOTIFICATION_DEFAULTS.templates[key] } } }))}>Ripristina modello originale</Button></div></div>}</div>)}
          {notificationPreview && <div className="rounded-xl bg-muted/40 p-3 text-sm"><p className="font-medium">Anteprima: {notificationPreview.subject}</p><div className="mt-2 whitespace-pre-wrap text-muted-foreground">{notificationPreview.body}</div></div>}
          <Button type="button" className="w-full" onClick={saveNotificationSettings} disabled={notificationBusy}>{notificationBusy ? "Salvataggio..." : "Salva modifiche"}</Button>
        </CardContent></Card>
      </div>}

      {section === "appearance" && <Card><CardContent className="space-y-6 pt-5">
        <div>
          <h2 className="font-semibold">Tema</h2>
          <p className="mt-1 text-sm text-muted-foreground">Scegli come visualizzare Beside su questo dispositivo.</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[['light', 'Chiaro'], ['dark', 'Scuro'], ['system', 'Segui il sistema']].map(([value, label]) => (
              <button key={value} type="button" onClick={() => update("theme", value)} className={`min-h-16 rounded-xl border px-2 py-2 text-sm ${preferences.theme === value ? "border-secondary bg-secondary text-secondary-foreground" : "border-border bg-card text-primary"}`} aria-pressed={preferences.theme === value}>
                <span className={`mx-auto mb-1 block h-5 w-8 rounded-md border ${value === "dark" ? "bg-slate-800" : value === "system" ? "bg-gradient-to-r from-white to-slate-700" : "bg-white"}`} />{label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <h2 className="font-semibold">Navigazione</h2>
          <p className="mt-1 text-sm text-muted-foreground">Scegli se mostrare i nomi nella barra inferiore.</p>
          <label className="mt-3 flex min-h-12 items-center justify-between rounded-xl border px-3 py-2 text-sm"><span>Mostra nomi delle icone</span><input type="checkbox" checked={preferences.mobileNavLabels} onChange={(event) => update("mobileNavLabels", event.target.checked)} className="h-5 w-5 accent-sky-500" /></label>
        </div>
        <div>
          <h2 className="font-semibold">Dimensione dei testi</h2>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[['normal', 'Normale'], ['large', 'Grande'], ['xlarge', 'Molto grande']].map(([value, label]) => (
              <button key={value} type="button" onClick={() => update("textScale", value)} className={`min-h-12 rounded-xl border px-2 text-sm ${preferences.textScale === value ? "border-secondary bg-secondary text-secondary-foreground" : "border-border bg-card text-primary"}`} aria-pressed={preferences.textScale === value}>{label}</button>
            ))}
          </div>
        </div>
      </CardContent></Card>}

      {section === "security" && <div className="space-y-3">
        <Card><CardHeader><button type="button" className="flex min-h-12 w-full items-center justify-between text-left" onClick={() => setSecurityPanel(securityPanel === "email" ? null : "email")}><span className="flex items-center gap-2 font-semibold"><Mail className="h-5 w-5 text-secondary"/>Email di accesso</span><span className="text-xs text-muted-foreground">{securityPanel === "email" ? "Chiudi" : "Gestisci"}</span></button></CardHeader>{securityPanel === "email" && <CardContent className="space-y-3"><p className="text-sm text-muted-foreground">Indirizzo attuale: {user?.email || "—"}</p>{emailChange.status === "pending" && <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm"><p>Verifica richiesta in attesa per {emailChange.email}.</p><Button type="button" variant="link" className="h-auto px-0" disabled={emailChangeBusy} onClick={cancelEmailChange}>Annulla richiesta</Button></div>}<form onSubmit={requestEmailChange} className="space-y-2"><Label htmlFor="security-new-email">Nuovo indirizzo email</Label><Input id="security-new-email" type="email" required value={emailChangeForm.email} onChange={e => setEmailChangeForm(f => ({ ...f, email: e.target.value }))}/><Label htmlFor="security-email-code">Codice Authenticator</Label><Input id="security-email-code" inputMode="numeric" maxLength={6} required value={emailChangeForm.code} onChange={e => { const next = e.target.value.replace(/\D/g, "").slice(0, 6); setEmailChangeForm(f => ({ ...f, code: next })); totpSubmitted.current.email = false; scheduleTotpSubmit("email", next, Boolean(emailChangeForm.email.trim()) && !emailChangeBusy, () => requestEmailChange(null, next)); }} autoComplete="one-time-code" disabled={emailChangeBusy}/>{emailChangeBusy && <p className="text-sm text-muted-foreground">Verifica in corso...</p>}<Button type="submit" className="w-full" disabled={emailChangeBusy}>Invia verifica</Button></form></CardContent>}</Card>
        <Card><CardHeader><button type="button" className="flex min-h-12 w-full items-center justify-between text-left" onClick={() => setSecurityPanel(securityPanel === "password" ? null : "password")}><span className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-5 w-5 text-secondary"/>Password</span><span className="text-xs text-muted-foreground">{securityPanel === "password" ? "Chiudi" : "Cambia"}</span></button></CardHeader>{securityPanel === "password" && <CardContent><form onSubmit={changePassword} className="space-y-3"><Input type="password" required placeholder="Password attuale" value={passwordChange.current_password} onChange={e => setPasswordChange(p => ({ ...p, current_password: e.target.value }))}/><Input type="password" required minLength={10} placeholder="Nuova password (minimo 10 caratteri)" value={passwordChange.new_password} onChange={e => setPasswordChange(p => ({ ...p, new_password: e.target.value }))}/><Input type="password" required minLength={10} placeholder="Conferma nuova password" value={passwordChange.confirm_password} onChange={e => setPasswordChange(p => ({ ...p, confirm_password: e.target.value }))}/>{user?.totp_enabled && <Input inputMode="numeric" required maxLength={6} placeholder="Codice Authenticator" value={passwordChange.code} onChange={e => { const next = e.target.value.replace(/\D/g, "").slice(0, 6); setPasswordChange(p => ({ ...p, code: next })); totpSubmitted.current.password = false; scheduleTotpSubmit("password", next, Boolean(passwordChange.current_password && passwordChange.new_password && passwordChange.confirm_password && passwordChange.new_password === passwordChange.confirm_password) && !passwordChangeBusy, () => changePassword(null, next)); }} autoComplete="one-time-code" disabled={passwordChangeBusy}/>} {passwordChangeBusy && <p className="text-sm text-muted-foreground">Verifica in corso...</p>}<Button type="submit" className="w-full" disabled={passwordChangeBusy}>{passwordChangeBusy ? "Aggiornamento..." : "Aggiorna password"}</Button></form></CardContent>}</Card>
        <Card><CardHeader><div className="flex items-center justify-between gap-3"><button type="button" className="flex min-h-12 flex-1 items-center justify-between text-left" onClick={() => setSecurityPanel(securityPanel === "passkey" ? null : "passkey")}><span className="font-semibold">Passkey e accesso rapido</span><span className="text-xs text-muted-foreground">{passkeyConfig.enabled ? `${passkeys.length} configurata/e` : "Non configurata"}</span></button><AddCircleButton label="Aggiungi passkey" onClick={() => { setSecurityPanel("passkey"); registerPasskey(); }} disabled={passkeyBusy || !passkeyConfig.enabled || !passkeyConfig.supported} /></div></CardHeader>{securityPanel === "passkey" && <CardContent className="space-y-2"><p className="text-sm text-muted-foreground">Usa Face ID o la sicurezza del dispositivo senza sostituire Authenticator.</p>{!passkeyConfig.enabled || !passkeyConfig.supported ? <p className="text-sm text-muted-foreground">Passkey non disponibile su questo dispositivo o ambiente.</p> : passkeys.length === 0 ? <p className="text-sm text-muted-foreground">Nessuna passkey registrata.</p> : passkeys.map((passkey) => <div key={passkey.credential_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"><div className="min-w-0"><p className="truncate font-medium">{passkey.name || "Passkey"}</p><p className="text-xs text-muted-foreground">Ultimo utilizzo: {passkey.last_used_at ? new Date(passkey.last_used_at).toLocaleString("it-IT") : "mai"}</p></div><div className="flex shrink-0 gap-2"><Button type="button" variant="outline" size="sm" onClick={() => renamePasskey(passkey.credential_id, passkey.name)}>Rinomina</Button><Button type="button" variant="destructive" size="sm" disabled={passkeyBusy} onClick={() => revokePasskey(passkey.credential_id)}>Revoca</Button></div></div>)}</CardContent>}</Card>
        <Card><CardHeader><button type="button" className="flex min-h-12 w-full items-center justify-between text-left" onClick={() => setSecurityPanel(securityPanel === "authenticator" ? null : "authenticator")}><span className="font-semibold">Authenticator</span><span className="text-xs text-muted-foreground">{user?.totp_enabled ? "Attivo" : "Non attivo"}</span></button></CardHeader>{securityPanel === "authenticator" && <CardContent><p className="text-sm text-muted-foreground">Authenticator TOTP è {user?.totp_enabled ? "attivo" : "da configurare"} e resta disponibile come alternativa alle Passkey.</p></CardContent>}</Card>
        <Card><CardHeader><button type="button" className="flex min-h-12 w-full items-center justify-between text-left" onClick={() => setSecurityPanel(securityPanel === "trusted" ? null : "trusted")}><span className="font-semibold">Contatto fidato</span><span className="text-xs text-muted-foreground">{recoveryContact ? "Configurato" : "Non configurato"}</span></button></CardHeader>{securityPanel === "trusted" && <CardContent className="space-y-3">{recoveryContact ? <div className="rounded-xl bg-muted p-3 text-sm"><p className="font-medium">{recoveryContact.contact_email}</p><p>Stato: {recoveryContact.status}</p>{recoveryContact.security_period_ends_at && <p className="text-xs text-muted-foreground">Periodo di sicurezza fino al {new Date(recoveryContact.security_period_ends_at).toLocaleString("it-IT")}</p>}</div> : <p className="text-sm text-muted-foreground">Nessun contatto fidato configurato.</p>}<p className="text-sm text-muted-foreground">Il contatto fidato può aiutarti a recuperare l'accesso, ma non può visualizzare i tuoi dati.</p>{user?.totp_enabled && <><Input type="email" placeholder="Email del contatto fidato" value={contactEmail} onChange={e => setContactEmail(e.target.value)} autoComplete="off"/><Input type="password" placeholder="Password attuale" value={contactPassword} onChange={e => setContactPassword(e.target.value)} autoComplete="current-password"/><Input inputMode="numeric" maxLength={6} placeholder="Codice Authenticator" value={contactTotp} onChange={e => { const next = e.target.value.replace(/\D/g, "").slice(0, 6); setContactTotp(next); totpSubmitted.current.contact = false; scheduleTotpSubmit("contact", next, Boolean(contactEmail.trim() && contactPassword) && !contactBusy && !recoveryContact, () => handleContactInvite(next)); }} autoComplete="one-time-code" disabled={contactBusy}/>{contactBusy && <p className="text-sm text-muted-foreground">Verifica in corso...</p>}{recoveryContact ? <Button type="button" variant="destructive" disabled={contactBusy} onClick={handleContactRevoke}>Revoca contatto fidato</Button> : <Button type="button" disabled={contactBusy} onClick={handleContactInvite}>Invita contatto fidato</Button>}</>}</CardContent>}</Card>
        <Card><CardHeader><CardTitle className="text-lg">Preferenze privacy e comunicazioni</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><label className="flex items-start gap-2"><Checkbox checked={marketingPreferences.email_opt_in} onCheckedChange={(value) => setMarketingPreferences((current) => ({ ...current, email_opt_in: value === true }))} /><span>Ricevere comunicazioni commerciali via email (facoltativo).</span></label><label className="flex items-start gap-2"><Checkbox checked={marketingPreferences.profiling_opt_in} onCheckedChange={(value) => setMarketingPreferences((current) => ({ ...current, profiling_opt_in: value === true }))} /><span>Profilazione per offerte commerciali personalizzate (facoltativo).</span></label><p className="text-xs text-muted-foreground">Puoi modificare o revocare queste preferenze senza compromettere l'accesso a Beside.</p><Button type="button" variant="outline" onClick={handleConsentSave}>Salva preferenze</Button></CardContent></Card>
      </div>}

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
        <Card><CardHeader><div className="flex items-center justify-between gap-3"><CardTitle className="text-lg">Assistenza</CardTitle><AddCircleButton label="Nuova richiesta di assistenza" onClick={() => setSupportFormOpen((current) => !current)} /></div></CardHeader>{supportFormOpen && <CardContent>
          <form onSubmit={async (event) => { await submitSupportTicket(event); setSupportFormOpen(false); }} className="space-y-4">
            <div className="space-y-1.5"><Label htmlFor="settings-support-category">Categoria</Label><select id="settings-support-category" className="w-full rounded-md border bg-background p-2.5" value={supportCategory} onChange={(event) => setSupportCategory(event.target.value)}>{SUPPORT_CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
            <div className="space-y-1.5"><Label htmlFor="settings-support-subject">Oggetto</Label><Input id="settings-support-subject" required maxLength={200} value={supportSubject} onChange={(event) => setSupportSubject(event.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="settings-support-message">Descrizione del problema</Label><Textarea id="settings-support-message" required maxLength={4000} rows={5} value={supportMessage} onChange={(event) => setSupportMessage(event.target.value)} /></div>
            <Button type="submit" disabled={supportBusy || !supportSubject.trim() || !supportMessage.trim()} className="w-full">{supportBusy ? "Invio..." : "Invia richiesta"}</Button>
          </form>
        </CardContent>}</Card>
        <Card><CardHeader><div className="flex items-center justify-between gap-3"><CardTitle className="text-lg">Le mie richieste</CardTitle><Button type="button" variant="ghost" size="sm" onClick={loadSupportTickets} disabled={supportLoading}>{supportLoading ? "Caricamento..." : "Aggiorna"}</Button></div></CardHeader><CardContent className="space-y-3">
          {supportSelectedTicket ? <div className="space-y-4"><Button type="button" variant="ghost" className="px-0" onClick={() => setSupportSelectedTicket(null)}>← Tutte le richieste</Button><div><p className="font-semibold">{supportSelectedTicket.subject}</p><p className="text-xs text-muted-foreground">{supportSelectedTicket.ticket_id} · {new Date(supportSelectedTicket.created_at).toLocaleString("it-IT")}</p></div><div className="space-y-3">{(supportSelectedTicket.messages || []).map((item, index) => <div key={`${supportSelectedTicket.ticket_id}-${index}`} className="rounded-lg border bg-muted/20 p-3"><div className="flex items-center justify-between gap-2 text-xs text-muted-foreground"><span>{item.author_type === "platform_owner" ? "Assistenza Beside" : "Tu"}</span><span>{new Date(item.created_at).toLocaleString("it-IT")}</span></div><p className="mt-1 whitespace-pre-wrap text-sm">{item.message}</p></div>)}</div></div> : supportLoading ? <p className="text-sm text-muted-foreground">Caricamento richieste...</p> : supportTickets.length === 0 ? <p className="text-sm text-muted-foreground">Non hai ancora inviato richieste.</p> : <div className="divide-y rounded-lg border">{supportTickets.map((ticket) => <button key={ticket.ticket_id} type="button" onClick={() => setSupportSelectedTicket(ticket)} className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-muted/40"><span className="min-w-0"><span className="block truncate font-medium">{ticket.subject}</span><span className="block text-xs text-muted-foreground">{ticket.ticket_id} · {new Date(ticket.created_at).toLocaleDateString("it-IT")}</span></span><span className="shrink-0 rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">{SUPPORT_STATUS_LABELS[ticket.status] || ticket.status}</span></button>)}</div>}
        </CardContent></Card>
      </div>}

      {section === "account" && <div className="space-y-4">
        <Card><CardHeader><CardTitle className="text-lg flex items-center gap-2"><PauseCircle className="h-5 w-5"/>Sospendi temporaneamente l’account</CardTitle></CardHeader><CardContent className="space-y-4"><p className="text-sm text-muted-foreground">La sospensione disattiva il rinnovo alla scadenza naturale del periodo pagato, senza perdere i giorni residui. Puoi annullarla finché non è diventata effettiva.</p><Button variant="outline" className="w-full" onClick={() => navigate("/subscription")}>Gestisci sospensione e rinnovo</Button></CardContent></Card>
        {user?.role === "owner" && <Card className="border-destructive/40"><CardHeader><CardTitle className="text-lg flex items-center gap-2 text-destructive"><Trash2 className="h-5 w-5"/>Elimina definitivamente account</CardTitle></CardHeader><CardContent className="space-y-4">{deletionStatus ? <div className="space-y-3 text-sm"><p className="font-medium text-destructive">Eliminazione avviata</p><p>L'accesso operativo è stato bloccato. Lo stato persistente è: {deletionStatus.status}.</p><Button type="button" className="w-full" onClick={() => logout().then(() => navigate("/login"))}>Torna al login</Button></div> : <><p className="text-sm text-muted-foreground">L'operazione è irreversibile: perderai subito l'accesso e l'eventuale periodo di abbonamento residuo, senza rimborso automatico.</p><form onSubmit={requestAccountDeletion} className="space-y-3"><select className="w-full rounded-md border bg-background p-2.5 text-sm" value={deletionForm.reason} onChange={e => setDeletionForm(f => ({ ...f, reason: e.target.value }))}><option value="">Motivo (facoltativo)</option><option value="pausa">Pausa o chiusura attività</option><option value="utilizzo">Utilizzo insufficiente</option><option value="costo">Costo abbonamento</option><option value="funzioni">Funzionalità mancanti</option><option value="alternativa">Altra soluzione</option><option value="altro">Altro</option></select>{deletionForm.reason === "altro" && <Textarea rows={2} placeholder="Note facoltative" value={deletionForm.details} onChange={e => setDeletionForm(f => ({ ...f, details: e.target.value }))}/>}<Input placeholder="Digita ELIMINA" value={deletionForm.confirmation} onChange={e => setDeletionForm(f => ({ ...f, confirmation: e.target.value }))} autoComplete="off" /><Input inputMode="numeric" maxLength={6} placeholder="Codice Authenticator" value={deletionForm.code} onChange={e => setDeletionForm(f => ({ ...f, code: e.target.value.replace(/\D/g, "").slice(0, 6) }))} autoComplete="one-time-code" /><Button type="submit" variant="destructive" className="w-full" disabled={deletionBusy}>{deletionBusy ? "Eliminazione in corso…" : "Elimina definitivamente"}</Button></form></>}</CardContent></Card>}
      </div>}
      {passkeyNameModal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-labelledby="passkey-dialog-title"><div className="w-full max-w-sm rounded-3xl bg-card p-5 shadow-2xl"><h2 id="passkey-dialog-title" className="text-lg font-semibold">{passkeyNameModal.rename ? "Rinomina passkey" : "Nomina passkey"}</h2><p className="mt-1 text-sm text-muted-foreground">Scegli un nome riconoscibile per questo dispositivo.</p><Input className="mt-4" autoFocus value={passkeyNameModal.name} onChange={e => setPasskeyNameModal(current => ({ ...current, name: e.target.value }))} /><div className="mt-4 flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setPasskeyNameModal(null)}>Annulla</Button><Button type="button" onClick={passkeyNameModal.rename ? completePasskeyRename : completePasskeyRegistration} disabled={passkeyBusy}>Conferma</Button></div></div></div>}
      {passkeyRevokeTarget && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-labelledby="revoke-passkey-title"><div className="w-full max-w-sm rounded-3xl bg-card p-5 shadow-2xl"><h2 id="revoke-passkey-title" className="text-lg font-semibold">Revocare questa passkey?</h2><p className="mt-1 text-sm text-muted-foreground">Dovrai usare un altro metodo di accesso a Beside.</p><div className="mt-4 flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setPasskeyRevokeTarget(null)}>Annulla</Button><Button type="button" variant="destructive" onClick={confirmRevokePasskey} disabled={passkeyBusy}>Revoca</Button></div></div></div>}
    </div>
  );
};
