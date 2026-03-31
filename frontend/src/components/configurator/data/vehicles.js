// Dati veicoli per il configuratore wrap
export const VEHICLES = {
  city_car: {
    id: 'city_car',
    label: 'City Car',
    description: 'Fiat 500, Smart, Toyota Aygo',
    multiplier: 0.70,
    badge: 'Compatta',
    icon: 'city'
  },
  seg_b: {
    id: 'seg_b',
    label: 'Segmento B',
    description: 'Polo, Clio, Fiesta',
    multiplier: 0.85,
    badge: 'Piccola',
    icon: 'hatchback'
  },
  seg_c: {
    id: 'seg_c',
    label: 'Segmento C',
    description: 'Golf, Focus, A3',
    multiplier: 1.00,
    badge: 'Standard',
    icon: 'sedan'
  },
  seg_d: {
    id: 'seg_d',
    label: 'Segmento D',
    description: 'Passat, Mondeo, A4',
    multiplier: 1.15,
    badge: 'Media',
    icon: 'sedan'
  },
  seg_e: {
    id: 'seg_e',
    label: 'Segmento E / GT',
    description: 'Serie 5, E-Class, A6',
    multiplier: 1.30,
    badge: 'Premium',
    icon: 'luxury'
  },
  suv: {
    id: 'suv',
    label: 'SUV / Crossover',
    description: 'Tiguan, Q5, X3',
    multiplier: 1.20,
    badge: 'SUV',
    icon: 'suv'
  },
  furgoncino: {
    id: 'furgoncino',
    label: 'Furgoncino',
    description: 'Fiorino, Kangoo, Berlingo',
    multiplier: 1.10,
    badge: 'Commerciale',
    icon: 'van_small'
  },
  van: {
    id: 'van',
    label: 'Van / Minibus',
    description: 'T6, Vito, Trafic',
    multiplier: 1.50,
    badge: 'Van',
    icon: 'van'
  },
  furgone: {
    id: 'furgone',
    label: 'Furgone Grande',
    description: 'Ducato, Sprinter, Master',
    multiplier: 2.00,
    badge: 'XL',
    icon: 'truck'
  }
};

export const VEHICLE_LIST = Object.values(VEHICLES);
