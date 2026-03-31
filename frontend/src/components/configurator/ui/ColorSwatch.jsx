import { motion } from 'framer-motion';
import { Check } from 'lucide-react';

export const ColorSwatch = ({ 
  color, 
  isSelected, 
  onClick, 
  size = 'md',
  showLabel = true,
  effect = null // 'shimmer' | 'pearl' | 'chameleon' | 'carbon'
}) => {
  const sizeClasses = {
    sm: 'w-10 h-10',
    md: 'w-14 h-14',
    lg: 'w-16 h-16'
  };

  // Gradient per effetti speciali
  const getBackground = () => {
    if (effect === 'chameleon' && color.hex2) {
      return `linear-gradient(135deg, ${color.hex} 0%, ${color.hex2} 100%)`;
    }
    if (effect === 'pearl') {
      return `linear-gradient(135deg, ${color.hex} 0%, #fff 50%, ${color.hex} 100%)`;
    }
    return color.hex;
  };

  return (
    <motion.button
      onClick={onClick}
      className="flex flex-col items-center gap-2 group"
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.95 }}
    >
      <div 
        className={`
          ${sizeClasses[size]} rounded-full relative
          transition-all duration-200
          ${isSelected 
            ? 'ring-3 ring-[#E0B840] ring-offset-2 ring-offset-[#0D0D1A]' 
            : 'ring-2 ring-transparent hover:ring-[#E0B840]/50'
          }
          ${effect === 'shimmer' ? 'animate-shimmer' : ''}
        `}
        style={{ 
          background: getBackground(),
          boxShadow: isSelected ? '0 0 20px rgba(224, 184, 64, 0.3)' : 'none'
        }}
      >
        {/* Carbon fiber pattern */}
        {effect === 'carbon' && (
          <div 
            className="absolute inset-0 rounded-full opacity-60"
            style={{
              backgroundImage: `
                repeating-linear-gradient(
                  45deg,
                  transparent,
                  transparent 2px,
                  rgba(0,0,0,0.3) 2px,
                  rgba(0,0,0,0.3) 4px
                )
              `
            }}
          />
        )}

        {/* Pearl shimmer overlay */}
        {effect === 'pearl' && (
          <div 
            className="absolute inset-0 rounded-full"
            style={{
              background: 'linear-gradient(135deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)',
              animation: 'shimmer 3s infinite'
            }}
          />
        )}

        {/* Selected checkmark */}
        {isSelected && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <div className="w-6 h-6 rounded-full bg-[#E0B840] flex items-center justify-center">
              <Check className="w-4 h-4 text-[#0D0D1A]" />
            </div>
          </motion.div>
        )}
      </div>

      {showLabel && (
        <span className={`
          text-xs font-medium text-center max-w-16 truncate
          ${isSelected ? 'text-[#E0B840]' : 'text-[#AAA] group-hover:text-white'}
        `}>
          {color.label}
        </span>
      )}
    </motion.button>
  );
};

export default ColorSwatch;
