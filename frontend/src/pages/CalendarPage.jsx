import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { useSearchParams } from "react-router-dom";
import { API } from "@/App";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CalendarDays, CalendarRange, Clock, FileCheck2, GripVertical, Plus, Trash2, Download } from "lucide-react";

const HOUR_FIRST = 7;
const HOUR_LAST = 20;
const HOUR_HEIGHT = 64;
const TRACK_HEIGHT = (HOUR_LAST - HOUR_FIRST) * HOUR_HEIGHT;
const INITIAL_WINDOW_DAYS = 42;
const WINDOW_EXTENSION_DAYS = 14;
const WORK_TYPES = [
  ["ppf_full", "PPF completo"], ["ppf_partial", "PPF parziale"],
  ["wrap_decorative", "Wrap decorativo"], ["wrap_commercial", "Wrap commerciale"],
  ["tint", "Oscuramento vetri"], ["upholstery", "Tappezzeria"],
  ["altro", "Altro"]
];
const REMINDERS = [[0, "All'orario dell'evento"], [5, "5 minuti prima"], [10, "10 minuti prima"],
  [20, "20 minuti prima"], [30, "30 minuti prima"], [60, "1 ora prima"]];
const pad = (n) => String(n).padStart(2, "0");
const dayKey = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const localDateTime = (d) => dayKey(d) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
const dateTimeParts = (value = "") => {
  const [date = "", rawTime = ""] = value.split("T");
  return { date, time: rawTime.slice(0, 5) };
};
const dayAt = (s) => new Date(s + "T00:00:00");
const addDays = (d, n) => { const v = new Date(d); v.setDate(v.getDate() + n); return v; };
const weekStart = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - (x.getDay() + 6) % 7); return x; };
const dayLabel = (d) => new Intl.DateTimeFormat("it-IT", { weekday: "short", day: "numeric", month: "short" }).format(d);
const typeName = (code) => WORK_TYPES.find((x) => x[0] === code)?.[1] || "Lavoro";
const minutesOf = (date) => date.getHours() * 60 + date.getMinutes();
const defaultForm = () => {
  const base = new Date(); base.setHours(9, 0, 0, 0);
  const end = new Date(base); end.setHours(11);
  return { title: "", starts_at: localDateTime(base), ends_at: localDateTime(end),
    resource: "Postazione 1", job_id: "", job_type: "altro", client_name: "",
    client_email: "", vehicle_info: "", notes: "", reminder_minutes: [30] };
};
const eventToForm = (e) => ({ ...e, starts_at: localDateTime(new Date(e.starts_at)),
  ends_at: localDateTime(new Date(e.ends_at)), job_id: e.job_id || "",
  client_email: e.client_email || "", reminder_minutes: e.reminder_minutes || [] });
