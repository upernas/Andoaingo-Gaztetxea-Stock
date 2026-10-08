import { seedData } from '../../../shared/seed';
import { ApiStore } from './apiStore';
import { ArtifactStore } from './artifactStore';
import { LocalStore } from './localStore';
import { DataStore, safeGet, safeSet } from './store';

declare const __TARGET__: 'artifact' | 'web';
export const TARGET = __TARGET__;

export interface ConnectionConfig {
  mode: 'local' | 'api';
  url: string;
  token: string | null;
}

const CONN_KEY = 'gz-connection-v1';

/** URL del backend compilada en el build (Docker: "/api"). Vacío = sin servidor. */
const DEFAULT_API = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

export function getConnection(): ConnectionConfig {
  try {
    const raw = safeGet(CONN_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* nada */ }
  return DEFAULT_API ? { mode: 'api', url: DEFAULT_API, token: null } : { mode: 'local', url: '', token: null };
}

export function setConnection(c: ConnectionConfig) { safeSet(CONN_KEY, JSON.stringify(c)); }

/** Elige dónde viven los datos. La UI no cambia según el modo. */
export async function pickStore(): Promise<{ store: DataStore; notice?: string }> {
  if (TARGET === 'artifact' || window.claude) {
    const a = await ArtifactStore.create();
    if (a) return { store: a };
    // sin base de datos compartida (sesión cerrada, vista previa…) → datos solo en este navegador
    return {
      store: new LocalStore(() => null),
      notice: 'Ezin da datu partekatuetara sartu: hasi saioa Claude-n gaztetxeko inbentarioa ikusi eta gordetzeko.',
    };
  }
  const c = getConnection();
  if (c.mode === 'api' && c.url) return { store: new ApiStore(c.url, c.token) };
  return { store: new LocalStore(seedData) };
}
