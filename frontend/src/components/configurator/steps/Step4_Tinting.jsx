import { motion } from 'framer-motion';
import { TINTING_VETRI, TINTING_FARI } from '../data/tinting';
import { formatPrice } from '../utils/priceCalculator';
import { SkipForward } from 'lucide-react';

export const Step4_Tinting = ({ 
  selectedVetri, 
  selectedFari, 
  onSelectVetri, 
  onSelectFari,
  onSkip 
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div>
        <h2 className="text-2xl font-bold text-white mb-2" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
          Oscuramento (Opzionale)
        </h2>
        <p className="text-[#AAA] text-sm">
          Aggiungi oscuramento vetri o fari per un look più aggressivo
        </p>
      </div>

      {/* Skip button */}
      <motion.button
        onClick={onSkip}
        className="w-full py-3 px-4 rounded-xl border-2 border-dashed border-[#2A2A3E] 
                   text-[#666] hover:border-[#E0B840]/50 hover:text-[#AAA] 
                   transition-all flex items-center justify-center gap-2"
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        <SkipForward className="w-4 h-4" />
        Salta questo step
      </motion.button>

      {/* Vetri section */}
      <div className="bg-[#1A1A2E] rounded-xl p-5 border border-[#2A2A3E]">
        <h3 className="text-sm font-semibold text-white mb-4">Oscuramento Vetri</h3>
        
        <div className="space-y-2">
          {/* Nessuno option */}
          <TintingOption
            label="Nessuno"
            description="Mantieni i vetri originali"
            price={0}
            isSelected={selectedVetri === null}
            onClick={() => onSelectVetri(null)}
          />
          
          {TINTING_VETRI.map((option) => (
            <TintingOption
              key={option.id}
              label={option.label}
              description={option.description}
              price={option.price}
              isSelected={selectedVetri === option.id}
              onClick={() => onSelectVetri(option.id)}
            />
          ))}
        </div>
      </div>

      {/* Fari section */}
      <div className="bg-[#1A1A2E] rounded-xl p-5 border border-[#2A2A3E]">
        <h3 className="text-sm font-semibold text-white mb-4">Oscuramento Fari Posteriori</h3>
        
        <div className="space-y-2">
          {/* Nessuno option */}
          <TintingOption
            label="Nessuno"
            description="Mantieni i fari originali"
            price={0}
            isSelected={selectedFari === null}
            onClick={() => onSelectFari(null)}
          />
          
          {TINTING_FARI.map((option) => (
            <TintingOption
              key={option.id}
              label={option.label}
              description={option.description}
              price={option.price}
              isSelected={selectedFari === option.id}
              onClick={() => onSelectFari(option.id)}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
};

// Helper component for tinting options
const TintingOption = ({ label, description, price, isSelected, onClick }) => (
  <motion.button
    onClick={onClick}
    className={`
      w-full p-3 rounded-lg border transition-all flex items-center justify-between
      ${isSelected 
        ? 'bg-[#E0B840]/10 border-[#E0B840]' 
        : 'bg-[#13131F] border-[#2A2A3E] hover:border-[#E0B840]/50'
      }
    `}
    whileHover={{ scale: 1.01 }}
    whileTap={{ scale: 0.99 }}
  >
    <div className="flex items-center gap-3">
      <div className={`
        w-5 h-5 rounded-full border-2 flex items-center justify-center
        ${isSelected ? 'border-[#E0B840]' : 'border-[#444]'}
      `}>
        {isSelected && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="w-3 h-3 rounded-full bg-[#E0B840]"
          />
        )}
      </div>
      <div className="text-left">
        <div className={`text-sm font-medium ${isSelected ? 'text-white' : 'text-[#AAA]'}`}>
          {label}
        </div>
        <div className="text-xs text-[#555]">{description}</div>
      </div>
    </div>
    
    {price > 0 && (
      <span className={`text-sm font-semibold ${isSelected ? 'text-[#E0B840]' : 'text-[#666]'}`}>
        +{formatPrice(price)}
      </span>
    )}
  </motion.button>
);

export default Step4_Tinting;
