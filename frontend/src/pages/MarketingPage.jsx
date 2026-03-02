import { useState, useEffect } from "react";
import { API } from "@/App";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { 
  Megaphone, 
  TrendingUp,
  Users,
  Clock,
  Euro,
  Plus,
  Lightbulb
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

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [statsRes, effortsRes] = await Promise.all([
        axios.get(`${API}/marketing/lead-sources`, { withCredentials: true }),
        axios.get(`${API}/marketing/efforts`, { withCredentials: true })
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
      }, { withCredentials: true });
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-heading-2 text-primary" data-testid="marketing-title">Marketing</h1>
          <p className="text-muted-foreground">Analizza le fonti dei tuoi clienti e il ROI</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="add-effort-btn">
              <Plus className="w-4 h-4 mr-2" />
              Registra Ore Marketing
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
                  data-testid="effort-month-input"
                />
              </div>
              
              <div className="space-y-2">
                <Label>Canale</Label>
                <Select
                  value={formData.channel}
                  onValueChange={(value) => setFormData({ ...formData, channel: value })}
                  required
                >
                  <SelectTrigger data-testid="effort-channel-select">
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
                  data-testid="effort-hours-input"
                />
              </div>
              
              <Button type="submit" className="w-full" data-testid="effort-submit-btn">
                Salva
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

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
        {/* Revenue by Source Pie Chart */}
        <Card data-testid="revenue-pie-chart">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Euro className="w-5 h-5 text-secondary" />
              Fatturato per Fonte
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-64 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : pieChartData.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Nessun dato. Aggiungi lavori con fonti lead per vedere le statistiche.</p>
                </div>
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

        {/* ROI by Source Bar Chart */}
        <Card data-testid="roi-bar-chart">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-secondary" />
              ROI per Canale (€/ora)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-64 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : roiChartData.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Registra le ore di marketing per vedere il ROI.</p>
                </div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={roiChartData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                  <Tooltip 
                    formatter={(value) => [`${formatCurrency(value)}/ora`, "ROI"]}
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
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
          <CardTitle className="text-lg flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-secondary" />
            Dettaglio Fonti Lead
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-muted rounded animate-pulse"></div>
              ))}
            </div>
          ) : leadStats.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">
              Nessun dato disponibile. Aggiungi lavori con fonti lead per vedere le statistiche.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-2 text-sm font-semibold text-muted-foreground">Fonte</th>
                    <th className="text-center py-3 px-2 text-sm font-semibold text-muted-foreground">Clienti</th>
                    <th className="text-right py-3 px-2 text-sm font-semibold text-muted-foreground">Fatturato</th>
                    <th className="text-right py-3 px-2 text-sm font-semibold text-muted-foreground">Ore</th>
                    <th className="text-right py-3 px-2 text-sm font-semibold text-muted-foreground">ROI (€/ora)</th>
                    <th className="text-right py-3 px-2 text-sm font-semibold text-muted-foreground">%</th>
                  </tr>
                </thead>
                <tbody>
                  {leadStats.map((stat, index) => (
                    <tr key={stat.source} className="border-b border-border/50 hover:bg-muted/50">
                      <td className="py-3 px-2">
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                          ></div>
                          <span className="font-medium">{getSourceLabel(stat.source)}</span>
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

      {/* Marketing Efforts History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="w-5 h-5 text-secondary" />
            Storico Ore Marketing
          </CardTitle>
        </CardHeader>
        <CardContent>
          {efforts.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">
              Nessuna ora di marketing registrata. Inizia a tracciare il tempo investito nei vari canali.
            </p>
          ) : (
            <div className="space-y-3">
              {efforts.slice(0, 10).map((effort) => (
                <div
                  key={effort.effort_id}
                  className="flex items-center justify-between p-3 bg-background rounded-lg border border-border"
                >
                  <div>
                    <p className="font-medium">{getSourceLabel(effort.channel)}</p>
                    <p className="text-sm text-muted-foreground">{effort.month}</p>
                  </div>
                  <span className="font-semibold">{effort.hours_invested}h</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
