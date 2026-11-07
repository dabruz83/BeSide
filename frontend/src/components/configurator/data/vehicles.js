import { VEHICLE_ASSETS } from './vehicleAssets';

// Catalogo configuratore derivato dalla mappatura degli asset reali.
const DEFAULT_ZONES = [
  'tetto',
  'cofano',
  'porte_fiancate',
  'parte_inferiore',
  'specchietti',
  'fari_anteriori',
];

const CATEGORY_META = {
  city_car: { description: 'Categoria compatta', multiplier: 0.70, badge: 'Compatta' },
  suv: { description: 'Sport utility vehicle', multiplier: 1.20, badge: 'SUV' },
  station_wagon: { description: 'Categoria familiare', multiplier: 1.10, badge: 'Wagon' },
  van: { description: 'Veicolo commerciale', multiplier: 2.00, badge: 'Commerciale' },
  minibus: { description: 'Trasporto persone', multiplier: 1.50, badge: 'Minibus' },
};

export const VEHICLES = Object.fromEntries(VEHICLE_ASSETS.map((asset) => {
  const meta = CATEGORY_META[asset.id];
  return [asset.id, {
    ...asset,
    ...meta,
    models: [],
    zones: asset.zones || DEFAULT_ZONES,
    assets: {
      thumbnail: asset.home,
      front: asset.runtimeViews?.front || null,
      rear: asset.runtimeViews?.rear || null,
      masks: asset.layers,
    },
  }];
}));

export const VEHICLE_LIST = Object.values(VEHICLES);
export const VEHICLE_CATEGORIES = VEHICLE_LIST;
