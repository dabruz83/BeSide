import { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { API } from "@/App";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles, Plus, CheckCircle2 } from "lucide-react";

const BLANK = {
  name: "", kind: "own", sector: "", logo_url: "", primary_color: "",
  secondary_color: "", audience: "", tone: "", visual_style: "",
  website_url: "", social_profiles: "", usual_goal: "", description: "",
  style_notes: "", avoid_claims: "", learning_enabled: true, usage_authorized: false,
};
const FIELDS = [
  ["name", "Nome attività o brand", "Es. Studio Rossi", true],
  ["sector", "Settore", "Es. Web design, wrapping, ristorazione"],
  ["audience", "A chi vuoi parlare?", "Es. Artigiani, negozi locali, PMI"],
  ["tone", "Tono abituale", "Es. Professionale e semplice"],
  ["visual_style", "Stile visivo", "Es. Minimal, moderno, colori caldi"],
  ["usual_goal", "Obiettivo abituale", "Es. Ricevere richieste di preventivo"],
  ["website_url", "Sito web HTTPS", "https://..."],
  ["social_profiles", "Canali social ufficiali", "Es. @brand su Instagram e Facebook"],
  ["logo_url", "Logo (indirizzo immagine HTTPS)", "https://..."],
  ["primary_color", "Colore principale", "#2E86AB"],
  ["secondary_color", "Colore secondario", "#FFFFFF"],
  ["description", "Servizi e punti di forza reali", "Descrivi brevemente ciò che offre il brand"],
  ["style_notes", "Preferenze per i futuri video", "Es. Ritmo veloce, testi brevi, voce naturale"],
  ["avoid_claims", "Cosa non dire o mostrare", "Es. Non inventare recensioni, prezzi o risultati"],
];

