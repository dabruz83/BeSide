import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { Timer, Pause, Play, Square } from 'lucide-react';
import { API, useAuth } from '@/App';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useWorkTime } from './WorkTimeProvider';
import { elapsed, formatDuration, progress } from './timeMath.mjs';

const states = { running: 'In lavorazione', paused: 'In pausa', ended: 'Sessione terminata' };
const localInput = value => { const d = new Date(value); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19); };
const useNow = () => { const [now, setNow] = useState(Date.now()); useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []); return now; };
const Clock = ({ session, large = false }) => <span className={`font-mono tabular-nums ${large ? 'text-4xl sm:text-5xl' : 'text-base'}`}>{formatDuration(elapsed(session, useNow()))}</span>;
export const TimerControls = ({ session, compact = false }) => {
  const { act, busy } = useWorkTime();
  const [confirming, setConfirming] = useState(false);
  return <div className={`flex gap-2 shrink-0 ${compact ? "" : "flex-wrap"}`}>
    <Button type="button" variant="outline" className="min-h-11 min-w-11 px-3" disabled={busy} aria-label={session.status === 'running' ? 'Pausa' : 'Riprendi'} onClick={() => act(session, session.status === 'running' ? 'pause' : 'resume')}>{session.status === 'running' ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}{!compact && <span className="ml-2">{session.status === 'running' ? 'Pausa' : 'Riprendi'}</span>}</Button>
    <Button type="button" variant="outline" className="min-h-11 min-w-11 px-3" disabled={busy} aria-label="Termina sessione" onClick={() => setConfirming(true)}><Square className="h-4 w-4" />{!compact && <span className="ml-2">Termina sessione</span>}</Button>
    <Dialog open={confirming} onOpenChange={setConfirming}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Termina sessione</DialogTitle></DialogHeader><p>La commessa resterà aperta e potrai iniziare altre sessioni.</p><Button className="min-h-11" disabled={busy} onClick={async () => { if (await act(session, 'finish')) setConfirming(false); }}>Conferma termine</Button><Button className="min-h-11" variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>Annulla</Button></DialogContent></Dialog>
  </div>;
};
export const ActiveWorkTimer = () => {
  const { active } = useWorkTime();
  if (!active) return null;
  return <aside aria-label="Sessione di lavoro aperta" className="active-work-timer border border-secondary/40 rounded-2xl bg-card shadow-lg p-2 flex items-center gap-2">
    <Timer className="h-5 w-5 shrink-0 text-secondary" />
    <Link className="min-w-0 flex-1" to={`/jobs?timeJob=${encodeURIComponent(active.job_id)}`}><span className="block truncate text-sm font-medium">{active.client_name} · {active.job_name}</span><Clock session={active} /><span className="sr-only">{states[active.status]}</span></Link>
    <TimerControls session={active} compact />
  </aside>;
};
export const CurrentWorkCard = () => {
  const { active } = useWorkTime();
  if (!active) return null;
  return <Card><CardHeader><CardTitle className="flex gap-2 items-center text-lg"><Timer className="h-5 w-5 text-secondary" />Lavoro in corso</CardTitle></CardHeader><CardContent className="space-y-3"><p>{active.job_name} · {active.client_name}</p><p>{states[active.status]}</p><Clock session={active} large /><div className="flex flex-wrap gap-2"><TimerControls session={active} /><Button asChild variant="outline"><Link to={`/jobs?timeJob=${encodeURIComponent(active.job_id)}`}>Apri scheda lavoro</Link></Button></div></CardContent></Card>;
};
export const StartWorkButton = ({ jobId }) => {
  const { enabled, requestStart, busy } = useWorkTime(); const { user } = useAuth();
  return enabled && user?.role !== 'viewer' ? <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => requestStart(jobId)}><Timer className="mr-2 h-4 w-4" />Avvia lavorazione</Button> : null;
};

