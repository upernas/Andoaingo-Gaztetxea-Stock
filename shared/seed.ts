// Hasierako datuak. Prezioak 189.536, 193.818 eta 197.703 albaranetatik (berretsi gabe: albaranak ez daude eguneratuta).
// Pack-tamainak (erabiltzaileak emanak): San Miguel 20 cl eta 0,0 → 30; glutenik gabe 24; latak 24; botilak 6; ura 35.
// Ezer ez da asmatu: datu ezezagunak null dira eta `unconfirmed` zerrendan ("BERRETSI GABE").
import type { AppData, Category, Product, Settings, Supplier } from './types';
import { newProduct } from './domain';

export const DEFAULT_SETTINGS: Settings = {
  gaztetxeName: 'Andoaingo Gaztetxea',
  greeting: 'Kaixo!',
  intro: '{data} fetxarako hurrengoa behar dugu:',
  farewell: 'Eskerrik asko!',
  showTotalInMessage: true,
  safetyPct: 25,
  minEventsForSuggestion: 2,
  deliveryFee: 0,
  pricesIncludeVat: false,
  eventTypes: ['Reggaeton', 'Tekno', 'Kontzertua'],
  unconfirmed: ['pricesIncludeVat'],
};

export const SEED_CATEGORIES: Category[] = [
  { id: 'cat-cerveza', name: 'Garagardoa', emoji: '', sortOrder: 1, active: true },
  { id: 'cat-refrescos', name: 'Freskagarriak', emoji: '', sortOrder: 2, active: true },
  { id: 'cat-agua', name: 'Ura', emoji: '', sortOrder: 3, active: true },
  { id: 'cat-vino', name: 'Ardoa', emoji: '', sortOrder: 4, active: true },
  { id: 'cat-destilados', name: 'Distilatuak', emoji: '', sortOrder: 5, active: true },
  { id: 'cat-chupitos', name: 'Txupitoak', emoji: '', sortOrder: 6, active: true },
  { id: 'cat-otros', name: 'Bestelakoak', emoji: '', sortOrder: 7, active: true },
];

export const SEED_SUPPLIERS: Supplier[] = [
  { id: 'sup-distribuidor', name: 'Banatzailea', contact: 'Jon', phone: '747407314', email: '', notes: 'Albaranetik: "Llamar antes de ir 747407314".', active: true },
];

const SUP = 'sup-distribuidor';
const NO_PRICE = ['purchasePrice'];
const bottle = { countMode: 'bottle' as const, inventoryUnit: 'ud.', purchaseUnit: 'caja' as const, unitsPerBox: 6, servingsPerUnit: null };
const can = { inventoryUnit: 'ud.', purchaseUnit: 'caja' as const, unitsPerBox: 24 };

