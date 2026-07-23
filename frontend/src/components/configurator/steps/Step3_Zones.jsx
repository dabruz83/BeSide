import { motion } from 'framer-motion';
import { ZONE_LIST } from '../data/zones';
import { ZoneButton } from '../ui/ZoneButton';
import { calculateZonePrice } from '../utils/priceCalculator';

export const Step3_Zones = ({ 
  selectedZones, 
  vehicle, 
  film, 
  onToggleZone 
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
          Zone da Wrappare
        </h2>
        <p className="text-[#AAA] text-sm">
          Seleziona le parti del veicolo da personalizzare. 
          <br />
          <span className="text-[#E0B840]">Puoi anche cliccare direttamente sull'anteprima!</span>
        </p>
      </div>

      <div className="space-y-3">
        {ZONE_LIST.map((zone) => {
          const price = calculateZonePrice({ 
            zoneId: zone.id, 
            vehicle, 
            film 
          });
          
          return (
            <ZoneButton
              key={zone.id}
              zone={zone}
              isSelected={selectedZones.includes(zone.id)}
              price={price}
              onClick={() => onToggleZone(zone.id)}
            />
          );
        })}
      </div>

      {/* Helper text */}
      {selectedZones.length === 0 && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center text-sm text-[#FF6B6B]"
        >
          Seleziona almeno una zona per continuare
        </motion.p>
      )}

      {selectedZones.length > 0 && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center text-sm text-[#AAA]"
        >
          {selectedZones.length} {selectedZones.length === 1 ? 'zona selezionata' : 'zone selezionate'}
        </motion.p>
      )}
    </motion.div>
  );
};

export default Step3_Zones;
