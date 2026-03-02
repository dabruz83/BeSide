import { useState, useEffect } from "react";
import { API } from "@/App";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { 
  Plus, 
  Wrench, 
  Euro,
  Clock,
  TrendingUp,
  Trash2,
  BarChart3
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2
  }).format(amount);
};

const JOB_TYPES = [
  { value: "ppf_full", label: "PPF Completo" },
  { value: "ppf_partial", label: "PPF Parziale" },
  { value: "wrap_decorative", label: "Wrap Decorativo" },
  { value: "wrap_commercial", label: "Wrap Commerciale" },
  { value: "tint", label: "Oscuramento Vetri" },
  { value: "upholstery", label: "Tappezzeria" }
];

const VEHICLE_TYPES = [
  { value: "sedan", label: "Berlina" },
  { value: "suv", label: "SUV" },
  { value: "van", label: "Van" },
  { value: "truck", label: "Camion" }
];

const LEAD_SOURCES = [
  { value: "passaparola", label: "Passaparola" },
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "google_search", label: "Google Search" },
  { value: "google_maps", label: "Google Maps" },
  { value: "partnership_carrozzerie", label: "Partnership Carrozzerie" },
  { value: "fiere", label: "Fiere" },
  { value: "website", label: "Sito Web" },
  { value: "altro", label: "Altro" }
];

const CHART_COLORS = ["#1E3A5F", "#2E86AB", "#1A7A4A", "#F39C12", "#C0392B", "#8E44AD"];

