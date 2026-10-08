// Lógica de negocio pura (sin dependencias). La usan el frontend (offline) y el backend (API /reports).
import type {
  AppData, Category, InventoryLine, InventorySession, Order, OrderLine, Product, Settings, Supplier,
} from './types';

const EPS = 1e-9;

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
/** redondeo hacia arriba tolerante a errores de coma flotante */
export const ceilSafe = (n: number) => Math.ceil(n - EPS);

export const uid = (): string => {
  const c: any = (globalThis as any).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
};

export const nowISO = () => new Date().toISOString();

// ───────────────────────── formato ─────────────────────────

export function euro(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return '—';
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true }) + ' €';
}

export function num(n: number | null | undefined, maxDec = 2): string {
  if (n == null || !isFinite(n)) return '—';
  return n.toLocaleString('es-ES', { maximumFractionDigits: maxDec });
}

/** en euskera el sustantivo no cambia tras un número ("3 kaxa", "1 kaxa") */
export function pluralize(word: string, _n: number): string {
  return word.trim();
}

export function qtyLabel(n: number, unit: string): string {
  return `${num(n)} ${unit}`.trim();
}

export const PURCHASE_UNIT_LABEL: Record<string, string> = { caja: 'pack', pack: 'pack', unidad: 'ud.' };

// ───────────────────────── productos ─────────────────────────

export function unitsPerPurchaseUnit(p: Product): number | null {
  if (p.purchaseUnit === 'caja') return p.unitsPerBox && p.unitsPerBox > 0 ? p.unitsPerBox : null;
  if (p.purchaseUnit === 'pack') return p.unitsPerPack && p.unitsPerPack > 0 ? p.unitsPerPack : null;
  return 1;
}

export function purchaseUnitName(p: Product): string {
  return PURCHASE_UNIT_LABEL[p.purchaseUnit];
}

/** desglose en cajas: 77 con cajas de 24 → "3×24 + 5" */
export function boxBreakdown(p: Product, units: number): string | null {
  const b = p.unitsPerBox;
  if (!b || b <= 1 || units < b) return null;
  const full = Math.floor(units / b + EPS);
  const rest = round2(units - full * b);
  return `${full}×${b}${rest > 0 ? ' + ' + num(rest, 2) : ''}`;
}

/** texto legible (blanco o negro) sobre un color de fondo */
export function inkOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const lin = (c: number) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.36 ? '#111417' : '#ffffff';
}

/** total en unidades de inventario de una línea contada */
export function lineTotal(p: Product, l: InventoryLine | undefined): number {
  if (!l) return 0;
  const q = l.quantity || 0;
  const part = l.partialQuantity || 0;
  if (p.countMode === 'bottle') return q + part;
  if (p.countMode === 'container') {
    const vol = p.containerVolumeL && p.containerVolumeL > 0 ? p.containerVolumeL : null;
    return vol ? q + part / vol : q;
  }
  return q;
}

/** litros totales (solo productos 'container') */
export function lineLitres(p: Product, l: InventoryLine | undefined): number | null {
  if (p.countMode !== 'container' || !p.containerVolumeL) return null;
  return lineTotal(p, l) * p.containerVolumeL;
}

export function describeStock(p: Product, units: number | null): string {
  if (units == null) return '—';
  if (p.countMode === 'container' && p.containerVolumeL) {
    return `${num(units * p.containerVolumeL, 1)} L`;
  }
  return qtyLabel(round2(units), p.inventoryUnit);
}

