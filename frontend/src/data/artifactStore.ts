import type { AppData, CollectionName, InventoryLine, Settings } from '../../../shared/types';
import { COLLECTIONS } from '../../../shared/types';
import { normalizeData } from '../../../shared/domain';
import { DEFAULT_SETTINGS } from '../../../shared/seed';
import { clone, DataStore, ExtractedInvoice, INVOICE_PROMPT, StoreStatus } from './store';

declare global {
  interface Window { claude?: { use(name: string): Promise<any> } }
}

const SETTINGS_DOC = 'config/settings';
const plain = (x: unknown) => JSON.parse(JSON.stringify(x));

/**
 * Base de datos compartida del artifact de Claude: todos los móviles que abren el enlace
 * ven los mismos datos en directo. Cada colección es una colección del store;
 * los conteos se escriben línea a línea (merge) para que dos personas puedan contar a la vez.
 */
export class ArtifactStore implements DataStore {
  readonly mode = 'artifact' as const;
  readonly label = 'Artifactaren datu partekatuak';
  private cols: Record<string, any[]> = {};
  private settings: Settings = DEFAULT_SETTINGS;
  private listeners = new Set<(d: AppData) => void>();
  private statusCb: (s: StoreStatus) => void = () => {};
  private chains = new Map<string, Promise<unknown>>();
  private pending = 0;
  private failed = false;
  private lineBuf = new Map<string, { lines: Record<string, InventoryLine>; n: number }>();
  private lineTimers = new Map<string, ReturnType<typeof setTimeout>>();

  private constructor(private db: any, private sample: any, private downloads: any) {}

  static async create(): Promise<ArtifactStore | null> {
    if (!window.claude) return null;
    const db = await window.claude.use('db').catch(() => null);
    if (!db) return null;
    const [sample, downloads] = await Promise.all([
      window.claude.use('sample').catch(() => null),
      window.claude.use('downloads').catch(() => null),
    ]);
    return new ArtifactStore(db, sample, downloads);
  }

  private snapshot(): AppData {
    // los conteos aún en el búfer (350 ms) se superponen para que la pantalla no "salte"
    const sessions = (this.cols.sessions ?? []).map((s: any) => {
      const b = this.lineBuf.get(s.id);
      return b ? { ...s, lines: { ...s.lines, ...b.lines } } : s;
    });
    const cols: Record<string, any[]> = { ...this.cols, sessions };
    for (const { col, item } of this.pendingDocs.values()) {
      const arr = cols[col] ?? [];
      const i = arr.findIndex((x: any) => x.id === item.id);
      cols[col] = i < 0 ? [...arr, item] : arr.map((x: any, k: number) => (k === i ? item : x));
    }
    return normalizeData({ ...(cols as any), settings: this.settings }, DEFAULT_SETTINGS);
  }

  load(): Promise<AppData> {
    return new Promise(resolve => {
      const waiting = new Set<string>([...COLLECTIONS, SETTINGS_DOC]);
      let done = false;
      const ready = (k: string) => {
        waiting.delete(k);
        if (!done && waiting.size === 0) { done = true; resolve(this.snapshot()); }
        else if (done) this.emit();
      };
      for (const c of COLLECTIONS) {
        this.cols[c] = [];
        this.db.collection(c).onSnapshot(
          (snap: any) => { this.cols[c] = snap.docs.map((d: any) => clone(d.data())); ready(c); },
          (e: any) => { this.report(e); ready(c); },
        );
      }
      this.db.doc(SETTINGS_DOC).onSnapshot(
        (snap: any) => { if (snap.exists) this.settings = { ...DEFAULT_SETTINGS, ...clone(snap.data()) }; ready(SETTINGS_DOC); },
        (e: any) => { this.report(e); ready(SETTINGS_DOC); },
      );
      setTimeout(() => { if (!done) { done = true; resolve(this.snapshot()); } }, 10000);
    });
  }

  private emit() {
    const d = this.snapshot();
    this.listeners.forEach(cb => cb(d));
  }

  subscribe(cb: (d: AppData) => void) {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  }

  onStatus(cb: (s: StoreStatus) => void) { this.statusCb = cb; this.push(); }

  private push(msg?: string) {
    this.statusCb(this.failed
      ? { state: 'error', pending: this.pending, message: msg ?? 'Aldaketaren bat ezin izan da gorde' }
      : { state: this.pending ? 'saving' : 'saved', pending: this.pending });
  }

  private report(e: any) {
    console.warn('db', e);
    const code = e?.code;
    const msg = code === 'invalid_argument' ? 'Ez duzu datu hauek aldatzeko baimenik (eskatu laguntzaile sarbidea)'
      : code === 'quota_exceeded' ? 'Datu-basea beteta dago: esportatu kopia eta ezabatu datu zaharrak'
      : code === 'revoked' || code === 'not_granted' ? 'Datuetarako sarbidea kendu da' : 'Konexiorik gabe — sinkronizatzeko zain';
    this.failed = true;
    this.push(msg);
  }