export const MarketingBrands = ({ brands, onRefresh, selectedBrandId, onSelect }) => {
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ ...BLANK });
  const [busy, setBusy] = useState(false);
  const [style, setStyle] = useState(null);

  useEffect(() => {
    if (!selectedBrandId) { setEditing(null); setForm({ ...BLANK, kind: brands.some((b) => b.kind === "own") ? "client" : "own" }); return; }
    const current = brands.find((b) => b.brand_id === selectedBrandId);
    if (current) { setEditing(current.brand_id); setForm({ ...BLANK, ...current }); }
  }, [selectedBrandId, brands]);

  useEffect(() => {
    setStyle(null);
    if (!selectedBrandId) return;
    let live = true;
    axios.get(API + "/marketing/brands/" + encodeURIComponent(selectedBrandId) + "/style")
      .then(({ data }) => { if (live) setStyle(data); })
      .catch(() => { if (live) setStyle(null); });
    return () => { live = false; };
  }, [selectedBrandId, brands]);

  const startNew = () => {
    onSelect("");
    setEditing(null);
    setForm({ ...BLANK, kind: brands.some((b) => b.kind === "own") ? "client" : "own" });
  };

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const payload = { ...BLANK, ...form };
      delete payload._id;
      delete payload.brand_id;
      delete payload.company_id;
      delete payload.created_at;
      delete payload.updated_at;
      delete payload.created_by;
      delete payload.authorization_confirmed_at;
      const url = editing ? API + "/marketing/brands/" + encodeURIComponent(editing) : API + "/marketing/brands";
      const { data } = editing ? await axios.patch(url, payload) : await axios.post(url, payload);
      await onRefresh();
      onSelect(data.brand_id);
      toast.success("Profilo brand salvato");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Impossibile salvare il profilo");
    } finally {
      setBusy(false);
    }
  };

  return <div className="space-y-4">
    <Card>
      <CardHeader><CardTitle className="text-lg">Profili Brand</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">Salva una volta sola identità, pubblico e stile. Ogni contenuto userà il profilo scelto, senza farti riscrivere un prompt.</p>
        <div className="flex flex-wrap gap-2">
          {brands.map((item) => <Button key={item.brand_id} type="button" size="sm"
            variant={selectedBrandId === item.brand_id ? "default" : "outline"}
            onClick={() => onSelect(item.brand_id)}>
            {item.name} {item.kind === "client" ? "· cliente" : "· mio"}
          </Button>)}
          <Button type="button" variant="outline" size="sm" onClick={startNew}><Plus className="mr-1 h-4 w-4"/>Nuovo brand</Button>
        </div>
        {style && selectedBrandId && <div className="rounded-xl border p-3 space-y-1 text-sm">
          <p className="font-semibold"><Sparkles className="inline h-4 w-4 mr-1 text-secondary"/>Memoria dello stile</p>
          <p>{style.learning_disabled ? "Apprendimento disattivato per questo brand." : style.style_ready
            ? "Beside ha almeno 5 contenuti approvati a cui ispirarsi."
            : `${style.sample_count}/6 contenuti approvati: la memoria di stile crescerà con i prossimi lavori.`}</p>
          {Boolean(style.frequent_tones?.length) && <p className="text-muted-foreground">Toni ricorrenti: {style.frequent_tones.join(", ")}</p>}
          <p className="text-xs text-muted-foreground">Vengono riutilizzati soltanto contenuti approvati di questo brand, non bozze o dati di altri clienti. La lettura automatica di vecchi video sarà una funzione successiva.</p>
        </div>}
      </CardContent>
    </Card>
    <Card>
      <CardHeader><CardTitle className="text-base">{editing ? "Modifica profilo" : "Crea profilo"}</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={save} className="space-y-4">
          <label className="block text-sm font-medium">Questo profilo rappresenta
            <select className="mt-1 w-full rounded-lg border p-3 bg-background" value={form.kind}
              disabled={Boolean(editing)} onChange={(e) => setForm((v) => ({ ...v, kind: e.target.value, usage_authorized: false }))}>
              <option value="own">La mia attività</option><option value="client">Un mio cliente</option>
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            {FIELDS.map(([key, label, placeholder, required]) =>
              <label key={key} className={["description", "style_notes", "avoid_claims", "audience", "visual_style"].includes(key) ? "block text-sm font-medium sm:col-span-2" : "block text-sm font-medium"}>
                {label}
                {["description", "style_notes", "avoid_claims", "audience", "visual_style"].includes(key)
                  ? <Textarea className="mt-1" placeholder={placeholder} value={form[key] || ""} maxLength={["description", "style_notes"].includes(key) ? 1000 : 500}
                      onChange={(e) => setForm((v) => ({ ...v, [key]: e.target.value }))}/>
                  : <Input className="mt-1" placeholder={placeholder} required={Boolean(required)} value={form[key] || ""} maxLength={key.includes("url") ? 500 : 350}
                      onChange={(e) => setForm((v) => ({ ...v, [key]: e.target.value }))}/>}
              </label>)}
          </div>
          {form.kind === "client" && <label className="flex gap-2 items-start rounded-lg bg-muted/40 p-3 text-sm">
            <input type="checkbox" className="mt-1" checked={Boolean(form.usage_authorized)}
              onChange={(e) => setForm((v) => ({ ...v, usage_authorized: e.target.checked }))}/>
            <span>Confermo di essere autorizzato a usare il nome, il logo e i materiali di questo cliente per preparare contenuti marketing. Puoi anche salvare il brand senza confermare: la generazione resterà bloccata fino all'autorizzazione. L'approvazione prima della pubblicazione resta separata.</span>
          </label>}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={Boolean(form.learning_enabled)}
              onChange={(e) => setForm((v) => ({ ...v, learning_enabled: e.target.checked }))}/>
            Usa i contenuti approvati per mantenere uno stile coerente
          </label>
          <Button disabled={busy} type="submit" className="w-full sm:w-auto"><CheckCircle2 className="mr-2 h-4 w-4"/>{busy ? "Salvataggio..." : "Salva profilo Brand"}</Button>
        </form>
      </CardContent>
    </Card>
  </div>;
};
