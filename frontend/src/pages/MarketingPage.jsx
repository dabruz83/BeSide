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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { 
  Megaphone, 
  TrendingUp,
  Users,
  Clock,
  Euro,
  Plus,
  Lightbulb,
  Sparkles,
  Target,
  MessageSquare,
  Video,
  Send,
  Loader2,
  Copy,
  ChevronRight
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2
  }).format(amount);
};

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

const CHART_COLORS = ["#1E3A5F", "#2E86AB", "#1A7A4A", "#F39C12", "#C0392B", "#8E44AD", "#27AE60", "#E74C3C", "#3498DB"];

const AI_STEPS = [
  { id: "bacino_utenza", label: "Analizza Bacino", icon: Target, description: "Analizza il tuo mercato locale" },
  { id: "trova_argomenti", label: "Trova Argomenti", icon: Lightbulb, description: "Scopri temi per i contenuti" },
  { id: "pain_points", label: "Pain Points", icon: Users, description: "Identifica i problemi dei clienti" },
  { id: "genera_idea", label: "Genera Idea", icon: Sparkles, description: "Crea un'idea per il contenuto" },
  { id: "sviluppo_testo", label: "Scrivi Testo", icon: MessageSquare, description: "Sviluppa il copy completo" },
  { id: "sviluppo_video", label: "Script Video", icon: Video, description: "Crea lo script per video/reel" }
];