export const WorkTimeCard = ({ jobId }) => {
  const { user } = useAuth(); const ctx = useWorkTime(); const now = useNow();
  const [data, setData] = useState(null), [activities, setActivities] = useState([]), [error, setError] = useState('');
  const [editing, setEditing] = useState(null), [form, setForm] = useState(null), [estimate, setEstimate] = useState('');
  const manager = ['owner', 'admin'].includes(user?.role);
  useEffect(() => { let active = true; if (!ctx.enabled) return; Promise.all([axios.get(`${API}/jobs/${jobId}/work-time`), axios.get(`${API}/work-time/activities`)]).then(([r, a]) => {
    if (!active) return; const sampledAt = Date.now(); setData({ ...r.data, sessions: r.data.sessions.map(s => ({ ...s, sampledAt })) }); setActivities(a.data); setError('');
  }).catch(() => { if (active) setError('Impossibile caricare le ore. Riprova.'); }); return () => { active = false; }; }, [jobId, ctx.version, ctx.enabled]);
  if (!ctx.enabled) return null;
  const own = ctx.active?.job_id === jobId ? ctx.active : null;
  const total = data?.sessions.reduce((sum, s) => sum + elapsed(s, now), 0) || 0;
  const bar = progress(total, data?.estimated_hours);
  const openManual = row => {
    setEditing(row || null);
    setForm({ started_at: row ? localInput(row.started_at) : '', ended_at: row ? localInput(row.ended_at) : '',
      pause_minutes: row ? Math.max(0, ((new Date(row.ended_at) - new Date(row.started_at)) / 1000 - row.accumulated_seconds) / 60) : 0,
      activity_id: row?.activity_id || '', billable: row?.billable ?? true, notes: row?.notes || '' });
  };
  const saveManual = async e => {
    e.preventDefault();
    const start = new Date(form.started_at), end = new Date(form.ended_at);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start || end > new Date() || form.pause_minutes < 0 || form.pause_minutes * 60000 >= end - start) { setError('Controlla intervallo e pause.'); return; }
    const payload = { job_id: jobId, started_at: editing && form.started_at === localInput(editing.started_at) ? editing.started_at : start.toISOString(), ended_at: editing && form.ended_at === localInput(editing.ended_at) ? editing.ended_at : end.toISOString(), pause_seconds: Math.round(Number(form.pause_minutes) * 60), activity_id: form.activity_id || null, billable: form.billable, notes: form.notes, revision: editing?.revision };
    if (await ctx.mutate(editing ? 'patch' : 'post', editing ? `/work-time/sessions/${editing.session_id}` : '/work-time/manual', payload)) { setForm(null); setEditing(null); }
  };
  const groups = Object.groupBy ? Object.groupBy(data?.sessions || [], s => new Date(s.started_at).toLocaleDateString('it-IT')) : (data?.sessions || []).reduce((all, s) => { const day = new Date(s.started_at).toLocaleDateString('it-IT'); (all[day] ||= []).push(s); return all; }, {});
  return <Card className="min-w-0" data-testid="work-time-card"><CardHeader><CardTitle>Tempo di lavorazione</CardTitle></CardHeader><CardContent className="space-y-5">
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <p className="text-sm text-muted-foreground">{own ? states[own.status] : data?.sessions.some(s => s.user_id === user?.user_id) ? 'Sessione terminata' : 'Non avviato'}</p>
    {own ? <><Clock session={own} large /><TimerControls session={own} /></> : <><div className="font-mono text-4xl tabular-nums">00:00:00</div><StartWorkButton jobId={jobId} /></>}
    {!data ? <p role="status">Caricamento ore…</p> : <><p className="font-semibold">Ore effettive complessive: {formatDuration(total)}</p><p className="text-xs text-muted-foreground">Totale manodopera di tutti i collaboratori. Le pause sono escluse.</p>
    {bar && <div className="space-y-2"><p>Ore preventivate: {data.estimated_hours}</p><p>{bar.remaining >= 0 ? 'Ore residue' : 'Ore eccedenti'}: {formatDuration(Math.abs(bar.remaining))}</p><div role="progressbar" aria-label="Ore utilizzate" aria-valuenow={Math.round(bar.percent)} aria-valuemin={0} aria-valuemax={100} className="h-3 rounded-full bg-muted overflow-hidden"><div className={`h-full ${bar.color}`} style={{ width: `${bar.percent}%` }} /></div></div>}
    {manager && <details><summary className="cursor-pointer text-sm min-h-11">Imposta ore preventivate (facoltativo)</summary><form className="flex gap-2" onSubmit={async e => { e.preventDefault(); if (await ctx.mutate('put', `/jobs/${jobId}/work-time/estimate`, { hours: estimate === '' ? null : Number(estimate) })) setEstimate(''); }}><Input type="number" min="0.01" max="100000" step="0.01" aria-label="Ore preventivate" placeholder={data.estimated_hours ? String(data.estimated_hours) : 'Nessuna previsione'} value={estimate} onChange={e => setEstimate(e.target.value)} /><Button disabled={ctx.busy}>Salva</Button></form><p className="text-xs text-muted-foreground">Salva vuoto per rimuovere la previsione. Non modifica il preventivo economico.</p></details>}
    </>}
    {user?.role !== 'viewer' && <Button type="button" variant="outline" className="min-h-11" onClick={() => openManual(null)}>Inserisci ore manualmente</Button>}
    {form && <form onSubmit={saveManual} className="space-y-3 rounded-xl border p-3">
      <h3 className="font-medium">{editing ? 'Correggi sessione' : 'Inserimento manuale'}</h3>
      <label className="block text-sm">Data e ora di inizio<Input className="min-w-0 max-w-full" type="datetime-local" step="1" required value={form.started_at} onChange={e => setForm({ ...form, started_at: e.target.value })} /></label>
      <label className="block text-sm">Data e ora di fine<Input className="min-w-0 max-w-full" type="datetime-local" step="1" required value={form.ended_at} onChange={e => setForm({ ...form, ended_at: e.target.value })} /></label>
      <label className="block text-sm">Pause (minuti)<Input type="number" min="0" step="any" required value={form.pause_minutes} onChange={e => setForm({ ...form, pause_minutes: e.target.value })} /></label>
      <label className="block text-sm">Attività<select className="block min-h-11 w-full border rounded-md bg-background p-2" value={form.activity_id} onChange={e => setForm({ ...form, activity_id: e.target.value })}><option value="">Nessuna categoria</option>{activities.filter(a => a.active || a.activity_id === form.activity_id).map(a => <option key={a.activity_id} value={a.activity_id}>{a.name}</option>)}</select></label>
      <label className="flex gap-2 min-h-11 items-center"><input type="checkbox" checked={form.billable} onChange={e => setForm({ ...form, billable: e.target.checked })} />Ore fatturabili</label>
      <label className="block text-sm">Note<Textarea maxLength={2000} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></label><p className="text-xs text-muted-foreground">Orari nel fuso locale del dispositivo. Correzioni registrate nello storico di audit.</p>
      <div className="flex gap-2"><Button disabled={ctx.busy}>Salva ore</Button><Button type="button" variant="ghost" onClick={() => setForm(null)}>Annulla</Button></div>
    </form>}
    <h3 className="font-semibold">Storico sessioni</h3>
    {Object.entries(groups).map(([day, rows]) => <section key={day} className="space-y-2"><h4 className="text-sm font-medium">{day} · {formatDuration(rows.reduce((sum, s) => sum + elapsed(s, now), 0))}</h4>{rows.map(s => <div key={s.session_id} className="rounded-xl border p-3 text-sm space-y-1"><p className="font-medium">{s.collaborator_name} · {activities.find(a => a.activity_id === s.activity_id)?.name || 'Senza categoria'}</p><p>{new Date(s.started_at).toLocaleString('it-IT')} → {s.ended_at ? new Date(s.ended_at).toLocaleString('it-IT') : states[s.status]}</p><p>{formatDuration(elapsed(s, now))} · {s.billable ? 'Fatturabili' : 'Non fatturabili'} · {s.source === 'manual' ? 'Manuale' : 'Timer'}</p>{s.notes && <p className="whitespace-pre-wrap break-words">{s.notes}</p>}{!s.is_open && (manager || s.user_id === user?.user_id) && user?.role !== 'viewer' && <Button variant="ghost" className="min-h-11" onClick={() => openManual(s)}>Correggi</Button>}</div>)}</section>)}
    {data && !data.sessions.length && <p className="text-sm text-muted-foreground">Nessuna sessione registrata.</p>}
  </CardContent></Card>;
};

