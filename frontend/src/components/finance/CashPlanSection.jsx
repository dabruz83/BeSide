import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { API } from "@/App";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  AlertTriangle,
  Banknote,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Copy,
  Edit3,
  PiggyBank,
  Plus,
  Save,
  Trash2,
  WalletCards
} from "lucide-react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

const EMPTY_FORM = {
  month: "",
  data_type: "actual",
  revenue: "",
  fixed_expenses: "",
  variable_expenses: "",
  other_expenses: "",
  taxes_paid: "",
  recommended_tax_reserve: 0,
  notes: ""
};

const FORECAST_METHODS = [
  { value: "manual", label: "Inserimento manuale" },
  { value: "average_3", label: "Media ultimi 3 mesi" },
  { value: "average_6", label: "Media ultimi 6 mesi" },
  { value: "copy_previous", label: "Copia mese precedente" }
];

const formatCurrency = (amount = 0) => new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2
}).format(Number(amount) || 0);

const formatMonth = (month) => {
  if (!month) return "—";
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("it-IT", {
    month: "long",
    year: "numeric"
  }).format(new Date(year, monthNumber - 1, 1));
};

const formatChartMonth = (month) => {
  if (!month) return "";
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("it-IT", {
    month: "short",
    year: "2-digit"
  }).format(new Date(year, monthNumber - 1, 1));
};

