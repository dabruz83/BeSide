import { motion } from 'framer-motion';
import { VEHICLE_CATEGORIES } from '../data/vehicles';

const DISPLAY_ORDER = ['minibus', 'suv', 'city_car', 'station_wagon', 'van'];

export const Step0_Vehicle = ({ selectedVehicle, onSelect }) => (
  <motion.div
    initial={{ opacity: 0, x: 20 }}
    animate={{ opacity: 1, x: 0 }}
    exit={{ opacity: 0, x: -20 }}
    className="space-y-6"
  >
    <div>
      <h2 className="text-2xl font-bold text-white mb-2" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
        Seleziona il Veicolo
      </h2>
      <p className="text-[#AAA] text-sm">
        Scegli la categoria; i modelli e gli asset reali verranno associati al catalogo.
      </p>
    </div>

    <div className="relative overflow-visible rounded-2xl bg-gradient-to-b from-[#1a1a2a] via-[#10101b] to-[#08080f] px-3 py-8 md:px-8 md:py-10">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#E0B840]/10 blur-3xl" />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-5 md:items-end md:gap-3 lg:gap-5">
      {DISPLAY_ORDER.map((vehicleId) => {
        const vehicle = VEHICLE_CATEGORIES.find((item) => item.id === vehicleId);
        if (!vehicle) return null;
        const isSelected = selectedVehicle === vehicle.id;
        const position = {
          minibus: 'md:translate-y-8 md:scale-[0.88]',
          suv: 'md:translate-y-3 md:scale-[0.96]',
          city_car: 'md:-translate-y-3 md:scale-105',
          station_wagon: 'md:translate-y-3 md:scale-[0.96]',
          van: 'md:translate-y-8 md:scale-[0.88]',
        }[vehicle.id];
        return (
          <motion.button
            key={vehicle.id}
            type="button"
            onClick={() => onSelect(vehicle.id)}
            className={`relative z-10 w-full rounded-xl border-2 p-3 text-left transition-all duration-300 md:p-2 lg:p-3 drop-shadow-2xl hover:brightness-110 ${position} ${isSelected ? 'md:z-30 md:scale-[1.04]' : ''} ${
              isSelected
                ? 'bg-[#E0B840]/10 border-[#E0B840] shadow-[0_0_28px_rgba(224,184,64,0.28)]'
                : 'border-transparent bg-transparent hover:border-[#E0B840]/30'
            }`}
            data-testid={`vehicle-category-${vehicle.id}`}
          >
            <span className={`absolute top-3 right-3 text-[10px] font-bold px-2 py-0.5 rounded-full ${
              isSelected ? 'bg-[#E0B840] text-[#0D0D1A]' : 'bg-[#2A2A3E] text-[#666]'
            }`}>
              {vehicle.badge}
            </span>
            <div className="mb-2 flex h-36 items-center justify-center rounded-lg bg-[#0D0D1A]/35 md:h-32 lg:h-36">
              <img src={vehicle.home} alt={vehicle.name} className="w-full h-full object-contain" />
            </div>
            <div className={`font-semibold ${isSelected ? 'text-white' : 'text-[#AAA]'}`}>{vehicle.name}</div>
            <div className="mt-1 text-xs text-[#666]">{vehicle.description}</div>
          </motion.button>
        );
      })}
      </div>
    </div>
  </motion.div>
);

export default Step0_Vehicle;
