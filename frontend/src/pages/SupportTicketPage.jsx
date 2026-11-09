import { useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import { API, useAuth } from "@/App";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const categories = [
  ["password", "Recupero password"],
  ["authentication", "Autenticazione"],
  ["privacy", "Privacy e cancellazione dati"],
  ["billing", "Abbonamenti"],
  ["technical", "Problemi tecnici"],
  ["other", "Altra richiesta"],
];

export const SupportTicketPage = () => {
  const { user } = useAuth();
  const [category, setCategory] = useState("technical");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const response = await axios.post(`${API}${user ? "/auth/support/tickets" : "/support/tickets"}`, {
        category,
        subject: subject.trim(),
        message: message.trim(),
        email: email.trim() || undefined,
      });
      setResult({ type: "success", text: response.data.message });
      setSubject("");
      setMessage("");
    } catch (error) {
      const retryAfter = error.response?.headers?.["retry-after"];
      const detail = typeof error.response?.data?.detail === "string"
        ? error.response.data.detail
        : error.response?.status === 429
          ? `Troppe richieste. Riprova tra ${retryAfter || "alcuni minuti"}.`
          : "Non è stato possibile inviare la richiesta. Riprova più tardi.";
      setResult({ type: "error", text: detail });
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-6">
      <section className="w-full max-w-2xl space-y-6">
        <div className="text-center space-y-2">
          <Link to="/" className="text-3xl font-bold text-primary">BESIDE</Link>
          <h1 className="text-2xl font-semibold">Centro assistenza</h1>
          <p className="text-muted-foreground">Invia una richiesta senza inserire password, codici o altri segreti.</p>
        </div>
        <form onSubmit={submit} className="rounded-xl border bg-card p-6 shadow-sm space-y-4">
          <div className="space-y-2">
            <Label htmlFor="support-category">Categoria</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="support-category"><SelectValue /></SelectTrigger>
              <SelectContent>{categories.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="support-subject">Oggetto</Label>
            <Input id="support-subject" required maxLength={200} value={subject} onChange={(event) => setSubject(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="support-message">Descrizione</Label>
            <Textarea id="support-message" required maxLength={4000} rows={6} value={message} onChange={(event) => setMessage(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="support-email">Email per eventuale risposta (facoltativa)</Label>
            <Input id="support-email" type="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} />
          </div>
          {result && <p className={`text-sm ${result.type === "error" ? "text-destructive" : "text-muted-foreground"}`}>{result.text}</p>}
          <Button type="submit" disabled={busy || !subject.trim() || !message.trim()} className="w-full">{busy ? "Invio..." : "Invia richiesta"}</Button>
        </form>
        <p className="text-center text-sm text-muted-foreground"><Link to="/login" className="text-primary underline">Torna al login</Link></p>
      </section>
    </main>
  );
};