  /** una escritura cada vez por documento, en orden */
  private queue(path: string, fn: () => Promise<unknown>) {
    this.pending++; this.push();
    const run = async () => {
      try { await fn(); }
      catch (e: any) {
        if (e?.code === 'unavailable') {
          await new Promise(r => setTimeout(r, 800 + Math.random() * 800));
          try { await fn(); } catch (e2) { this.report(e2); }
        } else this.report(e);
      } finally {
        this.pending--;
        this.push();
      }
    };
    const next = (this.chains.get(path) ?? Promise.resolve()).then(run);
    this.chains.set(path, next);
    return next as Promise<void>;
  }

  private pendingDocs = new Map<string, { col: CollectionName; item: any }>();
  private docTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /** ráfagas de cambios sobre el mismo documento → una sola escritura por pausa */
  upsert(col: CollectionName, item: { id: string }) {
    this.failed = false;
    const path = `${col}/${item.id}`;
    if (!this.pendingDocs.has(path)) { this.pending++; this.push(); }
    this.pendingDocs.set(path, { col, item: plain(item) });
    clearTimeout(this.docTimers.get(path));
    return new Promise<void>(resolve => {
      this.docTimers.set(path, setTimeout(() => {
        const d = this.pendingDocs.get(path);
        this.pendingDocs.delete(path);
        this.pending--;
        if (d) this.queue(path, () => this.db.doc(path).set(d.item)).then(resolve); else resolve();
      }, 250));
    });
  }

  async remove(col: CollectionName, id: string) {
    const path = `${col}/${id}`;
    if (this.pendingDocs.delete(path)) { clearTimeout(this.docTimers.get(path)); this.pending--; }
    await this.queue(path, () => this.db.doc(path).delete());
  }

  async setLine(sessionId: string, productId: string, line: InventoryLine) {
    this.failed = false;
    const buf = this.lineBuf.get(sessionId) ?? { lines: {}, n: 0 };
    buf.lines[productId] = { ...line };
    buf.n++;
    this.lineBuf.set(sessionId, buf);
    this.pending++; this.push();
    clearTimeout(this.lineTimers.get(sessionId));
    this.lineTimers.set(sessionId, setTimeout(() => {
      const b = this.lineBuf.get(sessionId);
      if (!b) return;
      this.lineBuf.delete(sessionId);
      this.pending -= b.n;
      const path = `sessions/${sessionId}`;
      // merge anidado: solo se envían las líneas cambiadas → dos personas pueden contar a la vez
      this.queue(path, () => this.db.doc(path).update({ lines: plain(b.lines) }));
    }, 350));
  }

  async saveSettings(s: Settings) {
    this.failed = false;
    await this.queue(SETTINGS_DOC, () => this.db.doc(SETTINGS_DOC).set(plain(s)));
  }

  async replaceAll(d: AppData) {
    const jobs: Promise<void>[] = [];
    for (const c of COLLECTIONS) {
      const incoming = new Set((d as any)[c].map((x: any) => x.id));
      for (const old of this.cols[c] ?? []) if (!incoming.has(old.id)) jobs.push(this.remove(c, old.id));
      for (const item of (d as any)[c]) jobs.push(this.upsert(c, item));
    }
    jobs.push(this.saveSettings(d.settings));
    await Promise.all(jobs);
  }

  async extractInvoice(images: Blob[]): Promise<ExtractedInvoice> {
    if (!this.sample) throw new Error('Irakurketa automatikoa ez dago erabilgarri hemen. Sartu datuak eskuz.');
    const limits = await this.sample.limits().catch(() => null);
    if (!limits?.images) throw new Error('Ikuspegi honek ez du irudirik bidaltzen uzten. Sartu datuak eskuz.');
    try {
      return await this.sample.json(INVOICE_PROMPT, { images: images.slice(0, limits.images.maxCount), modelTier: 'default' });
    } catch (e: any) {
      const map: Record<string, string> = {
        not_granted: 'Ez da baimendu orri honetan Claude erabiltzea.',
        rate_limited: 'Eskaera gehiegi. Saiatu berriro geroago.',
        invalid_json: 'Ezin izan da erantzuna ulertu. Saiatu argazki garbiago batekin.',
        image_rejected: 'Irudia ez da baliozkoa (JPG, PNG edo WebP).',
      };
      throw new Error(map[e?.code] ?? 'Ezin izan da faktura irakurri. Saiatu berriro edo sartu eskuz.');
    }
  }

  async download(filename: string, content: string, _mime: string) {
    if (!this.downloads) return false;
    try { await this.downloads.save({ filename, data: content }); return true; } catch { return false; }
  }
}
