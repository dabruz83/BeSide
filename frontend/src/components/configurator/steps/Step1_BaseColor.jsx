import { motion } from 'framer-motion';
import { BASE_COLORS } from '../data/colors';
import { ColorSwatch } from '../ui/ColorSwatch';

export const Step1_BaseColor = ({ selectedColor, onSelect }) => {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div>
        <h2 className="text-2xl font-bold text-white mb-2" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
          Colore Attuale
        </h2>
        <p className="text-[#AAA] text-sm">
          Qual è il colore attuale della carrozzeria del veicolo?
        </p>
      </div>

      <div className="bg-[#1A1A2E] rounded-xl p-6 border border-[#2A2A3E]">
        <div className="flex flex-wrap justify-center gap-6">
          {BASE_COLORS.map((color) => (
            <ColorSwatch
              key={color.id}
              color={color}
              isSelected={selectedColor?.id === color.id}
              onClick={() => onSelect(color)}
              size="lg"
            />
          ))}
        </div>
      </div>

      {selectedColor && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center text-sm text-[#AAA]"
        >
          Colore selezionato: <span className="text-[#E0B840] font-semibold">{selectedColor.label}</span>
        </motion.div>
      )}
    </motion.div>
  );
};

export default Step1_BaseColor;