export const SEED_PRODUCTS: Product[] = [
  newProduct({
    id: 'p-sm', name: 'San Miguel', categoryId: 'cat-cerveza', format: 'Botilatxoa 20 cl, itzulgarria', color: '#1d5236',
    inventoryUnit: 'ud.', purchaseUnit: 'caja', unitsPerBox: 30, supplierId: SUP, supplierCode: '000085',
    purchasePrice: 0.4965, vatRate: 21, returnable: true, returnValue: 0.09, sortOrder: 1,
    unconfirmed: ['purchasePrice'],
    notes: 'Packa: 30 ud. Albaranean: 0,7410 €/u, deskontuarekin 0,4965 €/u. Ontzia: 2,70 € pack osoko = 0,09 €/ud.',
  }),
  newProduct({
    id: 'p-sm00', name: 'San Miguel 0,0', categoryId: 'cat-cerveza', format: 'Botilatxoa 20 cl', color: '#1f4e8c',
    inventoryUnit: 'ud.', purchaseUnit: 'caja', unitsPerBox: 30, sortOrder: 2,
    unconfirmed: [...NO_PRICE, 'format', 'returnable'],
  }),
  newProduct({
    id: 'p-smsg', name: 'San Miguel glutenik gabe', categoryId: 'cat-cerveza', format: 'Botila 33 cl, ez itzulgarria', color: '#9a7b1c',
    inventoryUnit: 'ud.', purchaseUnit: 'caja', unitsPerBox: 24, supplierId: SUP, supplierCode: '000054',
    purchasePrice: 1.2054, vatRate: 21, sortOrder: 3, unconfirmed: ['purchasePrice'],
  }),
  newProduct({ id: 'p-coca', name: 'Coca-Cola', categoryId: 'cat-refrescos', format: 'Lata 33 cl', color: '#c8102e', ...can,
    supplierId: SUP, supplierCode: '000257', purchasePrice: 0.53, vatRate: 21, sortOrder: 4, unconfirmed: ['purchasePrice'] }),
  newProduct({ id: 'p-kasn', name: 'Kas Laranja', categoryId: 'cat-refrescos', format: 'Lata 33 cl', color: '#ef7d00', ...can,
    supplierId: SUP, supplierCode: '000287', purchasePrice: 0.672, vatRate: 21, sortOrder: 5, unconfirmed: ['purchasePrice'] }),
  newProduct({ id: 'p-kasl', name: 'Kas Limoia', categoryId: 'cat-refrescos', format: 'Lata 33 cl', color: '#e2c400', ...can,
    supplierId: SUP, supplierCode: '000288', purchasePrice: 0.672, vatRate: 21, sortOrder: 6, unconfirmed: ['purchasePrice'] }),
  newProduct({ id: 'p-schw', name: 'Schweppes Tonika', categoryId: 'cat-refrescos', format: 'Lata 33 cl', color: '#c9a227', ...can,
    supplierId: SUP, supplierCode: '000117', purchasePrice: 0.636, vatRate: 21, sortOrder: 7, unconfirmed: ['purchasePrice'] }),
  newProduct({
    id: 'p-agua', name: 'Ura (Font Vella)', categoryId: 'cat-agua', format: 'PET botila 0,33 L', color: '#3b8fd9',
    inventoryUnit: 'ud.', purchaseUnit: 'caja', unitsPerBox: 35, supplierId: SUP, supplierCode: '000431',
    purchasePrice: 0.3773, vatRate: 10, sortOrder: 8, unconfirmed: ['format', 'purchasePrice'],
  }),
  newProduct({ id: 'p-barcelo', name: 'Barceló Rona', categoryId: 'cat-destilados', format: 'Botila 0,70 L', color: '#7a4a24', ...bottle,
    supplierId: SUP, supplierCode: '000561', purchasePrice: 12.17, vatRate: 21, sortOrder: 9, unconfirmed: ['purchasePrice'] }),
  newProduct({ id: 'p-seagrams', name: "Seagram's Gina", categoryId: 'cat-destilados', format: 'Botila', color: '#2c4a7a', ...bottle,
    sortOrder: 10, unconfirmed: [...NO_PRICE, 'format'] }),
  newProduct({ id: 'p-beefeater', name: 'Beefeater Gina', categoryId: 'cat-destilados', format: 'Botila 0,70 L', color: '#a3162b', ...bottle,
    supplierId: SUP, supplierCode: '000573', purchasePrice: 12.2, vatRate: 21, sortOrder: 11, unconfirmed: ['purchasePrice'] }),
  newProduct({ id: 'p-absolut', name: 'Absolut Vodka', categoryId: 'cat-destilados', format: 'Botila', color: '#1b3a8c', ...bottle,
    sortOrder: 12, unconfirmed: [...NO_PRICE, 'format'] }),
  newProduct({ id: 'p-eristoff', name: 'Eristoff Vodka', categoryId: 'cat-destilados', format: 'Botila 1 L', color: '#3a3a3a', ...bottle,
    supplierId: SUP, supplierCode: '000580', purchasePrice: 10.34, vatRate: 21, sortOrder: 13, unconfirmed: ['purchasePrice'] }),
  newProduct({ id: 'p-jager', name: 'Jägermeister', categoryId: 'cat-destilados', format: 'Botila 0,70 L', color: '#24472f', ...bottle,
    supplierId: SUP, supplierCode: '000511', purchasePrice: 11.32, vatRate: 21, sortOrder: 14, unconfirmed: ['purchasePrice'] }),
  newProduct({ id: 'p-jd', name: "Jack Daniel's", categoryId: 'cat-destilados', format: 'Botila 0,70 L', color: '#1c1c1c', ...bottle,
    supplierId: SUP, supplierCode: '000600', purchasePrice: 15.78, vatRate: 21, sortOrder: 15, unconfirmed: ['purchasePrice'] }),
  newProduct({
    id: 'p-vino', name: 'Ardoa', categoryId: 'cat-vino', format: 'Kaxa 5 L', color: '#6e1a2d', countMode: 'container',
    inventoryUnit: 'ud.', containerVolumeL: 5, purchaseUnit: 'unidad', servingsPerUnit: null, sortOrder: 16,
    unconfirmed: ['purchasePrice'],
  }),
  newProduct({ id: 'p-plata', name: 'Plata o Plomo', categoryId: 'cat-chupitos', format: 'Botila 0,70 L', color: '#6b7178', ...bottle,
    supplierId: SUP, supplierCode: '007193', purchasePrice: 9.39, vatRate: 21, sortOrder: 17, unconfirmed: ['purchasePrice'] }),
  newProduct({ id: 'p-tequila', name: 'Tequila Marrubia', categoryId: 'cat-chupitos', format: 'Botila', color: '#d23a6e', ...bottle,
    sortOrder: 18, unconfirmed: [...NO_PRICE, 'format'] }),
  newProduct({ id: 'p-melon', name: 'Meloia', categoryId: 'cat-chupitos', format: 'Botila', color: '#5aa83a', ...bottle,
    sortOrder: 19, unconfirmed: [...NO_PRICE, 'format'] }),
  newProduct({ id: 'p-turbo', name: 'Turbo Azul', categoryId: 'cat-chupitos', format: 'Botila', color: '#1f6fd6', ...bottle,
    sortOrder: 20, unconfirmed: [...NO_PRICE, 'format'] }),
  newProduct({ id: 'p-patxaran', name: 'Patxaran La Navarra', categoryId: 'cat-chupitos', format: 'Botila 1 L', color: '#5b2245', ...bottle,
    supplierId: SUP, supplierCode: '000505', purchasePrice: 9.34, vatRate: 21, sortOrder: 21, unconfirmed: ['purchasePrice'] }),
  newProduct({ id: 'p-etxeko', name: 'Patxaran Etxeko', categoryId: 'cat-chupitos', format: 'Botila 1 L', color: '#5b2245', ...bottle,
    supplierId: SUP, supplierCode: '000506', purchasePrice: 9.95, vatRate: 21, sortOrder: 22, active: false,
    unconfirmed: ['purchasePrice'], notes: 'Desaktibatuta: orain La Navarra erosten da.' }),
];

export function seedData(): AppData {
  return JSON.parse(JSON.stringify({
    categories: SEED_CATEGORIES,
    suppliers: SEED_SUPPLIERS,
    products: SEED_PRODUCTS,
    sessions: [],
    orders: [],
    purchases: [],
    returns: [],
    settings: DEFAULT_SETTINGS,
  }));
}
