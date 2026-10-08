import { useState } from 'react';
import type { AppData, Product } from '../../../shared/types';
import { euro, num, round2, sortedProducts, uid } from '../../../shared/domain';
import type { ExtractedInvoice, ExtractedInvoiceLine } from '../data/store';
import { useApp } from '../state';
import { TopBar } from '../ui/kit';
import { IconCamera } from '../ui/icons';

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ');

/** produktua bilatu: lehenik albaraneko kodearen bidez, gero izenaren bidez */
export function matchProduct(data: AppData, l: ExtractedInvoiceLine): Product | undefined {
  const code = (l.code || '').replace(/^0+/, '');
  if (code) {
    const byCode = data.products.find(p => p.supplierCode && p.supplierCode.replace(/^0+/, '') === code);
    if (byCode) return byCode;
  }
  const desc = norm(l.description);
  let best: Product | undefined, bestScore = 0;
  for (const p of data.products) {
    const words = norm(p.name).split(' ').filter(w => w.length > 2);
    if (!words.length) continue;
    const hits = words.filter(w => desc.includes(w)).length;
    const score = hits / words.length;
    if (score > bestScore && hits > 0) { best = p; bestScore = score; }
  }
  return bestScore >= 0.5 ? best : undefined;
}

async function pdfToImages(file: File): Promise<Blob[]> {
  const w = window as any;
  if (!w.pdfjsLib) {
    await new Promise<void>((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      s.onload = () => res(); s.onerror = () => rej(new Error('Ezin izan da PDF irakurlea kargatu (konexiorik ez?)'));
      document.head.appendChild(s);
    });
    w.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  const pdf = await w.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const out: Blob[] = [];
  for (let i = 1; i <= Math.min(pdf.numPages, 3); i++) {
    const page = await pdf.getPage(i);
    const vp = page.getViewport({ scale: 2 });
    const c = document.createElement('canvas');
    c.width = vp.width; c.height = vp.height;
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    out.push(await new Promise<Blob>(r => c.toBlob(b => r(b!), 'image/png')));
  }
  return out;
}

interface Row { line: ExtractedInvoiceLine; productId: string; stock: boolean; updatePrice: boolean; updateBox: boolean; asReturn: boolean }

export function Invoices() {
  const { data, store, upsert, toast, go } = useApp();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inv, setInv] = useState<ExtractedInvoice | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const canAI = !!store.extractInvoice;
  const returnable = data.products.find(p => p.returnable);

  async function onFile(f: File) {
    setError(null); setInv(null);
    try {
      setBusy('Prestatzen…');
      const images = f.type === 'application/pdf' ? await pdfToImages(f) : [f];
      setPreview(URL.createObjectURL(images[0]));
      setBusy('Faktura irakurtzen… (minutu bat arte)');
      const res = await store.extractInvoice!(images);
      const lines = Array.isArray(res?.lines) ? res.lines : [];
      setInv({ ...res, lines });
      setRows(lines.map(l => {
        const p = l.isContainer ? undefined : matchProduct(data, l);
        return { line: l, productId: p?.id ?? '', stock: !!p && !l.isContainer, updatePrice: false, updateBox: false, asReturn: !!l.isContainer && (l.units ?? 0) < 0 && !!returnable };
      }));
    } catch (e: any) {
      setError(e?.message ?? 'Ezin izan da faktura irakurri');
    } finally { setBusy(null); }
  }

  function save() {
    if (!inv) return;
    const date = inv.date && /^\d{4}-\d{2}-\d{2}$/.test(inv.date) ? new Date(inv.date + 'T12:00:00').toISOString() : new Date().toISOString();
    let nStock = 0, nPrice = 0, nRet = 0;
    for (const r of rows) {
      const p = data.products.find(x => x.id === r.productId);
      const units = r.line.units, total = r.line.total;
      if (r.asReturn && returnable && units) {
        const qty = Math.abs(units) * (returnable.unitsPerBox ?? 1);
        const refund = Math.abs(total ?? 0);
        upsert('returns', { id: uid(), date, productId: returnable.id, quantity: qty, refundPerUnit: round2((refund / qty) * 10000) / 10000, totalRefund: refund, notes: inv.reference });
        nRet++; continue;
      }
      if (!p) continue;
      const unitPrice = units && total != null ? Math.round((total / units) * 10000) / 10000 : null;
      if (r.stock && units) {
        upsert('purchases', { id: uid(), date, supplierId: null, productId: p.id, quantity: units, unitPrice, total, orderId: null, invoiceRef: inv.reference || '', notes: r.line.description });
        nStock++;
      }
      const patch: Partial<Product> = {};
      if (r.updatePrice && unitPrice != null && unitPrice > 0) { patch.purchasePrice = unitPrice; nPrice++; }
      if (r.updateBox && r.line.boxes && units) patch.unitsPerBox = Math.abs(Math.round(units / r.line.boxes));
      if (Object.keys(patch).length) upsert('products', { ...p, ...patch, unconfirmed: p.unconfirmed.filter(f => !(f in patch)) });
    }
    toast(`${nStock} sarrera, ${nPrice} prezio, ${nRet} itzulketa`);
    setInv(null); setRows([]); setPreview(null);
    go({ name: 'purchases' });
  }
  const setRow = (i: number, patch: Partial<Row>) => setRows(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  return (
    <>
      <TopBar title="Fakturak" back />
      <div className="page">
        {!inv && (
          <>
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <h2>Faktura edo albarana igo</h2>
              <p className="small muted" style={{ margin: 0 }}>{canAI
                ? 'Atera argazkia edo igo PDFa. IAk lerroak proposatzen ditu eta zuk dena berrikusten duzu gorde aurretik: ezer ez da aldatzen zure baimenik gabe.'
                : 'Irakurketa automatikoak IA konfiguratuta duen zerbitzaria behar du. Lerroak eskuz erregistra ditzakezu Sarrerak atalean.'}</p>
              <label className={'btn lg ' + (canAI ? 'primary' : '')} style={{ opacity: canAI && !busy ? 1 : 0.5 }}>
                <IconCamera /> Argazkia edo PDFa
                <input type="file" accept="image/*,application/pdf" hidden disabled={!canAI || !!busy} onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
              </label>
              <button className="btn" onClick={() => go({ name: 'purchases' })}>Eskuz sartu</button>
            </div>
            {busy && <div className="notice info">{busy}</div>}
            {error && <div className="notice bad">{error}</div>}
          </>
        )}
        {inv && (
          <>
            <div className="notice info small">Berrikusi lerro bakoitza eta markatu zer gorde. Ondo irakurri ez diren datuak hutsik agertzen dira.</div>
            {preview && <img src={preview} alt="Igotako faktura" style={{ borderRadius: 6, border: '1px solid var(--line)' }} />}
            <div className="card grid2">
              <div className="field"><label htmlFor="iv-ref">Erreferentzia</label><input id="iv-ref" className="input" value={inv.reference ?? ''} onChange={e => setInv({ ...inv, reference: e.target.value })} /></div>
              <div className="field"><label htmlFor="iv-date">Data</label><input id="iv-date" type="date" className="input" value={inv.date ?? ''} onChange={e => setInv({ ...inv, date: e.target.value })} /></div>
            </div>
            {rows.map((r, i) => {
              const p = data.products.find(x => x.id === r.productId);
              const unitPrice = r.line.units && r.line.total != null ? r.line.total / r.line.units : null;
              const upb = r.line.boxes && r.line.units ? Math.abs(Math.round(r.line.units / r.line.boxes)) : null;
              return (
                <div key={i} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div className="small muted">{r.line.code} · {r.line.description}</div>
                  <div className="small num">{r.line.boxes != null ? `${num(r.line.boxes)} kaxa · ` : ''}{num(r.line.units)} ud. · {euro(r.line.unitPrice)}/ud{r.line.discount ? ` · dto ${euro(r.line.discount)}` : ''} · {euro(r.line.total)}</div>
                  {r.line.isContainer ? (
                    <label className="check"><input type="checkbox" checked={r.asReturn} disabled={!returnable || (r.line.units ?? 0) >= 0} onChange={e => setRow(i, { asReturn: e.target.checked })} />
                      {(r.line.units ?? 0) < 0 ? `Ontzien itzulketa erregistratu (+${euro(Math.abs(r.line.total ?? 0))})` : 'Ontziaren fidantza: ez da erregistratzen'}</label>
                  ) : (
                    <>
                      <select className="input" aria-label="Produktua" value={r.productId} onChange={e => setRow(i, { productId: e.target.value, stock: !!e.target.value })}>
                        <option value="">— Lerro hau ez gorde —</option>
                        {sortedProducts(data.products, false).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                      </select>
                      {p && <label className="check"><input type="checkbox" checked={r.stock} onChange={e => setRow(i, { stock: e.target.checked })} /> Stock-sarrera: {num(r.line.units)} {p.inventoryUnit}</label>}
                      {p && unitPrice != null && Math.abs(unitPrice - (p.purchasePrice ?? -1)) > 0.00005 && (
                        <label className="check"><input type="checkbox" checked={r.updatePrice} onChange={e => setRow(i, { updatePrice: e.target.checked })} /> Prezioa eguneratu: {euro(p.purchasePrice)} → {euro(unitPrice)}</label>
                      )}
                      {p && upb && upb !== p.unitsPerBox && (
                        <label className="check"><input type="checkbox" checked={r.updateBox} onChange={e => setRow(i, { updateBox: e.target.checked })} /> Kaxako unitateak: {p.unitsPerBox ?? '—'} → {upb}</label>
                      )}
                    </>
                  )}
                </div>
              );
            })}
            <div className="form-actions">
              <button className="btn lg primary" onClick={save}>Markatutakoa gorde</button>
              <button className="btn" onClick={() => { setInv(null); setRows([]); }}>Baztertu</button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
