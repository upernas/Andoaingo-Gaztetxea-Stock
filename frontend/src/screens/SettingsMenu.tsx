import { useState } from 'react';
import type { Settings as S } from '../../../shared/types';
import { buildMessage, sortedProducts } from '../../../shared/domain';
import { useApp } from '../state';
import { NumField, Tbc, TextField, TopBar } from '../ui/kit';
import { IconNext } from '../ui/icons';

export function SettingsMenu() {
  const { data, go, store } = useApp();
  const tbc = data.products.filter(p => p.active && p.unconfirmed.length).length;
  const items: [string, string, () => void][] = [
    ['Produktuak', `${sortedProducts(data.products).length} aktibo${tbc ? ` · ${tbc} berretsi gabe` : ''} · inbentarioaren ordena`, () => go({ name: 'products' })],
    ['Stock helburuak', 'Helburua eta gutxienekoa', () => go({ name: 'targets' })],
    ['Sarrerak', 'Jasotako edo itzulitako generoa erregistratu', () => go({ name: 'purchases' })],
    ['Ontzi hutsen itzulketa', 'Itzulitako botilatxoak', () => go({ name: 'returns' })],
    ['Fakturak', 'Argazkia edo PDFa igo eta datuak irakurri', () => go({ name: 'invoices' })],
    ['Mezua eta kalkuluak', 'Agurra, agur-esaldia, segurtasun-marjina', () => go({ name: 'messageSettings' })],
    ['Datuak eta konexioa', `Esportatu, babeskopia · ${store.label}`, () => go({ name: 'dataSettings' })],
  ];
  return (
    <>
      <TopBar title="Ezarpenak" />
      <div className="page">
        <div className="list">
          {items.map(([t, s, fn]) => (
            <button key={t} className="item" onClick={fn}>
              <div className="main"><div className="t">{t}</div><div className="s">{s}</div></div>
              <span className="chev"><IconNext /></span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

export function MessageSettings() {
  const { data, saveSettings, toast, back } = useApp();
  const [s, setS] = useState<S>(data.settings);
  const set = (patch: Partial<S>) => setS(cur => ({ ...cur, ...patch, unconfirmed: cur.unconfirmed.filter(f => !Object.keys(patch).includes(f)) }));
  const sample = buildMessage({ ...data, settings: s }, sortedProducts(data.products).slice(0, 2).map(p => ({
    productId: p.id, supplierId: null, quantity: 2, purchaseUnit: p.purchaseUnit, unitsPerPurchaseUnit: 1, unitPrice: null, recommended: 2, manual: false, note: '',
  })), new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10));
  return (
    <>
      <TopBar title="Mezua eta kalkuluak" back />
      <div className="page">
        <div className="label">WhatsApp mezua</div>
        <TextField id="s-name" label="Gaztetxearen izena" value={s.gaztetxeName} onChange={v => set({ gaztetxeName: v })} />
        <TextField id="s-greet" label="Agurra" value={s.greeting} onChange={v => set({ greeting: v })} />
        <TextField id="s-intro" label="Sarrera-esaldia ({data} = eskaeraren data)" value={s.intro} onChange={v => set({ intro: v })} />
        <TextField id="s-bye" label="Agur-esaldia" value={s.farewell} onChange={v => set({ farewell: v })} />
        <label className="check"><input type="checkbox" checked={s.showTotalInMessage} onChange={e => set({ showTotalInMessage: e.target.checked })} /> Guztizko estimatua sartu</label>
        <div className="card"><div className="small muted" style={{ marginBottom: 6 }}>Aurrebista</div><div className="msgbox small">{sample}</div></div>

        <div className="label">Kalkuluak</div>
        <NumField id="s-safety" label="Segurtasun-marjina" suffix="%" value={s.safetyPct} onChange={v => set({ safetyPct: v ?? 0 })}
          hint="Iragarpena = ekitaldi motako batez besteko kontsumoa × (1 + marjina)." />
        <NumField id="s-minev" label="Helburua iradokitzeko behar diren ekitaldiak" value={s.minEventsForSuggestion} onChange={v => set({ minEventsForSuggestion: Math.max(1, v ?? 1) })} />
        <label className="check"><input type="checkbox" checked={s.pricesIncludeVat} onChange={e => set({ pricesIncludeVat: e.target.checked })} /> Erosketa-prezioek BEZa barne dute <Tbc show={s.unconfirmed.includes('pricesIncludeVat')} /></label>
        <div className="field">
          <label htmlFor="s-ev">Ekitaldi motak <span>(komaz bereizita)</span></label>
          <input id="s-ev" className="input" value={s.eventTypes.join(', ')} onChange={e => set({ eventTypes: e.target.value.split(',').map(x => x.trim()).filter(Boolean) })} />
        </div>
        <div className="form-actions"><button className="btn lg primary" onClick={() => { saveSettings(s); toast('Gordeta'); back(); }}>Gorde</button></div>
      </div>
    </>
  );
}
