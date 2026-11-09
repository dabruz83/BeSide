import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';
import { ImagePlus, RotateCcw, Sparkles, X } from 'lucide-react';
import { FILM_LIST } from '../data/films';
import { CITY_CAR_INTERACTIVE_ZONES, CITY_CAR_FULL_WRAP_AVAILABLE } from '../data/cityCarInteractiveAssets';
import { PHOTO_CUSTOMIZATION_ZONES, buildPhotoPreviewFormData, createPhotoPreviewRequest, generatePhotoPreview } from '../data/photoAi';
import { VehiclePreview } from '../preview/VehiclePreview';
import { BeforeAfterSlider } from '../preview/BeforeAfterSlider';
import { PhotoMaskEditor } from '../preview/PhotoMaskEditor';

export const Personalize = ({
  vehicle,
  view,
  assets,
  zoneSelections,
  activeZone,
  onViewChange,
  onColorChange,
  onResetZone,
  onResetAll,
  photoAiEndpoint,
}) => {
  const [finishFilter, setFinishFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [uploadedPhoto, setUploadedPhoto] = useState(null);
  const [modifiedPhoto, setModifiedPhoto] = useState(null); // predisposto per il futuro flusso AI
  const photoInputRef = useRef(null);
  const graphicsInputRef = useRef(null);
  const [activePhotoZone, setActivePhotoZone] = useState('vehicle');
  const [photoFinish, setPhotoFinish] = useState('lucida');
  const [photoSelections, setPhotoSelections] = useState({});
  const [photoGraphics, setPhotoGraphics] = useState(null);
  const [photoMask, setPhotoMask] = useState(null);
  const [photoMaskPoints, setPhotoMaskPoints] = useState([]);
  const [photoNotes, setPhotoNotes] = useState('');
  const [photoErrors, setPhotoErrors] = useState([]);
  const [aiNotice, setAiNotice] = useState('');
  const [pendingAiRequest, setPendingAiRequest] = useState(null);
  const [photoAiBusy, setPhotoAiBusy] = useState(false);
  const cityCar = vehicle === 'city_car';
  const zones = cityCar ? CITY_CAR_INTERACTIVE_ZONES : [];
  const [currentZone, setCurrentZone] = useState(activeZone || zones[0]?.id);
  const activeZoneData = zones.find((zone) => zone.id === currentZone);
  const variants = activeZoneData?.variants || [];
  const selectedVariant = activeZoneData && zoneSelections[activeZoneData.id];

  const visibleVariants = useMemo(() => variants.filter((variant) => {
    const matchesFinish = finishFilter === 'all' || variant.finish === finishFilter;
    const matchesView = Boolean(variant.views?.[view]);
    const query = search.trim().toLowerCase();
    return matchesView && matchesFinish && (!query || `${variant.label} ${variant.code}`.toLowerCase().includes(query));
  }), [variants, finishFilter, search, view]);

  const overlays = selectedVariant?.views?.[view] ? [selectedVariant.views[view]] : [];

  useEffect(() => () => {
    if (uploadedPhoto?.url) URL.revokeObjectURL(uploadedPhoto.url);
  }, [uploadedPhoto]);
  useEffect(() => () => {
    if (photoGraphics?.url) URL.revokeObjectURL(photoGraphics.url);
  }, [photoGraphics]);

  const handlePhotoChange = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return;
    if (uploadedPhoto?.url) URL.revokeObjectURL(uploadedPhoto.url);
    if (photoGraphics?.url) URL.revokeObjectURL(photoGraphics.url);
    setUploadedPhoto({ file, name: file.name, type: file.type, size: file.size, url: URL.createObjectURL(file) });
    setModifiedPhoto(null);
    setPhotoGraphics(null);
    setPhotoMask(null);
    setPhotoMaskPoints([]);
    setPhotoSelections({});
    setPhotoErrors([]);
    setPhotoNotes('');
  };

  const clearUploadedPhoto = () => {
    if (uploadedPhoto?.url) URL.revokeObjectURL(uploadedPhoto.url);
    setUploadedPhoto(null);
    setModifiedPhoto(null);
    if (photoGraphics?.url) URL.revokeObjectURL(photoGraphics.url);
    setPhotoGraphics(null);
    setPhotoMask(null);
    setPhotoMaskPoints([]);
    setPhotoSelections({});
    setPhotoErrors([]);
    setPhotoNotes('');
    setAiNotice('');
    setPendingAiRequest(null);
  };

  const activePhotoZoneData = PHOTO_CUSTOMIZATION_ZONES.find((zone) => zone.id === activePhotoZone);
  const activePhotoFilm = FILM_LIST.find((film) => film.id === photoFinish) || FILM_LIST[0];
  const activePhotoSelection = photoSelections[activePhotoZone];
  const setPhotoSelection = (selection) => {
    setPhotoSelections((current) => ({
      ...current,
      [activePhotoZone]: { zoneId: activePhotoZone, kind: activePhotoZoneData?.kind, ...selection },
    }));
    setAiNotice('');
  };

  const handleGraphicsChange = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return;
    if (photoGraphics?.url) URL.revokeObjectURL(photoGraphics.url);
    const graphic = { file, name: file.name, url: URL.createObjectURL(file) };
    setPhotoGraphics(graphic);
    setPhotoSelections((current) => ({ ...current, graphics: { zoneId: 'graphics', kind: 'graphic', graphicName: graphic.name, graphicFile: file } }));
    setAiNotice('');
  };

  const requestPhotoPreview = () => {
    if (!uploadedPhoto) return;
    const request = createPhotoPreviewRequest({ photo: uploadedPhoto, vehicle, selections: photoSelections, notes: photoNotes, maskFile: photoMask, maskPoints: photoMaskPoints });
    generatePhotoPreview(request).then((result) => {
      if (result.status === 'invalid') {
        setPhotoErrors(result.errors);
        setPendingAiRequest(null);
        setAiNotice('Completa i dati richiesti prima di generare l’anteprima.');
        return;
      }
      setPhotoErrors([]);
      setPendingAiRequest(result.request);
      setPhotoAiBusy(true);
      setModifiedPhoto(null);
      setAiNotice('Configurazione pronta. Invio della richiesta al servizio AI…');
      return axios.post(photoAiEndpoint, buildPhotoPreviewFormData(result.request), {
        withCredentials: true,
        timeout: 120000,
      });
    }).then((response) => {
      const generated = response?.data?.modified_image;
      if (!generated?.base64 || !generated?.content_type) {
        setAiNotice('Il servizio non ha restituito un’immagine: nessun risultato è stato simulato.');
        return;
      }
      setModifiedPhoto({ url: `data:${generated.content_type};base64,${generated.base64}` });
      setAiNotice('Anteprima AI ricevuta. Puoi confrontarla nello slider Prima/Dopo.');
    }).catch((error) => {
      const detail = error.response?.data?.detail;
      setModifiedPhoto(null);
      setAiNotice(detail || 'Impossibile generare l’anteprima AI. Riprova più tardi.');
    }).finally(() => {
      setPhotoAiBusy(false);
    });
  };

  const beforePreview = (
    <VehiclePreview vehicleType={vehicle} view={view} assets={assets} />
  );
  const afterPreview = (
    <VehiclePreview vehicleType={vehicle} view={view} assets={assets} overlays={overlays} />
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]"
    >
      <section className="order-1 min-w-0 overflow-hidden rounded-2xl border border-[#D9D9D9] bg-white shadow-[0_16px_40px_rgba(0,0,0,0.22)]">
        <div className="relative aspect-[4/3] min-h-[360px] lg:aspect-[16/10] lg:min-h-[470px]">
          {uploadedPhoto ? (
            <div className="relative h-full w-full bg-white">
              {modifiedPhoto ? (
                <BeforeAfterSlider
                  before={<img src={uploadedPhoto.url} alt="Foto originale caricata" className="h-full w-full object-contain" />}
                  after={<img src={modifiedPhoto.url} alt="Anteprima AI modificata" className="h-full w-full object-contain" />}
                />
              ) : <img src={uploadedPhoto.url} alt="Foto caricata del veicolo" className="h-full w-full object-contain" />}
              {!modifiedPhoto && <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/65 px-3 py-1.5 text-center text-xs text-white">Anteprima foto · personalizzazione AI non ancora attiva</div>}
            </div>
          ) : (
            <BeforeAfterSlider before={beforePreview} after={afterPreview} enabled={Boolean(selectedVariant)} />
          )}
        </div>
        <div className="flex items-center justify-between border-t border-[#E6E6E6] bg-white px-4 py-3 text-sm text-[#333]">
          <div className="flex gap-2">
            {['front', 'rear'].map((candidate) => (
              <button
                key={candidate}
                type="button"
                onClick={() => onViewChange(candidate)}
                className={`rounded-lg px-3 py-1.5 transition ${view === candidate ? 'bg-[#E0B840] text-[#0D0D1A]' : 'bg-[#F3F3F3] text-[#555]'}`}
              >
                Vista {candidate === 'front' ? 'anteriore' : 'posteriore'}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => window.confirm('Rimuovere tutte le personalizzazioni?') && onResetAll()} className="flex items-center gap-1 rounded-lg bg-[#F3F3F3] px-3 py-1.5 hover:bg-[#E0B840]/20">
            <RotateCcw className="h-4 w-4" /> Ripristina
          </button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E6E6E6] bg-white px-4 py-3">
          <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handlePhotoChange} />
          <button type="button" onClick={() => photoInputRef.current?.click()} className="inline-flex items-center gap-2 rounded-lg border border-[#D0A92E] px-3 py-2 text-xs font-semibold text-[#8A6A00] transition hover:bg-[#E0B840]/15">
            <ImagePlus className="h-4 w-4" /> Carica la tua foto
          </button>
          {uploadedPhoto && <button type="button" onClick={clearUploadedPhoto} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs text-[#666] hover:bg-[#F3F3F3]"><X className="h-4 w-4" /> Torna al configuratore 2D</button>}
        </div>
      </section>

      <aside className="order-3 flex min-h-0 flex-col rounded-2xl border border-[#2A2A3E] bg-[#13131F] p-5 lg:order-2">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>Personalizza</h2>
            <p className="text-xs text-[#777]">Colori e pellicole</p>
          </div>
          <Sparkles className="h-5 w-5 text-[#E0B840]" />
        </div>

        {uploadedPhoto && (
          <section className="mb-5 rounded-xl border border-[#E0B840]/50 bg-[#1A1A2E] p-3" aria-label="Personalizzazione foto">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">Personalizza la foto</h3>
                <p className="text-[11px] text-[#999]">Seleziona più zone con impostazioni indipendenti.</p>
              </div>
              <span className="rounded-full bg-[#E0B840]/15 px-2 py-1 text-[10px] text-[#E0B840]">Locale</span>
            </div>
            <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {PHOTO_CUSTOMIZATION_ZONES.map((zone) => (
                <button key={zone.id} type="button" onClick={() => setActivePhotoZone(zone.id)} className={`rounded-lg border px-2 py-2 text-left text-xs transition ${activePhotoZone === zone.id ? 'border-[#E0B840] bg-[#E0B840]/15 text-white' : 'border-[#2A2A3E] text-[#AAA] hover:border-[#666]'}`}>
                  <span className="block truncate">{zone.label}</span>
                  {photoSelections[zone.id] && <span className="text-[10px] text-[#E0B840]">Configurata</span>}
                </button>
              ))}
            </div>

            {activePhotoZoneData?.kind === 'graphic' ? (
              <div className="rounded-lg border border-dashed border-[#555] p-3 text-center">
                <input ref={graphicsInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleGraphicsChange} />
                <button type="button" onClick={() => graphicsInputRef.current?.click()} className="rounded-lg border border-[#E0B840] px-3 py-2 text-xs text-[#E0B840]">Carica grafica</button>
                {photoGraphics && <p className="mt-2 truncate text-[11px] text-[#AAA]">{photoGraphics.name}</p>}
              </div>
            ) : activePhotoZoneData?.kind === 'tint' ? (
              <div>
                <p className="mb-2 text-xs text-[#AAA]">Gradazione disponibile</p>
                <div className="flex flex-wrap gap-2">
                  {activePhotoZoneData.options.map((option) => (
                    <button key={option} type="button" onClick={() => setPhotoSelection({ tint: option })} className={`rounded-lg border px-3 py-2 text-xs ${activePhotoSelection?.tint === option ? 'border-[#E0B840] bg-[#E0B840]/15 text-white' : 'border-[#2A2A3E] text-[#AAA]'}`}>{option}</button>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <label className="mb-2 block text-xs text-[#AAA]">Finitura
                  <select value={photoFinish} onChange={(event) => setPhotoFinish(event.target.value)} className="mt-1 w-full rounded-lg border border-[#2A2A3E] bg-[#13131F] px-2 py-2 text-xs text-white">
                    {FILM_LIST.map((film) => <option key={film.id} value={film.id}>{film.label}</option>)}
                  </select>
                </label>
                <div className="grid max-h-32 grid-cols-5 gap-2 overflow-y-auto">
                  {activePhotoFilm.colors.map((color) => (
                    <button key={`${activePhotoFilm.id}-${color.id}`} type="button" title={color.label} onClick={() => setPhotoSelection({ finish: activePhotoFilm.id, colorId: color.id, colorLabel: color.label })} className={`flex flex-col items-center gap-1 rounded-lg p-1 ${activePhotoSelection?.colorId === color.id && activePhotoSelection?.finish === activePhotoFilm.id ? 'bg-[#E0B840]/15 ring-1 ring-[#E0B840]' : ''}`}>
                      <span className="h-7 w-7 rounded-full border border-white/20" style={{ background: color.hex }} />
                      <span className="max-w-full truncate text-[9px] text-[#AAA]">{color.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <PhotoMaskEditor imageUrl={uploadedPhoto.url} onMaskChange={(file, points) => { setPhotoMask(file); setPhotoMaskPoints(points); setAiNotice(''); }} />
            {photoMask && <p className="mt-2 rounded-lg bg-[#E0B840]/10 px-2 py-2 text-[11px] text-[#E0B840]">Maschera PNG pronta ({photoMaskPoints.length} punti). Il riconoscimento automatico delle superfici sarà collegato in seguito.</p>}
            <label className="mt-3 block text-xs text-[#AAA]">Note aggiuntive (opzionale)
              <textarea value={photoNotes} onChange={(event) => setPhotoNotes(event.target.value.slice(0, 500))} rows={2} placeholder="Indicazioni per il futuro motore AI" className="mt-1 w-full resize-none rounded-lg border border-[#2A2A3E] bg-[#13131F] px-2 py-2 text-xs text-white placeholder:text-[#666]" />
            </label>
            {photoErrors.length > 0 && <ul className="mt-2 space-y-1 rounded-lg border border-red-400/40 bg-red-950/20 px-3 py-2 text-[11px] text-red-200" role="alert">{photoErrors.map((error) => <li key={error}>• {error}</li>)}</ul>}
            <button type="button" onClick={requestPhotoPreview} disabled={photoAiBusy} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-[#E0B840] px-3 py-2 text-xs font-semibold text-[#0D0D1A] transition hover:bg-[#F0CC50] disabled:cursor-wait disabled:opacity-60">
              <Sparkles className="h-4 w-4" /> Genera anteprima AI
            </button>
            {aiNotice && <p className="mt-2 rounded-lg bg-[#2A2A3E] px-2 py-2 text-[11px] text-[#E0B840]" role="status">{aiNotice}</p>}
            {pendingAiRequest && <div className="mt-2 rounded-lg border border-[#2A2A3E] px-3 py-2 text-[10px] text-[#AAA]">
              <p className="font-semibold text-[#E0B840]">Riepilogo richiesta pronta</p>
              <p>{pendingAiRequest.zones.length} zone · foto: {pendingAiRequest.sourceImage.name}</p>
              <p className="truncate">Zone: {pendingAiRequest.zones.map((zone) => zone.zoneId).join(', ')}</p>
              {pendingAiRequest.notes && <p className="truncate">Note: {pendingAiRequest.notes}</p>}
            </div>}
          </section>
        )}

        <label className="mb-3 text-xs text-[#777]">
          Finitura
          <select value={finishFilter} onChange={(event) => setFinishFilter(event.target.value)} className="mt-1 w-full rounded-lg border border-[#2A2A3E] bg-[#1A1A2E] px-3 py-2 text-sm text-white outline-none focus:border-[#E0B840]">
            <option value="all">Tutte le finiture</option>
            {FILM_LIST.map((film) => <option key={film.id} value={film.id}>{film.label}</option>)}
          </select>
        </label>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cerca nome o codice colore" className="mb-4 w-full rounded-lg border border-[#2A2A3E] bg-[#1A1A2E] px-3 py-2 text-sm text-white placeholder:text-[#666] outline-none focus:border-[#E0B840]" />
        <p className="mb-3 text-xs text-[#AAA]">
          {selectedVariant ? <>Pellicola attiva: <span className="font-semibold text-[#E0B840]">{selectedVariant.label}</span> · codice {selectedVariant.code}</> : 'Seleziona una variante reale per la zona attiva.'}
        </p>

        <div className="mb-5 max-h-64 overflow-y-auto rounded-xl border border-[#2A2A3E] bg-[#1A1A2E] p-3">
          <div className="grid grid-cols-4 gap-3 sm:grid-cols-5">
            {visibleVariants.map((variant) => {
              const isSelected = selectedVariant?.id === variant.id;
              return (
                <button key={variant.id} type="button" onClick={() => onColorChange(variant)} title={`Codice ${variant.code}`} className={`group flex flex-col items-center gap-1 rounded-lg p-1 ${isSelected ? 'bg-[#E0B840]/15 ring-1 ring-[#E0B840]' : ''}`}>
                  <span className={`flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border-2 bg-[#4A4A55] ${isSelected ? 'border-[#E0B840]' : 'border-transparent'}`}><img src={variant.views[view]} alt="" className="h-full w-full object-contain" /></span>
                  <span className="max-w-full truncate text-[10px] text-[#AAA]">{variant.code}</span>
                </button>
              );
            })}
          </div>
          {visibleVariants.length === 0 && <p className="py-4 text-center text-xs text-[#777]">Nessuna variante reale corrisponde ai filtri selezionati.</p>}
        </div>

      </aside>

      <div className="order-2 flex min-w-0 gap-2 overflow-x-auto rounded-xl border border-[#2A2A3E] bg-[#13131F] p-3 lg:order-3 lg:col-span-2">
        {zones.map((zone) => (
          <button key={zone.id} type="button" onClick={() => setCurrentZone(zone.id)} className={`flex shrink-0 items-center gap-2 rounded-lg border px-4 py-2 text-left text-sm ${currentZone === zone.id ? 'border-[#E0B840] bg-[#E0B840]/10 text-white' : 'border-[#2A2A3E] text-[#AAA]'}`}>
            <span>{zone.label}</span>
            <span className="text-xs text-[#777]">{zoneSelections[zone.id] ? '✓' : `${zone.variants.length}`}</span>
          </button>
        ))}
        {!CITY_CAR_FULL_WRAP_AVAILABLE && <span className="self-center whitespace-nowrap text-[11px] text-[#777]">Full Wrap non disponibile per City Car</span>}
        {selectedVariant && <button type="button" onClick={() => onResetZone(currentZone)} className="shrink-0 rounded-lg px-3 py-2 text-xs text-[#E0B840] hover:bg-[#E0B840]/10">Rimuovi personalizzazione</button>}
      </div>
    </motion.div>
  );
};

export default Personalize;
