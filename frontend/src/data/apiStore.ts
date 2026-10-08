import type { AppData, CollectionName, InventoryLine, Settings } from '../../../shared/types';
import { normalizeData } from '../../../shared/domain';
import { DEFAULT_SETTINGS } from '../../../shared/seed';
import { browserDownload, clone, DataStore, ExtractedInvoice, safeGet, safeSet, StoreStatus, upsertArr } from './store';

/** rutas REST por colección */
export const API_PATHS: Record<CollectionName, string> = {
  categories: 'categories', suppliers: 'suppliers', products: 'products', sessions: 'inventory-sessions',
  orders: 'orders', purchases: 'purchases', returns: 'returns',
};

interface Op { key: string; method: 'PUT' | 'POST' | 'DELETE'; path: string; body?: unknown }

const CACHE_KEY = 'gz-api-cache-v1';
const OUTBOX_KEY = 'gz-api-outbox-v1';

/**
 * Backend propio. Offline-first: cada cambio se aplica a la copia local y entra en una cola;
 * la cola se envía en orden en cuanto hay conexión. Nada se pierde al cerrar la app.
 */
export class ApiStore implements DataStore {
  readonly mode = 'api' as const;
  readonly label: string;
  private data!: AppData;
  private outbox: Op[] = [];
  private statusCb: (s: StoreStatus) => void = () => {};
  private flushing = false;
  private lastState: StoreStatus = { state: 'saved', pending: 0 };

  constructor(private baseUrl: string, private token: string | null) {
    this.label = 'Zerbitzaria: ' + baseUrl;
    try { this.outbox = JSON.parse(safeGet(OUTBOX_KEY) || '[]'); } catch { this.outbox = []; }
    window.addEventListener('online', () => this.flush());
    setInterval(() => { if (this.outbox.length) this.flush(); }, 15000);
  }

  private url(p: string) { return this.baseUrl.replace(/\/$/, '') + '/' + p.replace(/^\//, ''); }

  private async req(method: string, path: string, body?: unknown) {
    const res = await fetch(this.url(path), {
      method,
      headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: 'Bearer ' + this.token } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 401) throw Object.assign(new Error('login'), { code: 401 });
    if (!res.ok) throw Object.assign(new Error((await res.text()) || res.statusText), { code: res.status });
    return res.status === 204 ? null : res.json();
  }

  private setStatus(s: StoreStatus) { this.lastState = s; this.statusCb(s); }

  onStatus(cb: (s: StoreStatus) => void) { this.statusCb = cb; cb(this.lastState); }

  async load(): Promise<AppData> {
    const cached = safeGet(CACHE_KEY);
    try {
      await this.flush();
      const d = await this.req('GET', 'bootstrap');
      this.data = normalizeData(d, DEFAULT_SETTINGS);
      this.saveCache();
      if (!this.outbox.length) this.setStatus({ state: 'saved', pending: 0 });
    } catch (e: any) {
      if (cached) this.data = normalizeData(JSON.parse(cached), DEFAULT_SETTINGS);
      else this.data = normalizeData({}, DEFAULT_SETTINGS);
      this.setStatus(e?.code === 401
        ? { state: 'login', pending: this.outbox.length, message: 'Zerbitzariaren pasahitza behar da' }
        : { state: 'offline', pending: this.outbox.length, message: 'Zerbitzariarekin konexiorik ez' });
    }
    return clone(this.data);
  }

  subscribe(cb: (d: AppData) => void) {
    const tick = async () => {
      if (document.hidden || this.outbox.length || this.flushing) return;
      try {
        const d = normalizeData(await this.req('GET', 'bootstrap'), DEFAULT_SETTINGS);
        if (JSON.stringify(d) !== JSON.stringify(this.data)) { this.data = d; this.saveCache(); cb(clone(d)); }
        if (this.lastState.state !== 'saved') this.setStatus({ state: 'saved', pending: 0 });
      } catch { /* sin conexión: se reintenta en el siguiente ciclo */ }
    };
    const t = setInterval(tick, 20000);
    const vis = () => { if (!document.hidden) tick(); };
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); };
  }

  private saveCache() { safeSet(CACHE_KEY, JSON.stringify(this.data)); }

  private enqueue(op: Op) {
    // si ya hay un cambio pendiente del mismo objeto, se sustituye EN SU SITIO (menos tráfico y sin alterar el orden:
    // p. ej. un producto nuevo debe llegar antes que las líneas de inventario que lo usan)
    const i = this.outbox.findIndex((o, k) => o.key === op.key && k > 0); // el 0 puede estar enviándose
    if (i >= 0) this.outbox[i] = op; else this.outbox.push(op);
    safeSet(OUTBOX_KEY, JSON.stringify(this.outbox));
    this.saveCache();
    this.flush();
  }

