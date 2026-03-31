import { motion } from 'framer-motion';
import { VEHICLE_LIST } from '../data/vehicles';
import { Car, Truck } from 'lucide-react';

// Icone veicoli stilizzate
const VehicleIcon = ({ type, className }) => {
  const iconMap = {
    city: (
      <svg viewBox="0 0 80 40" className={className} fill="currentColor">
        <path d="M15 28 L20 18 L35 14 L55 14 L65 20 L68 28 L65 30 L15 30 Z" />
        <circle cx="25" cy="32" r="6" fill="#333" />
        <circle cx="55" cy="32" r="6" fill="#333" />
      </svg>
    ),
    hatchback: (
      <svg viewBox="0 0 80 40" className={className} fill="currentColor">
        <path d="M12 28 L18 16 L35 10 L58 10 L68 18 L70 28 L68 30 L12 30 Z" />
        <circle cx="22" cy="32" r="6" fill="#333" />
        <circle cx="58" cy="32" r="6" fill="#333" />
      </svg>
    ),
    sedan: (
      <svg viewBox="0 0 80 40" className={className} fill="currentColor">
        <path d="M8 28 L15 16 L30 10 L55 10 L68 16 L72 28 L70 30 L8 30 Z" />
        <circle cx="20" cy="32" r="6" fill="#333" />
        <circle cx="60" cy="32" r="6" fill="#333" />
      </svg>
    ),
    luxury: (
      <svg viewBox="0 0 80 40" className={className} fill="currentColor">
        <path d="M5 28 L12 14 L28 8 L58 8 L70 14 L75 28 L72 30 L5 30 Z" />
        <circle cx="18" cy="32" r="6" fill="#333" />
        <circle cx="62" cy="32" r="6" fill="#333" />
      </svg>
    ),
    suv: (
      <svg viewBox="0 0 80 40" className={className} fill="currentColor">
        <path d="M8 30 L12 14 L28 8 L55 8 L68 14 L72 30 L8 30 Z" />
        <circle cx="20" cy="34" r="7" fill="#333" />
        <circle cx="60" cy="34" r="7" fill="#333" />
      </svg>
    ),
    van_small: (
      <svg viewBox="0 0 80 40" className={className} fill="currentColor">
        <path d="M10 30 L10 12 L55 12 L68 20 L70 30 L10 30 Z" />
        <circle cx="22" cy="34" r="6" fill="#333" />
        <circle cx="58" cy="34" r="6" fill="#333" />
      </svg>
    ),
    van: (
      <svg viewBox="0 0 80 40" className={className} fill="currentColor">
        <path d="M8 30 L8 10 L58 10 L70 18 L72 30 L8 30 Z" />
        <circle cx="20" cy="34" r="7" fill="#333" />
        <circle cx="60" cy="34" r="7" fill="#333" />
      </svg>
    ),
    truck: (
      <svg viewBox="0 0 80 40" className={className} fill="currentColor">
        <path d="M5 30 L5 8 L60 8 L72 16 L75 30 L5 30 Z" />
        <circle cx="18" cy="35" r="8" fill="#333" />
        <circle cx="62" cy="35" r="8" fill="#333" />
      </svg>
    )
  };

  return iconMap[type] || iconMap.sedan;
};

export const Step0_Vehicle = ({ selectedVehicle, onSelect }) => {
  return (
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
          Scegli la tipologia del veicolo da personalizzare
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {VEHICLE_LIST.map((vehicle) => {
          const isSelected = selectedVehicle === vehicle.id;
          
          return (
            <motion.button
              key={vehicle.id}
              onClick={() => onSelect(vehicle.id)}
              className={`
                relative p-4 rounded-xl border-2 transition-all duration-200
                flex flex-col items-center gap-3 text-center
                ${isSelected 
                  ? 'bg-[#E0B840]/10 border-[#E0B840]' 
                  : 'bg-[#1A1A2E] border-[#2A2A3E] hover:border-[#E0B840]/50'
                }
              `}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.98 }}
            >
              {/* Badge moltiplicatore */}
              <span className={`
                absolute top-2 right-2 text-[10px] font-bold px-2 py-0.5 rounded-full
                ${isSelected ? 'bg-[#E0B840] text-[#0D0D1A]' : 'bg-[#2A2A3E] text-[#666]'}
              `}>
                {vehicle.badge}
              </span>

              {/* Icona veicolo */}
              <div className={`w-20 h-12 ${isSelected ? 'text-[#E0B840]' : 'text-[#666]'}`}>
                <VehicleIcon type={vehicle.icon} className="w-full h-full" />
              </div>

              {/* Label */}
              <div>
                <div className={`font-semibold text-sm ${isSelected ? 'text-white' : 'text-[#AAA]'}`}>
                  {vehicle.label}
                </div>
                <div className="text-[10px] text-[#555] mt-0.5">
                  {vehicle.description}
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
};

export default Step0_Vehicle;
