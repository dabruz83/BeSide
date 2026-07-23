import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FILM_LIST, FILMS } from '../data/films';
import { ColorSwatch } from '../ui/ColorSwatch';

export const Step2_Film = ({ selectedFilm, selectedColor, onSelectFilm, onSelectColor }) => {
  const [activeFilm, setActiveFilm] = useState(selectedFilm || 'lucida');
  const currentFilmData = FILMS[activeFilm];

  const handleFilmSelect = (filmId) => {
    setActiveFilm(filmId);
    onSelectFilm(filmId);
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
          Tipo di Pellicola
        </h2>
        <p className="text-[#AAA] text-sm">
          Scegli la finitura e il colore della pellicola
        </p>
      </div>

      {/* Film type selector - Pills */}
      <div className="flex flex-wrap gap-2">
        {FILM_LIST.map((film) => {
          const isActive = activeFilm === film.id;
          return (
            <motion.button
              key={film.id}
              onClick={() => handleFilmSelect(film.id)}
              className={`
                px-4 py-2 rounded-full text-sm font-semibold transition-all
                ${isActive 
                  ? 'bg-[#E0B840] text-[#0D0D1A]' 
                  : 'bg-[#1A1A2E] text-[#AAA] border border-[#2A2A3E] hover:border-[#E0B840]/50'
                }
              `}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {film.label}
              <span className="ml-1 text-xs opacity-70">
                {film.multiplier > 1 ? `+${Math.round((film.multiplier - 1) * 100)}%` : ''}
              </span>
            </motion.button>
          );
        })}
      </div>

      {/* Film description */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeFilm}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="text-sm text-[#666] italic"
        >
          {currentFilmData?.description}
        </motion.div>
      </AnimatePresence>

      {/* Color selector */}
      <div className="bg-[#1A1A2E] rounded-xl p-6 border border-[#2A2A3E]">
        <h3 className="text-sm font-semibold text-[#AAA] mb-4">
          Colori disponibili per {currentFilmData?.label}
        </h3>
        
        <AnimatePresence mode="wait">
          <motion.div
            key={activeFilm}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-wrap justify-center gap-4"
          >
            {currentFilmData?.colors.map((color) => (
              <ColorSwatch
                key={color.id}
                color={color}
                isSelected={selectedFilm === activeFilm && selectedColor?.id === color.id}
                onClick={() => onSelectColor(color)}
                size="md"
                effect={currentFilmData.effect || currentFilmData.texture}
              />
            ))}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Selection summary */}
      {selectedFilm && selectedColor && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-center gap-3 text-sm"
        >
          <span className="text-[#AAA]">Selezione:</span>
          <span className="px-3 py-1 rounded-full bg-[#2A2A3E] text-white font-medium">
            {FILMS[selectedFilm]?.label}
          </span>
          <div 
            className="w-6 h-6 rounded-full border-2 border-[#E0B840]"
            style={{ backgroundColor: selectedColor.hex }}
          />
          <span className="text-[#E0B840] font-semibold">{selectedColor.label}</span>
        </motion.div>
      )}
    </motion.div>
  );
};

export default Step2_Film;