export const JobsPage = () => {
  const [jobs, setJobs] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    client_name: "",
    job_type: "",
    vehicle_type: "",
    quote_amount: "",
    hours_worked: "",
    materials_cost: "",
    waste_percentage: "",
    lead_source: "",
    notes: ""
  });

  useEffect(() => {
    fetchJobs();
    fetchAnalytics();
  }, []);

  const fetchJobs = async () => {
    try {
      const response = await axios.get(`${API}/jobs`, { withCredentials: true });
      setJobs(response.data);
    } catch (error) {
      console.error("Error fetching jobs:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAnalytics = async () => {
    try {
      const response = await axios.get(`${API}/jobs/analytics/profitability`, { withCredentials: true });
      setAnalytics(response.data);
    } catch (error) {
      console.error("Error fetching analytics:", error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
        quote_amount: parseFloat(formData.quote_amount) || 0,
        hours_worked: parseFloat(formData.hours_worked) || 0,
        materials_cost: parseFloat(formData.materials_cost) || 0,
        waste_percentage: formData.waste_percentage ? parseFloat(formData.waste_percentage) / 100 : null
      };
      
      await axios.post(`${API}/jobs`, payload, { withCredentials: true });
      toast.success("Lavoro aggiunto con successo!");
      setDialogOpen(false);
      setFormData({
        client_name: "",
        job_type: "",
        vehicle_type: "",
        quote_amount: "",
        hours_worked: "",
        materials_cost: "",
        waste_percentage: "",
        lead_source: "",
        notes: ""
      });
      fetchJobs();
      fetchAnalytics();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Errore nell'aggiunta del lavoro");
    }
  };

  const handleDelete = async (jobId) => {
    if (!confirm("Sei sicuro di voler eliminare questo lavoro?")) return;
    
    try {
      await axios.delete(`${API}/jobs/${jobId}`, { withCredentials: true });
      toast.success("Lavoro eliminato");
      fetchJobs();
      fetchAnalytics();
    } catch (error) {
      toast.error("Errore nell'eliminazione");
    }
  };

  const getJobTypeLabel = (type) => JOB_TYPES.find(j => j.value === type)?.label || type;
  const getVehicleTypeLabel = (type) => VEHICLE_TYPES.find(v => v.value === type)?.label || type;

  const chartDataByJobType = analytics?.by_job_type?.map((item, index) => ({
    name: getJobTypeLabel(item._id),
    margin: item.avg_margin?.toFixed(1) || 0,
    fill: CHART_COLORS[index % CHART_COLORS.length]
  })) || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-heading-2 text-primary" data-testid="jobs-title">Lavori</h1>
          <p className="text-muted-foreground">Traccia i tuoi lavori e analizza la profittabilità</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="add-job-dialog-btn">
              <Plus className="w-4 h-4 mr-2" />
              Aggiungi Lavoro
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Nuovo Lavoro</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="client_name">Nome Cliente *</Label>
                <Input
                  id="client_name"
                  value={formData.client_name}
                  onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
                  placeholder="Es: Mario Rossi"
                  required
                  data-testid="job-client-input"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tipo Lavoro *</Label>
                  <Select
                    value={formData.job_type}
                    onValueChange={(value) => setFormData({ ...formData, job_type: value })}
                    required
                  >
                    <SelectTrigger data-testid="job-type-select">
                      <SelectValue placeholder="Seleziona" />
                    </SelectTrigger>
                    <SelectContent>
                      {JOB_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>Tipo Veicolo *</Label>
                  <Select
                    value={formData.vehicle_type}
                    onValueChange={(value) => setFormData({ ...formData, vehicle_type: value })}
                    required
                  >
                    <SelectTrigger data-testid="job-vehicle-select">
                      <SelectValue placeholder="Seleziona" />
                    </SelectTrigger>
                    <SelectContent>
                      {VEHICLE_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="quote_amount">Preventivo (€) *</Label>
                  <Input
                    id="quote_amount"
                    type="number"
                    step="0.01"
                    value={formData.quote_amount}
                    onChange={(e) => setFormData({ ...formData, quote_amount: e.target.value })}
                    placeholder="1500"
                    required
                    data-testid="job-quote-input"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="hours_worked">Ore Lavoro *</Label>
                  <Input
                    id="hours_worked"
                    type="number"
                    step="0.5"
                    value={formData.hours_worked}
                    onChange={(e) => setFormData({ ...formData, hours_worked: e.target.value })}
                    placeholder="8"
                    required
                    data-testid="job-hours-input"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="materials_cost">Materiali (€) *</Label>
                  <Input
                    id="materials_cost"
                    type="number"
                    step="0.01"
                    value={formData.materials_cost}
                    onChange={(e) => setFormData({ ...formData, materials_cost: e.target.value })}
                    placeholder="500"
                    required
                    data-testid="job-materials-input"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="waste_percentage">Scarto % (opzionale)</Label>
                  <Input
                    id="waste_percentage"
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    value={formData.waste_percentage}
                    onChange={(e) => setFormData({ ...formData, waste_percentage: e.target.value })}
                    placeholder="20"
                    data-testid="job-waste-input"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Fonte Lead</Label>
                  <Select
                    value={formData.lead_source}
                    onValueChange={(value) => setFormData({ ...formData, lead_source: value })}
                  >
                    <SelectTrigger data-testid="job-lead-select">
                      <SelectValue placeholder="Seleziona" />
                    </SelectTrigger>
                    <SelectContent>
                      {LEAD_SOURCES.map((source) => (
                        <SelectItem key={source.value} value={source.value}>{source.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="notes">Note</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Note aggiuntive..."
                  rows={2}
                />
              </div>
              
              <Button type="submit" className="w-full" data-testid="job-submit-btn">
                Salva Lavoro
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Analytics Charts */}
      {analytics && chartDataByJobType.length > 0 && (
        <Card data-testid="profitability-chart">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-secondary" />
              Profittabilità per Tipo di Lavoro
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={chartDataByJobType} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" unit="%" />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} />
                <Tooltip 
                  formatter={(value) => [`${value}%`, "Margine Medio"]}
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
                />
                <Bar dataKey="margin" radius={[0, 4, 4, 0]}>
                  {chartDataByJobType.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Jobs List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Ultimi Lavori</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 bg-muted rounded animate-pulse"></div>
              ))}
            </div>
          ) : jobs.length === 0 ? (
            <div className="text-center py-12">
              <Wrench className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground mb-4">Nessun lavoro registrato</p>
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Aggiungi il tuo primo lavoro
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {jobs.map((job) => (
                <div
                  key={job.job_id}
                  className="flex flex-col md:flex-row md:items-center justify-between p-4 bg-background rounded-lg border border-border gap-4"
                  data-testid={`job-item-${job.job_id}`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold">{job.client_name}</h3>
                      <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                        {getJobTypeLabel(job.job_type)}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {getVehicleTypeLabel(job.vehicle_type)} • {new Date(job.completed_date).toLocaleDateString('it-IT')}
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-6">
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">Preventivo</p>
                      <p className="font-semibold">{formatCurrency(job.quote_amount)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">Profitto</p>
                      <p className={`font-semibold ${job.net_profit >= 0 ? "text-success" : "text-destructive"}`}>
                        {formatCurrency(job.net_profit)}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">Margine</p>
                      <p className={`font-semibold ${job.profit_margin >= 30 ? "text-success" : job.profit_margin >= 15 ? "text-warning" : "text-destructive"}`}>
                        {job.profit_margin.toFixed(1)}%
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">€/ora</p>
                      <p className="font-semibold">{formatCurrency(job.hourly_rate)}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(job.job_id)}
                      data-testid={`delete-job-${job.job_id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
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
