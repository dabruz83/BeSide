const pad = n => String(n).padStart(2, '0');
export const localParts = value => {
  if (!value) return { date: '', time: '' };
  const d = new Date(value);
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` };
};
// Construct local dates numerically: no browser-dependent ISO-without-offset parsing.
export const parseLocal = (date, time) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}(:\d{2})?$/.test(time)) return null;
  const [y, m, day] = date.split('-').map(Number), [h, min, sec = 0] = time.split(':').map(Number);
  const d = new Date(y, m - 1, day, h, min, sec);
  // Also rejects times skipped by the daylight-saving transition.
  return d.getFullYear() === y && d.getMonth() === m - 1 && d.getDate() === day && d.getHours() === h && d.getMinutes() === min && d.getSeconds() === sec ? d : null;
};
export const manualPayload = (form, editing, jobId, now = new Date()) => {
  const errors = {};
  const timestamp = (prefix, original) => {
    const date = form[`${prefix}_date`], time = form[`${prefix}_time`];
    if (!date) errors[`${prefix}_date`] = 'Seleziona la data.';
    if (!time) errors[`${prefix}_time`] = 'Seleziona l’orario.';
    const parsed = parseLocal(date, time);
    if (date && time && !parsed) errors[`${prefix}_time`] = 'Data o ora non valida nel fuso locale (controlla il cambio di ora).';
    if (!parsed) return null;
    const previous = localParts(original);
    // Keep the exact instant (including milliseconds/DST offset) on unchanged corrections.
    return original && date === previous.date && (time.length === 5 ? time + ':00' : time) === previous.time ? new Date(original) : parsed;
  };
  const start = timestamp('start', editing?.started_at), end = timestamp('end', editing?.ended_at);
  const rawPause = String(form.pause_minutes).trim().replace(',', '.');
  const pause = rawPause === '' ? 0 : Number(rawPause);
  if (!Number.isFinite(pause) || pause < 0) errors.pause_minutes = 'Inserisci minuti di pausa validi, da zero in su.';
  if (start && end && end <= start) errors.end_time = 'La fine deve essere successiva all’inizio.';
  if (end && end > now) errors.end_time = 'La fine non può essere nel futuro.';
  const pauseSeconds = Math.round(pause * 60);
  if (start && end && end > start && pauseSeconds >= (end - start) / 1000) errors.pause_minutes = 'Le pause devono essere inferiori alla durata della sessione.';
  if (Object.keys(errors).length) return { errors };
  return { errors, payload: { job_id: jobId, started_at: start.toISOString(), ended_at: end.toISOString(), pause_seconds: pauseSeconds, activity_id: form.activity_id || null, billable: form.billable, notes: form.notes, revision: editing?.revision } };
};
