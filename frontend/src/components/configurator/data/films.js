// Finiture pellicole e colori disponibili
export const FILMS = {
  lucida: {
    id: 'lucida',
    label: 'Lucida',
    description: 'Finitura brillante classica',
    multiplier: 1.0,
    colors: [
      { id: 'nero', label: 'Nero', hex: '#111111' },
      { id: 'bianco', label: 'Bianco', hex: '#F5F5F5' },
      { id: 'rosso', label: 'Rosso', hex: '#CC2222' },
      { id: 'blu', label: 'Blu', hex: '#1A3ACC' },
      { id: 'verde', label: 'Verde', hex: '#1A8833' },
      { id: 'grigio', label: 'Grigio', hex: '#707070' },
      { id: 'oro', label: 'Oro', hex: '#C9A84C' },
      { id: 'argento', label: 'Argento', hex: '#C0C0C0' }
    ]
  },
  opaca: {
    id: 'opaca',
    label: 'Opaca',
    description: 'Effetto matte sofisticato',
    multiplier: 1.1,
    colors: [
      { id: 'nero', label: 'Nero', hex: '#1A1A1A' },
      { id: 'bianco', label: 'Bianco', hex: '#E8E8E8' },
      { id: 'verde_militare', label: 'Verde Militare', hex: '#4A5A3A' },
      { id: 'borgogna', label: 'Borgogna', hex: '#5A1A2A' },
      { id: 'grigio_militare', label: 'Grigio Militare', hex: '#6A6A5A' },
      { id: 'beige', label: 'Beige', hex: '#D4C5A0' }
    ]
  },
  carbonio: {
    id: 'carbonio',
    label: 'Carbonio',
    description: 'Texture fibra di carbonio',
    multiplier: 1.5,
    texture: 'carbon',
    colors: [
      { id: 'nero', label: 'Nero', hex: '#111111' },
      { id: 'grigio', label: 'Grigio', hex: '#3A3A3A' },
      { id: 'bianco', label: 'Bianco', hex: '#E8E8E8' }
    ]
  },
  satinata: {
    id: 'satinata',
    label: 'Satinata',
    description: 'Finitura semi-opaca elegante',
    multiplier: 1.2,
    colors: [
      { id: 'nero', label: 'Nero', hex: '#1A1A1A' },
      { id: 'bianco', label: 'Bianco', hex: '#E8E8E8' },
      { id: 'grigio', label: 'Grigio', hex: '#606060' },
      { id: 'blu_notte', label: 'Blu Notte', hex: '#1A2A5A' },
      { id: 'rosso_scuro', label: 'Rosso Scuro', hex: '#7A1A1A' },
      { id: 'verde_inglese', label: 'Verde Inglese', hex: '#1A4A2A' }
    ]
  },
  metallizzata: {
    id: 'metallizzata',
    label: 'Metallizzata',
    description: 'Riflessi metallici brillanti',
    multiplier: 1.3,
    effect: 'shimmer',
    colors: [
      { id: 'argento', label: 'Argento', hex: '#A8A8B8' },
      { id: 'oro', label: 'Oro', hex: '#C9A84C' },
      { id: 'rame', label: 'Rame', hex: '#B87333' },
      { id: 'blu_metallico', label: 'Blu Metallico', hex: '#2244AA' },
      { id: 'verde_metallico', label: 'Verde Metallico', hex: '#1A7044' }
    ]
  },
  perlescente: {
    id: 'perlescente',
    label: 'Perlescente',
    description: 'Effetto perla iridescente',
    multiplier: 1.4,
    effect: 'pearl',
    colors: [
      { id: 'perla', label: 'Perla', hex: '#F5F0E8' },
      { id: 'rosa', label: 'Rosa', hex: '#F0C0C8' },
      { id: 'azzurro', label: 'Azzurro', hex: '#C0D8F0' },
      { id: 'viola', label: 'Viola', hex: '#D0B8E8' }
    ]
  },
  cangiante: {
    id: 'cangiante',
    label: 'Cangiante',
    description: 'Colore che cambia con la luce',
    multiplier: 1.8,
    effect: 'chameleon',
    colors: [
      { id: 'verde_viola', label: 'Verde/Viola', hex: '#4D7A3A', hex2: '#7A3A7A' },
      { id: 'blu_verde', label: 'Blu/Verde', hex: '#1A5A7A', hex2: '#1A7A5A' },
      { id: 'rosso_oro', label: 'Rosso/Oro', hex: '#8A3A1A', hex2: '#C9A84C' }
    ]
  }
};

export const FILM_LIST = Object.values(FILMS);
