import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { AppData, CollectionName, InventoryLine, Settings } from '../../shared/types';
import { pickStore } from './data';
import { DataStore, StoreStatus, upsertArr } from './data/store';

export type Route =
  | { name: 'home' }
  | { name: 'inventory' }
  | { name: 'count'; sessionId: string; index?: number }
  | { name: 'invDone'; sessionId: string }
  | { name: 'receiptCheck'; sessionId: string }
  | { name: 'order' }
  | { name: 'orderMessage'; orderId: string }
  | { name: 'targets' }
  | { name: 'stats' }
  | { name: 'settings' }
  | { name: 'products' }
  | { name: 'productEdit'; productId: string | null }
  | { name: 'messageSettings' }
  | { name: 'returns' }
  | { name: 'purchases' }
  | { name: 'invoices' }
  | { name: 'dataSettings' };

export type Tab = 'home' | 'inventory' | 'order' | 'stats' | 'settings';

export const TAB_OF: Record<Route['name'], Tab> = {
  home: 'home', inventory: 'inventory', count: 'inventory', invDone: 'inventory', receiptCheck: 'order',
  order: 'order', orderMessage: 'order', targets: 'order',
  stats: 'stats',
  settings: 'settings', products: 'settings', productEdit: 'settings', messageSettings: 'settings', returns: 'settings', purchases: 'settings', invoices: 'settings',
  dataSettings: 'settings',
};

interface Ctx {
  data: AppData;
  store: DataStore;
  status: StoreStatus;
  notice?: string;
  route: Route;
  go(r: Route, replace?: boolean): void;
  back(): void;
  upsert<T extends { id: string }>(col: CollectionName, item: T): void;
  remove(col: CollectionName, id: string): void;
  setLine(sessionId: string, productId: string, line: InventoryLine): void;
  saveSettings(s: Settings): void;
  replaceAll(d: AppData): Promise<void>;
  toast(msg: string): void;
  toastMsg: string | null;
}

const AppCtx = createContext<Ctx | null>(null);

export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error('testuingururik ez');
  return c;
}

export function AppProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const [store, setStore] = useState<DataStore | null>(null);
  const [data, setData] = useState<AppData | null>(null);
  const [status, setStatus] = useState<StoreStatus>({ state: 'saved', pending: 0 });
  const [notice, setNotice] = useState<string>();
  const [stack, setStack] = useState<Route[]>([{ name: 'home' }]);
  const [toastMsg, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    let unsub: (() => void) | undefined;
    (async () => {
      const { store: s, notice: n } = await pickStore();
      s.onStatus(setStatus);
      const d = await s.load();
      setData(d);
      unsub = s.subscribe?.(setData);
      setNotice(n);
      setStore(s);
    })();
    return () => unsub?.();
  }, []);

  const route = stack[stack.length - 1];

  const go = useCallback((r: Route, replace = false) => {
    setStack(st => {
      // pulsar una pestaña reinicia la pila
      if (['home', 'inventory', 'order', 'stats', 'settings'].includes(r.name) && !replace) return [r];
      return replace ? [...st.slice(0, -1), r] : [...st, r];
    });
    window.scrollTo(0, 0);
  }, []);

  const back = useCallback(() => {
    setStack(st => (st.length > 1 ? st.slice(0, -1) : [{ name: TAB_OF[st[0].name] } as Route]));
    window.scrollTo(0, 0);
  }, []);

  const toast = useCallback((m: string) => {
    setToast(m);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const api = useMemo<Ctx | null>(() => {
    if (!store || !data) return null;
    return {
      data, store, status, notice, route, go, back, toast, toastMsg,
      upsert(col, item) {
        setData(d => d && ({ ...d, [col]: upsertArr((d as any)[col], item) }));
        store.upsert(col, item);
      },
      remove(col, id) {
        setData(d => d && ({ ...d, [col]: (d as any)[col].filter((x: any) => x.id !== id) }));
        store.remove(col, id);
      },
      setLine(sessionId, productId, line) {
        setData(d => d && ({
          ...d,
          sessions: d.sessions.map(s => s.id === sessionId ? { ...s, lines: { ...s.lines, [productId]: line } } : s),
        }));
        store.setLine(sessionId, productId, line);
      },
      saveSettings(s) {
        setData(d => d && ({ ...d, settings: s }));
        store.saveSettings(s);
      },
      async replaceAll(d) {
        setData(d);
        await store.replaceAll(d);
      },
    };
  }, [store, data, status, notice, route, go, back, toast, toastMsg]);

  if (!api) return <>{fallback}</>;
  return <AppCtx.Provider value={api}>{children}</AppCtx.Provider>;
}
