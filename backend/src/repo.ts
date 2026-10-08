// Acceso a PostgreSQL. Traduce entre el modelo camelCase compartido y las tablas snake_case.
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { AppData, CollectionName, InventoryLine, InventorySession, Order, Settings } from '../../shared/types';
import { normalizeData } from '../../shared/domain';
import { DEFAULT_SETTINGS } from '../../shared/seed';

pg.types.setTypeParser(1700, v => (v === null ? null : parseFloat(v))); // numeric → number
pg.types.setTypeParser(1184, v => (v === null ? null : new Date(v).toISOString())); // timestamptz → ISO
pg.types.setTypeParser(1082, v => v); // date → 'YYYY-MM-DD'

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? 'postgres://gaztetxe:gaztetxe@localhost:5432/gaztetxe' });

type Q = pg.Pool | pg.PoolClient;

interface TableDef { table: string; cols: Record<string, string>; json?: string[] }

/** columnas simples: clave camelCase → columna */
export const TABLES: Record<Exclude<CollectionName, 'sessions' | 'orders'>, TableDef> = {
  categories: { table: 'categories', cols: { id: 'id', name: 'name', emoji: 'emoji', sortOrder: 'sort_order', active: 'active' } },
  suppliers: { table: 'suppliers', cols: { id: 'id', name: 'name', contact: 'contact', phone: 'phone', email: 'email', notes: 'notes', active: 'active' } },
  products: {
    table: 'products', json: ['unconfirmed'],
    cols: {
      id: 'id', name: 'name', categoryId: 'category_id', format: 'format', countMode: 'count_mode', inventoryUnit: 'inventory_unit',
      containerVolumeL: 'container_volume_l', purchaseUnit: 'purchase_unit', unitsPerPack: 'units_per_pack', unitsPerBox: 'units_per_box',
      supplierId: 'supplier_id', supplierCode: 'supplier_code', purchasePrice: 'purchase_price', listPrice: 'list_price', vatRate: 'vat_rate',
      salePrice: 'sale_price', servingsPerUnit: 'servings_per_unit', minStock: 'min_stock', parLevel: 'par_level', reorderPoint: 'reorder_point',
      returnable: 'returnable', returnValue: 'return_value', sortOrder: 'sort_order', active: 'active', color: 'color', unconfirmed: 'unconfirmed', notes: 'notes',
    },
  },
  purchases: {
    table: 'purchases',
    cols: { id: 'id', date: 'date', supplierId: 'supplier_id', productId: 'product_id', quantity: 'quantity', unitPrice: 'unit_price', total: 'total', orderId: 'order_id', invoiceRef: 'invoice_ref', notes: 'notes' },
  },
  returns: {
    table: 'returns',
    cols: { id: 'id', date: 'date', productId: 'product_id', quantity: 'quantity', refundPerUnit: 'refund_per_unit', totalRefund: 'total_refund', notes: 'notes' },
  },
};

const SESSION_COLS = { id: 'id', date: 'date', eventName: 'event_name', eventType: 'event_type', attendees: 'attendees', createdBy: 'created_by', notes: 'notes', status: 'status', closedAt: 'closed_at', kind: 'kind', orderId: 'order_id' };
const ORDER_COLS = { id: 'id', date: 'date', supplierId: 'supplier_id', status: 'status', title: 'title', notes: 'notes', basedOnSessionId: 'based_on_session_id', eventType: 'event_type', neededBy: 'needed_by', estimatedCost: 'estimated_cost', message: 'message', receivedAt: 'received_at' };
const ORDER_LINE_COLS = { productId: 'product_id', supplierId: 'supplier_id', quantity: 'quantity', purchaseUnit: 'purchase_unit', unitsPerPurchaseUnit: 'units_per_purchase_unit', unitPrice: 'unit_price', recommended: 'recommended', manual: 'manual', note: 'note' };

function fromRow<T>(cols: Record<string, string>, row: any, json: string[] = []): T {
  const o: any = {};
  for (const [k, c] of Object.entries(cols)) o[k] = row[c];
  for (const j of json) if (typeof o[j] === 'string') o[j] = JSON.parse(o[j]);
  return o;
}

