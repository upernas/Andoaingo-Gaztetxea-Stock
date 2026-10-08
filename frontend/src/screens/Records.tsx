import { useMemo, useState } from 'react';
import type { Purchase, ReturnRecord } from '../../../shared/types';
import { euro, latestClosed, num, PURCHASE_UNIT_LABEL, round2, sortedProducts, uid, unitsPerPurchaseUnit } from '../../../shared/domain';
import { useApp } from '../state';
import { ConfirmSheet, fmtDate, NumField, Swatch, TopBar } from '../ui/kit';
import { IconTrash } from '../ui/icons';

const todayISO = () => new Date().toISOString().slice(0, 10);
const dateToISO = (d: string) => (d === todayISO() ? new Date().toISOString() : new Date(d + 'T12:00:00').toISOString());

export function Returns() {
  const { data, upsert, remove, toast } = useApp();
  const returnables = data.products.filter(p => p.returnable);
  const last = latestClosed(data);
  const [pid, setPid] = useState(returnables[0]?.id ?? '');
  const p = returnables.find(x => x.id === pid);
  const [qty, setQty] = useState<number | null>(() => (p && last?.lines[p.id]?.emptyContainers) || null);
  const [price, setPrice] = useState<number | null>(p?.returnValue ?? null);
  const [date, setDate] = useState(todayISO());
  const [del, setDel] = useState<ReturnRecord | null>(null);
  const list = data.returns.slice().sort((a, b) => b.date.localeCompare(a.date));
  const total = qty != null && price != null ? round2(qty * price) : null;

  return (
    <>
      <TopBar title="Ontzi hutsen itzulketa" back />
      <div className="page">
        {returnables.length === 0 ? <div className="notice">Ez dago produktu itzulgarririk. Markatu Produktuak atalean.</div> : (
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h2>Itzulketa erregistratu</h2>
            <div className="field">
              <label htmlFor="r-prod">Produktua</label>
              <select id="r-prod" className="input" value={pid} onChange={e => { setPid(e.target.value); setPrice(returnables.find(x => x.id === e.target.value)?.returnValue ?? null); }}>
                {returnables.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </div>
            <NumField id="r-qty" label="Itzulitako ontziak" value={qty} onChange={setQty}
              hint={p?.unitsPerBox && qty ? `= ${num(qty / p.unitsPerBox, 2)} pack (${p.unitsPerBox})` : last && p ? `Azken inbentarioa: ${last.lines[p.id]?.emptyContainers ?? 0} huts` : undefined} />
            {p?.unitsPerBox && <div className="seg">{[1, 2, 5, 10].map(n => <button key={n} onClick={() => setQty((qty ?? 0) + n * p.unitsPerBox!)}>+{n} pack</button>)}</div>}
            <div className="grid2">
              <NumField id="r-price" label="€ ontziko" value={price} onChange={setPrice} />
              <div className="field"><label htmlFor="r-date">Data</label><input id="r-date" type="date" className="input" value={date} onChange={e => setDate(e.target.value)} /></div>
            </div>
            <div className="spread"><span>Berreskuratutako dirua</span><span className="num">{total != null ? '+' + euro(total) : '—'}</span></div>
            <button className="btn lg primary" disabled={!p || !qty || price == null} onClick={() => {
              upsert('returns', { id: uid(), date: dateToISO(date), productId: p!.id, quantity: qty!, refundPerUnit: price!, totalRefund: total!, notes: '' });
              setQty(null); toast(`Itzulketa erregistratuta: +${euro(total)}`);
            }}>Erregistratu</button>
          </div>
        )}
        <div className="label">Historia</div>
        <div className="list">
          {list.map(r => (
            <div key={r.id} className="item">
              <div className="main"><div className="t">{num(r.quantity)} × {data.products.find(p => p.id === r.productId)?.name}</div><div className="s">{fmtDate(r.date)}</div></div>
              <div className="end">+{euro(r.totalRefund)}</div>
              <button className="iconbtn" aria-label="Ezabatu" onClick={() => setDel(r)}><IconTrash /></button>
            </div>
          ))}
          {!list.length && <div className="empty">Itzulketarik ez</div>}
        </div>
      </div>
      {del && <ConfirmSheet title="Itzulketa ezabatu" danger ok="Ezabatu" text="Erregistro hau ezabatuko da." onClose={() => setDel(null)} onOk={() => remove('returns', del.id)} />}
    </>
  );
}

export function Purchases() {
  const { data, upsert, remove, toast } = useApp();
  const products = sortedProducts(data.products);
  const [pid, setPid] = useState(products[0]?.id ?? '');
  const p = data.products.find(x => x.id === pid);
  const upu = p ? unitsPerPurchaseUnit(p) : null;
  const [boxes, setBoxes] = useState<number | null>(null);
  const [units, setUnits] = useState<number | null>(null);
  const [price, setPrice] = useState<number | null>(p?.purchasePrice ?? null);
  const [date, setDate] = useState(todayISO());
  const [isReturn, setIsReturn] = useState(false);
  const [del, setDel] = useState<Purchase | null>(null);
  const qty = units ?? (boxes != null && upu ? boxes * upu : null);
  const groups = useMemo(() => {
    const m = new Map<string, Purchase[]>();
    for (const pu of data.purchases.slice().sort((a, b) => b.date.localeCompare(a.date))) {
      const k = pu.date.slice(0, 10);
      m.set(k, [...(m.get(k) ?? []), pu]);
    }
    return [...m.entries()];
  }, [data.purchases]);

  return (
    <>
      <TopBar title="Sarrerak" back />
      <div className="page">
        <div className="notice info small">Sarrerak stockari gehitzen zaizkio data horretatik aurrera. Generoa azken inbentarioa baino lehen iritsi bazen, jada zenbatuta dago: jarri benetako iritsiera-data.</div>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2>Sarrera erregistratu</h2>
          <div className="field">
            <label htmlFor="pu-prod">Produktua</label>
            <select id="pu-prod" className="input" value={pid} onChange={e => { setPid(e.target.value); setPrice(data.products.find(x => x.id === e.target.value)?.purchasePrice ?? null); setBoxes(null); setUnits(null); }}>
              {products.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </div>
          <div className="grid2">
            {upu && upu > 1 ? <NumField id="pu-box" label={`${PURCHASE_UNIT_LABEL[p!.purchaseUnit]} (${upu})`} value={boxes} onChange={v => { setBoxes(v); setUnits(null); }} /> : null}
            <NumField id="pu-units" label="Unitateak" suffix={p?.inventoryUnit} value={units ?? qty} onChange={v => { setUnits(v); setBoxes(null); }} />
          </div>
          <div className="grid2">
            <NumField id="pu-price" label="€ unitateko" value={price} onChange={setPrice} />
            <div className="field"><label htmlFor="pu-date">Data</label><input id="pu-date" type="date" className="input" value={date} onChange={e => setDate(e.target.value)} /></div>
          </div>
          <label className="check"><input type="checkbox" checked={isReturn} onChange={e => setIsReturn(e.target.checked)} /> Hornitzaileari itzulitako generoa (stocka kentzen du)</label>
          <button className="btn lg primary" disabled={!p || !qty} onClick={() => {
            const q = (isReturn ? -1 : 1) * Math.abs(qty!);
            upsert('purchases', { id: uid(), date: dateToISO(date), supplierId: null, productId: p!.id, quantity: q, unitPrice: price,
              total: price != null ? round2(q * price) : null, orderId: null, invoiceRef: '', notes: isReturn ? 'Itzulketa' : '' });
            setBoxes(null); setUnits(null); toast('Sarrera erregistratuta');
          }}>Erregistratu</button>
        </div>
        <div className="label">Historia</div>
        {groups.length === 0 && <div className="card empty">Sarrerarik ez</div>}
        {groups.map(([k, items]) => (
          <div key={k} className="list">
            <div className="item"><div className="main"><div className="t num">{fmtDate(items[0].date)}</div></div><div className="end">{euro(round2(items.reduce((s, x) => s + (x.total ?? 0), 0)))}</div></div>
            {items.map(pu => {
              const pr = data.products.find(x => x.id === pu.productId);
              return (
                <div key={pu.id} className="item">
                  {pr && <Swatch color={pr.color} />}
                  <div className="main"><div className="t">{pr?.name ?? '?'}</div><div className="s">{num(pu.quantity)} × {euro(pu.unitPrice)}</div></div>
                  <div className="end">{euro(pu.total)}</div>
                  <button className="iconbtn" aria-label="Ezabatu" onClick={() => setDel(pu)}><IconTrash /></button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {del && <ConfirmSheet title="Sarrera ezabatu" danger ok="Ezabatu" text="Uneko stocka sarrera hau gabe kalkulatuko da." onClose={() => setDel(null)} onOk={() => remove('purchases', del.id)} />}
    </>
  );
}
