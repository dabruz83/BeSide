import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { API } from "@/App";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { 
  ClipboardList, 
  CheckCircle2,
  Upload,
  Car,
  User
} from "lucide-react";

export const ClientOnboardingPage = () => {
  const { token } = useParams();
  const [onboarding, setOnboarding] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checklist, setChecklist] = useState([]);

  const fetchOnboarding = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/onboarding/client/${token}`);
      setOnboarding(response.data);
      setChecklist(response.data.checklist_items);
    } catch (error) {
      console.error("Error fetching onboarding:", error);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchOnboarding();
  }, [fetchOnboarding]);

  const handleChecklistChange = (index) => {
    const newChecklist = [...checklist];
    newChecklist[index] = {
      ...newChecklist[index],
      completed: !newChecklist[index].completed
    };
    setChecklist(newChecklist);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.put(`${API}/onboarding/client/${token}`, {
        checklist_items: checklist
      });
      toast.success("Checklist salvata con successo!");
      fetchOnboarding();
    } catch (error) {
      toast.error("Errore nel salvataggio");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Caricamento...</p>
        </div>
      </div>
    );
  }

  if (!onboarding) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="py-8 text-center">
            <ClipboardList className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Link Non Valido</h2>
            <p className="text-muted-foreground">
              Questo link di onboarding non è valido o è scaduto. 
              Contatta l'installatore per ricevere un nuovo link.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const allCompleted = checklist.every(item => item.completed);
  const completedCount = checklist.filter(item => item.completed).length;

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-2xl font-bold text-primary mb-2" style={{ fontFamily: 'Barlow, sans-serif' }}>
            BESIDE
          </h1>
          <p className="text-muted-foreground">Checklist Pre-Lavoro</p>
        </div>

        {/* Client Info Card */}
        <Card>
          <CardContent className="py-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="font-semibold">{onboarding.client_name}</p>
                <p className="text-sm text-muted-foreground">{onboarding.client_email}</p>
              </div>
            </div>
            {onboarding.vehicle_info && (
              <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border">
                <Car className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">{onboarding.vehicle_info}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Status Card */}
        {onboarding.status === "complete" ? (
          <Card className="bg-success/10 border-success/30">
            <CardContent className="py-6 text-center">
              <CheckCircle2 className="w-12 h-12 text-success mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-success mb-2">Onboarding Completato!</h2>
              <p className="text-muted-foreground">
                Grazie per aver completato la checklist. L'installatore è stato notificato.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Progress */}
            <Card>
              <CardContent className="py-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Progresso</span>
                  <span className="text-sm text-muted-foreground">{completedCount}/{checklist.length}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary rounded-full transition-all duration-300"
                    style={{ width: `${(completedCount / checklist.length) * 100}%` }}
                  ></div>
                </div>
              </CardContent>
            </Card>

            {/* Checklist */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <ClipboardList className="w-5 h-5 text-secondary" />
                  Checklist da Completare
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {checklist.map((item, index) => (
                  <div
                    key={index}
                    className={`flex items-start gap-4 p-4 rounded-lg border transition-colors ${
                      item.completed 
                        ? "bg-success/5 border-success/30" 
                        : "bg-background border-border hover:border-primary/50"
                    }`}
                  >
                    <Checkbox
                      checked={item.completed}
                      onCheckedChange={() => handleChecklistChange(index)}
                      className="mt-1"
                      data-testid={`checklist-item-${index}`}
                    />
                    <div className="flex-1">
                      <p className={`font-medium ${item.completed ? "text-success line-through" : ""}`}>
                        {item.item}
                      </p>
                      {item.item.includes("Foto") && !item.completed && (
                        <div className="mt-2">
                          <Button variant="outline" size="sm" className="text-xs">
                            <Upload className="w-3 h-3 mr-1" />
                            Carica Foto
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Save Button */}
            <Button 
              onClick={handleSave} 
              className="w-full" 
              size="lg"
              disabled={saving}
              data-testid="save-checklist-btn"
            >
              {saving ? "Salvataggio..." : allCompleted ? "Completa Onboarding" : "Salva Progresso"}
            </Button>
          </>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground">
          Powered by BESIDE • Gestione Installatori
        </p>
      </div>
    </div>
  );
};