export const WorkActivitiesSettings = () => {
  const { enabled } = useWorkTime(); const { user } = useAuth();
  const [items, setItems] = useState([]), [name, setName] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const load = () => axios.get(`${API}/work-time/activities`).then(r => setItems(r.data)).catch(() => setError('Impossibile caricare le attività'));
  useEffect(() => { if (enabled) void load(); }, [enabled]);
  if (!enabled) return null;
  const save = async (item, nextName = item?.name, rename = false) => { setBusy(true); setError(''); try { await axios({ method: item ? 'patch' : 'post', url: `${API}/work-time/activities${item ? '/' + item.activity_id : ''}`, data: { name: item ? nextName : name, active: item ? (rename ? item.active : !item.active) : true } }); setName(''); await load(); } catch { setError('Salvataggio non riuscito. Verifica il nome e riprova.'); } finally { setBusy(false); } };
  return <Card><CardHeader><CardTitle>Attività di lavorazione</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-sm text-muted-foreground">Categorie facoltative, personalizzabili per la tua azienda: Preparazione, Progettazione, Installazione, Sviluppo, Produzione, Controllo qualità, Altro.</p>{error && <p role="alert">{error}</p>}{items.map(item => <div key={item.activity_id} className="flex items-center gap-2"><span className="flex-1 break-words">{item.name}{!item.active && ' (archiviata)'}</span>{['owner','admin'].includes(user?.role) && <div className="flex flex-wrap gap-1"><Button className="min-h-11" variant="ghost" disabled={busy} onClick={() => { const next = window.prompt('Nome attività', item.name); if (next?.trim()) void save(item, next.trim(), true); }}>Rinomina</Button><Button className="min-h-11" variant="outline" disabled={busy} onClick={() => save(item)}>{item.active ? 'Archivia' : 'Riattiva'}</Button></div>}</div>)}{['owner','admin'].includes(user?.role) && <form className="flex gap-2" onSubmit={e => { e.preventDefault(); void save(); }}><Input aria-label="Nome attività di lavorazione" maxLength={80} required value={name} onChange={e => setName(e.target.value)} placeholder="Nuova attività" /><Button disabled={busy}>Aggiungi</Button></form>}</CardContent></Card>;
};
