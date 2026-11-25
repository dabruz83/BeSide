import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API, useAuth } from '@/App';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const Context = createContext(null);
export const useWorkTime = () => useContext(Context);
const message = e => typeof e.response?.data?.detail === 'string' ? e.response.data.detail :
  e.response?.data?.detail?.message || 'Operazione non confermata. Controlla la connessione e riprova.';
export const WorkTimeProvider = ({ children }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [active, setActive] = useState(null), [enabled, setEnabled] = useState(false);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [version, setVersion] = useState(0);
  const [pending, setPending] = useState(null), [startJob, setStartJob] = useState(null), [conflict, setConflict] = useState(null);
  const [activities, setActivities] = useState([]), [activityId, setActivityId] = useState('');
  const inFlight = useRef(false), identity = useRef(null), sequence = useRef(0);
  const key = user ? `beside:work-time:${user.company_id}:${user.user_id}` : null;
  identity.current = key;
  const refresh = useCallback(async () => {
    if (!key) return;
    const requestId = ++sequence.current;
    try {
      const { data } = await axios.get(`${API}/work-time/active`);
      if (identity.current !== key || requestId !== sequence.current) return;
      setEnabled(data.enabled);
      setActive(data.session ? { ...data.session, sampledAt: Date.now() } : null);
      setVersion(v => v + 1);
    } catch (e) { if (identity.current === key) setError(message(e)); }
  }, [key]);
  useEffect(() => {
    setActive(null); setEnabled(false); setError(''); setPending(null);
    if (!key) return;
    try { setPending(JSON.parse(localStorage.getItem(key) || 'null')); } catch { setError('Impossibile recuperare l’operazione in attesa.'); }
    let stopped = false, timer;
    const poll = async () => { await refresh(); if (!stopped) timer = setTimeout(poll, 15000); };
    void poll();
    const recover = () => { if (document.visibilityState !== 'hidden') void refresh(); };
    window.addEventListener('online', recover); document.addEventListener('visibilitychange', recover);
    return () => { stopped = true; clearTimeout(timer); ++sequence.current; window.removeEventListener('online', recover); document.removeEventListener('visibilitychange', recover); };
  }, [key, refresh]);
  const send = useCallback(async operation => {
    if (!key || inFlight.current) return false;
    inFlight.current = true; setBusy(true); setError('');
    try {
      // Save the id before sending: an uncertain response can safely be retried after restart.
      localStorage.setItem(key, JSON.stringify(operation)); setPending(operation);
      await axios({ method: operation.method, url: API + operation.path, data: operation.data, timeout: 20000 });
      localStorage.removeItem(key);
      if (identity.current !== key) return false;
      setPending(null); await refresh(); return true;
    } catch (e) {
      if (identity.current !== key) return false;
      if (e.response?.status >= 400 && e.response.status < 500) {
        localStorage.removeItem(key); setPending(null);
        if (e.response.data?.detail?.session) setConflict(e.response.data.detail.session);
      }
      setError(message(e)); await refresh(); return false;
    } finally { inFlight.current = false; if (identity.current === key) setBusy(false); }
  }, [key, refresh]);
  const mutate = useCallback((method, path, data) => {
    if (pending || inFlight.current) return Promise.resolve(false);
    return send({ method, path, data: { ...data, operation_id: crypto.randomUUID() } });
  }, [pending, send]);
  const act = (session, action) => mutate('post', `/work-time/sessions/${session.session_id}/${action}`, { revision: session.revision });
  const requestStart = async jobId => {
    if (pending || busy) return;
    setStartJob(jobId); setActivityId('');
    if (active) setConflict(active);
    try { const { data } = await axios.get(`${API}/work-time/activities`); setActivities(data); }
    catch (e) { setError(message(e)); }
  };
  const begin = async () => { if (await mutate('post', '/work-time/start', { job_id: startJob, activity_id: activityId || null })) { setStartJob(null); setConflict(null); } };
  const switchJob = async () => {
    if (!await act(conflict, 'finish')) return;
    setConflict(null);
    // Separate confirmed writes: never start the new job if finishing was not acknowledged.
    await begin();
  };
  return <Context.Provider value={{ active, enabled, error, busy: busy || Boolean(pending), version, refresh, mutate, act, requestStart }}>
    {children}
    {key && (pending || error) && <div role="alert" className="fixed top-16 left-4 right-4 md:left-auto md:max-w-sm z-[60] rounded-xl border bg-card p-3 shadow-lg text-sm">
      {error || 'Operazione in attesa di conferma.'}
      {pending ? <Button className="work-time-primary mt-2 min-h-11 w-full" disabled={busy} onClick={() => send(pending)}>Riprova operazione</Button> : <Button variant="ghost" onClick={() => setError('')}>Chiudi</Button>}
    </div>}
    <Dialog open={Boolean(startJob)} onOpenChange={open => { if (!open && !busy) { setStartJob(null); setConflict(null); } }}>
      <DialogContent className="max-w-md"><DialogHeader><DialogTitle>{conflict ? 'Hai già una sessione di lavoro aperta.' : 'Avvia lavorazione'}</DialogTitle></DialogHeader>
        <label className="text-sm">Tipo di lavorazione (facoltativo)<select className="mt-2 min-h-11 w-full rounded-md border bg-background p-2" value={activityId} onChange={e => setActivityId(e.target.value)}><option value="">Nessuna categoria</option>{activities.filter(a => a.active).map(a => <option key={a.activity_id} value={a.activity_id}>{a.name}</option>)}</select></label>
        {conflict ? <><Button variant="outline" className="work-time-secondary min-h-11" onClick={() => { navigate(`/jobs?timeJob=${encodeURIComponent(conflict.job_id)}`); setStartJob(null); setConflict(null); }}>Torna al lavoro in corso</Button><Button disabled={busy || Boolean(pending)} className="work-time-primary min-h-11 whitespace-normal h-auto" onClick={switchJob}>Termina sessione e avvia nuovo lavoro</Button></> : <Button disabled={busy || Boolean(pending)} className="work-time-primary min-h-11" onClick={begin}>Avvia</Button>}
        <Button variant="ghost" className="work-time-cancel" disabled={busy} onClick={() => { setStartJob(null); setConflict(null); }}>Annulla</Button>
      </DialogContent>
    </Dialog>
  </Context.Provider>;
};
