import { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Car, Palette, Layers, MapPin, Sun, Calendar, 
  Lock, Mail, CheckCircle, Send
} from 'lucide-react';
import { VEHICLES } from '../data/vehicles';
import { FILMS } from '../data/films';
import { ZONES } from '../data/zones';
import { TINTING_VETRI, TINTING_FARI } from '../data/tinting';
import { formatPrice } from '../utils/priceCalculator';

export const Step6_Summary = ({ 
  state, 
  price, 
  onEmailChange,
  onGdprChange,
  onPay,
  onSendQuote
}) => {
  const [isProcessing, setIsProcessing] = useState(false);

  const vehicle = VEHICLES[state.vehicle];
  const film = FILMS[state.film];
  const vetri = TINTING_VETRI.find(t => t.id === state.tinting.vetri);
  const fari = TINTING_FARI.find(t => t.id === state.tinting.fari);

  const handlePay = async () => {
    setIsProcessing(true);
    await onPay();
    setIsProcessing(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div>
        <h2 className="text-2xl font-bold text-white mb-2" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
          Riepilogo Configurazione
        </h2>
        <p className="text-[#AAA] text-sm">
          Verifica i dettagli e procedi al pagamento
        </p>
      </div>

      {/* Summary card */}
      <div className="bg-[#1A1A2E] rounded-xl border border-[#2A2A3E] overflow-hidden">
        {/* Items */}
        <div className="p-4 space-y-4">
          {/* Vehicle */}
          <SummaryRow
            icon={<Car className="w-4 h-4" />}
            label="Veicolo"
            value={vehicle?.label}
            badge={vehicle?.badge}
          />

          {/* Base color */}
          <SummaryRow
            icon={<Palette className="w-4 h-4" />}
            label="Colore originale"
            value={state.baseColor?.label}
            colorHex={state.baseColor?.hex}
          />

          {/* Film */}
          <SummaryRow
            icon={<Layers className="w-4 h-4" />}
            label="Pellicola"
            value={`${film?.label} - ${state.filmColor?.label}`}
            colorHex={state.filmColor?.hex}
          />

          {/* Zones */}
          <SummaryRow
            icon={<MapPin className="w-4 h-4" />}
            label="Zone"
            value={state.zones.map(z => ZONES[z]?.label).join(', ')}
          />

          {/* Tinting */}
          {(vetri || fari) && (
            <SummaryRow
              icon={<Sun className="w-4 h-4" />}
              label="Oscuramento"
              value={[
                vetri && `Vetri: ${vetri.label}`,
                fari && `Fari: ${fari.label}`
              ].filter(Boolean).join(' | ')}
            />
          )}

          {/* Booking */}
          <SummaryRow
            icon={<Calendar className="w-4 h-4" />}
            label="Appuntamento"
            value={`${new Date(state.booking.date).toLocaleDateString('it-IT', {
              weekday: 'long',
              day: 'numeric',
              month: 'long'
            })} alle ${state.booking.time}`}
          />
        </div>

        {/* Price */}
        <div className="bg-[#E0B840]/10 p-4 border-t border-[#2A2A3E]">
          <div className="flex items-center justify-between">
            <span className="text-[#AAA] font-medium">Totale</span>
            <span 
              className="text-3xl font-bold text-[#E0B840]"
              style={{ fontFamily: 'Barlow Condensed, sans-serif' }}
            >
              {formatPrice(price)}
            </span>
          </div>
        </div>
      </div>

      {/* Email input */}
      <div className="space-y-2">
        <label className="text-sm text-[#AAA]">Email per conferma</label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#555]" />
          <input
            type="email"
            value={state.customerEmail}
            onChange={(e) => onEmailChange(e.target.value)}
            placeholder="tuaemail@esempio.it"
            className="w-full pl-11 pr-4 py-3 bg-[#1A1A2E] border border-[#2A2A3E] rounded-xl 
                       text-white placeholder-[#555] focus:border-[#E0B840] focus:outline-none"
          />
        </div>
      </div>

      {/* GDPR consent */}
      <label className="flex items-start gap-3 cursor-pointer group">
        <div className="relative mt-0.5">
          <input
            type="checkbox"
            checked={state.gdprConsent}
            onChange={(e) => onGdprChange(e.target.checked)}
            className="sr-only"
          />
          <div className={`
            w-5 h-5 rounded border-2 flex items-center justify-center transition-all
            ${state.gdprConsent 
              ? 'bg-[#E0B840] border-[#E0B840]' 
              : 'border-[#444] group-hover:border-[#E0B840]/50'
            }
          `}>
            {state.gdprConsent && <CheckCircle className="w-4 h-4 text-[#0D0D1A]" />}
          </div>
        </div>
        <span className="text-xs text-[#AAA] leading-relaxed">
          Acconsento al trattamento dei miei dati personali ai sensi del GDPR (Reg. UE 2016/679) 
          per la gestione della prenotazione e l'invio di comunicazioni relative al servizio.
        </span>
      </label>

      {/* Action buttons */}
      <div className="space-y-3">
        {/* Pay button */}
        <motion.button
          onClick={handlePay}
          disabled={!state.gdprConsent || !state.customerEmail || isProcessing}
          className={`
            w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2
            transition-all
            ${state.gdprConsent && state.customerEmail
              ? 'bg-[#E0B840] text-[#0D0D1A] hover:bg-[#F0CC50]' 
              : 'bg-[#2A2A3E] text-[#555] cursor-not-allowed'
            }
          `}
          whileHover={state.gdprConsent && state.customerEmail ? { scale: 1.02 } : {}}
          whileTap={state.gdprConsent && state.customerEmail ? { scale: 0.98 } : {}}
        >
          <Lock className="w-5 h-5" />
          {isProcessing ? 'Elaborazione...' : `Prenota e Paga ${formatPrice(price)}`}
        </motion.button>

        {/* Send quote button */}
        <motion.button
          onClick={onSendQuote}
          disabled={!state.customerEmail}
          className="w-full py-3 rounded-xl border-2 border-[#2A2A3E] text-[#AAA] 
                     hover:border-[#E0B840]/50 hover:text-white transition-all
                     flex items-center justify-center gap-2"
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
        >
          <Send className="w-4 h-4" />
          Ricevi preventivo via email
        </motion.button>
      </div>
    </motion.div>
  );
};

// Helper component for summary rows
const SummaryRow = ({ icon, label, value, badge, colorHex }) => (
  <div className="flex items-start justify-between gap-4">
    <div className="flex items-center gap-2 text-[#666]">
      {icon}
      <span className="text-sm">{label}</span>
    </div>
    <div className="flex items-center gap-2 text-right">
      {colorHex && (
        <div 
          className="w-4 h-4 rounded-full border border-[#444]"
          style={{ backgroundColor: colorHex }}
        />
      )}
      <span className="text-sm text-white font-medium">{value}</span>
      {badge && (
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#2A2A3E] text-[#AAA]">
          {badge}
        </span>
      )}
    </div>
  </div>
);

export default Step6_Summary;
