import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { RotateCcw, Sparkles } from 'lucide-react';
import { FILM_LIST } from '../data/films';
import { CITY_CAR_INTERACTIVE_ZONES, CITY_CAR_FULL_WRAP_AVAILABLE } from '../data/cityCarInteractiveAssets';
import { VehiclePreview } from '../preview/VehiclePreview';

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
}) => {
  const [finishFilter, setFinishFilter] = useState('all');
  const [search, setSearch] = useState('');
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]"
    >
      <section className="order-1 min-w-0 overflow-hidden rounded-2xl border border-[#D9D9D9] bg-white shadow-[0_16px_40px_rgba(0,0,0,0.22)]">
        <div className="relative aspect-[4/3] min-h-[360px] lg:aspect-[16/10] lg:min-h-[470px]">
          <VehiclePreview
            vehicleType={vehicle}
            view={view}
            assets={assets}
            overlays={overlays}
          />
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
      </section>

      <aside className="order-3 flex min-h-0 flex-col rounded-2xl border border-[#2A2A3E] bg-[#13131F] p-5 lg:order-2">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>Personalizza</h2>
            <p className="text-xs text-[#777]">Colori e pellicole</p>
          </div>
          <Sparkles className="h-5 w-5 text-[#E0B840]" />
        </div>

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