const escIcs = (v) => String(v || "").replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/[,;]/g, "\\$&");
const icsDate = (v) => new Date(v).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const downloadCalendar = (e) => {
  const content = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Beside//Pianificazione//IT",
    "BEGIN:VEVENT", "UID:" + e.event_id + "@mybeside.pro",
    "DTSTAMP:" + icsDate(new Date()), "DTSTART:" + icsDate(e.starts_at),
    "DTEND:" + icsDate(e.ends_at),
    "SUMMARY:" + escIcs(e.title),
    "DESCRIPTION:" + escIcs([e.client_name, typeName(e.job_type), e.vehicle_info, e.notes].filter(Boolean).join(" - ")),
    "LOCATION:" + escIcs(e.resource), "END:VEVENT", "END:VCALENDAR", ""].join("\r\n");
  const url = URL.createObjectURL(new Blob([content], { type: "text/calendar;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url; link.download = "Beside-" + e.event_id + ".ics";
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};

const DateTimeField = ({ label, value, onChange }) => {
  const { date, time } = dateTimeParts(value);
  const setPart = (part, nextValue) => {
    const next = part === "date"
      ? `${nextValue}T${time}`
      : `${date}T${nextValue}`;
    onChange(next);
  };

  return <div className="min-w-0 space-y-1.5">
    <Label>{label} *</Label>
    <div className="grid min-w-0 grid-cols-[minmax(0,1.35fr)_minmax(7rem,0.65fr)] overflow-hidden rounded-2xl border border-input bg-background shadow-sm">
      <label className="min-w-0 px-3 py-2.5 text-center">
        <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Data</span>
        <input
          type="date"
          required
          aria-label={`${label}: data`}
          value={date}
          onChange={(event) => setPart("date", event.target.value)}
          className="calendar-date-time-input mt-0.5 h-8 w-full min-w-0 bg-transparent p-0 text-center text-base font-semibold text-foreground outline-none"
        />
      </label>
      <label className="min-w-0 border-l border-primary/15 bg-sky-50 px-2 py-2.5 text-center">
        <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-primary/70">Ora</span>
        <input
          type="time"
          required
          aria-label={`${label}: ora`}
          value={time}
          onChange={(event) => setPart("time", event.target.value)}
          className="calendar-date-time-input mt-0.5 h-8 w-full min-w-0 bg-transparent p-0 text-center text-lg font-bold text-primary outline-none"
        />
      </label>
    </div>
  </div>;
};

export const CalendarPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [focusDate, setFocusDate] = useState(() => new Date());
  const [view, setView] = useState("week");
  const [windowStart, setWindowStart] = useState(() => addDays(weekStart(new Date()), -14));
  const [windowDays, setWindowDays] = useState(INITIAL_WINDOW_DAYS);
  const [resourceFilter, setResourceFilter] = useState("Postazione 1");
  const [events, setEvents] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [busy, setBusy] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [dragGhost, setDragGhost] = useState(null);
  const dragRef = useRef(null);
  const calendarScrollRef = useRef(null);
  const scrollGestureRef = useRef(null);
  const scrollFrameRef = useRef(null);
  const expandingWindowRef = useRef(false);
  const pendingScrollAdjustmentRef = useRef(0);
  const deepLinkUsed = useRef("");

  const start = windowStart;
  const end = useMemo(() => addDays(windowStart, windowDays), [windowStart, windowDays]);
  const dates = useMemo(() => Array.from({ length: windowDays },
    (_, i) => addDays(windowStart, i)), [windowStart, windowDays]);

  const reload = useCallback(async () => {
    setBusy(true);
    try {
      const [list, accepted] = await Promise.all([
        axios.get(API + "/calendar/events", { params: { start: start.toISOString(), end: end.toISOString() } }),
        axios.get(API + "/calendar/accepted-quotes")
      ]);
      setEvents(list.data);
      setQuotes(accepted.data);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Impossibile caricare la pianificazione.");
    } finally {
      setBusy(false);
    }
  }, [start, end]);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => {
    const calendar = calendarScrollRef.current;
    if (!calendar) return undefined;

    const touchStart = (event) => {
      if (event.touches.length !== 1 || event.target.closest?.("[data-calendar-event]")) {
        scrollGestureRef.current = null;
        return;
      }
      const touch = event.touches[0];
      scrollGestureRef.current = {
        x: touch.clientX, y: touch.clientY,
        left: calendar.scrollLeft, top: calendar.scrollTop, direction: null,
      };
    };
    const touchMove = (event) => {
      const gesture = scrollGestureRef.current;
      if (!gesture || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const deltaX = touch.clientX - gesture.x;
      const deltaY = touch.clientY - gesture.y;
      if (!gesture.direction && Math.hypot(deltaX, deltaY) >= 10) {
        gesture.direction = Math.abs(deltaY) > Math.abs(deltaX) * 1.2 ? "vertical" : "free";
      }
      if (gesture.direction !== "vertical") return;
      event.preventDefault();
      calendar.scrollLeft = gesture.left;
      calendar.scrollTop = gesture.top - deltaY;
    };
    const touchEnd = () => { scrollGestureRef.current = null; };

    calendar.addEventListener("touchstart", touchStart, { passive: true });
    calendar.addEventListener("touchmove", touchMove, { passive: false });
    calendar.addEventListener("touchend", touchEnd, { passive: true });
    calendar.addEventListener("touchcancel", touchEnd, { passive: true });
    return () => {
      calendar.removeEventListener("touchstart", touchStart);
      calendar.removeEventListener("touchmove", touchMove);
      calendar.removeEventListener("touchend", touchEnd);
      calendar.removeEventListener("touchcancel", touchEnd);
    };
  }, []);
  useEffect(() => {
    const calendar = calendarScrollRef.current;
    if (!calendar) return undefined;
    const frame = requestAnimationFrame(() => {
      const target = calendar.querySelector(`[data-calendar-column="${dayKey(focusDate)}"]`);
      if (target) calendar.scrollLeft = Math.max(0, target.offsetLeft - 56);
    });
    return () => cancelAnimationFrame(frame);
  }, [view]);
  useEffect(() => {
    const calendar = calendarScrollRef.current;
    const adjustment = pendingScrollAdjustmentRef.current;
    const frame = requestAnimationFrame(() => {
      if (calendar && adjustment) calendar.scrollLeft += adjustment;
      pendingScrollAdjustmentRef.current = 0;
      expandingWindowRef.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [windowStart, windowDays]);
  useEffect(() => () => {
    if (scrollFrameRef.current) cancelAnimationFrame(scrollFrameRef.current);
  }, []);
  useEffect(() => {
    if (!dialogOpen) return undefined;
    const root = document.documentElement;
    const body = document.body;
    const previous = {
      rootOverflow: root.style.overflow,
      rootOverscroll: root.style.overscrollBehavior,
      bodyOverflow: body.style.overflow,
      bodyOverscroll: body.style.overscrollBehavior,
    };
    root.style.overflow = "hidden";
    root.style.overscrollBehavior = "none";
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";
    return () => {
      root.style.overflow = previous.rootOverflow;
      root.style.overscrollBehavior = previous.rootOverscroll;
      body.style.overflow = previous.bodyOverflow;
      body.style.overscrollBehavior = previous.bodyOverscroll;
    };
  }, [dialogOpen]);
  const fillQuote = (current, quote) => ({
    ...current, job_id: quote.job_id, title: typeName(quote.job_type) + " • " + quote.client_name,
    job_type: quote.job_type, client_name: quote.client_name, client_email: quote.client_email || "",
    vehicle_info: quote.vehicle_info || "",
  });
  const openNew = (starts, quote) => {
    const first = new Date(starts || new Date());
    first.setSeconds(0, 0);
    if (!starts) first.setHours(9, 0, 0, 0);
    const last = new Date(first.getTime() + 2 * 3600 * 1000);
    let next = { ...defaultForm(), starts_at: localDateTime(first), ends_at: localDateTime(last) };
    if (quote) next = fillQuote(next, quote);
    setEditing(null); setForm(next); setDialogOpen(true);
  };
  const openEdit = (event) => {
    setEditing(event);
    setForm(eventToForm(event));
    setFocusDate(new Date(event.starts_at));
    setDialogOpen(true);
  };
  useEffect(() => {
    const job = searchParams.get("job");
    if (!job || busy || deepLinkUsed.current === job || quotes.length === 0) return;
    const match = quotes.find((q) => q.job_id === job);
    if (match) { deepLinkUsed.current = job; openNew(null, match); }
    else { deepLinkUsed.current = job; toast.info("Il preventivo potrebbe essere già pianificato."); }
    setSearchParams({}, { replace: true });
  }, [quotes, busy, searchParams, setSearchParams]);

  const saveEvent = async (event) => {
    const payload = {
      ...event, starts_at: new Date(event.starts_at).toISOString(),
      ends_at: new Date(event.ends_at).toISOString(), job_id: event.job_id || null,
      client_email: event.client_email || null,
      reminder_minutes: event.reminder_minutes.map(Number),
    };
    if (new Date(payload.ends_at) <= new Date(payload.starts_at)) {
      throw new Error("La fine deve essere successiva all'inizio.");
    }
    if (editing) await axios.put(API + "/calendar/events/" + editing.event_id, payload);
    else await axios.post(API + "/calendar/events", payload);
  };
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.reminder_minutes.length > 4) {
      toast.error("Puoi selezionare al massimo quattro promemoria."); return;
    }
    setSaving(true);
    try {
      await saveEvent(form);
      toast.success(editing ? "Appuntamento aggiornato" : "Appuntamento pianificato");
      setResourceFilter(form.resource.trim());
      setDialogOpen(false); await reload();
    } catch (error) { toast.error(error.response?.data?.detail || error.message || "Salvataggio non riuscito"); }
    finally { setSaving(false); }
  };
  const cancelEvent = async () => {
    if (!editing || !window.confirm("Annullare questo appuntamento? Il preventivo rimarrà disponibile.")) return;
    setSaving(true);
    try {
      await axios.delete(API + "/calendar/events/" + editing.event_id);
      toast.success("Appuntamento annullato"); setDialogOpen(false); await reload();
    } catch (error) { toast.error(error.response?.data?.detail || "Impossibile annullare"); }
    finally { setSaving(false); }
  };
  const pointerDown = (e, event) => {
    if (e.button !== 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    dragRef.current = { id: e.pointerId, event, x: e.clientX, y: e.clientY,
      offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top,
      width: rect.width, height: rect.height };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const pointerMove = (e, event) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== e.pointerId) return;
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 12) return;
    setDragGhost({ x: e.clientX - drag.offsetX, y: e.clientY - drag.offsetY,
      width: drag.width, height: drag.height, event });
  };
  const pointerUp = async (e, event) => {
    const drag = dragRef.current; dragRef.current = null;
    setDragGhost(null);
    if (!drag || drag.id !== e.pointerId) return;
    const distance = Math.hypot(e.clientX - drag.x, e.clientY - drag.y);
    if (distance < 12) { openEdit(event); return; }
    const drop = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-calendar-day]");
    if (!drop) { toast.info("Trascina l'appuntamento su una fascia visibile."); return; }
    const rect = drop.getBoundingClientRect();
    const offset = Math.max(0, Math.min(TRACK_HEIGHT, e.clientY - drag.offsetY - rect.top));
    const minutes = Math.round((offset / HOUR_HEIGHT * 60) / 15) * 15 + HOUR_FIRST * 60;
    const day = dayAt(drop.dataset.calendarDay);
    day.setMinutes(minutes);
    const length = new Date(event.ends_at).getTime() - new Date(event.starts_at).getTime();
    if (!window.confirm("Spostare " + event.title + " a " + day.toLocaleString("it-IT") + "?")) return;
    const updated = { ...eventToForm(event), starts_at: localDateTime(day),
      ends_at: localDateTime(new Date(day.getTime() + length)) };
    setSaving(true);
    try {
      const payload = { ...updated, starts_at: day.toISOString(),
        ends_at: new Date(day.getTime() + length).toISOString(), client_email: updated.client_email || null,
        job_id: updated.job_id || null };
      await axios.put(API + "/calendar/events/" + event.event_id, payload);
      toast.success("Lavoro spostato"); setFocusDate(day); setResourceFilter(event.resource); await reload();
    } catch (error) { toast.error(error.response?.data?.detail || "Spostamento non riuscito"); }
    finally { setSaving(false); }
  };
  const handleCalendarScroll = (event) => {
    const calendar = event.currentTarget;
    if (scrollFrameRef.current) return;
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      const columns = [...calendar.querySelectorAll("[data-calendar-column]")];
      if (columns.length === 0) return;
      const viewportLeft = calendar.getBoundingClientRect().left + 56;
      const visibleColumn = columns.reduce((nearest, column) =>
        Math.abs(column.getBoundingClientRect().left - viewportLeft) <
          Math.abs(nearest.getBoundingClientRect().left - viewportLeft) ? column : nearest);
      const visibleDay = visibleColumn.dataset.calendarColumn;
      if (visibleDay) {
        setFocusDate((current) => dayKey(current) === visibleDay ? current : dayAt(visibleDay));
      }

      if (expandingWindowRef.current) return;
      const columnWidth = columns[0].getBoundingClientRect().width;
      const remainingRight = calendar.scrollWidth - calendar.clientWidth - calendar.scrollLeft;
      if (calendar.scrollLeft < columnWidth * 2) {
        expandingWindowRef.current = true;
        pendingScrollAdjustmentRef.current = columnWidth * WINDOW_EXTENSION_DAYS;
        setWindowStart((current) => addDays(current, -WINDOW_EXTENSION_DAYS));
        setWindowDays((current) => current + WINDOW_EXTENSION_DAYS);
      } else if (remainingRight < columnWidth * 3) {
        expandingWindowRef.current = true;
        setWindowDays((current) => current + WINDOW_EXTENSION_DAYS);
      }
    });
  };
  const displayedWeekStart = weekStart(focusDate);
  const calendarRange = view === "week"
    ? dayLabel(displayedWeekStart) + " – " + dayLabel(addDays(displayedWeekStart, 6))
    : new Intl.DateTimeFormat("it-IT", { dateStyle: "full" }).format(focusDate);
  const openNewOnFocus = () => {
    const starts = dayAt(dayKey(focusDate));
    starts.setHours(9, 0, 0, 0);
    openNew(starts);
  };
  const eventStyle = (e, day) => {
    const firstVisible = new Date(day);
    firstVisible.setHours(HOUR_FIRST, 0, 0, 0);
    const lastVisible = new Date(day);
    lastVisible.setHours(HOUR_LAST, 0, 0, 0);
    const starts = new Date(e.starts_at), ends = new Date(e.ends_at);
    const clippedStart = new Date(Math.max(firstVisible.getTime(), starts.getTime()));
    const clippedEnd = new Date(Math.min(lastVisible.getTime(), ends.getTime()));
    const top = (clippedStart - firstVisible) / 60000 * HOUR_HEIGHT / 60;
    const height = (clippedEnd - clippedStart) / 60000 * HOUR_HEIGHT / 60;
    return { top: top + "px", height: Math.max(24, height) + "px" };
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden" data-testid="calendar-page">
      <div className="shrink-0">
        <h1 className="text-2xl font-bold text-primary flex gap-2 items-center"><CalendarDays className="w-6 h-6" />Pianificazione</h1>
      </div>

      {quotes.length > 0 && <Card className="max-h-[22dvh] shrink-0 overflow-y-auto border-primary/20">
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><FileCheck2 className="w-5 h-5" />Preventivi accettati da pianificare ({quotes.length})</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {quotes.slice(0, 12).map((quote) => <div key={quote.job_id} className="border rounded-lg p-3 flex gap-2 items-center justify-between">
            <div className="min-w-0"><p className="font-medium truncate">{quote.client_name}</p>
              <p className="text-sm text-muted-foreground">{typeName(quote.job_type)} · {quote.vehicle_info || "Veicolo da definire"}</p></div>
            <Button size="sm" onClick={() => openNew(null, quote)}>Pianifica lavoro</Button>
          </div>)}
        </CardContent>
      </Card>}

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <CardContent className="flex min-h-0 flex-1 flex-col gap-3 px-3 pb-3 pt-3 sm:p-4">
          <div className="flex shrink-0 items-center gap-2 px-1">
            <h2 className="min-w-0 flex-1 truncate px-1 font-semibold text-sm sm:text-base">{calendarRange}</h2>
            <div className="flex shrink-0 items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="!h-10 !w-10 rounded-full [&_svg]:!size-5" aria-label="Scegli visualizzazione" title="Visualizzazione calendario"><CalendarRange /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={8} className="min-w-[190px] rounded-xl p-2">
                  <DropdownMenuCheckboxItem checked={view === "day"} onSelect={() => setView("day")} className="rounded-lg py-2.5">Giorno</DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem checked={view === "week"} onSelect={() => setView("week")} className="rounded-lg py-2.5">Settimana</DropdownMenuCheckboxItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button size="icon" className="!h-10 !w-10 rounded-full [&_svg]:!size-5" onClick={openNewOnFocus} aria-label="Nuovo appuntamento" title="Nuovo appuntamento"><Plus /></Button>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-3 px-1 text-sm">
            <Label htmlFor="calendar-resource">Postazione visualizzata</Label>
            <select id="calendar-resource" value={resourceFilter}
              onChange={(e) => setResourceFilter(e.target.value)}
              className="min-w-[175px] max-w-full rounded-md border bg-background p-2 text-sm">
              {[...new Set(["Postazione 1", "Postazione 2", "Postazione 3",
                ...events.map((event) => event.resource)])].map((name) =>
                <option key={name} value={name}>{name}</option>)}
            </select>
          </div>
          <div ref={calendarScrollRef} onScroll={handleCalendarScroll}
            className={"-mx-3 min-h-0 flex-1 scroll-pl-14 overflow-auto overscroll-contain border-y sm:mx-0 sm:rounded-lg sm:border " + (view === "day" ? "snap-x snap-mandatory" : "snap-x snap-proximity")}
            style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-x pan-y" }}>
            <div className="flex min-w-max">
              <div className="sticky left-0 z-[60] w-14 shrink-0 bg-background">
                <div className="sticky top-0 z-[60] h-12 border-b bg-muted/50" />
                <div className="relative" style={{ height: TRACK_HEIGHT }}>
                  {Array.from({ length: HOUR_LAST - HOUR_FIRST + 1 }, (_, i) =>
                    <div key={i} className="absolute right-1 text-xs text-muted-foreground -translate-y-1/2"
                      style={{ top: i * HOUR_HEIGHT }}>{pad(HOUR_FIRST + i)}:00</div>)}
                </div>
              </div>
              {dates.map((d) => {
                const key = dayKey(d);
                const dayEvents = events.filter((event) => {
                  const first = new Date(event.starts_at), last = new Date(event.ends_at);
                  const visibleStart = new Date(d); visibleStart.setHours(HOUR_FIRST, 0, 0, 0);
                  const visibleEnd = new Date(d); visibleEnd.setHours(HOUR_LAST, 0, 0, 0);
                  return event.resource === resourceFilter && first < visibleEnd && last > visibleStart;
                });
                const isToday = key === dayKey(new Date());
                const isSelected = key === dayKey(focusDate);
                return <div key={key} data-calendar-column={key} className={"relative isolate snap-start shrink-0 border-l " + (view === "day" ? "w-[min(78vw,600px)]" : "w-[158px] sm:w-[175px]")}>
                  <div className={"sticky top-0 z-50 h-12 border-b px-2 flex flex-col items-center justify-center text-xs font-semibold leading-tight text-primary " + (isToday ? "bg-sky-200" : "bg-sky-100")}>
                    <span className="uppercase">{new Intl.DateTimeFormat("it-IT", { weekday: "short" }).format(d)}</span>
                    <span className={"flex h-6 min-w-6 items-center justify-center rounded-full text-sm " + (isSelected ? "bg-primary text-primary-foreground" : "")}>{d.getDate()}</span>
                  </div>
                  <div data-calendar-day={key} className="relative cursor-crosshair"
                    style={{ height: TRACK_HEIGHT, backgroundImage: "repeating-linear-gradient(to bottom, transparent 0, transparent 31px, hsl(var(--border)) 31px, hsl(var(--border)) 32px)", backgroundSize: "100% 32px" }}
                    onClick={(e) => {
                      if (e.target.closest("[data-calendar-event]")) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      const halfHours = Math.floor((e.clientY - rect.top) / 32);
                      const time = dayAt(key); time.setMinutes(HOUR_FIRST * 60 + Math.max(0, halfHours) * 30);
                      openNew(time);
                      setForm((prev) => ({ ...prev, resource: resourceFilter }));
                    }}>
                    {dayEvents.map((ev) => {
                      const startMoment = new Date(ev.starts_at);
                      return <div key={ev.event_id} data-calendar-event
                        role="button" tabIndex={0}
                        aria-label={"Modifica " + ev.title}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openEdit(ev); } }}
                        onPointerDown={(e) => pointerDown(e, ev)}
                        onPointerMove={(e) => pointerMove(e, ev)}
                        onPointerUp={(e) => pointerUp(e, ev)}
                        onPointerCancel={() => { dragRef.current = null; setDragGhost(null); }}
                        style={{ ...eventStyle(ev, d), touchAction: "none", opacity: dragGhost?.event.event_id === ev.event_id ? 0.28 : 1 }}
                        className="absolute left-1 right-1 z-10 rounded border border-primary bg-primary px-2 py-1 overflow-hidden text-left cursor-grab active:cursor-grabbing select-none text-primary-foreground shadow-sm">
                        <div className="flex gap-1 items-start"><GripVertical className="h-3 w-3 shrink-0 mt-0.5" /><div className="min-w-0">
                          <p className="text-xs font-bold break-words leading-tight">{ev.title}</p>
                          <p className="text-[11px] font-medium">{pad(startMoment.getHours())}:{pad(startMoment.getMinutes())}</p>
                          <p className="text-[11px] opacity-80 truncate">{ev.resource}</p>
                        </div></div>
                      </div>;
                    })}
                  </div>
                </div>;
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {dragGhost && <div className="fixed z-[100] pointer-events-none rounded border border-primary bg-primary px-2 py-1 overflow-hidden text-left select-none text-primary-foreground shadow-xl"
        style={{ left: dragGhost.x, top: dragGhost.y, width: dragGhost.width, height: dragGhost.height }}>
        <div className="flex gap-1 items-start"><GripVertical className="h-3 w-3 shrink-0 mt-0.5" /><div className="min-w-0">
          <p className="text-xs font-bold break-words leading-tight">{dragGhost.event.title}</p>
          <p className="text-[11px] font-medium">{pad(new Date(dragGhost.event.starts_at).getHours())}:{pad(new Date(dragGhost.event.starts_at).getMinutes())}</p>
          <p className="text-[11px] opacity-80 truncate">{dragGhost.event.resource}</p>
        </div></div>
      </div>}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="flex h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-xl flex-col gap-0 overflow-hidden rounded-3xl p-0 sm:h-auto sm:max-h-[90dvh] sm:rounded-2xl">
          <DialogHeader className="shrink-0 border-b bg-background px-5 py-5 pr-14">
            <DialogTitle>{editing ? "Modifica appuntamento" : "Pianifica lavoro"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 touch-pan-y space-y-3 overflow-y-auto overflow-x-hidden overscroll-contain px-5 py-4">
            <div><Label>Titolo *</Label><Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Installazione PPF • Mario Rossi" /></div>
            <div><Label>Preventivo accettato (opzionale)</Label>
              <select className="w-full rounded-md border bg-background p-2 text-sm" value={form.job_id} onChange={(e) => {
                const q = quotes.find((item) => item.job_id === e.target.value);
                setForm(q ? fillQuote(form, q) : { ...form, job_id: "" });
              }}>
                <option value="">Appuntamento inserito manualmente</option>
                {editing?.job_id && !quotes.some((q) => q.job_id === editing.job_id) &&
                  <option value={editing.job_id}>Preventivo già associato</option>}
                {quotes.map((q) => <option key={q.job_id} value={q.job_id}>{q.client_name} · {typeName(q.job_type)}</option>)}
              </select></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <DateTimeField label="Inizio" value={form.starts_at} onChange={(value) => setForm({ ...form, starts_at: value })} />
              <DateTimeField label="Fine" value={form.ends_at} onChange={(value) => setForm({ ...form, ends_at: value })} />
              <div><Label>Postazione *</Label><Input required value={form.resource} onChange={(e) => setForm({ ...form, resource: e.target.value })} placeholder="Postazione 1" /></div>
              <div><Label>Lavorazione</Label><select className="w-full rounded-md border p-2 bg-background text-sm" value={form.job_type}
                onChange={(e) => setForm({ ...form, job_type: e.target.value })}>
                {WORK_TYPES.map(([id, label]) => <option value={id} key={id}>{label}</option>)}
              </select></div>
              <div><Label>Cliente</Label><Input value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} /></div>
              <div><Label>Email cliente (facoltativa)</Label><Input type="email" value={form.client_email} onChange={(e) => setForm({ ...form, client_email: e.target.value })} /></div>
            </div>
            <div><Label>Veicolo</Label><Input value={form.vehicle_info} onChange={(e) => setForm({ ...form, vehicle_info: e.target.value })} placeholder="Modello / targa / note" /></div>
            <div><Label>Note</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            <div><Label className="flex gap-2 items-center"><Clock className="w-4 h-4" />Promemoria email all'installatore</Label>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
                {REMINDERS.map(([minutes, label]) => <label key={minutes} className="flex items-center gap-2 border rounded p-2 text-xs">
                  <input type="checkbox" checked={form.reminder_minutes.includes(minutes)} onChange={(e) => setForm((prev) => ({
                    ...prev, reminder_minutes: e.target.checked ? [...prev.reminder_minutes, minutes] : prev.reminder_minutes.filter((x) => x !== minutes)
                  }))} />{label}
                </label>)}
              </div><p className="text-xs text-muted-foreground mt-1">Fino a quattro avvisi. In questa fase vengono inviati all'email del titolare dell'azienda, non al cliente.</p>
            </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t bg-background px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {editing ? <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => downloadCalendar(editing)}><Download className="w-4 h-4 mr-1" />Esporta .ics</Button>
                <Button type="button" variant="destructive" onClick={cancelEvent} disabled={saving}><Trash2 className="w-4 h-4" /></Button>
              </div> : <span />}
              <Button type="submit" className="ml-auto rounded-full px-5" disabled={saving}>{saving ? "Salvataggio..." : editing ? "Salva modifiche" : "Pianifica lavoro"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
