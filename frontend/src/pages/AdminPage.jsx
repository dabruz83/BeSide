import { useState, useEffect, useCallback } from "react";
import { API } from "@/App";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";

const getErrorMessage = (error, fallback) => {
  const detail = error.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((item) => item?.msg).filter(Boolean).join("; ") || fallback;
  return fallback;
};
import { 
  Users, 
  CreditCard,
  MessageSquare,
  BarChart3,
  Search,
  Send,
  Eye,
  Edit,
  Lock,
  Unlock,
  Settings,
  LogOut,
  Euro,
  TrendingUp
} from "lucide-react";

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2
  }).format(amount);
};

const SUBSCRIPTION_TIERS = [
  { value: "essential", label: "Essential" },
  { value: "professional", label: "Professional" },
  { value: "elite", label: "Elite" }
];

const SUBSCRIPTION_STATUS = [
  { value: "trial", label: "Prova" },
  { value: "active", label: "Attivo" },
  { value: "cancelled", label: "Cancellato" }
];

export const AdminPage = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Login state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [twoFactorRequired, setTwoFactorRequired] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [mfaSetupRequired, setMfaSetupRequired] = useState(false);
  const [mfaActivationCode, setMfaActivationCode] = useState("");
  const [mfaSetup, setMfaSetup] = useState(null);
  
  // Data state
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [payments, setPayments] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [supportTickets, setSupportTickets] = useState([]);
  const [supportFilters, setSupportFilters] = useState({ category: "", status: "", priority: "", search: "", created_from: "", created_to: "" });
  const [selectedSupportTicket, setSelectedSupportTicket] = useState(null);
  const [supportReply, setSupportReply] = useState("");
  
  // Dialog state
  const [selectedUser, setSelectedUser] = useState(null);
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [chatDialogOpen, setChatDialogOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");

  useEffect(() => {
    const checkAdminSession = async () => {
      try {
        await axios.get(`${API}/admin/stats`);
        setIsLoggedIn(true);
      } catch (error) {
        setIsLoggedIn(false);
      } finally {
        setLoading(false);
      }
    };
    checkAdminSession();
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginLoading(true);
    
    try {
      const response = await axios.post(`${API}/admin/login`, {
        email: loginEmail,
        password: loginPassword
      });
      if (response.data.mfa_required) {
        setTwoFactorRequired(true);
        toast.success("Inserisci il codice della tua app Authenticator");
        return;
      }
      if (response.data.mfa_setup_required) {
        setMfaSetupRequired(true);
        setTwoFactorRequired(false);
        setLoginPassword("");
        toast.success("Controlla l'email verificata per iniziare la configurazione MFA");
        return;
      }
      setIsLoggedIn(true);
      toast.success("Accesso admin effettuato");
    } catch (error) {
      console.error("Admin login error:", error);
      toast.error(getErrorMessage(error, "Errore durante l'accesso"));
    } finally {
      setLoginLoading(false);
    }
  };

  const verifyMfaActivationEmail = async (event) => {
    event.preventDefault();
    setLoginLoading(true);
    try {
      const response = await axios.post(`${API}/admin/mfa/activation/verify-email`, { code: mfaActivationCode });
      setMfaSetup(response.data);
      setMfaActivationCode("");
      toast.success("Email verificata. Scansiona il QR code con Authenticator");
    } catch (error) {
      toast.error(getErrorMessage(error, "Codice email non valido o scaduto"));
    } finally {
      setLoginLoading(false);
    }
  };

  const confirmMfaActivation = async (event) => {
    event.preventDefault();
    setLoginLoading(true);
    try {
      await axios.post(`${API}/admin/mfa/activation/confirm`, { code: twoFactorCode });
      setIsLoggedIn(true);
      setMfaSetup(null);
      setMfaSetupRequired(false);
      setTwoFactorCode("");
      toast.success("MFA attivata. Accesso amministratore completato");
    } catch (error) {
      toast.error(getErrorMessage(error, "Codice TOTP non valido o procedura scaduta"));
    } finally {
      setLoginLoading(false);
    }
  };

  const verifyTwoFactor = async (e) => {
    e.preventDefault();
    setLoginLoading(true);
    try {
      await axios.post(`${API}/auth/2fa/verify`, { code: twoFactorCode });
      setIsLoggedIn(true);
      toast.success("Accesso admin effettuato");
    } catch (error) {
      toast.error(getErrorMessage(error, "Codice 2FA non valido o scaduto"));
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = useCallback(async () => {
    try {
      await axios.post(`${API}/auth/logout`, {});
    } catch (error) {
      console.error("Admin logout error:", error);
    }
    setIsLoggedIn(false);
    toast.success("Logout effettuato");
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, usersRes, paymentsRes, supportRes] = await Promise.all([
        axios.get(`${API}/admin/stats`),
        axios.get(`${API}/admin/users`),
        axios.get(`${API}/admin/payments`),
        axios.get(`${API}/admin/support/tickets`)
      ]);
      
      setStats(statsRes.data);
      setUsers(usersRes.data.users);
      setPayments(paymentsRes.data.payments);
      setSupportTickets(supportRes.data.tickets || []);
    } catch (error) {
      if (error.response?.status === 403 || error.response?.status === 401) {
        setIsLoggedIn(false);
        toast.error("Sessione scaduta");
      }
    }
  }, []);

  const fetchSupportTickets = async () => {
    try {
      const params = Object.fromEntries(Object.entries(supportFilters).filter(([, value]) => value));
      const response = await axios.get(`${API}/admin/support/tickets`, { params });
      setSupportTickets(response.data.tickets || []);
      if (selectedSupportTicket) {
        setSelectedSupportTicket((response.data.tickets || []).find((ticket) => ticket.ticket_id === selectedSupportTicket.ticket_id) || null);
      }
    } catch (error) {
      toast.error("Errore nel caricamento dei ticket");
    }
  };

  const updateSupportTicket = async (updates) => {
    if (!selectedSupportTicket) return;
    try {
      await axios.patch(`${API}/admin/support/tickets/${selectedSupportTicket.ticket_id}`, updates);
      setSupportReply("");
      await fetchSupportTickets();
      toast.success("Ticket aggiornato");
    } catch (error) {
      toast.error(getErrorMessage(error, "Errore nell'aggiornamento del ticket"));
    }
  };

  useEffect(() => {
    if (isLoggedIn) {
      fetchData();
    }
  }, [isLoggedIn, fetchData]);

  const handleSearchUsers = async () => {
    try {
      const response = await axios.get(`${API}/admin/users`, { params: { search: searchQuery } });
      setUsers(response.data.users);
    } catch (error) {
      toast.error("Errore nella ricerca");
    }
  };

  const handleUpdateUser = async (userId, updates) => {
    try {
      await axios.put(`${API}/admin/users/${userId}`, updates);
      toast.success("Utente aggiornato");
      fetchData();
      setUserDialogOpen(false);
    } catch (error) {
      toast.error("Errore nell'aggiornamento");
    }
  };

  const openChat = async (user) => {
    setSelectedUser(user);
    try {
      const response = await axios.get(`${API}/admin/chat/${user.user_id}`);
      setChatMessages(response.data);
      setChatDialogOpen(true);
    } catch (error) {
      toast.error("Errore nel caricamento chat");
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim()) return;
    
    try {
      await axios.post(`${API}/admin/chat/send`, {
        user_id: selectedUser.user_id,
        message: newMessage
      });
      
      setNewMessage("");
      
      // Refresh chat
      const response = await axios.get(`${API}/admin/chat/${selectedUser.user_id}`);
      setChatMessages(response.data);
      
      toast.success("Messaggio inviato");
    } catch (error) {
      toast.error("Errore nell'invio");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl flex items-center justify-center gap-2">
              <Lock className="w-6 h-6" />
              Admin BESIDE
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="admin@esempio.it"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <Input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loginLoading}>
                {loginLoading ? "Accesso..." : "Accedi"}
              </Button>
            </form>
            {twoFactorRequired && (
              <form onSubmit={verifyTwoFactor} className="mt-4 space-y-3 rounded-lg border p-4">
                <Label htmlFor="admin-two-factor-code">Codice di verifica (6 cifre)</Label>
                <Input
                  id="admin-two-factor-code"
                  inputMode="numeric"
                  maxLength={6}
                  value={twoFactorCode}
                  onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  autoComplete="one-time-code"
                  autoFocus
                />
                <Button type="submit" className="w-full" disabled={loginLoading || twoFactorCode.length !== 6}>
                  {loginLoading ? "Verifica..." : "Verifica codice"}
                </Button>
              </form>
            )}
            {mfaSetupRequired && !mfaSetup && (
              <form onSubmit={verifyMfaActivationEmail} className="mt-4 space-y-3 rounded-lg border border-amber-300 p-4">
                <p className="text-sm font-medium">Configura autenticazione a due fattori</p>
                <p className="text-xs text-muted-foreground">Inserisci il codice monouso inviato all'email verificata dell'amministratore.</p>
                <Input inputMode="numeric" maxLength={8} placeholder="Codice email (8 cifre)" value={mfaActivationCode} onChange={(event) => setMfaActivationCode(event.target.value.replace(/\D/g, "").slice(0, 8))} autoComplete="one-time-code" autoFocus />
                <Button type="submit" className="w-full" disabled={loginLoading || mfaActivationCode.length !== 8}>{loginLoading ? "Verifica..." : "Verifica codice email"}</Button>
              </form>
            )}
            {mfaSetup && (
              <form onSubmit={confirmMfaActivation} className="mt-4 space-y-3 rounded-lg border border-amber-300 p-4">
                <p className="text-sm font-medium">Configura autenticazione a due fattori</p>
                <div className="flex justify-center rounded-md bg-white p-3"><QRCodeSVG value={mfaSetup.otpauth_uri} size={190} includeMargin /></div>
                <p className="break-all text-xs text-muted-foreground">Chiave manuale: {mfaSetup.secret}</p>
                <Input inputMode="numeric" maxLength={6} placeholder="Codice Authenticator (6 cifre)" value={twoFactorCode} onChange={(event) => setTwoFactorCode(event.target.value.replace(/\D/g, "").slice(0, 6))} autoComplete="one-time-code" autoFocus />
                <Button type="submit" className="w-full" disabled={loginLoading || twoFactorCode.length !== 6}>{loginLoading ? "Attivazione..." : "Attiva MFA e accedi"}</Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-primary text-white p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Admin Panel - BESIDE
          </h1>
          <Button variant="ghost" className="text-white hover:text-white/80" onClick={handleLogout}>
            <LogOut className="w-4 h-4 mr-2" />
            Esci
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 space-y-6">
        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Users className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Utenti Totali</p>
                    <p className="text-2xl font-bold">{stats.total_users}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-success/10 flex items-center justify-center">
                    <TrendingUp className="w-6 h-6 text-success" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Utenti Attivi</p>
                    <p className="text-2xl font-bold">{stats.active_users}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-warning/10 flex items-center justify-center">
                    <CreditCard className="w-6 h-6 text-warning" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Paganti</p>
                    <p className="text-2xl font-bold">{stats.paying_users}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-secondary/10 flex items-center justify-center">
                    <Euro className="w-6 h-6 text-secondary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Fatturato Totale</p>
                    <p className="text-2xl font-bold">{formatCurrency(stats.total_revenue)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <Tabs defaultValue="users" className="space-y-4">
          <TabsList>
            <TabsTrigger value="users">
              <Users className="w-4 h-4 mr-2" />
              Utenti
            </TabsTrigger>
            <TabsTrigger value="payments">
              <CreditCard className="w-4 h-4 mr-2" />
              Pagamenti
            </TabsTrigger>
            <TabsTrigger value="support">
              <MessageSquare className="w-4 h-4 mr-2" />
              Support Center
            </TabsTrigger>
            <TabsTrigger value="stats">
              <BarChart3 className="w-4 h-4 mr-2" />
              Statistiche
            </TabsTrigger>
          </TabsList>

          {/* Users Tab */}
          <TabsContent value="users">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Gestione Utenti</CardTitle>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Cerca utente..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-64"
                    />
                    <Button onClick={handleSearchUsers}>
                      <Search className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-2">Utente</th>
                        <th className="text-left py-3 px-2">Email</th>
                        <th className="text-center py-3 px-2">Piano</th>
                        <th className="text-center py-3 px-2">Stato</th>
                        <th className="text-center py-3 px-2">Registrato</th>
                        <th className="text-right py-3 px-2">Azioni</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((user) => (
                        <tr key={user.user_id} className="border-b hover:bg-muted/50">
                          <td className="py-3 px-2">
                            <div className="font-medium">{user.business_name || user.name}</div>
                          </td>
                          <td className="py-3 px-2 text-muted-foreground">{user.email}</td>
                          <td className="text-center py-3 px-2">
                            <span className="px-2 py-1 rounded text-xs bg-primary/10 text-primary">
                              {user.subscription_tier}
                            </span>
                          </td>
                          <td className="text-center py-3 px-2">
                            <span className={`px-2 py-1 rounded text-xs ${
                              user.subscription_status === "active" 
                                ? "bg-success/10 text-success"
                                : user.subscription_status === "trial"
                                ? "bg-warning/10 text-warning"
                                : "bg-muted text-muted-foreground"
                            }`}>
                              {user.subscription_status}
                            </span>
                          </td>
                          <td className="text-center py-3 px-2 text-sm text-muted-foreground">
                            {new Date(user.created_at).toLocaleDateString('it-IT')}
                          </td>
                          <td className="text-right py-3 px-2">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => { setSelectedUser(user); setUserDialogOpen(true); }}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openChat(user)}
                              >
                                <MessageSquare className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleUpdateUser(user.user_id, { is_active: !user.is_active })}
                              >
                                {user.is_active ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Support Center Tab */}
          <TabsContent value="support">
            <Card>
              <CardHeader>
                <CardTitle>Centro assistenza</CardTitle>
                <div className="grid gap-2 md:grid-cols-4 lg:grid-cols-6">
                  <Select value={supportFilters.category || "all"} onValueChange={(value) => setSupportFilters({ ...supportFilters, category: value === "all" ? "" : value })}>
                    <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
                    <SelectContent><SelectItem value="all">Tutte le categorie</SelectItem>{["password", "authentication", "privacy", "billing", "technical", "other"].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select value={supportFilters.status || "all"} onValueChange={(value) => setSupportFilters({ ...supportFilters, status: value === "all" ? "" : value })}>
                    <SelectTrigger><SelectValue placeholder="Stato" /></SelectTrigger>
                    <SelectContent><SelectItem value="all">Tutti gli stati</SelectItem>{["open", "pending", "closed"].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select value={supportFilters.priority || "all"} onValueChange={(value) => setSupportFilters({ ...supportFilters, priority: value === "all" ? "" : value })}>
                    <SelectTrigger><SelectValue placeholder="Priorità" /></SelectTrigger>
                    <SelectContent><SelectItem value="all">Tutte le priorità</SelectItem>{["low", "normal", "high", "urgent"].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input type="date" aria-label="Ticket da data" value={supportFilters.created_from} onChange={(event) => setSupportFilters({ ...supportFilters, created_from: event.target.value })} />
                  <Input type="date" aria-label="Ticket fino a data" value={supportFilters.created_to} onChange={(event) => setSupportFilters({ ...supportFilters, created_to: event.target.value })} />
                  <div className="flex gap-2"><Input placeholder="Cerca ticket, cliente..." value={supportFilters.search} onChange={(event) => setSupportFilters({ ...supportFilters, search: event.target.value })} /><Button onClick={fetchSupportTickets}><Search className="w-4 h-4" /></Button></div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="space-y-2 max-h-[32rem] overflow-y-auto">
                  {supportTickets.length === 0 && <p className="text-sm text-muted-foreground">Nessun ticket trovato.</p>}
                  {supportTickets.map((ticket) => <button type="button" key={ticket.ticket_id} onClick={() => setSelectedSupportTicket(ticket)} className={`w-full rounded-lg border p-3 text-left ${selectedSupportTicket?.ticket_id === ticket.ticket_id ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}><div className="flex items-center justify-between gap-2"><span className="font-mono text-sm">{ticket.ticket_id}</span><span className="text-xs uppercase text-muted-foreground">{ticket.status}</span></div><p className="font-medium">{ticket.subject}</p><p className="text-xs text-muted-foreground">{ticket.category} · {new Date(ticket.created_at).toLocaleString("it-IT")}</p></button>)}
                </div>
                {selectedSupportTicket ? <div className="space-y-3 rounded-lg border p-4"><div><p className="font-semibold">{selectedSupportTicket.subject}</p><p className="text-xs text-muted-foreground">{selectedSupportTicket.requester_email || "Richiesta non autenticata"} · {selectedSupportTicket.company_id || "nessuna azienda associata"}</p></div><div className="max-h-64 space-y-2 overflow-y-auto">{(selectedSupportTicket.messages || []).map((message, index) => <div key={`${message.created_at}-${index}`} className="rounded bg-muted/50 p-2 text-sm"><p>{message.message}</p><p className="mt-1 text-xs text-muted-foreground">{message.author_type} · {new Date(message.created_at).toLocaleString("it-IT")}</p></div>)}</div><Textarea rows={3} placeholder="Risposta senza password o token" value={supportReply} onChange={(event) => setSupportReply(event.target.value)} /><div className="flex flex-wrap gap-2"><Button onClick={() => updateSupportTicket({ message: supportReply, status: "pending" })} disabled={!supportReply.trim()}>Rispondi</Button><Button variant="outline" onClick={() => updateSupportTicket({ status: "open" })}>Riapri</Button><Button variant="outline" onClick={() => updateSupportTicket({ status: "closed" })}>Chiudi</Button></div></div> : <p className="text-sm text-muted-foreground">Seleziona un ticket per visualizzarne la cronologia.</p>}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Payments Tab */}
          <TabsContent value="payments">
            <Card>
              <CardHeader>
                <CardTitle>Storico Pagamenti</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-2">ID</th>
                        <th className="text-left py-3 px-2">User ID</th>
                        <th className="text-center py-3 px-2">Piano</th>
                        <th className="text-right py-3 px-2">Importo</th>
                        <th className="text-center py-3 px-2">Stato</th>
                        <th className="text-center py-3 px-2">Data</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((payment) => (
                        <tr key={payment.transaction_id} className="border-b hover:bg-muted/50">
                          <td className="py-3 px-2 font-mono text-sm">{payment.transaction_id}</td>
                          <td className="py-3 px-2 font-mono text-sm text-muted-foreground">{payment.user_id}</td>
                          <td className="text-center py-3 px-2">
                            <span className="px-2 py-1 rounded text-xs bg-primary/10 text-primary">
                              {payment.tier}
                            </span>
                          </td>
                          <td className="text-right py-3 px-2 font-semibold">
                            {formatCurrency(payment.amount)}
                          </td>
                          <td className="text-center py-3 px-2">
                            <span className={`px-2 py-1 rounded text-xs ${
                              payment.payment_status === "paid" 
                                ? "bg-success/10 text-success"
                                : "bg-warning/10 text-warning"
                            }`}>
                              {payment.payment_status}
                            </span>
                          </td>
                          <td className="text-center py-3 px-2 text-sm text-muted-foreground">
                            {new Date(payment.created_at).toLocaleDateString('it-IT')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Stats Tab */}
          <TabsContent value="stats">
            <Card>
              <CardHeader>
                <CardTitle>Statistiche Dettagliate</CardTitle>
              </CardHeader>
              <CardContent>
                {stats && (
                  <div className="grid md:grid-cols-3 gap-6">
                    <div className="p-4 bg-muted/50 rounded-lg">
                      <h4 className="font-semibold mb-3">Utenti per Piano</h4>
                      {stats.users_by_tier?.map((tier) => (
                        <div key={tier._id} className="flex justify-between py-2 border-b border-border/50">
                          <span className="capitalize">{tier._id}</span>
                          <span className="font-semibold">{tier.count}</span>
                        </div>
                      ))}
                    </div>
                    
                    <div className="p-4 bg-muted/50 rounded-lg">
                      <h4 className="font-semibold mb-3">Riepilogo</h4>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span>Lavori totali</span>
                          <span className="font-semibold">{stats.total_jobs}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Utenti in prova</span>
                          <span className="font-semibold">{stats.trial_users}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Conversion rate</span>
                          <span className="font-semibold">
                            {stats.total_users > 0 
                              ? ((stats.paying_users / stats.total_users) * 100).toFixed(1) 
                              : 0}%
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="p-4 bg-muted/50 rounded-lg">
                      <h4 className="font-semibold mb-3">Fatturato</h4>
                      <div className="text-center py-4">
                        <p className="text-3xl font-bold text-primary">{formatCurrency(stats.total_revenue)}</p>
                        <p className="text-sm text-muted-foreground mt-1">Totale registrato</p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* User Edit Dialog */}
      <Dialog open={userDialogOpen} onOpenChange={setUserDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifica Utente</DialogTitle>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <p className="font-medium">{selectedUser.email}</p>
              </div>
              
              <div className="space-y-2">
                <Label>Piano Abbonamento</Label>
                <Select
                  value={selectedUser.subscription_tier}
                  onValueChange={(value) => setSelectedUser({ ...selectedUser, subscription_tier: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUBSCRIPTION_TIERS.map((tier) => (
                      <SelectItem key={tier.value} value={tier.value}>{tier.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>Stato Abbonamento</Label>
                <Select
                  value={selectedUser.subscription_status}
                  onValueChange={(value) => setSelectedUser({ ...selectedUser, subscription_status: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUBSCRIPTION_STATUS.map((status) => (
                      <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <Button 
                className="w-full"
                onClick={() => handleUpdateUser(selectedUser.user_id, {
                  subscription_tier: selectedUser.subscription_tier,
                  subscription_status: selectedUser.subscription_status
                })}
              >
                Salva Modifiche
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Chat Dialog */}
      <Dialog open={chatDialogOpen} onOpenChange={setChatDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Chat con {selectedUser?.business_name || selectedUser?.email}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="h-64 overflow-y-auto border rounded-lg p-4 space-y-3">
              {chatMessages.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Nessun messaggio</p>
              ) : (
                chatMessages.map((msg) => (
                  <div
                    key={msg.message_id}
                    className={`p-3 rounded-lg ${
                      msg.sender_type === "admin" 
                        ? "bg-primary/10 ml-8" 
                        : "bg-muted mr-8"
                    }`}
                  >
                    <p className="text-sm">{msg.message}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(msg.created_at).toLocaleString('it-IT')}
                    </p>
                  </div>
                ))
              )}
            </div>
            
            <div className="flex gap-2">
              <Textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Scrivi un messaggio..."
                rows={2}
              />
              <Button onClick={sendMessage} className="self-end">
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
