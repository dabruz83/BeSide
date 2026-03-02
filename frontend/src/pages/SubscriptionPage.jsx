import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth, API } from "@/App";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { 
  CreditCard, 
  Check,
  CheckCircle2,
  Loader2
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
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  useEffect(() => {
    const sessionId = searchParams.get("session_id");
    if (sessionId) {
      checkPaymentStatus(sessionId);
    }
  }, [searchParams]);

  const checkPaymentStatus = async (sessionId) => {
    setCheckingPayment(true);
    let attempts = 0;
    const maxAttempts = 5;
    
    const poll = async () => {
      try {
        const response = await axios.get(`${API}/subscription/status/${sessionId}`, {
          withCredentials: true
        });
        
        if (response.data.payment_status === "paid") {
          setPaymentSuccess(true);
          await checkAuth();
          toast.success("Pagamento completato! Benvenuto in BESIDE.");
          return;
        }
        
        if (response.data.status === "expired") {
          toast.error("Sessione di pagamento scaduta.");
          setCheckingPayment(false);
          return;
        }
        
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(poll, 2000);
        } else {
          setCheckingPayment(false);
          toast.error("Timeout verifica pagamento. Contattaci se hai completato il pagamento.");
        }
      } catch (error) {
        setCheckingPayment(false);
        toast.error("Errore nella verifica del pagamento");
      }
    };
    
    poll();
  };

  const handleSubscribe = async (tier) => {
    setLoading(true);
    try {
      const response = await axios.post(`${API}/subscription/checkout`, {
        tier: tier,
        origin_url: window.location.origin
      }, { withCredentials: true });
      
      window.location.href = response.data.checkout_url;
    } catch (error) {
      toast.error("Errore nell'avvio del checkout");
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
          Tutti i piani includono 14 giorni di prova gratuita
        </p>
      </div>

      {/* Current Plan Info */}
      {user?.subscription_status === "active" && (
        <Card className="bg-success/10 border-success/30">
          <CardContent className="py-4 text-center">
            <p className="text-success font-medium">
              Piano attuale: {TIERS.find(t => t.id === user.subscription_tier)?.name || user.subscription_tier}
            </p>
          </CardContent>
        </Card>
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
                <span className="text-4xl font-bold text-primary">€{tier.price}</span>
                <span className="text-muted-foreground">/mese</span>
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
                disabled={loading || user?.subscription_tier === tier.id}
                className={`w-full ${tier.popular ? "" : "variant-outline"}`}
                variant={tier.popular ? "default" : "outline"}
                data-testid={`subscribe-${tier.id}-btn`}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Caricamento...
                  </>
                ) : user?.subscription_tier === tier.id ? (
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
              Sì, puoi cancellare il tuo abbonamento in qualsiasi momento. Avrai accesso fino alla fine del periodo pagato.
            </p>
          </div>
          <div>
            <p className="font-medium">Come funziona la prova gratuita?</p>
            <p className="text-sm text-muted-foreground">
              Hai 14 giorni per provare tutte le funzionalità. Non ti verrà addebitato nulla fino alla fine della prova.
            </p>
          </div>
          <div>
            <p className="font-medium">Posso cambiare piano?</p>
            <p className="text-sm text-muted-foreground">
              Sì, puoi passare a un piano superiore o inferiore in qualsiasi momento. La differenza verrà calcolata proporzionalmente.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