  async flush() {
    if (this.flushing) return;
    this.flushing = true;
    try {
      while (this.outbox.length) {
        this.setStatus({ state: 'saving', pending: this.outbox.length });
        const op = this.outbox[0];
        try {
          await this.req(op.method, op.path, op.body);
        } catch (e: any) {
          if (e?.code === 401) { this.setStatus({ state: 'login', pending: this.outbox.length, message: 'Zerbitzariaren pasahitza behar da' }); return; }
          if (e?.code && e.code >= 400 && e.code < 500) {
            // el servidor rechaza este cambio: se descarta para no bloquear la cola
            console.warn('Cambio rechazado por el servidor', op, e.message);
          } else {
            this.setStatus({ state: 'offline', pending: this.outbox.length, message: 'Konexiorik gabe — sinkronizatzeko zain' });
            return;
          }
        }
        this.outbox.shift();
        safeSet(OUTBOX_KEY, JSON.stringify(this.outbox));
      }
      this.setStatus({ state: 'saved', pending: 0 });
    } finally {
      this.flushing = false;
    }
  }

  async upsert(col: CollectionName, item: { id: string }) {
    (this.data as any)[col] = upsertArr((this.data as any)[col], clone(item));
    this.enqueue({ key: `${col}:${item.id}`, method: 'PUT', path: `${API_PATHS[col]}/${encodeURIComponent(item.id)}`, body: item });
  }
  async remove(col: CollectionName, id: string) {
    (this.data as any)[col] = (this.data as any)[col].filter((x: any) => x.id !== id);
    this.enqueue({ key: `${col}:${id}`, method: 'DELETE', path: `${API_PATHS[col]}/${encodeURIComponent(id)}` });
  }
  async setLine(sessionId: string, productId: string, line: InventoryLine) {
    const s = this.data.sessions.find(x => x.id === sessionId);
    if (s) s.lines[productId] = { ...line };
    // si la sesión entera aún no ha llegado al servidor, basta con reenviarla completa
    const pendingSession = this.outbox.find(o => o.key === `sessions:${sessionId}`);
    if (pendingSession && s) { pendingSession.body = clone(s); safeSet(OUTBOX_KEY, JSON.stringify(this.outbox)); this.saveCache(); return; }
    this.enqueue({
      key: `line:${sessionId}:${productId}`, method: 'PUT',
      path: `inventory-sessions/${encodeURIComponent(sessionId)}/lines/${encodeURIComponent(productId)}`, body: line,
    });
  }
  async saveSettings(s: Settings) {
    this.data.settings = clone(s);
    this.enqueue({ key: 'settings', method: 'PUT', path: 'settings', body: s });
  }
  async replaceAll(d: AppData) {
    this.data = clone(d);
    this.outbox = [];
    this.enqueue({ key: 'import', method: 'POST', path: 'import', body: d });
  }

  async extractInvoice(images: Blob[]): Promise<ExtractedInvoice> {
    const form = new FormData();
    images.forEach((b, i) => form.append('images', b, `factura-${i}.png`));
    const res = await fetch(this.url('invoices/extract'), {
      method: 'POST', body: form, headers: this.token ? { Authorization: 'Bearer ' + this.token } : {},
    });
    if (!res.ok) throw new Error(res.status === 501
      ? 'Zerbitzariak ez du irakurketa automatikoa konfiguratuta (ANTHROPIC_API_KEY falta da). Sartu datuak eskuz.'
      : await res.text());
    return res.json();
  }

  async download(filename: string, content: string, mime: string) { return browserDownload(filename, content, mime); }
}

export async function apiLogin(baseUrl: string, password: string): Promise<{ token: string; role: string }> {
  const res = await fetch(baseUrl.replace(/\/$/, '') + '/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }),
  });
  if (!res.ok) throw new Error(res.status === 401 ? 'Pasahitz okerra' : 'Ezin izan da zerbitzariarekin konektatu');
  return res.json();
}

export async function apiHealth(baseUrl: string): Promise<{ ok: boolean; auth: boolean; ai: boolean } | null> {
  try {
    const res = await fetch(baseUrl.replace(/\/$/, '') + '/health');
    return res.ok ? res.json() : null;
  } catch { return null; }
}
