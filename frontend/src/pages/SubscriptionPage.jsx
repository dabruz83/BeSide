import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth, API } from "@/App";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  CreditCard,
  Check,
  CheckCircle2,
  Loader2, PauseCircle, RotateCcw
} from "lucide-react";

const TIERS = [
  {
    id: "essential",
    name: "Essential",
    price: 97,
    features: [
      "Tutte le funzionalità base",
      "Max 50 lavori/mese",
      "1 utente",
      "Supporto email"
    ]
  },
  {
    id: "professional",
    name: "Professional",
    price: 197,
    popular: true,
    features: [
      "Lavori illimitati",
      "AI Workflows (3 template)",
      "Supporto prioritario (24h)",
      "Review trimestrale"
    ]
  },
  {
    id: "elite",
    name: "Elite",
    price: 397,
    features: [
      "Configuratore white-label",
      "Chiamata strategica mensile",
      "Supporto WhatsApp illimitato",
      "Richieste custom"
    ]
  }
];

export const SubscriptionPage = () => {
  const { user, checkAuth } = useAuth();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [interval, setInterval] = useState("month");
  const [billing, setBilling] = useState({ enabled: false, tiers: {} });
  const [lifecycle, setLifecycle] = useState(null);
  const [pauseReason, setPauseReason] = useState("");
  const [pauseDetails, setPauseDetails] = useState("");
  const [pauseConfirm, setPauseConfirm] = useState(false);
  const [pauseBusy, setPauseBusy] = useState(false);
  useEffect(() => {
    axios.get(`${API}/subscription/config`).then(r => setBilling(r.data)).catch(() => {});
    axios.get(`${API}/subscription/lifecycle`).then(r => setLifecycle(r.data)).catch(() => {});
  }, []);

  const dateLabel = (value) => value ? new Date(value).toLocaleDateString("it-IT", {
    day: "numeric", month: "long", year: "numeric"
  }) : "la scadenza del periodo";
  const configuredPrice = (tier) => billing.tiers?.[tier]?.[interval];
  const formatPrice = (tier) => {
    const amount = configuredPrice(tier.id)?.amount_cents;
    if (typeof amount === "number") return new Intl.NumberFormat("it-IT", {
      style: "currency", currency: "EUR", maximumFractionDigits: 2
    }).format(amount / 100);
    return interval === "month" ? "€" + tier.price : "Prezzo al checkout";
  };
  const refreshLifecycle = async () => {
    const response = await axios.get(`${API}/subscription/lifecycle`);
    setLifecycle(response.data);
    await checkAuth();
  };
  const schedulePause = async () => {
    setPauseBusy(true);
    try {
      const { data } = await axios.post(`${API}/subscription/suspend`, {
        reason: pauseReason, details: pauseDetails.trim(),
      });
      setPauseConfirm(false);
      await refreshLifecycle();
      toast.success("Sospensione programmata per " + dateLabel(data.pause_effective_at));
    } catch (e) {
      toast.error(e.response?.data?.detail || "Sospensione non disponibile.");
    } finally { setPauseBusy(false); }
  };
  const undoPause = async () => {
    setPauseBusy(true);
    try {
      await axios.post(`${API}/subscription/suspend/cancel`, {});
      await refreshLifecycle();
      toast.success("Rinnovo riattivato.");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Ripristino non disponibile.");
    } finally { setPauseBusy(false); }
  };
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  useEffect(() => {
    const sessionId = searchParams.get("session_id");
    if (!sessionId) return;
    let cancelled = false;
    let timer;
    let attempts = 0;
    setCheckingPayment(true);
    const poll = async () => {
      try {
        const { data } = await axios.get(`${API}/subscription/status/${sessionId}`);
        if (cancelled) return;
        if (data.payment_status === "paid") {
          setPaymentSuccess(true); setCheckingPayment(false); await checkAuth(); return;
        }
        if (data.status === "expired" || ++attempts >= 15) {
          setCheckingPayment(false); toast.info("Pagamento in attesa di conferma o sessione scaduta."); return;
        }
        timer = setTimeout(poll, 2000);
      } catch (_) {
        if (!cancelled) { setCheckingPayment(false); toast.error("Verifica pagamento non disponibile"); }
      }
    };
    poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [searchParams, checkAuth]);

  const handleSubscribe = async (tier) => {
    setLoading(true);
    try {
      const response = await axios.post(`${API}/subscription/checkout`, {
        tier: tier,
        interval,
        origin_url: window.location.origin
      }, { withCredentials: true });

      window.location.href = response.data.checkout_url;
    } catch (error) {
      toast.error(error.response?.data?.detail || "Errore nell'avvio del checkout");
      setLoading(false);
    }
  };

  if (checkingPayment) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardContent className="py-12 text-center">
            <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Verifica pagamento...</h2>
            <p className="text-muted-foreground">
              Stiamo verificando il tuo pagamento. Attendere...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (paymentSuccess) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardContent className="py-12 text-center">
            <CheckCircle2 className="w-16 h-16 text-success mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-primary mb-2">Pagamento Completato!</h2>
            <p className="text-muted-foreground mb-6">
              Grazie per aver scelto BESIDE. Il tuo abbonamento è ora attivo.
            </p>
            <Button onClick={() => window.location.href = "/dashboard"}>
              Vai alla Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-heading-2 text-primary" data-testid="subscription-title">
          Scegli il tuo Piano
        </h1>
        <p className="text-muted-foreground mt-2">
          Scegli il piano e la periodicità di fatturazione
        </p>
      </div>

      <div className="flex justify-center gap-2" role="group" aria-label="Periodicità abbonamento">
        <Button variant={interval === "month" ? "default" : "outline"} onClick={() => setInterval("month")}>Mensile</Button>
        <Button variant={interval === "year" ? "default" : "outline"} onClick={() => setInterval("year")}>Annuale</Button>
      </div>
      {interval === "year" && <p className="text-sm text-center text-muted-foreground">I prezzi annuali saranno selezionabili solo dopo la configurazione dei relativi prezzi Stripe. Il rinnovo si può disattivare per la scadenza annuale.</p>}

      {lifecycle?.suspended && <Card className="border-primary/25">
        <CardContent className="pt-5 space-y-2">
          <p className="font-semibold text-primary">Il tuo account è sospeso</p>
          <p className="text-sm text-muted-foreground">I dati sono conservati secondo le condizioni applicabili. Seleziona un piano per riattivare l'accesso; il nuovo periodo inizierà dopo il pagamento.</p>
        </CardContent>
      </Card>}
      {lifecycle?.pause_requested && !lifecycle?.suspended && <Card className="border-primary/25">
        <CardContent className="pt-5 space-y-3">
          <p className="font-semibold">Sospensione programmata</p>
          <p className="text-sm text-muted-foreground">Puoi utilizzare Beside fino al {dateLabel(lifecycle.pause_effective_at)}. Il rinnovo successivo è disattivato.</p>
          {user?.role === "owner" && <Button disabled={pauseBusy} variant="outline" onClick={undoPause}><RotateCcw className="mr-2 h-4 w-4" />Annulla sospensione</Button>}
        </CardContent>
      </Card>}

      {/* Current Plan Info */}
      {user?.subscription_status === "active" && !lifecycle?.suspended && (
        <Card className="bg-success/10 border-success/30">
          <CardContent className="py-4 text-center">
            <p className="text-success font-medium">
              Piano attuale: {TIERS.find(t => t.id === user.subscription_tier)?.name || user.subscription_tier}
            </p>
          </CardContent>
        </Card>
      )}

      {!billing.enabled && <p className="text-center text-muted-foreground" role="status">Pagamenti non attivi in questo ambiente. Puoi esplorare i piani senza addebiti.</p>}
      {billing.enabled && user?.subscription_status === 'active' && !lifecycle?.suspended && <Button onClick={async () => {
        try { const { data } = await axios.post(`${API}/subscription/portal`); window.location.href = data.url; }
        catch (error) { toast.error(error.response?.data?.detail || 'Portale non disponibile'); }
      }}>Gestisci abbonamento</Button>}
      {user?.role === "owner" && lifecycle?.subscription_status === "active" && !lifecycle?.pause_requested && !lifecycle?.suspended && billing.enabled && (
        <Card><CardContent className="pt-5 space-y-3">
          <div className="flex gap-2 items-center font-medium"><PauseCircle className="h-5 w-5" />Sospendi temporaneamente l'account</div>
          <p className="text-sm text-muted-foreground">Il rinnovo sarà disattivato. Potrai utilizzare Beside fino al termine del periodo già pagato ({dateLabel(lifecycle.current_period_end)}). Nessun giorno pagato viene perso.</p>
          {!pauseConfirm ? (
            <Button variant="outline" onClick={() => setPauseConfirm(true)}>Programma sospensione</Button>
          ) : (
            <div className="rounded-md border p-3 space-y-3">
              <Label htmlFor="pause-reason">Per quale motivo vuoi sospendere il tuo account? (facoltativo)</Label>
              <select id="pause-reason" className="w-full rounded-md border bg-background p-2.5 text-sm" value={pauseReason} onChange={e => setPauseReason(e.target.value)}>
                <option value="">Preferisco non rispondere</option>
                <option value="pausa">Pausa o chiusura temporanea dell'attività</option>
                <option value="utilizzo">Utilizzo limitato</option>
                <option value="costo">Costo dell'abbonamento</option>
                <option value="funzioni">Funzionalità mancanti</option>
                <option value="alternativa">Altra soluzione</option>
                <option value="altro">Altro motivo</option>
              </select>
              {pauseReason === "altro" && <Textarea rows={2} value={pauseDetails} onChange={e => setPauseDetails(e.target.value)} maxLength={500} placeholder="Puoi aggiungere dettagli (facoltativo)"/>}
              <p className="text-xs text-muted-foreground">Confermando, disattivi il prossimo rinnovo e programmi la sospensione per la fine del periodo pagato.</p>
              <div className="flex flex-wrap gap-2"><Button disabled={pauseBusy} onClick={schedulePause}>Conferma sospensione</Button><Button variant="ghost" onClick={() => setPauseConfirm(false)}>Indietro</Button></div>
            </div>
          )}
        </CardContent></Card>
      )}

      {/* Pricing Cards */}
      <div className="grid md:grid-cols-3 gap-6">
        {TIERS.map((tier) => (
          <Card
            key={tier.id}
            className={`relative ${tier.popular ? "border-primary shadow-lg" : ""}`}
            data-testid={`tier-${tier.id}`}
          >
            {tier.popular && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="bg-primary text-white text-xs font-medium px-3 py-1 rounded-full">
                  Più Popolare
                </span>
              </div>
            )}
            <CardHeader className="text-center pb-2">
              <CardTitle className="text-xl">{tier.name}</CardTitle>
              <div className="mt-4">
                <span className="text-3xl font-bold text-primary">{formatPrice(tier)}</span>
                {typeof configuredPrice(tier.id)?.amount_cents === "number" && <span className="text-muted-foreground">/{interval === "month" ? "mese" : "anno"}</span>}
                {!configuredPrice(tier.id)?.available && <p className="text-xs text-muted-foreground mt-2">Prezzo {interval === "year" ? "annuale" : "mensile"} non attivo</p>}
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <ul className="space-y-3">
                {tier.features.map((feature, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <Check className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
              </ul>
              <Button
                onClick={() => handleSubscribe(tier.id)}
                disabled={loading || !configuredPrice(tier.id)?.available || (user?.subscription_status === "active" && !lifecycle?.suspended && user?.subscription_tier === tier.id)}
                className={`w-full ${tier.popular ? "" : "variant-outline"}`}
                variant={tier.popular ? "default" : "outline"}
                data-testid={`subscribe-${tier.id}-btn`}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Caricamento...
                  </>
                ) : user?.subscription_status === "active" && !lifecycle?.suspended && user?.subscription_tier === tier.id ? (
                  "Piano Attuale"
                ) : (
                  "Scegli Piano"
                )}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* FAQ Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Domande Frequenti</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="font-medium">Posso cancellare in qualsiasi momento?</p>
            <p className="text-sm text-muted-foreground">
              Puoi disattivare il rinnovo in qualsiasi momento. L'accesso resta attivo fino alla fine del periodo già pagato; nell'annuale fino alla scadenza dell'annualità.
            </p>
          </div>
          <div>
            <p className="font-medium">Come funziona la prova gratuita?</p>
            <p className="text-sm text-muted-foreground">
              Le condizioni di prova, se disponibili per il tuo piano, sono mostrate nel checkout. Nessun pagamento viene avviato senza conferma.
            </p>
          </div>
          <div>
            <p className="font-medium">Posso cambiare piano?</p>
            <p className="text-sm text-muted-foreground">
              Le modifiche del piano e gli eventuali conguagli vengono presentati nel portale di fatturazione.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
