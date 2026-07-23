// Zone wrappabili con prezzi base
export const ZONES = {
  tetto: {
    id: 'tetto',
    label: 'Tetto',
    description: 'Copertura completa del tetto',
    basePrice: 180,
    icon: 'roof'
  },
  cofano: {
    id: 'cofano',
    label: 'Cofano',
    description: 'Cofano anteriore',
    basePrice: 140,
    icon: 'hood'
  },
  porte_fiancate: {
    id: 'porte_fiancate',
    label: 'Porte + Fiancate',
    description: 'Porte e pannelli laterali completi',
    basePrice: 280,
    icon: 'doors'
  },
  parte_inferiore: {
    id: 'parte_inferiore',
    label: 'Parte Inferiore',
    description: 'Minigonne e spoiler inferiori',
    basePrice: 180,
    icon: 'lower'
  },
  specchietti: {
    id: 'specchietti',
    label: 'Specchietti',
    description: 'Calotte specchietti retrovisori',
    basePrice: 60,
    icon: 'mirrors'
  },
  fari_anteriori: {
    id: 'fari_anteriori',
    label: 'Fari Anteriori',
    description: 'Pellicola protettiva fari',
    basePrice: 60,
    icon: 'lights'
  }
};

export const ZONE_LIST = Object.values(ZONES);
