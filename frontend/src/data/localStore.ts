import type { AppData, CollectionName, InventoryLine, Settings } from '../../../shared/types';
import { normalizeData } from '../../../shared/domain';
import { DEFAULT_SETTINGS } from '../../../shared/seed';
import { browserDownload, clone, DataStore, safeGet, safeSet, StoreStatus, upsertArr } from './store';

const KEY = 'gz-stock-data-v2';

/** Guarda todo en este navegador. Útil para probar sin servidor. */
export class LocalStore implements DataStore {
  readonly mode = 'local' as const;
  readonly label = 'Gailu honetan bakarrik';
  private data!: AppData;
  private statusCb: (s: StoreStatus) => void = () => {};
  private persistent = true;

  constructor(private seed: () => AppData | null) {}

  async load(): Promise<AppData> {
    const raw = safeGet(KEY);
    if (raw) {
      try { this.data = normalizeData(JSON.parse(raw), DEFAULT_SETTINGS); } catch { /* corrupto → semilla */ }
    }
    if (!this.data) {
      this.data = normalizeData(this.seed() ?? {}, DEFAULT_SETTINGS);
      this.persist();
    }
    return clone(this.data);
  }

  onStatus(cb: (s: StoreStatus) => void) {
    this.statusCb = cb;
    cb(this.persistent ? { state: 'saved', pending: 0 } : { state: 'error', pending: 0, message: 'Nabigatzaileak ez du daturik gordetzen uzten' });
  }

  private persist() {
    this.persistent = safeSet(KEY, JSON.stringify(this.data));
    this.statusCb(this.persistent ? { state: 'saved', pending: 0 } : { state: 'error', pending: 0, message: 'Ezin izan da nabigatzaile honetan gorde' });
  }

  async upsert(col: CollectionName, item: { id: string }) {
    (this.data as any)[col] = upsertArr((this.data as any)[col], clone(item));
    this.persist();
  }
  async remove(col: CollectionName, id: string) {
    (this.data as any)[col] = (this.data as any)[col].filter((x: any) => x.id !== id);
    this.persist();
  }
  async setLine(sessionId: string, productId: string, line: InventoryLine) {
    const s = this.data.sessions.find(x => x.id === sessionId);
    if (s) { s.lines[productId] = { ...line }; this.persist(); }
  }
  async saveSettings(s: Settings) { this.data.settings = clone(s); this.persist(); }
  async replaceAll(d: AppData) { this.data = clone(d); this.persist(); }
  async download(filename: string, content: string, mime: string) { return browserDownload(filename, content, mime); }
}
