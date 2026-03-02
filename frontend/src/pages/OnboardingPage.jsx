import { useState, useEffect } from "react";
import { API } from "@/App";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { 
  Users, 
  Plus,
  Link as LinkIcon,
  Copy,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ExternalLink
} from "lucide-react";

export const OnboardingPage = () => {
  const [onboardings, setOnboardings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    client_name: "",
    client_email: "",
    vehicle_info: ""
  });

  useEffect(() => {
    fetchOnboardings();
  }, []);

  const fetchOnboardings = async () => {
    try {
      const response = await axios.get(`${API}/onboarding`, { withCredentials: true });
      setOnboardings(response.data);
    } catch (error) {
      console.error("Error fetching onboardings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post(`${API}/onboarding`, formData, { 
        withCredentials: true,
        headers: { 'origin': window.location.origin }
      });
      toast.success("Onboarding creato! Link copiato negli appunti.");
      navigator.clipboard.writeText(response.data.unique_link);
      setDialogOpen(false);
      setFormData({ client_name: "", client_email: "", vehicle_info: "" });
      fetchOnboardings();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Errore nella creazione");
    }
  };

  const copyLink = (link) => {
    navigator.clipboard.writeText(link);
    toast.success("Link copiato!");
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "complete":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-success/10 text-success">
            <CheckCircle2 className="w-3 h-3" />
            Completato
          </span>
        );
      case "in_progress":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-secondary/10 text-secondary">
            <Clock className="w-3 h-3" />
            In Corso
          </span>
        );
      case "overdue":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-destructive/10 text-destructive">
            <AlertTriangle className="w-3 h-3" />
            Scaduto
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-warning/10 text-warning">
            <Clock className="w-3 h-3" />
            In Attesa
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-heading-2 text-primary" data-testid="onboarding-title">Onboarding Clienti</h1>
          <p className="text-muted-foreground">Gestisci le checklist pre-lavoro dei clienti</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="new-onboarding-btn">
              <Plus className="w-4 h-4 mr-2" />
              Nuovo Onboarding
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Crea Onboarding Cliente</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="client_name">Nome Cliente *</Label>
                <Input
                  id="client_name"
                  value={formData.client_name}
                  onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
                  placeholder="Mario Rossi"
                  required
                  data-testid="onboarding-client-input"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="client_email">Email Cliente *</Label>
                <Input
                  id="client_email"
                  type="email"
                  value={formData.client_email}
                  onChange={(e) => setFormData({ ...formData, client_email: e.target.value })}
                  placeholder="mario.rossi@email.it"
                  required
                  data-testid="onboarding-email-input"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="vehicle_info">Info Veicolo (opzionale)</Label>
                <Input
                  id="vehicle_info"
                  value={formData.vehicle_info}
                  onChange={(e) => setFormData({ ...formData, vehicle_info: e.target.value })}
                  placeholder="BMW X5 2023 Nero"
                  data-testid="onboarding-vehicle-input"
                />
              </div>
              
              <Button type="submit" className="w-full" data-testid="onboarding-submit-btn">
                Genera Link Onboarding
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Info Card */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <LinkIcon className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-primary">Come funziona l'onboarding</p>
              <p className="text-sm text-muted-foreground mt-1">
                1. Crea un onboarding per il cliente → 2. Copia il link generato → 3. Invia via WhatsApp o email → 
                4. Il cliente compila la checklist → 5. Ricevi notifica quando completato
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Onboardings List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="w-5 h-5 text-secondary" />
            Onboarding Attivi
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 bg-muted rounded animate-pulse"></div>
              ))}
            </div>
          ) : onboardings.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground mb-4">Nessun onboarding creato</p>
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Crea il primo onboarding
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {onboardings.map((onboarding) => (
                <div
                  key={onboarding.onboarding_id}
                  className="p-4 bg-background rounded-lg border border-border"
                  data-testid={`onboarding-item-${onboarding.onboarding_id}`}
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold">{onboarding.client_name}</h3>
                        {getStatusBadge(onboarding.status)}
                      </div>
                      <p className="text-sm text-muted-foreground">{onboarding.client_email}</p>
                      {onboarding.vehicle_info && (
                        <p className="text-sm text-muted-foreground mt-1">{onboarding.vehicle_info}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-2">
                        Creato: {new Date(onboarding.created_at).toLocaleDateString('it-IT')}
                        {onboarding.completed_at && ` • Completato: ${new Date(onboarding.completed_at).toLocaleDateString('it-IT')}`}
                      </p>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyLink(onboarding.unique_link)}
                        data-testid={`copy-link-${onboarding.onboarding_id}`}
                      >
                        <Copy className="w-4 h-4 mr-2" />
                        Copia Link
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(onboarding.unique_link, '_blank')}
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  
                  {/* Checklist Progress */}
                  <div className="mt-4 pt-4 border-t border-border">
                    <p className="text-xs text-muted-foreground mb-2">
                      Checklist ({onboarding.checklist_items.filter(i => i.completed).length}/{onboarding.checklist_items.length})
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {onboarding.checklist_items.map((item, index) => (
                        <span
                          key={index}
                          className={`text-xs px-2 py-1 rounded ${
                            item.completed 
                              ? "bg-success/10 text-success" 
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {item.completed ? "✓" : "○"} {item.item.split(" ").slice(0, 2).join(" ")}...
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
