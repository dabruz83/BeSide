import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { API } from "@/App";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { 
  Plus, 
  Wrench, 
  Euro,
  Trash2,
  BarChart3,
  FileText,
  Send,
  Copy,
  ExternalLink,
  CheckCircle2,
  Clock,
  XCircle
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
  const [searchParams] = useSearchParams();
  const [jobs, setJobs] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("lavori");
  
  const [formData, setFormData] = useState({
    client_name: "",
    client_email: "",
    job_type: "",
    vehicle_type: "",
    vehicle_info: "",
    quote_amount: "",
    hours_worked: "",
    materials_cost: "",
    waste_percentage: "",
    lead_source: "",
    notes: "",
    is_quote: searchParams.get("mode") === "quote"
  });

  useEffect(() => {
    fetchJobs();
    fetchAnalytics();
  }, []);

  useEffect(() => {
    if (searchParams.get("mode") === "quote") {
      setFormData(prev => ({ ...prev, is_quote: true }));
      setActiveTab("preventivi");
      setDialogOpen(true);
    }
  }, [searchParams]);

  const fetchJobs = async () => {
    try {
      const response = await axios.get(`${API}/jobs`);
      setJobs(response.data);
    } catch (error) {
      console.error("Error fetching jobs:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAnalytics = async () => {
    try {
      const response = await axios.get(`${API}/jobs/analytics/profitability`);
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
      
      const response = await axios.post(`${API}/jobs`, payload);
      
      if (formData.is_quote && response.data.quote_link) {
        toast.success("Preventivo creato! Link copiato.");
        navigator.clipboard.writeText(response.data.quote_link);
      } else {
        toast.success("Lavoro aggiunto con successo!");
      }
      
      setDialogOpen(false);
      setFormData({
        client_name: "",
        client_email: "",
        job_type: "",
        vehicle_type: "",
        vehicle_info: "",
        quote_amount: "",
        hours_worked: "",
        materials_cost: "",
        waste_percentage: "",
        lead_source: "",
        notes: "",
        is_quote: false
      });
      fetchJobs();
      fetchAnalytics();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Errore nell'operazione");
    }
  };

  const handleDelete = async (jobId) => {
    if (!confirm("Sei sicuro di voler eliminare?")) return;
    
    try {
      await axios.delete(`${API}/jobs/${jobId}`);
      toast.success("Eliminato");
      fetchJobs();
      fetchAnalytics();
    } catch (error) {
      toast.error("Errore nell'eliminazione");
    }
  };

  const copyQuoteLink = (link) => {
    navigator.clipboard.writeText(link);
    toast.success("Link copiato!");
  };

  const getJobTypeLabel = (type) => JOB_TYPES.find(j => j.value === type)?.label || type;
  const getVehicleTypeLabel = (type) => VEHICLE_TYPES.find(v => v.value === type)?.label || type;

  const chartDataByJobType = analytics?.by_job_type?.map((item, index) => ({
    name: getJobTypeLabel(item._id),
    margin: item.avg_margin?.toFixed(1) || 0,
    fill: CHART_COLORS[index % CHART_COLORS.length]
  })) || [];

  const completedJobs = jobs.filter(j => !j.is_quote);
  const quotes = jobs.filter(j => j.is_quote);

  const getQuoteStatusBadge = (status) => {
    switch (status) {
      case "accepted":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-success/10 text-success">
            <CheckCircle2 className="w-3 h-3" />
            Accettato
          </span>
        );
      case "rejected":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-destructive/10 text-destructive">
            <XCircle className="w-3 h-3" />
            Rifiutato
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-warning/10 text-warning">
            <Clock className="w-3 h-3" />
            In attesa
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-heading-2 text-primary" data-testid="jobs-title">Lavori e Preventivi</h1>
          <p className="text-muted-foreground">Gestisci lavori, preventivi e analizza la profittabilità</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="add-job-dialog-btn">
              <Plus className="w-4 h-4 mr-2" />
              Nuovo
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{formData.is_quote ? "Nuovo Preventivo" : "Nuovo Lavoro"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Toggle Preventivo/Lavoro */}
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <Label htmlFor="is_quote" className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Crea come Preventivo
                </Label>
                <Switch
                  id="is_quote"
                  checked={formData.is_quote}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_quote: checked })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="client_name">Nome Cliente *</Label>
                  <Input
                    id="client_name"
                    value={formData.client_name}
                    onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
                    placeholder="Mario Rossi"
                    required
                    data-testid="job-client-input"
                  />
                </div>
                
                {formData.is_quote && (
                  <div className="space-y-2">
                    <Label htmlFor="client_email">Email Cliente</Label>
                    <Input
                      id="client_email"
                      type="email"
                      value={formData.client_email}
                      onChange={(e) => setFormData({ ...formData, client_email: e.target.value })}
                      placeholder="mario@email.it"
                    />
                  </div>
                )}
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

              <div className="space-y-2">
                <Label htmlFor="vehicle_info">Info Veicolo</Label>
                <Input
                  id="vehicle_info"
                  value={formData.vehicle_info}
                  onChange={(e) => setFormData({ ...formData, vehicle_info: e.target.value })}
                  placeholder="Es: BMW X5 2023 Nero"
                />
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="quote_amount">Importo (€) *</Label>
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
                
                {!formData.is_quote && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="hours_worked">Ore Lavoro *</Label>
                      <Input
                        id="hours_worked"
                        type="number"
                        step="0.5"
                        value={formData.hours_worked}
                        onChange={(e) => setFormData({ ...formData, hours_worked: e.target.value })}
                        placeholder="8"
                        required={!formData.is_quote}
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
                        required={!formData.is_quote}
                        data-testid="job-materials-input"
                      />
                    </div>
                  </>
                )}
              </div>
              
              {!formData.is_quote && (
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
              )}
              
              <div className="space-y-2">
                <Label htmlFor="notes">Note {formData.is_quote ? "(visibili nel preventivo)" : ""}</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder={formData.is_quote ? "Descrizione del lavoro, condizioni, tempistiche..." : "Note aggiuntive..."}
                  rows={formData.is_quote ? 4 : 2}
                />
              </div>
              
              <Button type="submit" className="w-full" data-testid="job-submit-btn">
                {formData.is_quote ? (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Crea Preventivo
                  </>
                ) : (
                  "Salva Lavoro"
                )}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="lavori" data-testid="tab-lavori">
            <Wrench className="w-4 h-4 mr-2" />
            Lavori ({completedJobs.length})
          </TabsTrigger>
          <TabsTrigger value="preventivi" data-testid="tab-preventivi">
            <FileText className="w-4 h-4 mr-2" />
            Preventivi ({quotes.length})
          </TabsTrigger>
          <TabsTrigger value="analytics" data-testid="tab-analytics">
            <BarChart3 className="w-4 h-4 mr-2" />
            Analytics
          </TabsTrigger>
        </TabsList>

        {/* Lavori Tab */}
        <TabsContent value="lavori" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Lavori Completati</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-20 bg-muted rounded animate-pulse"></div>
                  ))}
                </div>
              ) : completedJobs.length === 0 ? (
                <div className="text-center py-12">
                  <Wrench className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground mb-4">Nessun lavoro registrato</p>
                  <Button onClick={() => { setFormData(prev => ({ ...prev, is_quote: false })); setDialogOpen(true); }}>
                    <Plus className="w-4 h-4 mr-2" />
                    Aggiungi il tuo primo lavoro
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {completedJobs.map((job) => (
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
                          <p className="text-xs text-muted-foreground">Importo</p>
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
        </TabsContent>

        {/* Preventivi Tab */}
        <TabsContent value="preventivi" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Preventivi</CardTitle>
              <Button size="sm" onClick={() => { setFormData(prev => ({ ...prev, is_quote: true })); setDialogOpen(true); }}>
                <Plus className="w-4 h-4 mr-2" />
                Nuovo Preventivo
              </Button>
            </CardHeader>
            <CardContent>
              {quotes.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground mb-4">Nessun preventivo creato</p>
                  <Button onClick={() => { setFormData(prev => ({ ...prev, is_quote: true })); setDialogOpen(true); }}>
                    <Plus className="w-4 h-4 mr-2" />
                    Crea il tuo primo preventivo
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {quotes.map((quote) => (
                    <div
                      key={quote.job_id}
                      className="flex flex-col md:flex-row md:items-center justify-between p-4 bg-background rounded-lg border border-border gap-4"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold">{quote.client_name}</h3>
                          {getQuoteStatusBadge(quote.quote_status)}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {getJobTypeLabel(quote.job_type)} • {getVehicleTypeLabel(quote.vehicle_type)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Creato: {new Date(quote.created_at).toLocaleDateString('it-IT')}
                        </p>
                      </div>
                      
                      <div className="flex items-center gap-4">
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">Importo</p>
                          <p className="font-semibold text-lg">{formatCurrency(quote.quote_amount)}</p>
                        </div>
                        
                        {quote.quote_link && (
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => copyQuoteLink(quote.quote_link)}
                            >
                              <Copy className="w-4 h-4 mr-1" />
                              Copia Link
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => window.open(quote.quote_link, '_blank')}
                            >
                              <ExternalLink className="w-4 h-4" />
                            </Button>
                          </div>
                        )}
                        
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => handleDelete(quote.job_id)}
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
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-4">
          {analytics && chartDataByJobType.length > 0 ? (
            <Card data-testid="profitability-chart">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-secondary" />
                  Profittabilità per Tipo di Lavoro
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
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
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <BarChart3 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">
                  Aggiungi lavori completati per vedere le statistiche di profittabilità
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};
