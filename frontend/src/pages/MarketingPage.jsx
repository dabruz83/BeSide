import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { API } from "@/App";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Sparkles, Plus, CalendarDays, BookOpen, ClipboardCheck, Clock3,
  CheckCircle2, PencilLine, Copy, Trash2, ArrowLeft, ArrowRight,
  Lightbulb, FolderOpen, RefreshCcw, LayoutDashboard
} from "lucide-react";

const TABS = [
  { id: "overview", label: "Panoramica", Icon: LayoutDashboard },
  { id: "assistant", label: "Assistente AI", Icon: Sparkles },
  { id: "contents", label: "I miei contenuti", Icon: FolderOpen },
  { id: "calendar", label: "Calendario editoriale", Icon: CalendarDays },
  { id: "guide", label: "Guida e consigli", Icon: BookOpen },
];
const STATES = [
  { id: "draft", label: "Bozze", Icon: PencilLine },
  { id: "pending_approval", label: "Da approvare", Icon: ClipboardCheck },
  { id: "ready", label: "Pronti", Icon: CheckCircle2 },
  { id: "scheduled", label: "Programmati", Icon: Clock3 },
  { id: "published", label: "Pubblicati", Icon: CheckCircle2 },
];
const QUESTIONS = [
  { key: "servizio", title: "Cosa vuoi promuovere?", options: ["Sito web", "E-commerce", "SEO", "Manutenzione"] },
  { key: "obiettivo", title: "Qual è il tuo obiettivo?", options: ["Trovare clienti", "Farti conoscere", "Vendere", "Fidelizzare"] },
  { key: "pubblico", title: "A chi ti rivolgi?", options: ["Professionisti", "Attività locali", "Aziende", "Privati"] },
  { key: "canale", title: "Dove vuoi pubblicare?", options: ["Instagram", "LinkedIn", "Facebook", "Altro"] },
  { key: "formato", title: "Quale contenuto vuoi creare?", options: ["Post", "Carosello", "Reel"] },
  { key: "tono", title: "Con quale tono?", options: ["Professionale", "Semplice", "Creativo", "Informativo"] },
];
const ACTIONS = [
  { id: "audience", title: "Cliente ideale", hint: "Definisci pubblico, bisogni e proposte di valore." },
  { id: "ideas", title: "Idee contenuti", hint: "Cinque spunti concreti per iniziare." },
  { id: "post", title: "Scrivi post", hint: "Un post con invito all'azione, pronto da rivedere." },
  { id: "reel", title: "Script reel", hint: "Un video breve con hook, scene e CTA." },
];
const EMPTY = { title: "", body: "", channel: "Instagram", format: "post", status: "draft", scheduled_date: "", answers: {} };
const prettyDate = (value) => value ? new Date(value.slice(0, 10) + "T12:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" }) : "";
const statusLabel = (status) => STATES.find((s) => s.id === status)?.label || status;

