import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { API } from "@/App";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { 
  FileText, 
  CheckCircle2,
  XCircle,
  Building2,
  Car,
  Euro,
  Calendar,
  Phone,
  Mail,
  MapPin,
  Loader2
} from "lucide-react";

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2
  }).format(amount);
};

const JOB_TYPE_LABELS = {
  ppf_full: "PPF Completo",
  ppf_partial: "PPF Parziale",
  wrap_decorative: "Wrap Decorativo",
  wrap_commercial: "Wrap Commerciale",
  tint: "Oscuramento Vetri",
  upholstery: "Tappezzeria"
};

const VEHICLE_TYPE_LABELS = {
  sedan: "Berlina",
  suv: "SUV",
  van: "Van",
  truck: "Camion"
};

export const QuotePage = () => {
  const { token } = useParams();
  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [clientNotes, setClientNotes] = useState("");
  const [accepted, setAccepted] = useState(null);

  const fetchQuote = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/quote/${token}`);
      setQuote(response.data);
    } catch (error) {
      console.error("Error fetching quote:", error);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchQuote();
  }, [fetchQuote]);

  const handleAcceptReject = async (accept) => {
    setSubmitting(true);
    try {
      await axios.post(`${API}/quote/${token}/accept`, {
        accepted: accept,
        notes: clientNotes,
        client_signature: accept ? `Accettato digitalmente il ${new Date().toLocaleDateString('it-IT')}` : null
      });
      
      setAccepted(accept);
      toast.success(accept ? "Preventivo accettato!" : "Preventivo rifiutato");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Errore nell'operazione");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Caricamento preventivo...</p>
        </div>
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="py-8 text-center">
            <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Preventivo Non Trovato</h2>
            <p className="text-muted-foreground">
              Questo link non è valido o il preventivo è scaduto.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isProcessed = quote.quote_status !== "pending" || accepted !== null;

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header with Logo */}
        <div className="text-center">
          {quote.business_info?.logo_url ? (
            <img 
              src={quote.business_info.logo_url} 
              alt={quote.business_name}
              style={{ width: quote.business_info.logo_width || 150 }}
              className="mx-auto mb-4"
            />
          ) : (
            <h1 className="text-2xl font-bold text-primary mb-2" style={{ fontFamily: 'Barlow, sans-serif' }}>
              {quote.business_name}
            </h1>
          )}
        </div>

        {/* Success/Rejected State */}
        {isProcessed && (
          <Card className={accepted || quote.quote_status === "accepted" ? "bg-success/10 border-success/30" : "bg-destructive/10 border-destructive/30"}>
            <CardContent className="py-8 text-center">
              {accepted || quote.quote_status === "accepted" ? (
                <>
                  <CheckCircle2 className="w-16 h-16 text-success mx-auto mb-4" />
                  <h2 className="text-2xl font-bold text-success mb-2">Preventivo Accettato!</h2>
                  <p className="text-muted-foreground">
                    Grazie! L'installatore è stato notificato e ti contatterà presto per concordare i dettagli.
                  </p>
                </>
              ) : (
                <>
                  <XCircle className="w-16 h-16 text-destructive mx-auto mb-4" />
                  <h2 className="text-2xl font-bold text-destructive mb-2">Preventivo Rifiutato</h2>
                  <p className="text-muted-foreground">
                    Grazie per averci considerato. Se cambi idea, contattaci!
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Quote Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="w-5 h-5 text-secondary" />
              Preventivo #{quote.job_id?.slice(-8).toUpperCase()}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Business Info */}
            {quote.business_info && (
              <div className="p-4 bg-muted/30 rounded-lg space-y-2">
                <h3 className="font-semibold flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  {quote.business_name}
                </h3>
                {quote.business_info.indirizzo && (
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <MapPin className="w-3 h-3" />
                    {quote.business_info.indirizzo}, {quote.business_info.cap} {quote.business_info.citta} ({quote.business_info.provincia})
                  </p>
                )}
                {quote.business_info.telefono && (
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Phone className="w-3 h-3" />
                    {quote.business_info.telefono}
                  </p>
                )}
                {quote.business_info.email && (
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Mail className="w-3 h-3" />
                    {quote.business_info.email}
                  </p>
                )}
                {quote.business_info.partita_iva && (
                  <p className="text-sm text-muted-foreground">
                    P.IVA: {quote.business_info.partita_iva}
                  </p>
                )}
                {quote.business_info.intestazione_extra && (
                  <p className="text-sm text-muted-foreground whitespace-pre-line">
                    {quote.business_info.intestazione_extra}
                  </p>
                )}
              </div>
            )}

            {/* Client Info */}
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Cliente</p>
                <p className="font-semibold text-lg">{quote.client_name}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Data Preventivo</p>
                <p className="font-semibold flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  {new Date(quote.created_at).toLocaleDateString('it-IT')}
                </p>
              </div>
            </div>

            {/* Service Details */}
            <div className="border-t border-border pt-4">
              <h4 className="font-semibold mb-3">Dettagli Servizio</h4>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Tipo Lavoro</p>
                    <p className="font-medium">{JOB_TYPE_LABELS[quote.job_type] || quote.job_type}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Car className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Veicolo</p>
                    <p className="font-medium">
                      {VEHICLE_TYPE_LABELS[quote.vehicle_type] || quote.vehicle_type}
                      {quote.vehicle_info && ` - ${quote.vehicle_info}`}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Notes */}
            {quote.notes && (
              <div className="border-t border-border pt-4">
                <h4 className="font-semibold mb-2">Descrizione e Condizioni</h4>
                <p className="text-muted-foreground whitespace-pre-line">{quote.notes}</p>
              </div>
            )}

            {/* Total */}
            <div className="border-t border-border pt-4">
              <div className="flex items-center justify-between p-4 bg-primary/5 rounded-lg">
                <div className="flex items-center gap-3">
                  <Euro className="w-6 h-6 text-primary" />
                  <span className="font-semibold text-lg">Totale Preventivo</span>
                </div>
                <span className="text-3xl font-bold text-primary">{formatCurrency(quote.quote_amount)}</span>
              </div>
            </div>

            {/* Accept/Reject Actions */}
            {!isProcessed && (
              <div className="border-t border-border pt-6 space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Note (opzionale)</label>
                  <Textarea
                    value={clientNotes}
                    onChange={(e) => setClientNotes(e.target.value)}
                    placeholder="Aggiungi note o richieste..."
                    rows={3}
                  />
                </div>

                <div className="p-4 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    Accettando questo preventivo, confermi di aver letto e accettato le condizioni indicate.
                    Questa accettazione ha valore contrattuale vincolante.
                  </p>
                </div>

                <div className="flex gap-4">
                  <Button
                    variant="outline"
                    className="flex-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => handleAcceptReject(false)}
                    disabled={submitting}
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    Rifiuta
                  </Button>
                  <Button
                    className="flex-1 bg-success hover:bg-success/90"
                    onClick={() => handleAcceptReject(true)}
                    disabled={submitting}
                  >
                    {submitting ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                    )}
                    Accetta Preventivo
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground">
          Powered by BESIDE • Gestione Installatori
        </p>
      </div>
    </div>
  );
};