export function sortedProducts(products: Product[], onlyActive = true): Product[] {
  return products.filter(p => !onlyActive || p.active).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export function categoryOf(data: Pick<AppData, 'categories'>, p: Product): Category | undefined {
  return data.categories.find(c => c.id === p.categoryId);
}

export function supplierOf(data: Pick<AppData, 'suppliers'>, id: string | null): Supplier | undefined {
  return id ? data.suppliers.find(s => s.id === id) : undefined;
}

// ───────────────────────── sesiones de inventario ─────────────────────────

export function closedSessions(data: AppData): InventorySession[] {
  return data.sessions.filter(s => s.status === 'closed' && s.kind !== 'reception').sort((a, b) => a.date.localeCompare(b.date));
}

export function openSession(data: AppData): InventorySession | undefined {
  return data.sessions.filter(s => s.status === 'open' && s.kind !== 'reception').sort((a, b) => b.date.localeCompare(a.date))[0];
}

export function latestClosed(data: AppData): InventorySession | undefined {
  const c = closedSessions(data);
  return c[c.length - 1];
}

export function previousClosed(data: AppData, s: InventorySession): InventorySession | undefined {
  const c = closedSessions(data).filter(x => x.id !== s.id && x.date < s.date);
  return c[c.length - 1];
}

/** entradas netas (compras − devoluciones de género) en (from, to] */
export function purchasesBetween(data: AppData, productId: string, from: string | null, to: string | null): number {
  let t = 0;
  for (const pu of data.purchases) {
    if (pu.productId !== productId) continue;
    if (from && pu.date <= from) continue;
    if (to && pu.date > to) continue;
    t += pu.quantity;
  }
  return t;
}

export interface StockNow {
  units: number | null;     // null = nunca contado
  counted: number | null;   // lo contado en el último inventario
  purchasesSince: number;
  sessionId: string | null;
}

/** stock actual = último inventario cerrado + entradas posteriores */
export function currentStock(data: AppData, p: Product): StockNow {
  const s = [...closedSessions(data)].reverse().find(x => x.lines[p.id]?.counted);
  if (!s) return { units: null, counted: null, purchasesSince: 0, sessionId: null };
  const counted = lineTotal(p, s.lines[p.id]);
  const since = purchasesBetween(data, p.id, s.date, null);
  return { units: counted + since, counted, purchasesSince: since, sessionId: s.id };
}

export interface ConsumptionLine {
  product: Product;
  previous: number | null;
  purchased: number;
  current: number;
  consumption: number | null;
  cost: number | null;
  estSales: number | null;
  anomaly: boolean;
}

export interface SessionSummary {
  session: InventorySession;
  previous: InventorySession | undefined;
  stockCost: number;
  stockSale: number;
  consumptionUnits: number;
  consumptionCost: number;
  estSales: number;
  margin: number;
  empties: number;
  refundValue: number;
  lines: ConsumptionLine[];
  missingPurchasePrice: Product[];
  missingSalePrice: Product[];
  anomalies: ConsumptionLine[];
}

export function saleValueOf(p: Product, units: number): number | null {
  if (p.salePrice == null || p.servingsPerUnit == null) return null;
  return units * p.servingsPerUnit * p.salePrice;
}

/** resumen de un inventario comparado con el anterior cerrado */
export function sessionSummary(data: AppData, session: InventorySession): SessionSummary {
  const previous = previousClosed(data, session);
  const lines: ConsumptionLine[] = [];
  let stockCost = 0, stockSale = 0, consumptionUnits = 0, consumptionCost = 0, estSales = 0, empties = 0, refundValue = 0;
  const missP = new Set<Product>(), missS = new Set<Product>();

  for (const p of data.products) {
    const l = session.lines[p.id];
    if (!l?.counted) continue;
    const cur = lineTotal(p, l);
    if (p.purchasePrice != null) stockCost += cur * p.purchasePrice; else if (cur > 0) missP.add(p);
    const sv = saleValueOf(p, cur);
    if (sv != null) stockSale += sv;
    if (p.returnable) {
      empties += l.emptyContainers || 0;
      if (p.returnValue != null) refundValue += (l.emptyContainers || 0) * p.returnValue;
    }
    let prev: number | null = null, purchased = 0, cons: number | null = null;
    const pl = previous?.lines[p.id];
    if (previous && pl?.counted) {
      prev = lineTotal(p, pl);
      purchased = purchasesBetween(data, p.id, previous.date, session.date);
      cons = round2(prev + purchased - cur);
    }
    let cost: number | null = null, sales: number | null = null;
    const anomaly = cons != null && cons < -EPS;
    if (cons != null && !anomaly) {
      consumptionUnits += cons;
      if (p.purchasePrice != null) { cost = cons * p.purchasePrice; consumptionCost += cost; } else if (cons > 0) missP.add(p);
      sales = saleValueOf(p, cons);
      if (sales != null) estSales += sales; else if (cons > 0 && p.salePrice == null && p.servingsPerUnit !== 0) missS.add(p);
    }
    lines.push({ product: p, previous: prev, purchased, current: cur, consumption: cons, cost, estSales: sales, anomaly });
  }
  lines.sort((a, b) => a.product.sortOrder - b.product.sortOrder);
  return {
    session, previous,
    stockCost: round2(stockCost), stockSale: round2(stockSale),
    consumptionUnits: round2(consumptionUnits), consumptionCost: round2(consumptionCost),
    estSales: round2(estSales), margin: round2(estSales - consumptionCost),
    empties, refundValue: round2(refundValue),
    lines,
    missingPurchasePrice: [...missP], missingSalePrice: [...missS],
    anomalies: lines.filter(l => l.anomaly),
  };
}

/** valor del stock actual (último inventario + entradas posteriores) */
export function stockValueNow(data: AppData) {
  let cost = 0, sale = 0, missingCost = 0, counted = 0;
  for (const p of data.products) {
    const s = currentStock(data, p);
    if (s.units == null) continue;
    counted++;
    const u = Math.max(0, s.units);
    if (p.purchasePrice != null) cost += u * p.purchasePrice; else if (u > 0) missingCost++;
    const sv = saleValueOf(p, u);
    if (sv != null) sale += sv;
  }
  return { cost: round2(cost), sale: round2(sale), missingCost, counted };
}

// ───────────────────────── recomendación de pedido ─────────────────────────

export type RecStatus = 'urgente' | 'recomendado' | 'ok' | 'sin-objetivo' | 'sin-datos';
export type TargetSource = 'ekitaldia' | 'helburua' | 'batezbestekoa' | null;

export interface Recommendation {
  product: Product;
  status: RecStatus;
  current: number | null;
  par: number | null;
  /** objetivo usado (predicción por evento, stock objetivo o media) */
  target: number | null;
  source: TargetSource;
  /** eventos de ese tipo en los que se basa la predicción */
  basedOn: number;
  need: number;
  upu: number;
  upuKnown: boolean;
  qty: number; // en unidades de compra
  unitPrice: number | null; // € por unidad de compra
}

/** consumo medio en eventos de un tipo concreto (el inventario posterior al evento lleva su tipo) */
export function eventTypeConsumption(data: AppData, p: Product, eventType: string, history = consumptionHistory(data)) {
  const values: number[] = [];
  for (const h of history) {
    if (h.session.eventType !== eventType) continue;
    const l = h.lines.find(x => x.product.id === p.id);
    if (l && l.consumption != null && !l.anomaly) values.push(l.consumption);
  }
  return { n: values.length, avg: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null, max: values.length ? Math.max(...values) : null };
}

export function recommend(data: AppData, p: Product, eventType?: string, history?: SessionSummary[]): Recommendation {
  const upuRaw = unitsPerPurchaseUnit(p);
  const upu = upuRaw ?? 1;
  const unitPrice = p.purchasePrice != null ? round2(p.purchasePrice * upu * 10000) / 10000 : null;
  const st = currentStock(data, p);
  const safety = 1 + (data.settings.safetyPct ?? 0) / 100;

  let target: number | null = null, source: TargetSource = null, basedOn = 0;
  if (eventType) {
    const ev = eventTypeConsumption(data, p, eventType, history ?? consumptionHistory(data));
    if (ev.n > 0 && ev.avg != null) { target = ceilSafe(ev.avg * safety); source = 'ekitaldia'; basedOn = ev.n; }
  }
  if (target == null && p.parLevel != null) { target = p.parLevel; source = 'helburua'; }
  if (target == null) {
    const all = consumptionStats(data, data.settings, history ?? consumptionHistory(data)).find(s => s.product.id === p.id);
    if (all?.suggestedPar != null) { target = all.suggestedPar; source = 'batezbestekoa'; basedOn = all.n; }
  }
  if (target != null && p.minStock != null) target = Math.max(target, p.minStock);

  const base = { product: p, current: st.units, par: p.parLevel, target, source, basedOn, upu, upuKnown: upuRaw != null, unitPrice };
  if (target == null) return { ...base, status: 'sin-objetivo', need: 0, qty: 0 };
  if (st.units == null) return { ...base, status: 'sin-datos', need: 0, qty: 0 };
  const cur = st.units;
  const need = round2(target - cur);
  if (need <= EPS) return { ...base, status: 'ok', need: 0, qty: 0 };
  const urgent = (p.minStock != null && cur <= p.minStock + EPS) || cur <= EPS;
  return { ...base, status: urgent ? 'urgente' : 'recomendado', need, qty: ceilSafe(need / upu) };
}

export function recommendations(data: AppData, eventType?: string): Recommendation[] {
  const history = consumptionHistory(data);
  return sortedProducts(data.products).map(p => recommend(data, p, eventType, history));
}

// ───────────────────────── pedido ─────────────────────────

export function orderLineFromRec(r: Recommendation): OrderLine {
  return {
    productId: r.product.id, supplierId: r.product.supplierId, quantity: r.qty,
    purchaseUnit: r.product.purchaseUnit, unitsPerPurchaseUnit: r.upu, unitPrice: r.unitPrice,
    recommended: r.qty, manual: false, note: '',
  };
}

export function lineCost(l: OrderLine): number | null {
  return l.unitPrice == null ? null : l.quantity * l.unitPrice;
}

export interface SupplierGroup {
  supplierId: string | null;
  supplierName: string;
  lines: OrderLine[];
  subtotal: number;
  missingPrice: number;
  deliveryFee: number;
}

export function groupBySupplier(data: AppData, lines: OrderLine[]): SupplierGroup[] {
  const map = new Map<string, SupplierGroup>();
  for (const l of lines) {
    if (l.quantity <= 0) continue;
    const key = l.supplierId ?? '__none';
    if (!map.has(key)) {
      map.set(key, {
        supplierId: l.supplierId, supplierName: supplierOf(data, l.supplierId)?.name ?? 'Hornitzailerik gabe',
        lines: [], subtotal: 0, missingPrice: 0, deliveryFee: l.supplierId ? data.settings.deliveryFee || 0 : 0,
      });
    }
    const g = map.get(key)!;
    g.lines.push(l);
    const c = lineCost(l);
    if (c == null) g.missingPrice++; else g.subtotal += c;
  }
  const groups = [...map.values()];
  groups.forEach(g => { g.subtotal = round2(g.subtotal); });
  return groups.sort((a, b) => (a.supplierId ? 0 : 1) - (b.supplierId ? 0 : 1) || a.supplierName.localeCompare(b.supplierName));
}

export function orderTotal(data: AppData, lines: OrderLine[]) {
  const groups = groupBySupplier(data, lines);
  const products = round2(groups.reduce((s, g) => s + g.subtotal, 0));
  const fees = round2(groups.reduce((s, g) => s + g.deliveryFee, 0));
  return { products, fees, total: round2(products + fees), missing: groups.reduce((s, g) => s + g.missingPrice, 0), groups };
}

export function lineQtyLabel(data: AppData, l: OrderLine): string {
  const p = data.products.find(x => x.id === l.productId);
  void p;
  return qtyLabel(l.quantity, PURCHASE_UNIT_LABEL[l.purchaseUnit]);
}

/** mensaje limpio para WhatsApp (lista única, en el orden del almacén) */
/** 2026-10-09 → 09/10/26 (eguna/hila/urtea) */
export function shortDate(ymd: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : '';
}

export function buildMessage(data: AppData, lines: OrderLine[], neededBy?: string | null): string {
  const s = data.settings;
  const sel = lines.filter(l => l.quantity > 0);
  const out: string[] = [];
  if (s.greeting.trim()) out.push(s.greeting.trim(), '');
  const date = shortDate(neededBy);
  const intro = s.intro.includes('{data}')
    ? (date ? s.intro.replace('{data}', date) : 'Hurrengoa behar dugu:')
    : s.intro;
  if (intro.trim()) out.push(intro.trim(), '');
  const order = (id: string) => data.products.find(p => p.id === id)?.sortOrder ?? 0;
  for (const l of [...sel].sort((a, b) => order(a.productId) - order(b.productId))) {
    const p = data.products.find(x => x.id === l.productId);
    if (!p) continue;
    out.push(`- ${p.name}: ${lineQtyLabel(data, l)}`);
  }
  out.push('');
  if (s.showTotalInMessage) {
    const t = orderTotal(data, sel);
    if (t.products > 0) out.push(`Guztira, gutxi gorabehera: ${euro(t.products)}`, '');
  }
  if (s.farewell.trim()) out.push(s.farewell.trim());
  if (s.gaztetxeName.trim()) out.push(s.gaztetxeName.trim());
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ───────────────────────── eskaeraren harrera ─────────────────────────

export interface ReceiptLine { product: Product; ordered: number; received: number; diff: number }

/** eskatutakoa vs iritsitakoa (unitateetan) */
export function receiptCheck(data: AppData, order: Order, session: InventorySession): ReceiptLine[] {
  const out: ReceiptLine[] = [];
  for (const l of order.lines) {
    if (l.quantity <= 0) continue;
    const product = data.products.find(p => p.id === l.productId);
    if (!product) continue;
    const ordered = round2(l.quantity * l.unitsPerPurchaseUnit);
    const received = session.lines[l.productId]?.quantity ?? 0;
    out.push({ product, ordered, received, diff: round2(received - ordered) });
  }
  return out.sort((a, b) => a.product.sortOrder - b.product.sortOrder);
}

// ───────────────────────── histórico y aprendizaje ─────────────────────────

export interface ConsumptionStats {
  product: Product;
  values: number[];
  n: number;
  avg: number | null;
  min: number | null;
  max: number | null;
  trend: 'sube' | 'baja' | 'estable' | null;
  suggestedPar: number | null;
}

/** consumos de cada par de inventarios consecutivos */
export function consumptionHistory(data: AppData): SessionSummary[] {
  return closedSessions(data).filter(s => previousClosed(data, s)).map(s => sessionSummary(data, s));
}

export function consumptionStats(data: AppData, settings: Settings = data.settings, history = consumptionHistory(data)): ConsumptionStats[] {
  return sortedProducts(data.products).map(p => {
    const values: number[] = [];
    for (const h of history) {
      const l = h.lines.find(x => x.product.id === p.id);
      if (l && l.consumption != null && !l.anomaly) values.push(l.consumption);
    }
    const n = values.length;
    if (!n) return { product: p, values, n, avg: null, min: null, max: null, trend: null, suggestedPar: null };
    const avg = values.reduce((a, b) => a + b, 0) / n;
    const min = Math.min(...values), max = Math.max(...values);
    let trend: ConsumptionStats['trend'] = null;
    if (n >= 3) {
      const recent = values.slice(-2).reduce((a, b) => a + b, 0) / 2;
      const older = values.slice(0, -2).reduce((a, b) => a + b, 0) / (n - 2);
      trend = recent > older * 1.15 ? 'sube' : recent < older * 0.85 ? 'baja' : 'estable';
    }
    const suggestedPar = n >= Math.max(1, settings.minEventsForSuggestion)
      ? ceilSafe(avg * (1 + settings.safetyPct / 100)) : null;
    return { product: p, values, n, avg: round2(avg), min, max, trend, suggestedPar };
  });
}

// ───────────────────────── exportación ─────────────────────────

export function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const cols = [...new Set(rows.flatMap(r => Object.keys(r)))];
  const esc = (v: unknown) => {
    if (v == null) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  // separador ';' → Excel en español lo abre bien
  return [cols.join(';'), ...rows.map(r => cols.map(c => esc(r[c])).join(';'))].join('\n');
}

export function flatInventoryLines(data: AppData) {
  const out: Record<string, unknown>[] = [];
  for (const s of data.sessions) for (const [pid, l] of Object.entries(s.lines)) {
    const p = data.products.find(x => x.id === pid);
    out.push({ sessionId: s.id, date: s.date, eventName: s.eventName, productId: pid, product: p?.name ?? pid, ...l, total: p ? round2(lineTotal(p, l)) : null });
  }
  return out;
}

export function flatOrderLines(data: AppData) {
  const out: Record<string, unknown>[] = [];
  for (const o of data.orders) for (const l of o.lines) {
    out.push({ orderId: o.id, date: o.date, status: o.status, product: data.products.find(p => p.id === l.productId)?.name ?? l.productId, ...l });
  }
  return out;
}

export function emptySession(partial: Partial<InventorySession> = {}): InventorySession {
  return {
    id: uid(), date: nowISO(), eventName: '', eventType: '', kind: 'inventory', orderId: null, attendees: null, createdBy: '',
    notes: '', status: 'open', closedAt: null, lines: {}, ...partial,
  };
}

export function emptyOrder(partial: Partial<Order> = {}): Order {
  return {
    id: uid(), date: nowISO(), supplierId: null, status: 'borrador', title: '', notes: '', basedOnSessionId: null,
    estimatedCost: 0, message: '', lines: [], receivedAt: null, eventType: '', neededBy: null, ...partial,
  };
}

export function newProduct(partial: Partial<Product> = {}): Product {
  return {
    id: uid(), name: '', categoryId: null, format: '', countMode: 'unit', inventoryUnit: 'unidad',
    containerVolumeL: null, purchaseUnit: 'caja', unitsPerPack: null, unitsPerBox: null, supplierId: null,
    supplierCode: '', purchasePrice: null, listPrice: null, vatRate: 21, salePrice: null, servingsPerUnit: 1,
    minStock: null, parLevel: null, reorderPoint: null, returnable: false, returnValue: null, sortOrder: 9999,
    active: true, color: '#5b6470', unconfirmed: [], notes: '', ...partial,
  };
}

/** completa campos que falten (datos antiguos / importados) */
export function normalizeData(d: Partial<AppData>, defaults: AppData['settings']): AppData {
  return {
    categories: d.categories ?? [],
    suppliers: d.suppliers ?? [],
    products: (d.products ?? []).map(p => newProduct(p)),
    sessions: (d.sessions ?? []).map(s => emptySession(s)),
    orders: (d.orders ?? []).map(o => emptyOrder(o)),
    purchases: d.purchases ?? [],
    returns: d.returns ?? [],
    settings: { ...defaults, ...(d.settings ?? {}) },
  };
}
