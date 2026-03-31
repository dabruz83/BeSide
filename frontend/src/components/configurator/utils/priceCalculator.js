import { VEHICLES } from '../data/vehicles';
import { FILMS } from '../data/films';
import { ZONES } from '../data/zones';
import { TINTING_VETRI, TINTING_FARI } from '../data/tinting';

/**
 * Calcola il prezzo totale della configurazione
 * Formula: (Σ prezzi_zone + Σ prezzi_oscuramento) × mult_veicolo × mult_pellicola
 */
export function calculatePrice({ vehicle, film, zones, tinting }) {
  if (!vehicle || !film || !zones || zones.length === 0) {
    return 0;
  }

  // Somma prezzi zone selezionate
  const zonesTotal = zones.reduce((sum, zoneId) => {
    const zone = ZONES[zoneId];
    return sum + (zone?.basePrice || 0);
  }, 0);

  // Somma prezzi oscuramento
  let tintingTotal = 0;
  if (tinting?.vetri) {
    const vetriOption = TINTING_VETRI.find(t => t.id === tinting.vetri);
    tintingTotal += vetriOption?.price || 0;
  }
  if (tinting?.fari) {
    const fariOption = TINTING_FARI.find(t => t.id === tinting.fari);
    tintingTotal += fariOption?.price || 0;
  }

  // Moltiplicatori
  const vehicleMultiplier = VEHICLES[vehicle]?.multiplier || 1;
  const filmMultiplier = FILMS[film]?.multiplier || 1;

  // Calcolo finale
  const total = (zonesTotal + tintingTotal) * vehicleMultiplier * filmMultiplier;
  
  return Math.round(total);
}

/**
 * Calcola il prezzo di una singola zona
 */
export function calculateZonePrice({ zoneId, vehicle, film }) {
  if (!vehicle || !film || !zoneId) return 0;
  
  const zone = ZONES[zoneId];
  if (!zone) return 0;

  const vehicleMultiplier = VEHICLES[vehicle]?.multiplier || 1;
  const filmMultiplier = FILMS[film]?.multiplier || 1;

  return Math.round(zone.basePrice * vehicleMultiplier * filmMultiplier);
}

/**
 * Formatta prezzo in formato italiano
 */
export function formatPrice(price) {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(price);
}
