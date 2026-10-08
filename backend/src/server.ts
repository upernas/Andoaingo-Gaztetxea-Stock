// API REST del Gaztetxe Stock (Node + Express + PostgreSQL).
import express, { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import path from 'node:path';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { CollectionName } from '../../shared/types';
import {
  consumptionStats, flatInventoryLines, flatOrderLines, latestClosed, recommendations, sessionSummary, stockValueNow, toCSV, uid,
} from '../../shared/domain';
import { seedData } from '../../shared/seed';
import { INVOICE_PROMPT } from '../../shared/invoicePrompt';
import * as repo from './repo';

const PORT = Number(process.env.PORT ?? 3000);
const APP_PASSWORD = process.env.APP_PASSWORD ?? '';       // contraseña para todo el equipo (vacío = sin login, solo para pruebas)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? '';   // opcional: solo admin cambia productos, ajustes, borra o importa
const SECRET = process.env.TOKEN_SECRET ?? (APP_PASSWORD + ADMIN_PASSWORD + 'gaztetxe');
const AI_KEY = process.env.ANTHROPIC_API_KEY ?? '';
const AI_MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5';
const STATIC_DIR = process.env.STATIC_DIR ?? '';

const PATH_TO_COL: Record<string, CollectionName> = {
  categories: 'categories', suppliers: 'suppliers', products: 'products', 'inventory-sessions': 'sessions', inventory: 'sessions',
  orders: 'orders', purchases: 'purchases', returns: 'returns',
};
/** productos, categorías y proveedores no se borran: se desactivan (conservan el histórico) */
const NO_DELETE: CollectionName[] = ['products', 'categories', 'suppliers'];
const ADMIN_COLS: CollectionName[] = ['products', 'categories', 'suppliers'];

// ───────────────────────── autenticación (token firmado, sin dependencias) ─────────────────────────

type Role = 'admin' | 'staff';
const sign = (payload: string) => createHmac('sha256', SECRET).update(payload).digest('base64url');
function makeToken(role: Role) {
  const payload = Buffer.from(JSON.stringify({ role, exp: Date.now() + 1000 * 60 * 60 * 24 * 180 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}
function readToken(t: string | undefined): Role | null {
  if (!t) return null;
  const [payload, sig] = t.split('.');
  if (!payload || !sig) return null;
  const good = sign(payload);
  if (good.length !== sig.length || !timingSafeEqual(Buffer.from(good), Buffer.from(sig))) return null;
  try {
    const { role, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return exp > Date.now() ? role : null;
  } catch { return null; }
}
const eq = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

declare global { namespace Express { interface Request { role?: Role } } }

function auth(req: Request, res: Response, next: NextFunction) {
  if (!APP_PASSWORD && !ADMIN_PASSWORD) { req.role = 'admin'; return next(); }
  const role = readToken(req.headers.authorization?.replace(/^Bearer /, ''));
  if (!role) return res.status(401).json({ error: 'Saioa hasi behar da' });
  req.role = role;
  next();
}
const adminOnly = (req: Request, res: Response, next: NextFunction) =>
  !ADMIN_PASSWORD || req.role === 'admin' ? next() : res.status(403).json({ error: 'Administratzaileak bakarrik egin dezake hau' });

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) =>
  fn(req, res).catch(next);

// ───────────────────────── app ─────────────────────────

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '20mb' }));
app.use((req, res, next) => {
  // CORS: permite usar el frontend publicado en otro dominio (GitHub Pages) contra este backend
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN ?? '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const api = express.Router();

api.get('/health', wrap(async (_req, res) => {
  await repo.pool.query('SELECT 1');
  res.json({ ok: true, auth: !!(APP_PASSWORD || ADMIN_PASSWORD), ai: !!AI_KEY, version: '1.0.0' });
}));

api.post('/login', (req, res) => {
  const pwd = String(req.body?.password ?? '');
  if (ADMIN_PASSWORD && eq(pwd, ADMIN_PASSWORD)) return res.json({ token: makeToken('admin'), role: 'admin' });
  if (APP_PASSWORD && eq(pwd, APP_PASSWORD)) return res.json({ token: makeToken(ADMIN_PASSWORD ? 'staff' : 'admin'), role: ADMIN_PASSWORD ? 'staff' : 'admin' });
  setTimeout(() => res.status(401).json({ error: 'Pasahitz okerra' }), 600); // frena ataques de fuerza bruta
});

api.use(auth);

api.get('/bootstrap', wrap(async (_req, res) => res.json(await repo.bootstrap())));

api.get('/settings', wrap(async (_req, res) => res.json(await repo.getSettings())));
api.put('/settings', adminOnly, wrap(async (req, res) => { await repo.saveSettings(req.body); res.json(await repo.getSettings()); }));

// informes calculados en el servidor con la MISMA lógica que el frontend
api.get('/reports/summary', wrap(async (_req, res) => {
  const d = await repo.bootstrap();
  const last = latestClosed(d);
  const sum = last ? sessionSummary(d, last) : null;
  res.json({
    stock: stockValueNow(d),
    lastEvent: sum && {
      id: last!.id, name: last!.eventName || last!.eventType, date: last!.date, stockCost: sum.stockCost, consumptionUnits: sum.consumptionUnits,
      consumptionCost: sum.consumptionCost, estimatedSales: sum.estSales, margin: sum.margin, empties: sum.empties, refundValue: sum.refundValue,
    },
    recommendations: recommendations(d).filter(r => r.qty > 0).map(r => ({
      productId: r.product.id, name: r.product.name, status: r.status, current: r.current, par: r.par, quantity: r.qty,
      purchaseUnit: r.product.purchaseUnit, unitsPerPurchaseUnit: r.upu, unitPrice: r.unitPrice,
    })),
    consumption: consumptionStats(d).filter(s => s.n).map(s => ({ productId: s.product.id, name: s.product.name, avg: s.avg, min: s.min, max: s.max, trend: s.trend, suggestedPar: s.suggestedPar })),
  });
}));

// exportación / backup
api.get('/export.json', wrap(async (_req, res) => {
  res.setHeader('Content-Disposition', `attachment; filename="gaztetxe-stock-backup-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json(await repo.bootstrap());
}));
api.get('/export/:name.csv', wrap(async (req, res) => {
  const d = await repo.bootstrap();
  const tables: Record<string, () => Record<string, unknown>[]> = {
    produktuak: () => d.products.map(p => ({ ...p, unconfirmed: p.unconfirmed.join('|') })),
    hornitzaileak: () => d.suppliers as any, kategoriak: () => d.categories as any,
    inbentarioak: () => d.sessions.map(({ lines, ...s }) => s), zenbaketak: () => flatInventoryLines(d),
    eskaerak: () => d.orders.map(({ lines, message, ...o }) => o), eskaera_lerroak: () => flatOrderLines(d),
    sarrerak: () => d.purchases as any, itzulketak: () => d.returns as any,
  };
  const fn = tables[req.params.name];
  if (!fn) return res.status(404).json({ error: 'Taulak: ' + Object.keys(tables).join(', ') });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.name}.csv"`);
  res.send('﻿' + toCSV(fn()));
}));
api.post('/import', adminOnly, wrap(async (req, res) => {
  if (!req.body || !Array.isArray(req.body.products)) return res.status(400).json({ error: 'Ez da baliozko kopia' });
  await repo.replaceAll(req.body);
  res.json({ ok: true });
}));

// lectura de facturas con IA (opcional)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 4 } });
api.post('/invoices/extract', upload.array('images', 4), wrap(async (req, res) => {
  if (!AI_KEY) return res.status(501).json({ error: 'ANTHROPIC_API_KEY falta da zerbitzarian' });
  const files = (req.files as Express.Multer.File[]) ?? [];
  if (!files.length) return res.status(400).json({ error: 'Igo irudi bat gutxienez' });
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': AI_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: AI_MODEL, max_tokens: 4000,
      messages: [{ role: 'user', content: [
        ...files.map(f => ({ type: 'image', source: { type: 'base64', media_type: f.mimetype || 'image/png', data: f.buffer.toString('base64') } })),
        { type: 'text', text: INVOICE_PROMPT },
      ] }],
    }),
  });
  if (!r.ok) return res.status(502).json({ error: 'IA zerbitzuaren errorea: ' + (await r.text()).slice(0, 300) });
  const body: any = await r.json();
  const text: string = body.content?.map((c: any) => c.text ?? '').join('') ?? '';
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return res.status(502).json({ error: 'IAk ez du datu irakurgarririk itzuli' });
  res.json(JSON.parse(m[0]));
}));

