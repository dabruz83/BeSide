import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { API } from "@/App";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export const PostWorkSupportPage = () => {
  const { token } = useParams();
  const [job, setJob] = useState(null);
  const [message, setMessage] = useState("");
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/post-work/${token}`);
      setJob(data);
    } catch (error) {
      setJob(null);
      toast.error(error.response?.data?.detail || "Link assistenza non disponibile");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const submit = async (event) => {
    event.preventDefault();
    if (!message.trim()) return;
    setSending(true);
    try {
      const form = new FormData();
      form.append("message", message.trim());
      photos.forEach((photo) => form.append("photos", photo));
      await axios.post(`${API}/post-work/${token}/requests`, form);
      setSent(true);
      setMessage("");
      setPhotos([]);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Impossibile inviare la segnalazione");
    } finally {
      setSending(false);
    }
  };

  if (loading) return <main className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></main>;
  if (!job) return <main className="min-h-screen flex items-center justify-center p-6"><Card className="w-full max-w-lg"><CardContent className="p-6 text-center">Il link assistenza non è valido, è scaduto o è stato revocato.</CardContent></Card></main>;
  if (sent) return <main className="min-h-screen flex items-center justify-center p-6"><Card className="w-full max-w-lg"><CardHeader><CardTitle>Segnalazione inviata</CardTitle></CardHeader><CardContent className="space-y-3"><p>Abbiamo ricevuto la tua segnalazione. L'installatore potrà prenderla in carico e rispondere.</p><Button className="w-full" onClick={() => setSent(false)}>Invia un'altra segnalazione</Button></CardContent></Card></main>;

  return <main className="min-h-screen bg-background p-4 sm:p-6"><Card className="mx-auto mt-8 w-full max-w-lg"><CardHeader><CardTitle>Assistenza post-lavorazione</CardTitle><p className="text-sm text-muted-foreground">{job.client_name}{job.job_type ? ` · ${job.job_type}` : ""}</p></CardHeader><CardContent><form onSubmit={submit} className="space-y-4"><label className="block text-sm font-medium">Descrivi il problema<Textarea className="mt-2 min-h-32" maxLength={4000} required value={message} onChange={(event) => setMessage(event.target.value)} /></label><label className="block text-sm font-medium">Fotografie (facoltative, max 4 file da 5 MB)<input className="mt-2 block w-full text-sm" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => setPhotos(Array.from(event.target.files || []).slice(0, 4))} /></label><Button className="w-full" type="submit" disabled={sending}>{sending ? "Invio..." : "Invia segnalazione"}</Button></form></CardContent></Card></main>;
};