export const MarketingPage = () => {
  const [tab, setTab] = useState("overview");
  const [contents, setContents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [form, setForm] = useState({ ...EMPTY });
  const [step, setStep] = useState(0);
  const [brief, setBrief] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiError, setAiError] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(() => new Date().toISOString().slice(0, 7));

  const reload = useCallback(async () => {
    try {
      const res = await axios.get(API + "/agency/marketing/contents");
      setContents(Array.isArray(res.data) ? res.data : []);
      setError("");
    } catch (e) {
      setError(e.response?.data?.detail || "Impossibile caricare i contenuti.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const counts = useMemo(() => Object.fromEntries(STATES.map((state) =>
    [state.id, contents.filter((item) => item.status === state.id).length])), [contents]);
  const scheduled = useMemo(() => contents.filter((x) => x.scheduled_date && x.status === "scheduled")
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date)), [contents]);
  const visible = useMemo(() => contents.filter((x) => filter === "all" || x.status === filter), [contents, filter]);

  const change = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const selectAnswer = (key, value) => setForm((prev) => ({
    ...prev, answers: { ...prev.answers, [key]: value },
    ...(key === "canale" ? { channel: value } : {}),
    ...(key === "formato" ? { format: value === "Reel" ? "reel_script" : value === "Carosello" ? "carousel" : "post" } : {}),
  }));

  const create = () => {
    setForm({ ...EMPTY, answers: {} });
    setStep(0);
    setBrief("");
    setAiError("");
    setTab("assistant");
  };
  const edit = (item) => {
    setForm({ ...EMPTY, ...item, answers: { ...(item.answers || {}) }, scheduled_date: item.scheduled_date || "" });
    const firstUnanswered = QUESTIONS.findIndex((question) => !(item.answers || {})[question.key]);
    setStep(firstUnanswered >= 0 ? firstUnanswered : QUESTIONS.length);
    setAiError("");
    setTab("assistant");
  };

  const save = async (nextStatus = form.status) => {
    if (nextStatus === "scheduled" && !form.scheduled_date) {
      toast.error("Seleziona prima una data di pubblicazione.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim() || "Contenuto senza titolo",
        body: form.body,
        channel: form.channel,
        format: form.format,
        status: nextStatus,
        scheduled_date: form.scheduled_date || null,
        answers: form.answers,
      };
      const res = form.content_id
        ? await axios.patch(API + "/agency/marketing/contents/" + form.content_id, payload)
        : await axios.post(API + "/agency/marketing/contents", payload);
      setForm((prev) => ({ ...prev, ...res.data, scheduled_date: res.data.scheduled_date || "" }));
      await reload();
      toast.success(nextStatus === "draft" ? "Bozza salvata" : "Contenuto aggiornato");
      setTab("contents");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Non è stato possibile salvare.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item) => {
    if (!window.confirm("Eliminare definitivamente questo contenuto?")) return;
    try {
      await axios.delete(API + "/agency/marketing/contents/" + item.content_id);
      await reload();
      toast.success("Contenuto eliminato");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Errore durante l'eliminazione");
    }
  };

  const copy = async (value) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copiato negli appunti");
    } catch {
      toast.error("Non è stato possibile copiare il testo");
    }
  };

  const generate = async (action) => {
    setAiBusy(true);
    setAiError("");
    try {
      const res = await axios.post(API + "/agency/marketing/generate", {
        action,
        answers: form.answers,
        brief,
      });
      const output = (res.data?.content || "").trim();
      if (!output) throw new Error("empty");
      setForm((prev) => ({
        ...prev,
        title: prev.title || (ACTIONS.find((a) => a.id === action)?.title + " — " + (prev.answers.servizio || "Web agency")),
        body: prev.body ? prev.body + "\n\n" + output : output,
        format: action === "reel" ? "reel_script" : prev.format,
      }));
      toast.success("Testo generato: puoi modificarlo e salvarlo.");
    } catch (e) {
      setAiError(e.response?.data?.detail || "L'assistente non è disponibile. Riprova più tardi.");
    } finally {
      setAiBusy(false);
    }
  };

  const renderContent = (item) => (
    <Card key={item.content_id}>
      <CardContent className="p-4 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs rounded-full bg-muted px-2 py-1">{statusLabel(item.status)}</span>
          <span className="text-xs text-muted-foreground">{item.channel} · {item.format === "reel_script" ? "Reel" : item.format === "carousel" ? "Carosello" : "Post"}</span>
        </div>
        <p className="font-semibold line-clamp-2">{item.title || "Contenuto senza titolo"}</p>
        <p className="text-sm text-muted-foreground line-clamp-2">{item.body || "Contenuto da completare"}</p>
        {item.scheduled_date && <p className="text-xs text-muted-foreground"><CalendarDays className="inline h-3 w-3 mr-1" />{prettyDate(item.scheduled_date)}</p>}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => edit(item)}><PencilLine className="h-4 w-4 mr-1" />Apri</Button>
          <Button size="sm" variant="outline" disabled={!item.body} onClick={() => copy(item.body)} aria-label="Copia il testo"><Copy className="h-4 w-4" /></Button>
          <Button size="sm" variant="ghost" onClick={() => remove(item)} aria-label="Elimina il contenuto"><Trash2 className="h-4 w-4" /></Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-5 pb-8" data-testid="agency-marketing">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary flex items-center gap-2"><Sparkles className="h-6 w-6" />Marketing AI</h1>
          <p className="text-sm text-muted-foreground">Beside Agency · Dall'idea alla pubblicazione</p>
        </div>
        <Button onClick={create} className="rounded-full"><Plus className="h-4 w-4 mr-1" />Crea</Button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2" role="tablist" aria-label="Sezioni Marketing AI">
        {TABS.map(({ id, label, Icon }) =>
          <Button key={id} role="tab" aria-selected={tab === id} size="sm"
            variant={tab === id ? "default" : "outline"} className="shrink-0 rounded-full"
            onClick={() => setTab(id)}><Icon className="mr-1 h-4 w-4" />{label}</Button>)}
      </div>
      {error && <p className="rounded-lg border border-red-200 p-3 text-sm text-red-700" role="alert">{error} <Button size="sm" variant="ghost" onClick={reload}><RefreshCcw className="h-4 w-4" /></Button></p>}

      {tab === "overview" && <div className="space-y-5">
        <Card className="bg-secondary/10">
          <CardContent className="p-5 space-y-3">
            <p className="text-lg font-semibold">Cosa vuoi creare oggi?</p>
            <p className="text-sm text-muted-foreground">Ti guidiamo con poche domande, senza bisogno di scrivere prompt.</p>
            <Button onClick={create} className="w-full sm:w-auto"><Sparkles className="h-4 w-4 mr-2" />Crea con AI</Button>
          </CardContent>
        </Card>
        <div className="grid grid-cols-2 gap-3">
          {STATES.filter((s) => s.id !== "ready").map(({ id, label, Icon }) =>
            <button key={id} onClick={() => { setFilter(id); setTab("contents"); }}
              className="text-left rounded-xl border bg-card p-4 min-h-28 hover:border-primary/50">
              <Icon className="h-5 w-5 text-secondary" /><p className="mt-2 font-semibold">{label}</p>
              <p className="text-2xl font-bold">{counts[id] || 0}</p>
            </button>)}
        </div>
        <Card><CardHeader><CardTitle className="text-base">Prossime pubblicazioni</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {scheduled.length ? scheduled.slice(0, 5).map((item) =>
              <button key={item.content_id} onClick={() => edit(item)}
                className="w-full text-left border-b py-2 last:border-0">
                <span className="font-medium">{item.title}</span>
                <span className="block text-xs text-muted-foreground">{prettyDate(item.scheduled_date)} · {item.channel}</span>
              </button>) : <p className="text-sm text-muted-foreground">Nessun contenuto programmato.</p>}
          </CardContent></Card>
        <button className="text-sm text-primary underline underline-offset-4" onClick={() => setTab("guide")}>Consiglio: come si scrive una buona call to action?</button>
      </div>}

      {tab === "assistant" && <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Percorso guidato · Passaggio {Math.min(step + 1, QUESTIONS.length)} di {QUESTIONS.length}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {step < QUESTIONS.length ? <>
              <div className="flex gap-1">{QUESTIONS.map((q, index) =>
                <div key={q.key} className={"h-1.5 flex-1 rounded-full " + (index <= step ? "bg-secondary" : "bg-muted")} />)}</div>
              <p className="font-semibold text-lg">{QUESTIONS[step].title}</p>
              <div className="grid grid-cols-2 gap-2">
                {QUESTIONS[step].options.map((value) =>
                  <button key={value} onClick={() => selectAnswer(QUESTIONS[step].key, value)}
                    className={"min-h-14 rounded-xl border p-3 text-sm " +
                      (form.answers[QUESTIONS[step].key] === value ? "border-secondary bg-secondary/10 font-semibold" : "bg-background")}>
                    {value}
                  </button>)}
              </div>
              <div className="flex gap-2 justify-between">
                <Button variant="outline" disabled={!step} onClick={() => setStep((s) => s - 1)}><ArrowLeft className="mr-1 h-4 w-4" />Indietro</Button>
                <Button variant="ghost" onClick={() => setStep((s) => Math.min(QUESTIONS.length, s + 1))}>Salta</Button>
                <Button onClick={() => setStep((s) => Math.min(QUESTIONS.length, s + 1))}
                  disabled={!form.answers[QUESTIONS[step].key]}>Avanti<ArrowRight className="ml-1 h-4 w-4" /></Button>
              </div>
            </> : <>
              <p className="font-semibold">Scegli come usare l'assistente</p>
              <div className="grid sm:grid-cols-2 gap-2">
                {ACTIONS.map((item) =>
                  <Button key={item.id} variant="outline" disabled={aiBusy} className="h-auto min-h-16 whitespace-normal text-left justify-start"
                    onClick={() => generate(item.id)}>
                    <Sparkles className="mr-2 h-4 w-4 shrink-0" /><span><strong className="block">{item.title}</strong><small className="font-normal">{item.hint}</small></span>
                  </Button>)}
              </div>
              <Button variant="ghost" onClick={() => setStep(0)}><ArrowLeft className="mr-1 h-4 w-4" />Modifica risposte</Button>
            </>}
            <p className="text-xs text-muted-foreground">Puoi salvare una bozza in qualsiasi momento e riprendere più tardi.</p>
          </CardContent>
        </Card>
        <Card><CardHeader><CardTitle className="text-base">Il tuo contenuto</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <label className="block text-sm font-medium">Titolo<Input value={form.title} onChange={(e) => change("title", e.target.value)} placeholder="Es. Perché serve un sito aggiornato" maxLength={160} className="mt-1" /></label>
            <label className="block text-sm font-medium">Indicazioni aggiuntive per l'AI
              <Textarea value={brief} onChange={(e) => setBrief(e.target.value)} maxLength={3000}
                placeholder="Es. Rivolgiti ai negozi locali di Bolzano" rows={2} className="mt-1" />
            </label>
            <label className="block text-sm font-medium">Testo (modificabile)
              <Textarea value={form.body} onChange={(e) => change("body", e.target.value)} rows={8} maxLength={12000}
                placeholder="Il testo generato apparirà qui. Puoi anche scriverlo direttamente." className="mt-1" />
            </label>
            {aiBusy && <p role="status" className="text-sm text-muted-foreground">Sto generando il contenuto con AI...</p>}
            {aiError && <p role="alert" className="text-sm text-red-600">{aiError}</p>}
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="text-sm">Canale<select className="mt-1 w-full rounded-md border bg-background p-2.5" value={form.channel} onChange={(e) => change("channel", e.target.value)}>
                {["Instagram", "LinkedIn", "Facebook", "Altro"].map((c) => <option key={c}>{c}</option>)}
              </select></label>
              <label className="text-sm">Formato<select className="mt-1 w-full rounded-md border bg-background p-2.5" value={form.format} onChange={(e) => change("format", e.target.value)}>
                <option value="post">Post</option><option value="carousel">Carosello</option><option value="reel_script">Reel</option>
              </select></label>
            </div>
            <label className="block text-sm">Data prevista di pubblicazione (facoltativa)
              <Input className="mt-1" type="date" value={form.scheduled_date || ""} onChange={(e) => change("scheduled_date", e.target.value)} />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={saving} onClick={() => save("draft")}>Salva bozza</Button>
              <Button variant="outline" disabled={saving || !form.body.trim()} onClick={() => save("pending_approval")}>Da approvare</Button>
              <Button variant="outline" disabled={saving || !form.body.trim()} onClick={() => save("ready")}>Approva</Button>
              <Button disabled={saving || !form.body.trim() || !form.scheduled_date} onClick={() => save("scheduled")}>Programma</Button>
              {form.content_id && <Button variant="outline" disabled={saving || !form.body.trim()} onClick={() => save("published")}>Segna pubblicato</Button>}
              <Button variant="ghost" disabled={!form.body} onClick={() => copy(form.body)}><Copy className="mr-1 h-4 w-4" />Copia</Button>
            </div>
            <p className="text-xs text-muted-foreground">Programmare qui non pubblica automaticamente sui social. Dopo la pubblicazione usa “Segna pubblicato”.</p>
          </CardContent></Card>
      </div>}

      {tab === "contents" && <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {[{ id: "all", label: "Tutti" }, ...STATES].map((item) =>
            <Button key={item.id} size="sm" variant={filter === item.id ? "default" : "outline"} onClick={() => setFilter(item.id)}>{item.label}</Button>)}
        </div>
        {loading ? <p className="text-sm text-muted-foreground">Caricamento...</p> :
          visible.length ? <div className="grid md:grid-cols-2 gap-3">{visible.map(renderContent)}</div> :
          <Card><CardContent className="p-6 text-center space-y-2"><FolderOpen className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Qui appariranno i tuoi contenuti. Nessun elemento in questa categoria.</p>
            <Button onClick={create}><Plus className="mr-1 h-4 w-4" />Crea contenuto</Button></CardContent></Card>}
      </div>}

      {tab === "calendar" && <div className="space-y-3">
        <Card><CardContent className="p-4 space-y-3">
          <p className="font-semibold">Calendario editoriale</p>
          <p className="text-sm text-muted-foreground">Le pubblicazioni programmate sono separate dagli appuntamenti lavorativi.</p>
          <Input type="month" value={calendarMonth} onChange={(e) => setCalendarMonth(e.target.value)} className="max-w-56" />
          {scheduled.filter((x) => x.scheduled_date.startsWith(calendarMonth)).length ?
            scheduled.filter((x) => x.scheduled_date.startsWith(calendarMonth)).map((item) =>
              <button key={item.content_id} onClick={() => edit(item)} className="block w-full rounded-lg border p-3 text-left hover:bg-muted/50">
                <strong>{prettyDate(item.scheduled_date)}</strong>
                <span className="block">{item.title}</span>
                <span className="text-xs text-muted-foreground">{item.channel} · Programmato</span>
              </button>) :
            <p className="text-sm text-muted-foreground">Nessuna pubblicazione programmata nel mese selezionato.</p>}
          <Link to="/calendar" className="inline-flex items-center text-sm text-primary underline underline-offset-4"><CalendarDays className="h-4 w-4 mr-1" />Apri l'agenda Beside</Link>
        </CardContent></Card>
      </div>}

      {tab === "guide" && <div className="grid md:grid-cols-2 gap-3">
        {[
          ["Parti dall'obiettivo", "Decidi cosa vuoi ottenere: contatti, visibilità, vendite o fiducia."],
          ["Post efficace", "Inizia da un problema reale, mostra il beneficio e concludi con una CTA chiara."],
          ["Reel breve", "Apri con un hook nei primi secondi, mostra un esempio e termina con un invito all'azione."],
          ["Lavora con l'AI", "Descrivi servizio, cliente, canale e tono. Poi correggi sempre il testo e verifica eventuali affermazioni."],
          ["Dalla bozza alla pubblicazione", "Crea, salva, revisiona, programma e segna pubblicato. Nessun post viene pubblicato automaticamente."],
        ].map(([title, description]) =>
          <Card key={title}><CardContent className="p-4">
            <p className="font-semibold flex items-center gap-2"><Lightbulb className="h-4 w-4 text-secondary" />{title}</p>
            <p className="text-sm text-muted-foreground mt-2">{description}</p>
          </CardContent></Card>)}
      </div>}
    </div>
  );
};