// líneas de inventario (guardado automático línea a línea)
api.put('/inventory-sessions/:id/lines/:productId', wrap(async (req, res) => {
  await repo.setLine(req.params.id, req.params.productId, req.body);
  res.status(204).end();
}));

// CRUD genérico: GET /products, POST /products, PUT /products/:id, DELETE /purchases/:id…
api.get('/:col', wrap(async (req, res) => {
  const col = PATH_TO_COL[req.params.col];
  if (!col) return res.status(404).json({ error: 'Bide ezezaguna' });
  res.json(await repo.list(col));
}));
api.get('/:col/:id', wrap(async (req, res) => {
  const col = PATH_TO_COL[req.params.col];
  if (!col) return res.status(404).json({ error: 'Bide ezezaguna' });
  const item = await repo.get(col, req.params.id);
  return item ? res.json(item) : res.status(404).json({ error: 'Ez da aurkitu' });
}));
const save = (fromParam: boolean) => wrap(async (req, res) => {
  const col = PATH_TO_COL[req.params.col];
  if (!col) return res.status(404).json({ error: 'Bide ezezaguna' });
  if (ADMIN_COLS.includes(col) && ADMIN_PASSWORD && req.role !== 'admin') return res.status(403).json({ error: 'Administratzaileak bakarrik' });
  const item = { ...req.body, id: fromParam ? req.params.id : req.body?.id ?? uid() };
  if (col === 'products' && !item.name) return res.status(422).json({ error: 'Produktuak izena behar du' });
  await repo.upsert(col, item);
  res.status(fromParam ? 200 : 201).json(await repo.get(col, item.id));
});
api.post('/:col', save(false));
api.put('/:col/:id', save(true));
api.delete('/:col/:id', adminOnly, wrap(async (req, res) => {
  const col = PATH_TO_COL[req.params.col];
  if (!col) return res.status(404).json({ error: 'Bide ezezaguna' });
  if (NO_DELETE.includes(col)) return res.status(409).json({ error: 'Ez da ezabatzen: desaktibatu historia gordetzeko' });
  await repo.remove(col, req.params.id);
  res.status(204).end();
}));

