import { useState, useEffect } from "react";
import { useAuth, API } from "@/App";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { 
  Calculator, 
  Euro,
  CalendarDays,
  TrendingUp,
  AlertTriangle,
  PiggyBank,
  FileText,
  Info
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2
  }).format(amount);
};

const TAX_REGIMES = [
  { value: "forfettario_5", label: "Forfettario 5%", description: "Nuove attività (primi 5 anni)" },
  { value: "forfettario_15", label: "Forfettario 15%", description: "Attività consolidate" },
  { value: "ordinario", label: "Regime Ordinario", description: "Con IVA e IRPEF progressiva" }
];

export const FinancePage = () => {
  const { user } = useAuth();
  const [accruals, setAccruals] = useState([]);
  const [forecast, setForecast] = useState(null);
  const [deadlines, setDeadlines] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Calculator state
  const [calcRevenue, setCalcRevenue] = useState("");
  const [calcRegime, setCalcRegime] = useState(user?.tax_regime || "forfettario_15");
  const [calcPeriod, setCalcPeriod] = useState("monthly");
  const [calcResult, setCalcResult] = useState(null);
  
  // Accrual form state
  const [accrualMonth, setAccrualMonth] = useState(new Date().toISOString().slice(0, 7));
  const [accrualRevenue, setAccrualRevenue] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (user?.tax_regime) {
      setCalcRegime(user.tax_regime);
    }
  }, [user]);

  const fetchData = async () => {
    try {
      const [accrualsRes, forecastRes, deadlinesRes] = await Promise.all([
        axios.get(`${API}/tax/accruals`),
        axios.get(`${API}/tax/forecast`),
        axios.get(`${API}/tax/deadlines`)
      ]);
      setAccruals(accrualsRes.data);
      setForecast(forecastRes.data);
      setDeadlines(deadlinesRes.data.deadlines);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCalculate = async () => {
    if (!calcRevenue || parseFloat(calcRevenue) <= 0) {
      toast.error("Inserisci un fatturato valido");
      return;
    }
    
    try {
      const response = await axios.post(`${API}/tax/calculate`, {
        revenue: parseFloat(calcRevenue),
        tax_regime: calcRegime,
        period: calcPeriod
      });
      setCalcResult(response.data);
    } catch (error) {
      toast.error("Errore nel calcolo");
    }
  };

  const handleSaveAccrual = async () => {
    if (!accrualRevenue || parseFloat(accrualRevenue) <= 0) {
      toast.error("Inserisci un fatturato valido");
      return;
    }
    
    try {
      await axios.post(`${API}/tax/accruals`, {
        month: accrualMonth,
        revenue: parseFloat(accrualRevenue)
      });
      toast.success("Accantonamento salvato!");
      setAccrualRevenue("");
      fetchData();
    } catch (error) {
      toast.error("Errore nel salvataggio");
    }
  };

  const forecastChartData = forecast?.forecast?.map((item) => ({
    month: item.month.slice(5),
    accantonamento: item.total_accrual,
    netto: item.net_income
  })) || [];

  const getRegimeDescription = (regime) => {
    switch (regime) {
      case "forfettario_5":
        return "IRPEF sostitutiva 5% + INPS 26.07% sul 78% del fatturato. Esente IVA.";
      case "forfettario_15":
        return "IRPEF sostitutiva 15% + INPS 26.07% sul 78% del fatturato. Esente IVA.";
      case "ordinario":
        return "IRPEF progressiva (23-43%) + INPS 26.07% + IVA 22% sul fatturato.";
      default:
        return "";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-heading-2 text-primary" data-testid="finance-title">Finanza</h1>
        <p className="text-muted-foreground">Calcola le tasse e pianifica gli accantonamenti</p>
      </div>

      <Tabs defaultValue="calculator" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="calculator" data-testid="tab-calculator">
            <Calculator className="w-4 h-4 mr-2" />
            Calcolatore
          </TabsTrigger>
          <TabsTrigger value="accruals" data-testid="tab-accruals">
            <PiggyBank className="w-4 h-4 mr-2" />
            Accantonamenti
          </TabsTrigger>
          <TabsTrigger value="deadlines" data-testid="tab-deadlines">
            <CalendarDays className="w-4 h-4 mr-2" />
            Scadenze
          </TabsTrigger>
        </TabsList>

        {/* Tax Calculator Tab */}
        <TabsContent value="calculator" className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            {/* Calculator Form */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Calculator className="w-5 h-5 text-secondary" />
                  Calcola Accantonamento Fiscale
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Periodo di Calcolo</Label>
                  <Select value={calcPeriod} onValueChange={setCalcPeriod}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Mensile</SelectItem>
                      <SelectItem value="yearly">Annuale</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="calc_revenue">
                    Fatturato {calcPeriod === "monthly" ? "Mensile" : "Annuale"} (€)
                  </Label>
                  <Input
                    id="calc_revenue"
                    type="number"
                    step="0.01"
                    value={calcRevenue}
                    onChange={(e) => setCalcRevenue(e.target.value)}
                    placeholder={calcPeriod === "monthly" ? "5000" : "60000"}
                    data-testid="calc-revenue-input"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Regime Fiscale</Label>
                  <Select value={calcRegime} onValueChange={setCalcRegime}>
                    <SelectTrigger data-testid="calc-regime-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TAX_REGIMES.map((regime) => (
                        <SelectItem key={regime.value} value={regime.value}>
                          <div>
                            <div>{regime.label}</div>
                            <div className="text-xs text-muted-foreground">{regime.description}</div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Regime Info */}
                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      {getRegimeDescription(calcRegime)}
                    </p>
                  </div>
                </div>
                
                <Button onClick={handleCalculate} className="w-full" data-testid="calc-submit-btn">
                  Calcola
                </Button>
              </CardContent>
            </Card>

            {/* Calculator Results */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="w-5 h-5 text-secondary" />
                  Risultato Calcolo
                </CardTitle>
              </CardHeader>
              <CardContent>
                {calcResult ? (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center py-2 border-b border-border">
                      <span className="text-muted-foreground">
                        Fatturato {calcResult.period === "monthly" ? "Mensile" : "Annuale"}
                      </span>
                      <span className="font-semibold">{formatCurrency(calcResult.revenue)}</span>
                    </div>
                    
                    <div className="flex justify-between items-center py-2 border-b border-border">
                      <div>
                        <span className="text-muted-foreground">IRPEF</span>
                        <p className="text-xs text-muted-foreground">
                          {calcRegime.includes("forfettario") ? "Imposta sostitutiva" : "Progressiva"}
                        </p>
                      </div>
                      <span className="font-semibold text-destructive">- {formatCurrency(calcResult.irpef_amount)}</span>
                    </div>
                    
                    <div className="flex justify-between items-center py-2 border-b border-border">
                      <div>
                        <span className="text-muted-foreground">INPS</span>
                        <p className="text-xs text-muted-foreground">Gestione Separata 26.07%</p>
                      </div>
                      <span className="font-semibold text-destructive">- {formatCurrency(calcResult.inps_amount)}</span>
                    </div>
                    
                    {calcResult.iva_amount > 0 && (
                      <div className="flex justify-between items-center py-2 border-b border-border">
                        <div>
                          <span className="text-muted-foreground">IVA</span>
                          <p className="text-xs text-muted-foreground">22% da versare</p>
                        </div>
                        <span className="font-semibold text-destructive">- {formatCurrency(calcResult.iva_amount)}</span>
                      </div>
                    )}
                    
                    <div className="flex justify-between items-center py-3 bg-destructive/10 px-3 rounded-lg">
                      <span className="font-semibold">Totale da Accantonare</span>
                      <span className="font-bold text-lg text-destructive">{formatCurrency(calcResult.total_accrual)}</span>
                    </div>
                    
                    <div className="flex justify-between items-center py-3 bg-success/10 px-3 rounded-lg">
                      <span className="font-semibold">Netto Disponibile</span>
                      <span className="font-bold text-lg text-success">{formatCurrency(calcResult.net_income)}</span>
                    </div>

                    {/* Yearly Projection for monthly calculations */}
                    {calcResult.period === "monthly" && calcResult.yearly_projection && (
                      <div className="mt-4 p-4 bg-muted/30 rounded-lg">
                        <h4 className="font-semibold mb-3 flex items-center gap-2">
                          <TrendingUp className="w-4 h-4 text-secondary" />
                          Proiezione Annuale
                        </h4>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground">Fatturato</p>
                            <p className="font-semibold">{formatCurrency(calcResult.revenue * 12)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Tasse Annuali</p>
                            <p className="font-semibold text-destructive">{formatCurrency(calcResult.yearly_projection.total_accrual)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Netto Annuale</p>
                            <p className="font-semibold text-success">{formatCurrency(calcResult.yearly_projection.net_income)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">% Tasse/Fatturato</p>
                            <p className="font-semibold">{((calcResult.yearly_projection.total_accrual / (calcResult.revenue * 12)) * 100).toFixed(1)}%</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Calculator className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Inserisci un fatturato per vedere il calcolo</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Forecast Chart */}
          {forecast && forecastChartData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-secondary" />
                  Previsione 6 Mesi
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Basata sul fatturato medio di {formatCurrency(forecast.avg_monthly_revenue)}/mese
                </p>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={forecastChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip 
                      formatter={(value) => formatCurrency(value)}
                      contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
                    />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="netto" 
                      stroke="#1A7A4A" 
                      strokeWidth={2}
                      name="Netto Disponibile"
                    />
                    <Line 
                      type="monotone" 
                      dataKey="accantonamento" 
                      stroke="#C0392B" 
                      strokeWidth={2}
                      name="Da Accantonare"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Accruals Tab */}
        <TabsContent value="accruals" className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            {/* Add Accrual Form */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Euro className="w-5 h-5 text-secondary" />
                  Registra Fatturato Mensile
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="accrual_month">Mese</Label>
                  <Input
                    id="accrual_month"
                    type="month"
                    value={accrualMonth}
                    onChange={(e) => setAccrualMonth(e.target.value)}
                    data-testid="accrual-month-input"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="accrual_revenue">Fatturato del Mese (€)</Label>
                  <Input
                    id="accrual_revenue"
                    type="number"
                    step="0.01"
                    value={accrualRevenue}
                    onChange={(e) => setAccrualRevenue(e.target.value)}
                    placeholder="5000"
                    data-testid="accrual-revenue-input"
                  />
                </div>

                <p className="text-xs text-muted-foreground">
                  Il calcolo userà il regime fiscale dal tuo profilo: {TAX_REGIMES.find(r => r.value === user?.tax_regime)?.label || "Forfettario 15%"}
                </p>
                
                <Button onClick={handleSaveAccrual} className="w-full" data-testid="accrual-submit-btn">
                  Salva e Calcola Accantonamento
                </Button>
              </CardContent>
            </Card>

            {/* Cumulative Balance */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <PiggyBank className="w-5 h-5 text-secondary" />
                  Saldo Cumulativo
                </CardTitle>
              </CardHeader>
              <CardContent>
                {accruals.length > 0 ? (
                  <div className="text-center py-6">
                    <p className="text-4xl font-bold text-primary mb-2">
                      {formatCurrency(accruals[0]?.cumulative_balance || 0)}
                    </p>
                    <p className="text-muted-foreground">Da tenere per le tasse</p>
                  </div>
                ) : (
                  <div className="text-center py-6 text-muted-foreground">
                    <p>Nessun accantonamento registrato</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Accruals History */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Storico Accantonamenti</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-16 bg-muted rounded animate-pulse"></div>
                  ))}
                </div>
              ) : accruals.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">
                  Nessun accantonamento registrato. Inizia registrando il fatturato mensile.
                </p>
              ) : (
                <div className="space-y-3">
                  {accruals.map((accrual) => (
                    <div
                      key={accrual.accrual_id}
                      className="flex flex-col md:flex-row md:items-center justify-between p-4 bg-background rounded-lg border border-border gap-3"
                    >
                      <div>
                        <p className="font-semibold">{accrual.month}</p>
                        <p className="text-sm text-muted-foreground">
                          Fatturato: {formatCurrency(accrual.revenue)}
                        </p>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <div className="text-center">
                          <p className="text-muted-foreground">IRPEF</p>
                          <p className="font-medium">{formatCurrency(accrual.irpef_amount)}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-muted-foreground">INPS</p>
                          <p className="font-medium">{formatCurrency(accrual.inps_amount)}</p>
                        </div>
                        {accrual.iva_amount > 0 && (
                          <div className="text-center">
                            <p className="text-muted-foreground">IVA</p>
                            <p className="font-medium">{formatCurrency(accrual.iva_amount)}</p>
                          </div>
                        )}
                        <div className="text-center">
                          <p className="text-muted-foreground">Totale</p>
                          <p className="font-semibold text-destructive">{formatCurrency(accrual.total_accrual)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Deadlines Tab */}
        <TabsContent value="deadlines" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-warning" />
                Scadenze Fiscali - {TAX_REGIMES.find(r => r.value === user?.tax_regime)?.label || "Forfettario"}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Scadenze basate sul tuo regime fiscale (Agenzia delle Entrate)
              </p>
            </CardHeader>
            <CardContent>
              {deadlines.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">
                  Nessuna scadenza nei prossimi 120 giorni
                </p>
              ) : (
                <div className="space-y-4">
                  {deadlines.map((deadline, index) => (
                    <div
                      key={index}
                      className={`flex items-center justify-between p-4 rounded-lg border ${
                        deadline.urgency === "red" 
                          ? "bg-destructive/10 border-destructive/30" 
                          : deadline.urgency === "yellow"
                          ? "bg-warning/10 border-warning/30"
                          : "bg-success/10 border-success/30"
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-3 h-3 rounded-full ${
                          deadline.urgency === "red" 
                            ? "bg-destructive" 
                            : deadline.urgency === "yellow"
                            ? "bg-warning"
                            : "bg-success"
                        }`}></div>
                        <div>
                          <p className="font-semibold">{deadline.description}</p>
                          <p className="text-sm text-muted-foreground">{deadline.date}</p>
                        </div>
                      </div>
                      <span className={`text-sm font-medium px-3 py-1 rounded-full ${
                        deadline.urgency === "red" 
                          ? "bg-destructive text-white" 
                          : deadline.urgency === "yellow"
                          ? "bg-warning text-black"
                          : "bg-success text-white"
                      }`}>
                        {deadline.days_until === 0 ? "Oggi!" : `${deadline.days_until} giorni`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
