import { useState } from 'react';
import axios from 'axios';
import { API } from '@/App';
import { VEHICLES } from './data/vehicles';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, RotateCcw, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

// Hooks
import { useConfigurator } from './hooks/useConfigurator';

// UI Components
import { StepIndicator } from './ui/StepIndicator';
import { PriceTag } from './ui/PriceTag';

// Preview
import { VehiclePreview } from './preview/VehiclePreview';

// Steps
import { Step0_Vehicle } from './steps/Step0_Vehicle';
import { Step1_BaseColor } from './steps/Step1_BaseColor';
import { Step2_Film } from './steps/Step2_Film';
import { Step3_Zones } from './steps/Step3_Zones';
import { Step4_Tinting } from './steps/Step4_Tinting';
import { Step5_Booking } from './steps/Step5_Booking';
import { Step6_Summary } from './steps/Step6_Summary';

export const WrapConfigurator = () => {
  const { state, price, canProceed, actions } = useConfigurator();
  const [previewView, setPreviewView] = useState('rear');
  const [showPreview, setShowPreview] = useState(true);

  // Handle step navigation
  const handleNext = () => {
    if (canProceed[state.step]) {
      actions.nextStep();
    }
  };

  const handlePrev = () => {
    actions.prevStep();
  };

  // Toggle preview view
  const togglePreviewView = () => {
    setPreviewView(prev => prev === 'rear' ? 'front' : 'rear');
  };

  const [saving, setSaving] = useState(false);
  const handlePay = async () => {
    toast.info('Pagamento del configuratore non ancora attivo. Salva e invia il preventivo per proseguire.');
  };

  const handleSendQuote = async () => {
    if (saving) return;
    if (!state.gdprConsent || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.customerEmail)) {
      toast.error('Inserisci una email valida e conferma il consenso.'); return;
    }
    setSaving(true);
    try {
      const { data } = await axios.post(`${API}/jobs`, {
        client_name: state.customerEmail, client_email: state.customerEmail,
        job_type: state.film?.includes('ppf') ? 'ppf_partial' : 'wrap_decorative',
        vehicle_type: 'sedan', vehicle_info: VEHICLES[state.vehicle]?.label || state.vehicle,
        quote_amount: price, hours_worked: 0, materials_cost: 0, is_quote: true,
        notes: JSON.stringify({ configurazione: state, appuntamento: 'preferenza da confermare' }),
      });
      const sent = await axios.post(`${API}/jobs/${data.job_id}/send-quote`);
      toast.success(sent.data.message);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Errore nel salvataggio o invio. Verifica la pagina Lavori prima di riprovare.');
    } finally { setSaving(false); }
  };

  // Render current step
  const renderStep = () => {
    switch (state.step) {
      case 0:
        return (
          <Step0_Vehicle
            selectedVehicle={state.vehicle}
            onSelect={actions.setVehicle}
          />
        );
      case 1:
        return (
          <Step1_BaseColor
            selectedColor={state.baseColor}
            onSelect={actions.setBaseColor}
          />
        );
      case 2:
        return (
          <Step2_Film
            selectedFilm={state.film}
            selectedColor={state.filmColor}
            onSelectFilm={actions.setFilm}
            onSelectColor={actions.setFilmColor}
          />
        );
      case 3:
        return (
          <Step3_Zones
            selectedZones={state.zones}
            vehicle={state.vehicle}
            film={state.film}
            onToggleZone={actions.toggleZone}
          />
        );
      case 4:
        return (
          <Step4_Tinting
            selectedVetri={state.tinting.vetri}
            selectedFari={state.tinting.fari}
            onSelectVetri={actions.setTintingVetri}
            onSelectFari={actions.setTintingFari}
            onSkip={handleNext}
          />
        );
      case 5:
        return (
          <Step5_Booking
            selectedDate={state.booking.date}
            selectedTime={state.booking.time}
            onSelectDate={actions.setBookingDate}
            onSelectTime={actions.setBookingTime}
          />
        );
      case 6:
        return (
          <Step6_Summary
            state={state}
            price={price}
            onEmailChange={actions.setCustomerEmail}
            onGdprChange={actions.setGdprConsent}
            onPay={handlePay}
            onSendQuote={handleSendQuote}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-[#0D0D1A]">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#0D0D1A]/95 backdrop-blur-sm border-b border-[#2A2A3E]">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <h1 
                className="text-2xl font-bold text-white"
                style={{ fontFamily: 'Barlow Condensed, sans-serif' }}
              >
                WRAP<span className="text-[#E0B840]">CONFIG</span>
              </h1>
            </div>

            {/* Price tag */}
            <PriceTag price={price} />
          </div>
        </div>

        {/* Step indicator */}
        <div className="border-t border-[#1A1A2E]">
          <div className="max-w-4xl mx-auto">
            <StepIndicator
              currentStep={state.step}
              maxVisitedStep={state.maxVisitedStep}
              onStepClick={actions.goToStep}
            />
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Preview section - Left side on desktop, top on mobile */}
          <div className="lg:w-1/2 lg:sticky lg:top-40 lg:self-start">
            {/* Mobile toggle */}
            <div className="lg:hidden flex items-center justify-between mb-3">
              <span className="text-sm text-[#AAA]">Anteprima</span>
              <button
                onClick={() => setShowPreview(!showPreview)}
                className="flex items-center gap-1 text-sm text-[#E0B840]"
              >
                {showPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                {showPreview ? 'Nascondi' : 'Mostra'}
              </button>
            </div>

            <AnimatePresence>
              {(showPreview || window.innerWidth >= 1024) && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="bg-[#0A0A12] rounded-2xl border border-[#1A1A2E] overflow-hidden"
                >
                  {/* Preview container */}
                  <div className="relative aspect-[16/10] flex items-center justify-center p-4">
                    <VehiclePreview
                      vehicleType={state.vehicle || 'seg_c'}
                      view={previewView}
                      baseColor={state.baseColor?.hex || '#AAAAAA'}
                      filmColor={state.filmColor?.hex}
                      selectedZones={state.zones}
                      onZoneClick={state.step === 3 ? actions.toggleZone : undefined}
                      interactive={state.step === 3}
                    />
                  </div>

                  {/* Preview controls */}
                  <div className="flex items-center justify-between px-4 py-3 bg-[#13131F] border-t border-[#1A1A2E]">
                    <span className="text-xs text-[#555]">
                      Vista: {previewView === 'rear' ? '3/4 Posteriore' : '3/4 Anteriore'}
                    </span>
                    
                    <motion.button
                      onClick={togglePreviewView}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#1A1A2E] 
                                 text-[#AAA] text-sm hover:text-white transition-colors"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <RotateCcw className="w-4 h-4" />
                      Ruota
                    </motion.button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Configuration panel - Right side on desktop, bottom on mobile */}
          <div className="lg:w-1/2">
            <div className="bg-[#13131F] rounded-2xl border border-[#1A1A2E] p-6">
              <AnimatePresence mode="wait">
                <motion.div
                  key={state.step}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                >
                  {renderStep()}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Navigation buttons */}
            {state.step < 6 && (
              <div className="flex items-center justify-between mt-6 gap-4">
                <motion.button
                  onClick={handlePrev}
                  disabled={state.step === 0}
                  className={`
                    flex items-center gap-2 px-6 py-3 rounded-xl font-semibold
                    transition-all
                    ${state.step === 0 
                      ? 'bg-[#1A1A2E] text-[#333] cursor-not-allowed' 
                      : 'bg-[#1A1A2E] text-[#AAA] hover:text-white'
                    }
                  `}
                  whileHover={state.step > 0 ? { scale: 1.02 } : {}}
                  whileTap={state.step > 0 ? { scale: 0.98 } : {}}
                >
                  <ChevronLeft className="w-5 h-5" />
                  Indietro
                </motion.button>

                <motion.button
                  onClick={handleNext}
                  disabled={!canProceed[state.step]}
                  className={`
                    flex items-center gap-2 px-8 py-3 rounded-xl font-semibold
                    transition-all
                    ${canProceed[state.step]
                      ? 'bg-[#E0B840] text-[#0D0D1A] hover:bg-[#F0CC50]' 
                      : 'bg-[#2A2A3E] text-[#555] cursor-not-allowed'
                    }
                  `}
                  whileHover={canProceed[state.step] ? { scale: 1.02, y: -2 } : {}}
                  whileTap={canProceed[state.step] ? { scale: 0.98 } : {}}
                >
                  Avanti
                  <ChevronRight className="w-5 h-5" />
                </motion.button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default WrapConfigurator;