app.use('/api', api);

if (STATIC_DIR) {
  // modo "todo en uno": el backend sirve también la PWA
  app.use(express.static(STATIC_DIR, { index: 'index.html' }));
  app.get('*', (_req, res) => res.sendFile(path.join(STATIC_DIR, 'index.html')));
}

// errores de base de datos → códigos HTTP útiles (4xx = el cliente no reintenta)
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const pgCode: string | undefined = err?.code;
  if (pgCode === '23503') return res.status(409).json({ error: 'Existitzen ez den zerbait aipatzen du (produktua edo inbentarioa)' });
  if (pgCode && /^(22|23)/.test(pgCode)) return res.status(422).json({ error: 'Datu baliogabeak: ' + err.message });
  console.error(err);
  res.status(500).json({ error: 'Barne-errorea' });
});

async function main() {
  for (let i = 0; ; i++) {
    try { await repo.migrate(); break; } catch (e) {
      if (i > 20) throw e;
      console.log('Datu-basearen zain…');
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  if (process.env.SEED_ON_EMPTY !== 'false' && (await repo.isEmpty())) {
    await repo.replaceAll(seedData());
    console.log('Datu-base hutsa: hasierako datuak kargatuta');
  }
  if (!APP_PASSWORD && !ADMIN_PASSWORD) console.warn('KONTUZ: APP_PASSWORD gabe, sareko edonork alda ditzake datuak.');
  app.listen(PORT, () => console.log(`Gaztetxe Stock APIa: http://0.0.0.0:${PORT}/api`));
}

main().catch(e => { console.error(e); process.exit(1); });
