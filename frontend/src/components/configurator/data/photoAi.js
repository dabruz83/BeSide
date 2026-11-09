// Contratto locale per il futuro servizio di anteprima AI.
// Non contiene chiamate di rete e non persiste immagini o dati personali.
export const PHOTO_CUSTOMIZATION_ZONES = [
  { id: 'vehicle', label: 'Auto completa', kind: 'film' },
  { id: 'hood', label: 'Cofano', kind: 'film' },
  { id: 'roof', label: 'Tetto', kind: 'film' },
  { id: 'mirrors', label: 'Specchietti', kind: 'film' },
  { id: 'bumpers', label: 'Paraurti', kind: 'film' },
  { id: 'headlights', label: 'Fari', kind: 'tint', options: ['35%', '15%'] },
  { id: 'windows', label: 'Finestrini laterali', kind: 'tint', options: ['5%', '15%', '20%'] },
  { id: 'graphics', label: 'Grafiche personalizzate', kind: 'graphic' },
  { id: 'other', label: 'Altre parti', kind: 'film' },
];

export const createPhotoPreviewRequest = ({ photo, vehicle, selections, notes = '', maskFile = null, maskPoints = [] }) => ({
  // I File restano solo in memoria: il futuro adapter potrà inserirli in FormData.
  sourceImage: photo ? { name: photo.name, type: photo.type, size: photo.size } : null,
  sourceFile: photo?.file || null,
  vehicle,
  zones: Object.values(selections || {}).map(({ zoneId, ...selection }) => ({ zoneId, ...selection })),
  maskFile,
  masks: maskFile ? [{ zoneId: 'manual-selection', assetRef: 'manual-polygon', view: 'photo', points: maskPoints }] : [],
  notes: notes.trim(),
});

const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export const validatePhotoPreviewRequest = (request) => {
  const errors = [];
  if (!request?.sourceImage || !request.sourceFile) errors.push('Carica una fotografia del veicolo.');
  if (request?.sourceImage && !PHOTO_TYPES.has(request.sourceImage.type)) errors.push('Il formato della fotografia non è supportato.');
  if (!request?.vehicle) errors.push('Seleziona il veicolo di riferimento.');
  if (!request?.zones?.length) errors.push('Seleziona almeno una zona da personalizzare.');
  if (request?.maskFile && request.zones.some((zone) => zone.kind === 'graphic')) errors.push('Maschera e grafica markup non possono essere inviate insieme.');

  request?.zones?.forEach((zone) => {
    if (zone.kind === 'graphic' && !zone.graphicFile) errors.push('Carica la grafica per la zona selezionata.');
    if (zone.kind === 'tint' && !zone.tint) errors.push(`Scegli la gradazione per ${zone.zoneId}.`);
    if (zone.kind === 'film' && (!zone.finish || !zone.colorId)) errors.push(`Completa colore e finitura per ${zone.zoneId}.`);
  });
  return { valid: errors.length === 0, errors };
};

/** Punto unico in cui collegare in seguito il vero adapter AI. */
export const generatePhotoPreview = async (request) => {
  const validation = validatePhotoPreviewRequest(request);
  if (!validation.valid) return { status: 'invalid', ...validation };
  return { status: 'ready', request };
};

export const buildPhotoPreviewFormData = (request) => {
  const formData = new FormData();
  formData.append('photo', request.sourceFile, request.sourceImage.name);
  const graphicZone = request.zones.find((zone) => zone.kind === 'graphic' && zone.graphicFile);
  const configuration = {
    vehicle: request.vehicle,
    notes: request.notes,
    masks: request.masks || [],
    zones: request.zones.map(({ graphicFile, ...zone }) => zone),
  };
  formData.append('configuration', JSON.stringify(configuration));
  if (request.maskFile) formData.append('mask', request.maskFile, request.maskFile.name);
  if (graphicZone) formData.append('graphic', graphicZone.graphicFile, graphicZone.graphicFile.name);
  return formData;
};