const addMonth = (month, amount = 1) => {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year, monthNumber - 1 + amount, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

const readAmount = (value) => value === "" ? 0 : Number(value);

const getErrorMessage = (error, fallback) => error?.response?.data?.detail || fallback;

export const CashPlanSection = () => {
  const [months, setMonths] = useState([]);
  const [summary, setSummary] = useState(null);
  const [recurringDefaults, setRecurringDefaults] = useState({
    revenue: 0,
    fixed_expenses: 0,
    variable_expenses: 0
  });
  const [openingBalance, setOpeningBalance] = useState("0");
  const [activeType, setActiveType] = useState("actual");
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [forecastMethod, setForecastMethod] = useState("manual");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  const fetchCashPlan = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/finance/cash-plan/months`);
      setMonths(response.data.months || []);
      setSummary(response.data.summary || null);
      setRecurringDefaults(response.data.recurring_defaults || {
        revenue: 0,
        fixed_expenses: 0,
        variable_expenses: 0
      });
      setOpeningBalance(String(response.data.opening_balance ?? 0));
    } catch (error) {
      console.error("Error fetching cash plan:", error);
      toast.error(getErrorMessage(error, "Impossibile caricare il piano di cassa"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCashPlan();
  }, [fetchCashPlan]);

  const sortedMonths = useMemo(
    () => [...months].sort((first, second) => first.month.localeCompare(second.month)),
    [months]
  );

  const visibleMonths = useMemo(
    () => sortedMonths.filter((entry) => entry.data_type === activeType),
    [activeType, sortedMonths]
  );

  const chartData = useMemo(
    () => sortedMonths.map((entry) => ({
      ...entry,
      monthLabel: formatChartMonth(entry.month)
    })),
    [sortedMonths]
  );

  const firstForecastLabel = chartData.find((entry) => entry.data_type === "forecast")?.monthLabel;

  const updateForm = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const startNewMonth = (copyPrevious = false) => {
    const previous = visibleMonths[visibleMonths.length - 1] || sortedMonths[sortedMonths.length - 1];
    const currentMonth = new Date().toISOString().slice(0, 7);
    setForm({
      ...EMPTY_FORM,
      month: previous ? addMonth(previous.month) : currentMonth,
      data_type: activeType,
      revenue: copyPrevious ? String(previous?.revenue ?? recurringDefaults.revenue ?? 0) : "",
      fixed_expenses: String(previous?.fixed_expenses ?? recurringDefaults.fixed_expenses ?? 0),
      variable_expenses: copyPrevious ? String(previous?.variable_expenses ?? recurringDefaults.variable_expenses ?? 0) : "",
      other_expenses: copyPrevious && previous ? String(previous.other_expenses || 0) : "",
      taxes_paid: "",
      notes: ""
    });
    setEditingId("new");
  };

  const startEditing = (entry) => {
    setForm({
      month: entry.month,
      data_type: entry.data_type,
      revenue: String(entry.revenue ?? 0),
      fixed_expenses: String(entry.fixed_expenses ?? 0),
      variable_expenses: String(entry.variable_expenses ?? 0),
      other_expenses: String(entry.other_expenses ?? 0),
      taxes_paid: String(entry.taxes_paid ?? 0),
      recommended_tax_reserve: entry.recommended_tax_reserve ?? 0,
      notes: entry.notes || ""
    });
    setEditingId(entry.cash_plan_id);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const saveMonth = async () => {
    const payload = {
      month: form.month,
      data_type: form.data_type,
      revenue: readAmount(form.revenue),
      fixed_expenses: readAmount(form.fixed_expenses),
      variable_expenses: readAmount(form.variable_expenses),
      other_expenses: readAmount(form.other_expenses),
      taxes_paid: readAmount(form.taxes_paid),
      notes: form.notes.trim()
    };
    const amounts = [
      payload.revenue,
      payload.fixed_expenses,
      payload.variable_expenses,
      payload.other_expenses,
      payload.taxes_paid
    ];

    if (!/^\d{4}-\d{2}$/.test(payload.month)) {
      toast.error("Seleziona un mese valido");
      return;
    }
    if (amounts.some((amount) => !Number.isFinite(amount) || amount < 0)) {
      toast.error("Gli importi devono essere numeri uguali o superiori a zero");
      return;
    }

    setSaving(true);
    try {
      if (editingId === "new") {
        await axios.post(`${API}/finance/cash-plan/months`, payload);
      } else {
        await axios.put(`${API}/finance/cash-plan/months/${editingId}`, payload);
      }
      toast.success("Mese salvato nel piano di cassa");
      cancelEditing();
      setActiveType(payload.data_type);
      await fetchCashPlan();
    } catch (error) {
      toast.error(getErrorMessage(error, "Errore durante il salvataggio del mese"));
    } finally {
      setSaving(false);
    }
  };

  const deleteMonth = async (entry) => {
    const confirmed = window.confirm(`Eliminare ${formatMonth(entry.month)} dal piano di cassa?`);
    if (!confirmed) return;

    try {
      await axios.delete(`${API}/finance/cash-plan/months/${entry.cash_plan_id}`);
      if (editingId === entry.cash_plan_id) cancelEditing();
      toast.success("Mese eliminato");
      await fetchCashPlan();
    } catch (error) {
      toast.error(getErrorMessage(error, "Errore durante l'eliminazione del mese"));
    }
  };

  const saveOpeningBalance = async () => {
    const value = Number(openingBalance);
    if (!Number.isFinite(value)) {
      toast.error("Inserisci un saldo iniziale valido");
      return;
    }

    setSaving(true);
    try {
      await axios.put(`${API}/finance/cash-plan/settings`, { opening_balance: value });
      toast.success("Saldo iniziale salvato");
      await fetchCashPlan();
    } catch (error) {
      toast.error(getErrorMessage(error, "Errore durante il salvataggio del saldo iniziale"));
    } finally {
      setSaving(false);
    }
  };

  const generateForecast = async () => {
    if (forecastMethod === "manual") {
      startNewMonth(false);
      return;
    }

    setGenerating(true);
    try {
      const response = await axios.post(`${API}/finance/cash-plan/forecast/generate`, {
        method: forecastMethod,
        months: 6
      });
      toast.success(`${response.data.created_count} mesi previsionali creati`);
      await fetchCashPlan();
    } catch (error) {
      toast.error(getErrorMessage(error, "Impossibile generare la previsione"));
    } finally {
      setGenerating(false);
    }
  };

  const renderEditor = () => (
    <div className="mt-4 border-t border-border pt-4 space-y-4" data-testid="cash-plan-editor">
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="cash_plan_month">Mese e Anno</Label>
          <Input
            id="cash_plan_month"
            type="month"
            value={form.month}
            onChange={(event) => updateForm("month", event.target.value)}
            data-testid="cash-plan-month-input"
          />
        </div>
        <div className="space-y-2">
          <Label>Tipo di Dato</Label>
          <Select value={form.data_type} onValueChange={(value) => updateForm("data_type", value)}>
            <SelectTrigger data-testid="cash-plan-type-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="actual">Consuntivo</SelectItem>
              <SelectItem value="forecast">Previsione</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="cash_plan_revenue">Incassi Effettivi o Previsti (€)</Label>
          <Input
            id="cash_plan_revenue"
            type="number"
            min="0"
            step="0.01"
            value={form.revenue}
            onChange={(event) => updateForm("revenue", event.target.value)}
            data-testid="cash-plan-revenue-input"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cash_plan_fixed">Spese Fisse (€)</Label>
          <Input
            id="cash_plan_fixed"
            type="number"
            min="0"
            step="0.01"
            value={form.fixed_expenses}
            onChange={(event) => updateForm("fixed_expenses", event.target.value)}
            data-testid="cash-plan-fixed-input"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cash_plan_variable">Spese Variabili (€)</Label>
          <Input
            id="cash_plan_variable"
            type="number"
            min="0"
            step="0.01"
            value={form.variable_expenses}
            onChange={(event) => updateForm("variable_expenses", event.target.value)}
            data-testid="cash-plan-variable-input"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cash_plan_other">Altre Uscite (€)</Label>
          <Input
            id="cash_plan_other"
            type="number"
            min="0"
            step="0.01"
            value={form.other_expenses}
            onChange={(event) => updateForm("other_expenses", event.target.value)}
            data-testid="cash-plan-other-input"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cash_plan_taxes_paid">Tasse e Contributi Pagati (€)</Label>
          <Input
            id="cash_plan_taxes_paid"
            type="number"
            min="0"
            step="0.01"
            value={form.taxes_paid}
            onChange={(event) => updateForm("taxes_paid", event.target.value)}
            data-testid="cash-plan-taxes-paid-input"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cash_plan_reserve">Accantonamento Fiscale Consigliato (€)</Label>
          <Input
            id="cash_plan_reserve"
            value={formatCurrency(form.recommended_tax_reserve)}
            readOnly
            disabled
          />
          <p className="text-xs text-muted-foreground">
            Viene ricalcolato automaticamente al salvataggio usando il tuo regime fiscale.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="cash_plan_notes">Note Facoltative</Label>
        <Textarea
          id="cash_plan_notes"
          value={form.notes}
          onChange={(event) => updateForm("notes", event.target.value)}
          placeholder="Ad esempio: acquisto materiali, pagamento F24, incasso importante..."
          maxLength={1000}
          data-testid="cash-plan-notes-input"
        />
      </div>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
        <Button variant="outline" onClick={cancelEditing} disabled={saving}>
          Annulla
        </Button>
        <Button onClick={saveMonth} disabled={saving} data-testid="cash-plan-save-btn">
          <Save className="w-4 h-4 mr-2" />
          {saving ? "Salvataggio..." : "Salva"}
        </Button>
      </div>
    </div>
  );

  const renderMonthCard = (entry) => {
    const expanded = editingId === entry.cash_plan_id;
    return (
      <Card
        key={entry.cash_plan_id}
        className={entry.data_type === "forecast" ? "border-dashed bg-muted/20" : ""}
        data-testid={`cash-plan-row-${entry.cash_plan_id}`}
      >
        <CardContent className="p-4">
          <div
            role="button"
            tabIndex={0}
            className="cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
            onClick={() => expanded ? cancelEditing() : startEditing(entry)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                expanded ? cancelEditing() : startEditing(entry);
              }
            }}
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <p className="font-semibold capitalize">{formatMonth(entry.month)}</p>
                <Badge variant={entry.data_type === "actual" ? "default" : "outline"}>
                  {entry.data_type === "actual" ? "Consuntivo" : "Previsione"}
                </Badge>
              </div>
              <div className="flex items-center gap-1 self-end sm:self-auto">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(event) => {
                    event.stopPropagation();
                    startEditing(entry);
                  }}
                >
                  <Edit3 className="w-4 h-4 mr-1" />
                  Modifica
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={(event) => {
                    event.stopPropagation();
                    deleteMonth(entry);
                  }}
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Elimina
                </Button>
                {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Incassi</p>
                <p className="font-semibold text-success">{formatCurrency(entry.revenue)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Uscite Complessive</p>
                <p className="font-semibold text-destructive">{formatCurrency(entry.real_outflows)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Accantonamento</p>
                <p className="font-semibold">{formatCurrency(entry.recommended_tax_reserve)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Liquidità Disponibile</p>
                <p className={entry.available_liquidity >= 0 ? "font-semibold text-success" : "font-semibold text-destructive"}>
                  {formatCurrency(entry.available_liquidity)}
                </p>
              </div>
            </div>
          </div>
          {expanded && renderEditor()}
        </CardContent>
      </Card>
    );
  };

  return (
    <Card data-testid="cash-plan-section">
      <CardHeader className="space-y-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <WalletCards className="w-5 h-5 text-secondary" />
          Piano di Cassa
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Registra i mesi trascorsi e prepara una previsione realistica della liquidità futura.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-lg border border-border p-4">
          <div className="flex flex-col lg:flex-row lg:items-end gap-3">
            <div className="space-y-2 flex-1">
              <Label htmlFor="cash_plan_opening_balance">Saldo Iniziale del Piano di Cassa (€)</Label>
              <Input
                id="cash_plan_opening_balance"
                type="number"
                step="0.01"
                value={openingBalance}
                onChange={(event) => setOpeningBalance(event.target.value)}
                data-testid="cash-plan-opening-balance-input"
              />
              <p className="text-xs text-muted-foreground">
                Inseriscilo una volta: il saldo finale di ogni mese diventa il saldo iniziale del mese successivo.
              </p>
            </div>
            <Button onClick={saveOpeningBalance} disabled={saving} data-testid="cash-plan-opening-save-btn">
              <Save className="w-4 h-4 mr-2" />
              Salva Saldo
            </Button>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <div className="rounded-lg border border-border p-4">
            <Banknote className="w-5 h-5 text-secondary mb-2" />
            <p className="text-xs text-muted-foreground">Saldo Bancario Stimato</p>
            <p className="text-lg font-semibold">{formatCurrency(summary?.estimated_bank_balance)}</p>
          </div>
          <div className="rounded-lg border border-border p-4">
            <PiggyBank className="w-5 h-5 text-secondary mb-2" />
            <p className="text-xs text-muted-foreground">Accantonamenti da Conservare</p>
            <p className="text-lg font-semibold">{formatCurrency(summary?.tax_reserve_to_keep)}</p>
          </div>
          <div className="rounded-lg border border-border p-4">
            <WalletCards className="w-5 h-5 text-secondary mb-2" />
            <p className="text-xs text-muted-foreground">Liquidità Disponibile</p>
            <p className={(summary?.available_liquidity ?? 0) >= 0 ? "text-lg font-semibold text-success" : "text-lg font-semibold text-destructive"}>
              {formatCurrency(summary?.available_liquidity)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              È il denaro stimato che puoi utilizzare dopo aver escluso tasse e contributi da accantonare.
            </p>
          </div>
          <div className="rounded-lg border border-border p-4">
            <CalendarClock className="w-5 h-5 text-secondary mb-2" />
            <p className="text-xs text-muted-foreground">Prossimo Pagamento Previsto</p>
            {summary?.next_payment ? (
              <>
                <p className="text-lg font-semibold">{formatCurrency(summary.next_payment.amount)}</p>
                <p className="text-xs text-muted-foreground capitalize">{formatMonth(summary.next_payment.month)}</p>
              </>
            ) : (
              <p className="font-semibold mt-1">Nessun pagamento inserito</p>
            )}
          </div>
        </div>

        {summary?.liquidity_warning && (
          <Alert className="border-warning/50 bg-warning/10">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <AlertTitle>Possibile carenza di liquidità</AlertTitle>
            <AlertDescription>
              Attenzione: nel mese di <span className="capitalize">{formatMonth(summary.liquidity_warning.month)}</span> potresti avere una carenza di liquidità di {formatCurrency(summary.liquidity_warning.shortfall)}.
            </AlertDescription>
          </Alert>
        )}

        <Tabs
          value={activeType}
          onValueChange={(value) => {
            setActiveType(value);
            cancelEditing();
          }}
          className="space-y-4"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="actual" data-testid="cash-plan-actual-tab">Consuntivo</TabsTrigger>
            <TabsTrigger value="forecast" data-testid="cash-plan-forecast-tab">Previsione</TabsTrigger>
          </TabsList>

          {["actual", "forecast"].map((type) => (
            <TabsContent key={type} value={type} className="space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{type === "actual" ? "Mesi Consuntivi" : "Mesi Previsionali"}</h3>
                  <p className="text-sm text-muted-foreground">
                    {type === "actual"
                      ? "Dati reali dei mesi trascorsi."
                      : "Stime future sempre modificabili manualmente."}
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  {type === "forecast" && (
                    <Select value={forecastMethod} onValueChange={setForecastMethod}>
                      <SelectTrigger className="sm:w-[220px]" data-testid="cash-plan-forecast-method">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FORECAST_METHODS.map((method) => (
                          <SelectItem key={method.value} value={method.value}>{method.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {type === "forecast" && forecastMethod !== "manual" && (
                    <Button variant="outline" onClick={generateForecast} disabled={generating}>
                      {generating ? "Generazione..." : "Genera 6 Mesi"}
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => startNewMonth(true)}>
                    <Copy className="w-4 h-4 mr-2" />
                    Copia Mese Precedente
                  </Button>
                  <Button onClick={() => startNewMonth(false)} data-testid="cash-plan-add-month-btn">
                    <Plus className="w-4 h-4 mr-2" />
                    Aggiungi Mese
                  </Button>
                </div>
              </div>

              {editingId === "new" && (
                <Card className="border-secondary/40">
                  <CardContent className="p-4">
                    <h4 className="font-semibold">Nuovo Mese</h4>
                    {renderEditor()}
                  </CardContent>
                </Card>
              )}

              {loading ? (
                <div className="space-y-3">
                  {[1, 2].map((item) => <div key={item} className="h-28 rounded-lg bg-muted animate-pulse" />)}
                </div>
              ) : visibleMonths.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
                  <WalletCards className="w-10 h-10 mx-auto mb-3 opacity-50" />
                  <p>Nessun mese {type === "actual" ? "consuntivo" : "previsionale"} inserito.</p>
                  <p className="text-sm mt-1">Usa “Aggiungi Mese” per iniziare.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {visibleMonths.map(renderMonthCard)}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>

        {chartData.length > 0 && (
          <div className="border-t border-border pt-6 space-y-3">
            <div>
              <h3 className="font-semibold">Andamento della Liquidità</h3>
              <p className="text-sm text-muted-foreground">
                Barre più chiare e separatore tratteggiato indicano i mesi previsionali.
              </p>
            </div>
            <div className="w-full overflow-x-auto">
              <div className="min-w-[700px] h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 20, right: 20, left: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="monthLabel" />
                    <YAxis tickFormatter={(value) => `${Math.round(value / 1000)}k`} />
                    <Tooltip
                      formatter={(value) => formatCurrency(value)}
                      labelFormatter={(_, payload) => payload?.[0]?.payload?.month ? formatMonth(payload[0].payload.month) : ""}
                      contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb" }}
                    />
                    <Legend />
                    {firstForecastLabel && (
                      <ReferenceLine
                        x={firstForecastLabel}
                        stroke="#64748b"
                        strokeDasharray="4 4"
                        label={{ value: "Previsione", position: "insideTopRight", fill: "#64748b" }}
                      />
                    )}
                    <Bar dataKey="revenue" name="Incassi" radius={[4, 4, 0, 0]}>
                      {chartData.map((entry) => (
                        <Cell
                          key={`revenue-${entry.cash_plan_id}`}
                          fill="#1A7A4A"
                          fillOpacity={entry.data_type === "forecast" ? 0.45 : 1}
                        />
                      ))}
                    </Bar>
                    <Bar dataKey="real_outflows" name="Uscite Reali" radius={[4, 4, 0, 0]}>
                      {chartData.map((entry) => (
                        <Cell
                          key={`outflows-${entry.cash_plan_id}`}
                          fill="#C0392B"
                          fillOpacity={entry.data_type === "forecast" ? 0.45 : 1}
                        />
                      ))}
                    </Bar>
                    <Line
                      type="monotone"
                      dataKey="available_liquidity"
                      name="Liquidità Disponibile"
                      stroke="#1e3a5f"
                      strokeWidth={3}
                      dot={{ r: 3 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
