// Mappatura dei soli PNG realmente presenti nella libreria City Car.
// I codici senza finitura esplicita restano classificati come lucidi iniziali.
export const classifyCityCarFinish = (code) => (/m(?:att)?$/i.test(code) || /supermatt$/i.test(code) || /-matt$/i.test(code) ? 'opaca' : 'lucida');

const withFinish = (code, views) => ({
  id: code,
  label: code,
  code,
  finish: classifyCityCarFinish(code),
  finishVerified: /m(?:att)?$/i.test(code) || /supermatt$/i.test(code) || /-matt$/i.test(code),
  views,
});

export const CITY_CAR_SPECCHIETTI_FRONT_CODES = ['010m', '022', '028', '045', '070', '070m', '070superm', '090', '090m', '091', '091m', '093', '093m', '171', '172', '173', '175', '195', '196', '196m', '197', '197m', '285m', '317', '369', '369m', '553', '602', '677', '704', '711', '793', '793m', '795', '795m', '905', '932', '932m', '937', '937m', '945', '946', '961', '988', '989', '990'];
export const CITY_CAR_SPECCHIETTI_REAR_CODES = ['010m', '022', '028', '045', '070', '070m', '070supermatt', '090', '090m', '091', '091m', '093', '093m', '171', '172', '173', '175', '195', '196', '196m', '197', '197m', '285m', '317', '369', '369m', '553', '602', '677', '704', '711', '793', '793m', '795', '795m', '905', '932', '932m', '937', '937m', '945', '946', '961', '988', '989', '990'];
const CITY_CAR_COFANO_CODES = ['010m', '022', '028', '045', '070', '070m', '070supermatt', '090', '090m', '091', '091m', '093', '093m', '171', '172', '173', '175', '195', '196', '196m', '197', '197m', '285m', '317', '369', '369m', '553', '602', '677', '704', '711', '793', '793m', '795', '795m', '905', '932', '932m', '937', '937m', '945', '946', '961', '988', '989', '990'];
const CITY_CAR_TETTO_FRONT_CODES = ['010m', '022', '028', '045', '070', '070-matt', '070-supermatt', '090', '090m', '091', '091m', '093', '093m', '171', '172', '173', '175', '195', '196', '196m', '197', '197m', '285m', '369', '369m', '553', '602', '677', '704', '711', '793', '793m', '795', '795m', '905', '905B', '932', '932m', '937', '937m', '945', '946', '961', '988', '989', '990'];
const CITY_CAR_TETTO_REAR_CODES = ['010', '022', '028', '045', '070', '070m', '070superm', '090', '090m', '091', '091m', '093', '093m', '101m', '171', '172', '173', '175', '195', '196', '196m', '197', '197m', '285m', '317', '369', '369m', '553', '602', '677', '704', '711', '793', '793m', '795', '795m', '905', '932', '932m', '937', '937m', '945', '946', '961', '988', '989', '990'];
const union = (...lists) => [...new Set(lists.flat())];
const layerUrl = (zone, view, code) => `/assets/vehicles/city-car/layers/${zone}/${view}/${code}.png`;

const specchiettiVariants = union(CITY_CAR_SPECCHIETTI_FRONT_CODES, CITY_CAR_SPECCHIETTI_REAR_CODES).map((code) => withFinish(code, {
  ...(CITY_CAR_SPECCHIETTI_FRONT_CODES.includes(code) ? { front: layerUrl('specchietti', 'front', code) } : {}),
  ...(CITY_CAR_SPECCHIETTI_REAR_CODES.includes(code) ? { rear: layerUrl('specchietti', 'rear', code) } : {}),
}));
const cofanoVariants = CITY_CAR_COFANO_CODES.map((code) => withFinish(code, { front: `/assets/vehicles/city-car/layers/cofano/${code}.png` }));
const tettoVariants = union(CITY_CAR_TETTO_FRONT_CODES, CITY_CAR_TETTO_REAR_CODES).map((code) => withFinish(code, {
  ...(CITY_CAR_TETTO_FRONT_CODES.includes(code) ? { front: layerUrl('tetto', 'front', code) } : {}),
  ...(CITY_CAR_TETTO_REAR_CODES.includes(code) ? { rear: layerUrl('tetto', 'rear', code) } : {}),
}));

export const CITY_CAR_INTERACTIVE_ZONES = [
  { id: 'specchietti', label: 'Specchietti', variants: specchiettiVariants },
  { id: 'cofano', label: 'Cofano', variants: cofanoVariants },
  { id: 'tetto', label: 'Tetto', variants: tettoVariants },
];

export const CITY_CAR_BASE_COLORS = [
  { id: 'bianco', label: 'Bianco', front: '/assets/vehicles/city-car/base/colors/Hatchback bianco.png', rear: '/assets/vehicles/city-car/base/colors/bianco-rear.png' },
  { id: 'nero', label: 'Nero', front: '/assets/vehicles/city-car/base/colors/Hatchback nero.png', rear: '/assets/vehicles/city-car/base/colors/nero-rear.png' },
  { id: 'rosso', label: 'Rosso', front: '/assets/vehicles/city-car/base/colors/Hatchback rosso.png', rear: '/assets/vehicles/city-car/base/colors/rosso-rear.png' },
  { id: 'grigio', label: 'Grigio', front: '/assets/vehicles/city-car/base/colors/Hatchback-grigio.png', rear: '/assets/vehicles/city-car/base/colors/grigio-rear.png' },
  { id: 'blu', label: 'Blu', front: '/assets/vehicles/city-car/base/colors/Hatchback blu.png', rear: '/assets/vehicles/city-car/base/colors/blu-rear.png' },
];

export const CITY_CAR_FULL_WRAP_AVAILABLE = false;
