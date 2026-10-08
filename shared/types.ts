// Modelo de datos compartido por frontend y backend.
// Todas las cantidades de stock se expresan en UNIDADES DE INVENTARIO (lo que se cuenta).
// Las cantidades de pedido se expresan en UNIDADES DE COMPRA (caja / pack / unidad).

export type ID = string;

/** Cómo se cuenta un producto en el inventario */
export type CountMode =
  | 'unit'       // botellines, latas, vasos… → solo enteros
  | 'bottle'     // botellas → enteras + fracción de la botella abierta (¼, ½, ¾)
  | 'container'; // vino en caja (bag-in-box) → cajas cerradas + litros de la abierta

export type PurchaseUnit = 'caja' | 'pack' | 'unidad';

export interface Category {
  id: ID;
  name: string;
  emoji: string;
  sortOrder: number;
  active: boolean;
}

export interface Supplier {
  id: ID;
  name: string;
  contact: string;
  phone: string;
  email: string;
  notes: string;
  active: boolean;
}

export interface Product {
  id: ID;
  name: string;
  categoryId: ID | null;
  format: string;
  countMode: CountMode;
  /** lo que contamos: botellín, lata, botella, caja 5 L… */
  inventoryUnit: string;
  /** solo countMode 'container': litros por envase (vino 5 L) */
  containerVolumeL: number | null;
  /** lo que compramos */
  purchaseUnit: PurchaseUnit;
  unitsPerPack: number | null;
  unitsPerBox: number | null;
  supplierId: ID | null;
  /** código del artículo en el albarán del proveedor */
  supplierCode: string;
  /** € por unidad de inventario, NETO (tras descuento), sin IVA */
  purchasePrice: number | null;
  /** € por unidad según tarifa del albarán, antes de descuento */
  listPrice: number | null;
  vatRate: number | null;
  /** € por consumición (opcional: hielo, vasos… no se venden) */
  salePrice: number | null;
  /** consumiciones que salen de una unidad de inventario (1 botellín = 1; 1 botella de ron = N cubatas) */
  servingsPerUnit: number | null;
  minStock: number | null;
  parLevel: number | null;
  reorderPoint: number | null;
  returnable: boolean;
  /** € que devuelven por cada envase vacío */
  returnValue: number | null;
  sortOrder: number;
  active: boolean;
  /** color característico (fondo al contar, marca en listas) */
  color: string;
  /** nombres de campos marcados "POR CONFIRMAR" */
  unconfirmed: string[];
  notes: string;
}

export interface InventoryLine {
  /** unidades enteras / envases cerrados */
  quantity: number;
  /** bottle: fracción de botella abierta (0-0.75) · container: litros de la caja abierta */
  partialQuantity: number;
  /** envases vacíos (solo retornables) */
  emptyContainers: number;
  counted: boolean;
}

export type SessionStatus = 'open' | 'closed';

export interface InventorySession {
  id: ID;
  date: string; // ISO
  eventName: string;
  eventType: string;
  attendees: number | null;
  createdBy: string;
  notes: string;
  status: SessionStatus;
  closedAt: string | null;
  lines: Record<ID, InventoryLine>;
  /** 'inventory' = ekitaldi osteko inbentarioa · 'reception' = iritsitako eskaeraren zenbaketa */
  kind: 'inventory' | 'reception';
  /** reception: zein eskaerari dagokion */
  orderId: ID | null;
}

export type OrderStatus = 'borrador' | 'enviado' | 'recibido';

export interface OrderLine {
  productId: ID;
  supplierId: ID | null;
  /** cantidad en unidades de compra */
  quantity: number;
  purchaseUnit: PurchaseUnit;
  unitsPerPurchaseUnit: number;
  /** € por unidad de compra (estimado) */
  unitPrice: number | null;
  recommended: number;
  manual: boolean;
  note: string;
}

export interface Order {
  id: ID;
  date: string;
  supplierId: ID | null;
  status: OrderStatus;
  title: string;
  notes: string;
  basedOnSessionId: ID | null;
  /** tipo del próximo evento: base de la predicción */
  eventType: string;
  estimatedCost: number;
  message: string;
  lines: OrderLine[];
  receivedAt: string | null;
  /** noiz behar dugun eskaera (YYYY-MM-DD) */
  neededBy: string | null;
}

/** Entrada (o salida, si negativa) de género al almacén */
export interface Purchase {
  id: ID;
  date: string;
  supplierId: ID | null;
  productId: ID;
  /** en unidades de inventario; negativo = género devuelto al proveedor */
  quantity: number;
  /** € por unidad de inventario */
  unitPrice: number | null;
  total: number | null;
  orderId: ID | null;
  invoiceRef: string;
  notes: string;
}

/** Devolución de envases vacíos */
export interface ReturnRecord {
  id: ID;
  date: string;
  productId: ID;
  quantity: number;
  refundPerUnit: number;
  totalRefund: number;
  notes: string;
}

export interface Settings {
  gaztetxeName: string;
  greeting: string;
  intro: string;
  farewell: string;
  showTotalInMessage: boolean;
  /** margen de seguridad para el stock objetivo sugerido (%) */
  safetyPct: number;
  /** eventos mínimos con consumo antes de sugerir objetivo */
  minEventsForSuggestion: number;
  /** coste fijo por albarán (servicio de reparto) */
  deliveryFee: number;
  pricesIncludeVat: boolean;
  eventTypes: string[];
  unconfirmed: string[];
}

export interface AppData {
  categories: Category[];
  suppliers: Supplier[];
  products: Product[];
  sessions: InventorySession[];
  orders: Order[];
  purchases: Purchase[];
  returns: ReturnRecord[];
  settings: Settings;
}

export type CollectionName =
  | 'categories' | 'suppliers' | 'products' | 'sessions' | 'orders' | 'purchases' | 'returns';

export const COLLECTIONS: CollectionName[] = [
  'categories', 'suppliers', 'products', 'sessions', 'orders', 'purchases', 'returns',
];