export const MarketingPage = () => {
  const [leadStats, setLeadStats] = useState([]);
  const [insight, setInsight] = useState(null);
  const [efforts, setEfforts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    month: new Date().toISOString().slice(0, 7),
    channel: "",
    hours_invested: ""
  });

  // AI Content State
  const [aiStep, setAiStep] = useState("bacino_utenza");
  const [aiInput, setAiInput] = useState("");
  const [aiContext, setAiContext] = useState({});
  const [aiResponse, setAiResponse] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiHistory, setAiHistory] = useState([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [statsRes, effortsRes] = await Promise.all([
        axios.get(`${API}/marketing/lead-sources`),
        axios.get(`${API}/marketing/efforts`)
      ]);
      setLeadStats(statsRes.data.lead_sources);
      setInsight(statsRes.data.insight);
      setEfforts(effortsRes.data);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/marketing/efforts`, {
        ...formData,
        hours_invested: parseFloat(formData.hours_invested) || 0
      });
      toast.success("Ore marketing salvate!");
      setDialogOpen(false);
      setFormData({
        month: new Date().toISOString().slice(0, 7),
        channel: "",
        hours_invested: ""
      });
      fetchData();
    } catch (error) {
      toast.error("Errore nel salvataggio");
    }
  };

  const handleAIGenerate = async () => {
    if (!aiInput.trim() && aiStep === "bacino_utenza") {
      toast.error("Inserisci la tua zona/città");
      return;
    }

    setAiLoading(true);
    try {
      const response = await axios.post(`${API}/marketing/ai/generate`, {
        step: aiStep,
        context: aiContext,
        user_input: aiInput
      });
      
      setAiResponse(response.data.content);
      
      // Update context with this step's info
      setAiContext(prev => ({
        ...prev,
        [aiStep]: {
          input: aiInput,
          response: response.data.content
        }
      }));
      
      // Add to history
      setAiHistory(prev => [...prev, {
        step: aiStep,
        input: aiInput,
        response: response.data.content,
        timestamp: new Date().toISOString()
      }]);
      
      toast.success("Contenuto generato!");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Errore nella generazione");
    } finally {
      setAiLoading(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success("Copiato negli appunti!");
  };

  const goToNextStep = () => {
    const currentIndex = AI_STEPS.findIndex(s => s.id === aiStep);
    if (currentIndex < AI_STEPS.length - 1) {
      setAiStep(AI_STEPS[currentIndex + 1].id);
      setAiInput("");
      setAiResponse("");
    }
  };

  const getSourceLabel = (source) => LEAD_SOURCES.find(s => s.value === source)?.label || source;

  const pieChartData = leadStats.map((stat, index) => ({
    name: getSourceLabel(stat.source),
    value: stat.total_revenue,
    percentage: stat.percentage,
    fill: CHART_COLORS[index % CHART_COLORS.length]
  }));

  const roiChartData = leadStats.map((stat, index) => ({
    name: getSourceLabel(stat.source),
    roi: stat.roi,
    fill: CHART_COLORS[index % CHART_COLORS.length]
  }));

  const getStepPlaceholder = (step) => {
    switch (step) {
      case "bacino_utenza": return "Es: Milano nord, zona Monza-Brianza";
      case "trova_argomenti": return "Es: PPF per auto sportive, manutenzione wrap";
      case "pain_points": return "Es: Preoccupazioni sui costi, durata del prodotto";
      case "genera_idea": return "Es: Video comparativo PPF vs wrap";
      case "sviluppo_testo": return "Descrivi l'idea da sviluppare...";
      case "sviluppo_video": return "Descrivi il video che vuoi creare...";
      default: return "";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-heading-2 text-primary" data-testid="marketing-title">Marketing</h1>
          <p className="text-muted-foreground">Analizza ROI e crea contenuti con l'AI</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="add-effort-btn">
              <Plus className="w-4 h-4 mr-2" />
              Registra Ore
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Registra Ore Marketing</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Mese</Label>
                <Input
                  type="month"
                  value={formData.month}
                  onChange={(e) => setFormData({ ...formData, month: e.target.value })}
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label>Canale</Label>
                <Select
                  value={formData.channel}
                  onValueChange={(value) => setFormData({ ...formData, channel: value })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona canale" />
                  </SelectTrigger>
                  <SelectContent>
                    {LEAD_SOURCES.map((source) => (
                      <SelectItem key={source.value} value={source.value}>{source.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>Ore Investite</Label>
                <Input
                  type="number"
                  step="0.5"
                  value={formData.hours_invested}
                  onChange={(e) => setFormData({ ...formData, hours_invested: e.target.value })}
                  placeholder="4"
                  required
                />
              </div>
              
              <Button type="submit" className="w-full">
                Salva
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="analytics" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="analytics">
            <TrendingUp className="w-4 h-4 mr-2" />
            Analytics & ROI
          </TabsTrigger>
          <TabsTrigger value="ai_content">
            <Sparkles className="w-4 h-4 mr-2" />
            Genera Contenuti AI
          </TabsTrigger>
        </TabsList>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-6">
          {/* Insight Card */}
          {insight && (
            <Card className="bg-secondary/10 border-secondary/30">
              <CardContent className="py-4">
                <div className="flex items-start gap-3">
                  <Lightbulb className="w-5 h-5 text-secondary flex-shrink-0 mt-0.5" />
                  <p className="text-sm font-medium">{insight}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Charts */}
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Euro className="w-5 h-5 text-secondary" />
                  Fatturato per Fonte
                </CardTitle>
              </CardHeader>
              <CardContent>
                {pieChartData.length === 0 ? (
                  <div className="h-64 flex items-center justify-center text-muted-foreground">
                    <p>Nessun dato disponibile</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={pieChartData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ percentage }) => `${percentage.toFixed(0)}%`}
                        outerRadius={80}
                        dataKey="value"
                      >
                        {pieChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => formatCurrency(value)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-secondary" />
                  ROI per Canale (€/ora)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {roiChartData.length === 0 ? (
                  <div className="h-64 flex items-center justify-center text-muted-foreground">
                    <p>Registra le ore marketing per vedere il ROI</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={roiChartData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                      <Tooltip 
                        formatter={(value) => [`${formatCurrency(value)}/ora`, "ROI"]}
                      />
                      <Bar dataKey="roi" radius={[0, 4, 4, 0]}>
                        {roiChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Lead Sources Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Dettaglio Fonti Lead</CardTitle>
            </CardHeader>
            <CardContent>
              {leadStats.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">
                  Nessun dato. Aggiungi lavori con fonti lead per vedere le statistiche.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-3 px-2 text-sm font-semibold">Fonte</th>
                        <th className="text-center py-3 px-2 text-sm font-semibold">Clienti</th>
                        <th className="text-right py-3 px-2 text-sm font-semibold">Fatturato</th>
                        <th className="text-right py-3 px-2 text-sm font-semibold">Ore</th>
                        <th className="text-right py-3 px-2 text-sm font-semibold">ROI</th>
                        <th className="text-right py-3 px-2 text-sm font-semibold">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leadStats.map((stat, index) => (
                        <tr key={stat.source} className="border-b border-border/50">
                          <td className="py-3 px-2">
                            <div className="flex items-center gap-2">
                              <div 
                                className="w-3 h-3 rounded-full" 
                                style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                              />
                              {getSourceLabel(stat.source)}
                            </div>
                          </td>
                          <td className="text-center py-3 px-2">{stat.client_count}</td>
                          <td className="text-right py-3 px-2 font-medium">{formatCurrency(stat.total_revenue)}</td>
                          <td className="text-right py-3 px-2">{stat.total_hours}h</td>
                          <td className="text-right py-3 px-2 font-semibold text-success">{formatCurrency(stat.roi)}</td>
                          <td className="text-right py-3 px-2">{stat.percentage.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI Content Tab */}
        <TabsContent value="ai_content" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-secondary" />
                Generatore Contenuti Marketing
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Segui il percorso guidato per creare contenuti efficaci per i social
              </p>
            </CardHeader>
            <CardContent>
              {/* Steps Navigation */}
              <div className="flex flex-wrap gap-2 mb-6">
                {AI_STEPS.map((step, index) => (
                  <Button
                    key={step.id}
                    variant={aiStep === step.id ? "default" : "outline"}
                    size="sm"
                    onClick={() => { setAiStep(step.id); setAiResponse(""); }}
                    className="flex items-center gap-2"
                  >
                    <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-xs">
                      {index + 1}
                    </span>
                    <step.icon className="w-4 h-4" />
                    <span className="hidden sm:inline">{step.label}</span>
                  </Button>
                ))}
              </div>

              {/* Current Step Info */}
              <div className="p-4 bg-muted/50 rounded-lg mb-4">
                <h3 className="font-semibold flex items-center gap-2">
                  {AI_STEPS.find(s => s.id === aiStep)?.icon && (
                    <span className="text-secondary">
                      {(() => { const Icon = AI_STEPS.find(s => s.id === aiStep)?.icon; return Icon ? <Icon className="w-5 h-5" /> : null; })()}
                    </span>
                  )}
                  {AI_STEPS.find(s => s.id === aiStep)?.label}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {AI_STEPS.find(s => s.id === aiStep)?.description}
                </p>
              </div>

              {/* Input Area */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Il tuo input</Label>
                  <Textarea
                    value={aiInput}
                    onChange={(e) => setAiInput(e.target.value)}
                    placeholder={getStepPlaceholder(aiStep)}
                    rows={3}
                  />
                </div>

                <Button 
                  onClick={handleAIGenerate} 
                  disabled={aiLoading}
                  className="w-full"
                >
                  {aiLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Generazione in corso...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Genera con AI
                    </>
                  )}
                </Button>

                {/* Response Area */}
                {aiResponse && (
                  <div className="mt-6 p-4 bg-background border border-border rounded-lg">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold">Risultato</h4>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyToClipboard(aiResponse)}
                        >
                          <Copy className="w-4 h-4 mr-1" />
                          Copia
                        </Button>
                        {AI_STEPS.findIndex(s => s.id === aiStep) < AI_STEPS.length - 1 && (
                          <Button
                            size="sm"
                            onClick={goToNextStep}
                          >
                            Prossimo Step
                            <ChevronRight className="w-4 h-4 ml-1" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="prose prose-sm max-w-none whitespace-pre-wrap text-sm">
                      {aiResponse}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* AI History */}
          {aiHistory.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Storico Generazioni</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {aiHistory.slice(-5).reverse().map((item, index) => (
                    <div
                      key={index}
                      className="p-3 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted transition-colors"
                      onClick={() => copyToClipboard(item.response)}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium">
                          {AI_STEPS.find(s => s.id === item.step)?.label}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(item.timestamp).toLocaleTimeString('it-IT')}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {item.response.substring(0, 100)}...
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};
