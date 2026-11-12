import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { API } from "@/App";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const CompanyInviteAcceptPage = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") || "";
  const [invite, setInvite] = useState(null);
  const [form, setForm] = useState({ first_name: "", last_name: "", password: "" });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) return setLoading(false);
    axios.get(`${API}/auth/company/invitations/preview`, { params: { token } })
      .then(({ data }) => setInvite(data))
      .catch(error => toast.error(error.response?.data?.detail || "Invito non valido o scaduto"))
      .finally(() => setLoading(false));
  }, [token]);

  const accept = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      await axios.post(`${API}/auth/company/invitations/accept`, { token, ...form });
      setDone(true);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Impossibile accettare l'invito.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="mx-auto max-w-md p-6 text-center">Caricamento invito…</div>;
  return <div className="mx-auto flex min-h-[70vh] max-w-md items-center p-4">
    <Card className="w-full">
      <CardHeader><CardTitle>{done ? "Invito accettato" : "Invito a collaborare"}</CardTitle></CardHeader>
      <CardContent>
        {done ? <div className="space-y-4 text-sm"><p>Account creato per {invite?.email}. Controlla la posta per verificare l'indirizzo.</p><p>Dopo la verifica, accedi con la tua password e configura il tuo Authenticator personale.</p><Button className="w-full" onClick={() => navigate("/login")}>Vai al login</Button></div> : !invite ? <div className="space-y-4 text-sm"><p>Questo invito non è valido o è scaduto.</p><Button variant="outline" className="w-full" onClick={() => navigate("/login")}>Vai al login</Button></div> : <form onSubmit={accept} className="space-y-4">
          <p className="text-sm text-muted-foreground">Sei stato invitato da {invite.company_name} come {invite.role}. Usa una password personale: non condividere credenziali o codici MFA.</p>
          <p className="text-sm">Email: <strong>{invite.email}</strong></p>
          <div><Label>Nome</Label><Input required value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} /></div>
          <div><Label>Cognome</Label><Input value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} /></div>
          <div><Label>Password personale</Label><Input required minLength={10} type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} /></div>
          <Button className="w-full" disabled={busy}>{busy ? "Attivazione…" : "Accetta invito"}</Button>
        </form>}
      </CardContent>
    </Card>
  </div>;
};
