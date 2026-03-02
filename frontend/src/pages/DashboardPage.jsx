import { useState, useEffect } from "react";
import { useAuth, API } from "@/App";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Euro, 
  TrendingUp, 
  TrendingDown,
  Wrench, 
  Users, 
  CalendarDays,
  Plus,
  ArrowRight,
  AlertTriangle
} from "lucide-react";
import { Link } from "react-router-dom";

// Format currency in Italian style
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2
  }).format(amount);
};

// Format job type labels
const JOB_TYPE_LABELS = {
  ppf_full: "PPF Completo",
  ppf_partial: "PPF Parziale",
  wrap_decorative: "Wrap Decorativo",
  wrap_commercial: "Wrap Commerciale",
  tint: "Oscuramento Vetri",
  upholstery: "Tappezzeria"
};

// Format lead source labels
const LEAD_SOURCE_LABELS = {
  passaparola: "Passaparola",
  instagram: "Instagram",
  facebook: "Facebook",
  google_search: "Google Search",
  google_maps: "Google Maps",
  partnership_carrozzerie: "Partnership Carrozzerie",
  fiere: "Fiere",
  website: "Sito Web",
  altro: "Altro"
};

export const DashboardPage = () => {
  const { user } = useAuth();
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMetrics();
  }, []);

  const fetchMetrics = async () => {
    try {
      const response = await axios.get(`${API}/dashboard/metrics`, {
        withCredentials: true
      });
      setMetrics(response.data);
    } catch (error) {
      console.error("Error fetching metrics:", error);
    } finally {
      setLoading(false);
    }
  };

  const getCashFlowColor = (status) => {
    switch (status) {
      case "green": return "bg-success text-white";
      case "yellow": return "bg-warning text-black";
      case "red": return "bg-destructive text-white";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getCashFlowLabel = (status) => {
    switch (status) {
      case "green": return "Positivo";
      case "yellow": return "Attenzione";
      case "red": return "Critico";
      default: return "N/D";
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-8 w-48 bg-muted rounded animate-pulse"></div>
            <div className="h-4 w-32 bg-muted rounded mt-2 animate-pulse"></div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-4 w-24 bg-muted rounded mb-4"></div>
                <div className="h-8 w-32 bg-muted rounded"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-heading-2 text-primary" data-testid="dashboard-title">
            Ciao, {user?.business_name || user?.name || "Installatore"}!
          </h1>
          <p className="text-muted-foreground">Ecco il riepilogo della tua attività</p>
        </div>
        <Link to="/jobs">
          <Button data-testid="add-job-btn">
            <Plus className="w-4 h-4 mr-2" />
            Nuovo Lavoro
          </Button>
        </Link>
      </div>

      {/* Main KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Tax Reserve */}
        <Card className="card-metric stagger-item" data-testid="tax-reserve-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-label flex items-center gap-2">
              <Euro className="w-4 h-4" />
              Accantonamento Fiscale
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-primary">
              {formatCurrency(metrics?.tax_reserve_balance || 0)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Da accantonare per le tasse</p>
          </CardContent>
        </Card>

        {/* Cash Flow Status */}
        <Card className="card-metric stagger-item" data-testid="cash-flow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-label flex items-center gap-2">
              {metrics?.cash_flow_status === "green" ? (
                <TrendingUp className="w-4 h-4" />
              ) : (
                <TrendingDown className="w-4 h-4" />
              )}
              Stato Cash Flow
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getCashFlowColor(metrics?.cash_flow_status)}`}>
              {getCashFlowLabel(metrics?.cash_flow_status)}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Margine medio: {metrics?.average_profit_margin?.toFixed(1) || 0}%
            </p>
          </CardContent>
        </Card>

        {/* Most Profitable Job */}
        <Card className="card-metric stagger-item" data-testid="profitable-job-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-label flex items-center gap-2">
              <Wrench className="w-4 h-4" />
              Lavoro Più Profittevole
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold text-primary">
              {metrics?.most_profitable_job_type 
                ? JOB_TYPE_LABELS[metrics.most_profitable_job_type] || metrics.most_profitable_job_type
                : "Nessun dato"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Basato sui margini</p>
          </CardContent>
        </Card>

        {/* Top Lead Source */}
        <Card className="card-metric stagger-item" data-testid="lead-source-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-label flex items-center gap-2">
              <Users className="w-4 h-4" />
              Top Lead Source
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold text-primary">
              {metrics?.top_lead_source 
                ? LEAD_SOURCE_LABELS[metrics.top_lead_source] || metrics.top_lead_source
                : "Nessun dato"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Fonte clienti migliore</p>
          </CardContent>
        </Card>
      </div>

      {/* Secondary Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Monthly Stats */}
        <Card className="stagger-item" data-testid="monthly-stats-card">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-secondary" />
              Questo Mese
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Lavori completati</span>
              <span className="font-semibold text-lg">{metrics?.total_jobs_this_month || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Fatturato</span>
              <span className="font-semibold text-lg">{formatCurrency(metrics?.total_revenue_this_month || 0)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Margine medio</span>
              <span className="font-semibold text-lg">{metrics?.average_profit_margin?.toFixed(1) || 0}%</span>
            </div>
            <Link to="/jobs">
              <Button variant="outline" className="w-full mt-2">
                Vedi tutti i lavori
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Tax Deadlines */}
        <Card className="stagger-item" data-testid="tax-deadlines-card">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-warning" />
              Prossime Scadenze Fiscali
            </CardTitle>
          </CardHeader>
          <CardContent>
            {metrics?.upcoming_tax_deadlines && metrics.upcoming_tax_deadlines.length > 0 ? (
              <div className="space-y-3">
                {metrics.upcoming_tax_deadlines.slice(0, 4).map((deadline, index) => (
                  <div
                    key={index}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      deadline.urgency === "red" 
                        ? "bg-destructive/10 border-destructive/30" 
                        : deadline.urgency === "yellow"
                        ? "bg-warning/10 border-warning/30"
                        : "bg-success/10 border-success/30"
                    }`}
                  >
                    <div>
                      <p className="font-medium text-sm">{deadline.description}</p>
                      <p className="text-xs text-muted-foreground">{deadline.date}</p>
                    </div>
                    <span className={`text-xs font-medium px-2 py-1 rounded ${
                      deadline.urgency === "red" 
                        ? "bg-destructive text-white" 
                        : deadline.urgency === "yellow"
                        ? "bg-warning text-black"
                        : "bg-success text-white"
                    }`}>
                      {deadline.days_until} giorni
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-4">
                Nessuna scadenza nei prossimi 90 giorni
              </p>
            )}
            <Link to="/finance">
              <Button variant="outline" className="w-full mt-4">
                Vai alla sezione Finanza
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card className="stagger-item">
        <CardHeader>
          <CardTitle className="text-lg">Azioni Rapide</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Link to="/jobs" className="w-full">
              <Button variant="outline" className="w-full h-auto py-4 flex-col gap-2">
                <Plus className="w-5 h-5" />
                <span className="text-xs">Nuovo Lavoro</span>
              </Button>
            </Link>
            <Link to="/finance" className="w-full">
              <Button variant="outline" className="w-full h-auto py-4 flex-col gap-2">
                <Euro className="w-5 h-5" />
                <span className="text-xs">Calcola Tasse</span>
              </Button>
            </Link>
            <Link to="/onboarding" className="w-full">
              <Button variant="outline" className="w-full h-auto py-4 flex-col gap-2">
                <Users className="w-5 h-5" />
                <span className="text-xs">Nuovo Cliente</span>
              </Button>
            </Link>
            <Link to="/marketing" className="w-full">
              <Button variant="outline" className="w-full h-auto py-4 flex-col gap-2">
                <TrendingUp className="w-5 h-5" />
                <span className="text-xs">Vedi ROI</span>
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
