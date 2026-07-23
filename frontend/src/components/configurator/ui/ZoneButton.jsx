import { motion } from 'framer-motion';
import { Check, Plus } from 'lucide-react';
import { formatPrice } from '../utils/priceCalculator';

export const ZoneButton = ({ 
  zone, 
  isSelected, 
  price,
  onClick,
  disabled = false
}) => {
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      className={`
        w-full p-4 rounded-xl border-2 transition-all duration-200
        flex items-center justify-between
        ${isSelected 
          ? 'bg-[#E0B840]/10 border-[#E0B840] text-white' 
          : 'bg-[#1A1A2E] border-[#2A2A3E] text-[#AAA] hover:border-[#E0B840]/50 hover:text-white'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
      whileHover={!disabled ? { scale: 1.02 } : {}}
      whileTap={!disabled ? { scale: 0.98 } : {}}
    >
      <div className="flex items-center gap-3">
        {/* Toggle icon */}
        <div className={`
          w-6 h-6 rounded-md flex items-center justify-center
          ${isSelected ? 'bg-[#E0B840]' : 'bg-[#2A2A3E]'}
        `}>
          {isSelected ? (
            <Check className="w-4 h-4 text-[#0D0D1A]" />
          ) : (
            <Plus className="w-4 h-4 text-[#555]" />
          )}
        </div>

        {/* Zone info */}
        <div className="text-left">
          <div className="font-semibold text-sm">{zone.label}</div>
          <div className="text-xs text-[#666]">{zone.description}</div>
        </div>
      </div>

      {/* Price tag */}
      <div className={`
        px-3 py-1.5 rounded-lg font-bold text-sm
        ${isSelected ? 'bg-[#E0B840] text-[#0D0D1A]' : 'bg-[#2A2A3E] text-[#AAA]'}
      `}>
        {formatPrice(price)}
      </div>
    </motion.button>
  );
};

export default ZoneButton;