async function upsertRow(q: Q, table: string, cols: Record<string, string>, item: any, json: string[] = []) {
  const keys = Object.keys(cols).filter(k => item[k] !== undefined);
  const columns = keys.map(k => cols[k]);
  const values = keys.map(k => (json.includes(k) ? JSON.stringify(item[k]) : item[k]));
  const set = columns.filter(c => c !== 'id').map(c => `${c} = EXCLUDED.${c}`);
  if (table === 'products') set.push('updated_at = now()');
  await q.query(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map((_, i) => '$' + (i + 1)).join(', ')})
     ON CONFLICT (id) DO UPDATE SET ${set.join(', ')}`,
    values,
  );
}

export async function migrate() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const file = process.env.SCHEMA_FILE ?? path.resolve(here, '../../db/schema.sql');
  await pool.query(readFileSync(file, 'utf8'));
}

// ───────────────────────── lectura ─────────────────────────

export async function list(col: CollectionName, q: Q = pool): Promise<any[]> {
  if (col === 'sessions') return listSessions(q);
  if (col === 'orders') return listOrders(q);
  const t = TABLES[col];
  const order = col === 'products' || col === 'categories' ? 'sort_order, name' : col === 'suppliers' ? 'name' : 'date';
  const { rows } = await q.query(`SELECT * FROM ${t.table} ORDER BY ${order}`);
  return rows.map(r => fromRow(t.cols, r, t.json));
}

async function listSessions(q: Q, id?: string): Promise<InventorySession[]> {
  const { rows } = await q.query(`SELECT * FROM inventory_sessions ${id ? 'WHERE id = $1' : ''} ORDER BY date`, id ? [id] : []);
  const { rows: lines } = await q.query(`SELECT * FROM inventory_lines ${id ? 'WHERE session_id = $1' : ''}`, id ? [id] : []);
  return rows.map(r => {
    const s = fromRow<InventorySession>(SESSION_COLS, r);
    s.lines = {};
    for (const l of lines.filter(x => x.session_id === s.id)) {
      s.lines[l.product_id] = { quantity: l.quantity, partialQuantity: l.partial_quantity, emptyContainers: l.empty_containers, counted: l.counted };
    }
    return s;
  });
}

async function listOrders(q: Q, id?: string): Promise<Order[]> {
  const { rows } = await q.query(`SELECT * FROM orders ${id ? 'WHERE id = $1' : ''} ORDER BY date`, id ? [id] : []);
  const { rows: lines } = await q.query(`SELECT * FROM order_lines ${id ? 'WHERE order_id = $1' : ''} ORDER BY position`, id ? [id] : []);
  return rows.map(r => ({ ...fromRow<Order>(ORDER_COLS, r), lines: lines.filter(l => l.order_id === r.id).map(l => fromRow(ORDER_LINE_COLS, l)) }));
}

export async function get(col: CollectionName, id: string) {
  if (col === 'sessions') return (await listSessions(pool, id))[0] ?? null;
  if (col === 'orders') return (await listOrders(pool, id))[0] ?? null;
  const t = TABLES[col];
  const { rows } = await pool.query(`SELECT * FROM ${t.table} WHERE id = $1`, [id]);
  return rows[0] ? fromRow(t.cols, rows[0], t.json) : null;
}

export async function getSettings(q: Q = pool): Promise<Settings> {
  const { rows } = await q.query(`SELECT value FROM settings WHERE key = 'app'`);
  return { ...DEFAULT_SETTINGS, ...(rows[0]?.value ?? {}) };
}

export async function bootstrap(): Promise<AppData> {
  const [categories, suppliers, products, sessions, orders, purchases, returns, settings] = await Promise.all([
    list('categories'), list('suppliers'), list('products'), list('sessions'), list('orders'), list('purchases'), list('returns'), getSettings(),
  ]);
  return normalizeData({ categories, suppliers, products, sessions, orders, purchases, returns, settings }, DEFAULT_SETTINGS);
}

// ───────────────────────── escritura ─────────────────────────

async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const r = await fn(c);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally { c.release(); }
}

async function writeLine(q: Q, sessionId: string, productId: string, l: InventoryLine) {
  await q.query(
    `INSERT INTO inventory_lines (id, session_id, product_id, quantity, partial_quantity, empty_containers, counted)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (session_id, product_id) DO UPDATE SET quantity = EXCLUDED.quantity, partial_quantity = EXCLUDED.partial_quantity,
       empty_containers = EXCLUDED.empty_containers, counted = EXCLUDED.counted`,
    [`${sessionId}:${productId}`, sessionId, productId, l.quantity ?? 0, l.partialQuantity ?? 0, Math.round(l.emptyContainers ?? 0), l.counted ?? true],
  );
}

export async function upsert(col: CollectionName, item: any, q?: pg.PoolClient): Promise<void> {
  const run = async (c: pg.PoolClient) => {
    if (col === 'sessions') {
      await upsertRow(c, 'inventory_sessions', SESSION_COLS, item);
      if (item.lines) for (const [pid, l] of Object.entries(item.lines as Record<string, InventoryLine>)) await writeLine(c, item.id, pid, l);
      return;
    }
    if (col === 'orders') {
      await upsertRow(c, 'orders', ORDER_COLS, item);
      if (Array.isArray(item.lines)) {
        await c.query('DELETE FROM order_lines WHERE order_id = $1', [item.id]);
        let i = 0;
        for (const l of item.lines) {
          await upsertRow(c, 'order_lines', { id: 'id', orderId: 'order_id', position: 'position', ...ORDER_LINE_COLS },
            { ...l, id: `${item.id}:${l.productId}:${i}`, orderId: item.id, position: i++ });
        }
      }
      return;
    }
    const t = TABLES[col];
    await upsertRow(c, t.table, t.cols, item, t.json);
  };
  if (q) return run(q);
  await tx(run);
}

export async function setLine(sessionId: string, productId: string, line: InventoryLine) {
  await writeLine(pool, sessionId, productId, line);
}

export async function remove(col: CollectionName, id: string) {
  const table = col === 'sessions' ? 'inventory_sessions' : col === 'orders' ? 'orders' : TABLES[col].table;
  const { rowCount } = await pool.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
  return rowCount ?? 0;
}

export async function saveSettings(s: Settings, q: Q = pool) {
  await q.query(`INSERT INTO settings (key, value) VALUES ('app', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [JSON.stringify(s)]);
}

/** sustituye todos los datos (restaurar copia de seguridad) */
export async function replaceAll(d: AppData) {
  const data = normalizeData(d, DEFAULT_SETTINGS);
  await tx(async c => {
    await c.query('TRUNCATE order_lines, orders, inventory_lines, inventory_sessions, purchases, returns, products, suppliers, categories, settings');
    for (const col of ['categories', 'suppliers', 'products', 'sessions', 'orders', 'purchases', 'returns'] as CollectionName[]) {
      for (const item of (data as any)[col]) await upsert(col, item, c);
    }
    await saveSettings(data.settings, c);
  });
}

export async function isEmpty() {
  const { rows } = await pool.query('SELECT (SELECT count(*) FROM products) + (SELECT count(*) FROM categories) AS n');
  return Number(rows[0].n) === 0;
}
