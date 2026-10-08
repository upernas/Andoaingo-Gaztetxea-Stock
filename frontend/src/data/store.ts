// Capa de datos: la interfaz de UI nunca sabe dónde se guardan los datos.
// Implementaciones:
//   LocalStore    → este navegador (modo demo / sin servidor)
//   ApiStore      → backend propio (Node + PostgreSQL), con cola offline
//   ArtifactStore → base de datos compartida del artifact de Claude
import type { AppData, CollectionName, InventoryLine, Settings } from '../../../shared/types';

export type SyncState = 'saved' | 'saving' | 'offline' | 'error' | 'login';

export interface StoreStatus {
  state: SyncState;
  pending: number;
  message?: string;
}

export interface ExtractedInvoiceLine {
  code: string;
  description: string;
  boxes: number | null;
  units: number | null;
  vatRate: number | null;
  unitPrice: number | null;
  discount: number | null;
  total: number | null;
  isContainer: boolean;
}

export interface ExtractedInvoice {
  supplier: string;
  date: string; // YYYY-MM-DD
  reference: string;
  lines: ExtractedInvoiceLine[];
  notes: string;
  totals: Record<string, number | null>;
}

export interface DataStore {
  readonly mode: 'local' | 'api' | 'artifact';
  readonly label: string;
  load(): Promise<AppData>;
  /** cambios hechos desde otros dispositivos */
  subscribe?(cb: (d: AppData) => void): () => void;
  onStatus(cb: (s: StoreStatus) => void): void;
  upsert(col: CollectionName, item: { id: string }): Promise<void>;
  remove(col: CollectionName, id: string): Promise<void>;
  setLine(sessionId: string, productId: string, line: InventoryLine): Promise<void>;
  saveSettings(s: Settings): Promise<void>;
  replaceAll(d: AppData): Promise<void>;
  /** OCR/IA de facturas, si este modo lo soporta */
  extractInvoice?(images: Blob[]): Promise<ExtractedInvoice>;
  /** descarga de ficheros (el artifact necesita su propio mecanismo) */
  download?(filename: string, content: string, mime: string): Promise<boolean>;
}

export { INVOICE_PROMPT } from '../../../shared/invoicePrompt';

export function upsertArr<T extends { id: string }>(arr: T[], item: T): T[] {
  const i = arr.findIndex(x => x.id === item.id);
  if (i < 0) return [...arr, item];
  const copy = arr.slice();
  copy[i] = item;
  return copy;
}

export const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

export function safeGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
export function safeSet(key: string, v: string) {
  try { localStorage.setItem(key, v); return true; } catch { return false; }
}
export function safeDel(key: string) {
  try { localStorage.removeItem(key); } catch { /* sin almacenamiento */ }
}

export function browserDownload(filename: string, content: string, mime: string): boolean {
  try {
    const blob = new Blob([content], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    return true;
  } catch { return false; }
}
