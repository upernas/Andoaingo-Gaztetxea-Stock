import { useMemo, useRef, useState } from 'react';
import type { CountMode, Product, PurchaseUnit } from '../../../shared/types';
import { euro, newProduct, num, PURCHASE_UNIT_LABEL, round2, sortedProducts, unitsPerPurchaseUnit } from '../../../shared/domain';
import { useApp } from '../state';
import { ConfirmSheet, NumField, Swatch, Tbc, TextField, TopBar } from '../ui/kit';
import { IconDown, IconGrip, IconNext, IconUp } from '../ui/icons';

const FIELD_LABELS: Record<string, string> = {
  name: 'izena', format: 'formatua', purchasePrice: 'erosketa-prezioa', listPrice: 'tarifa', unitsPerBox: 'packeko unitateak',
  unitsPerPack: 'packeko unitateak', supplierId: 'hornitzailea', salePrice: 'salmenta-prezioa', servingsPerUnit: 'kontsumizioak unitateko',
  returnable: 'itzulgarria', returnValue: 'itzulketaren balioa', parLevel: 'helburua', vatRate: 'BEZa',
};

export function ProductsList() {
  const { data, go, upsert, toast } = useApp();
  const [sorting, setSorting] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [q, setQ] = useState('');
  const active = sortedProducts(data.products);
  const inactive = data.products.filter(p => !p.active).sort((a, b) => a.name.localeCompare(b.name));
  const filtered = active.filter(p => p.name.toLowerCase().includes(q.toLowerCase()));

  const saveOrder = (ids: string[]) => ids.forEach((id, i) => {
    const p = data.products.find(x => x.id === id)!;
    if (p.sortOrder !== i + 1) upsert('products', { ...p, sortOrder: i + 1 });
  });

  return (
    <>
      <TopBar title="Produktuak" back />
      <div className="page">
        <div className="btns two">
          <button className="btn primary" onClick={() => go({ name: 'productEdit', productId: null })}>Produktua gehitu</button>
          <button className="btn" onClick={() => { if (sorting) toast('Ordena gordeta'); setSorting(!sorting); }}>{sorting ? 'Ados' : 'Ordenatu'}</button>
        </div>
        {sorting ? (
          <>
            <div className="notice info small">Ordenatu biltegian/barran dauden bezala: arrastatu heldulekutik edo erabili geziak. Inbentarioak ordena hau jarraituko du.</div>
            <SortableList ids={active.map(p => p.id)} onChange={saveOrder} render={id => {
              const p = data.products.find(x => x.id === id)!;
              return <><Swatch color={p.color} /><div className="main"><div className="t">{p.name}</div><div className="s">{p.format}</div></div></>;
            }} />
          </>
        ) : (
          <>
            <input className="input" placeholder="Bilatu…" value={q} onChange={e => setQ(e.target.value)} aria-label="Produktua bilatu" />
            <div className="list">
              {filtered.map(p => <ProductRow key={p.id} p={p} pos={active.indexOf(p) + 1} />)}
              {!filtered.length && <div className="empty">Produkturik ez</div>}
            </div>
            {inactive.length > 0 && (
              <>
                <button className="btn sm" onClick={() => setShowInactive(!showInactive)}>Desaktibatuak ({inactive.length}) {showInactive ? '▾' : '▸'}</button>
                {showInactive && <div className="list">{inactive.map(p => <ProductRow key={p.id} p={p} />)}</div>}
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}

function ProductRow({ p, pos }: { p: Product; pos?: number }) {
  const { go } = useApp();
  const upu = unitsPerPurchaseUnit(p);
  return (
    <button className={'item' + (p.active ? '' : ' off')} onClick={() => go({ name: 'productEdit', productId: p.id })}>
      <Swatch color={p.color} />
      <div className="main">
        <div className="t">{pos ? <span className="muted num small">{pos}. </span> : null}{p.name} {p.unconfirmed.length > 0 && <Tbc />}</div>
        <div className="s">{p.format}{upu && upu > 1 ? ` · ${PURCHASE_UNIT_LABEL[p.purchaseUnit]} ${upu}` : ''} · {euro(p.purchasePrice)}/ud.</div>
      </div>
      <span className="chev"><IconNext /></span>
    </button>
  );
}

/** zerrenda ordenagarria: heldulekutik arrastatu (ukimena eta sagua) + geziak */
export function SortableList({ ids, onChange, render }: { ids: string[]; onChange(ids: string[]): void; render(id: string): React.ReactNode }) {
  const [order, setOrder] = useState(ids);
  const [drag, setDrag] = useState<{ id: string; startY: number; dy: number } | null>(null);
  const refs = useRef(new Map<string, HTMLDivElement>());
  const live = useMemo(() => (drag ? order : ids), [drag, order, ids]);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= ids.length) return;
    const n = ids.slice(); const [x] = n.splice(from, 1); n.splice(to, 0, x); onChange(n);
  };
  return (
    <div className="list sortable">
      {live.map((id, i) => (
        <div key={id} ref={el => { if (el) refs.current.set(id, el); else refs.current.delete(id); }}
          className={'item' + (drag?.id === id ? ' dragging' : '')} style={drag?.id === id ? { transform: `translateY(${drag.dy}px)` } : undefined}>
          <button className="handle" aria-label="Arrastatu ordenatzeko"
            onPointerDown={e => { (e.target as HTMLElement).setPointerCapture(e.pointerId); setOrder(ids); setDrag({ id, startY: e.clientY, dy: 0 }); }}
            onPointerMove={e => {
              if (!drag || drag.id !== id) return;
              const h = refs.current.get(id)!.getBoundingClientRect().height || 48;
              const dy = e.clientY - drag.startY;
              const cur = order.indexOf(id);
              if (dy > h / 2 && cur < order.length - 1) { const n = order.slice(); n.splice(cur, 1); n.splice(cur + 1, 0, id); setOrder(n); setDrag({ ...drag, startY: drag.startY + h, dy: dy - h }); return; }
              if (dy < -h / 2 && cur > 0) { const n = order.slice(); n.splice(cur, 1); n.splice(cur - 1, 0, id); setOrder(n); setDrag({ ...drag, startY: drag.startY - h, dy: dy + h }); return; }
              setDrag({ ...drag, dy });
            }}
            onPointerUp={() => { if (drag) { onChange(order); setDrag(null); } }}
            onPointerCancel={() => setDrag(null)}><IconGrip /></button>
          {render(id)}
          <button className="iconbtn" aria-label="Igo" onClick={() => move(i, i - 1)} disabled={i === 0}><IconUp /></button>
          <button className="iconbtn" aria-label="Jaitsi" onClick={() => move(i, i + 1)} disabled={i === live.length - 1}><IconDown /></button>
        </div>
      ))}
    </div>
  );
}

const MODES: [CountMode, string, string][] = [
  ['unit', 'Unitateak', 'botilatxoak, latak, edalontziak…'],
  ['bottle', 'Botilak', 'osoak + botila irekia (¼ ½ ¾)'],
  ['container', 'Litroka', 'kaxa itxiak + irekiaren litroak (ardoa 5 L)'],
];

export function ProductEdit({ productId }: { productId: string | null }) {
  const { data, upsert, back, toast } = useApp();
  const existing = productId ? data.products.find(p => p.id === productId) : undefined;
  const [p, setP] = useState<Product>(() => existing ?? newProduct({
    categoryId: 'cat-otros', sortOrder: Math.max(0, ...data.products.map(x => x.sortOrder)) + 1, unitsPerBox: 24, inventoryUnit: 'ud.',
  }));
  const [boxPrice, setBoxPrice] = useState<number | null>(null);
  const [confirmOff, setConfirmOff] = useState(false);
  const tbc = (f: string) => p.unconfirmed.includes(f);
  const set = (patch: Partial<Product>) => {
    const fields = Object.keys(patch);
    setP(cur => ({ ...cur, ...patch, unconfirmed: cur.unconfirmed.filter(f => !fields.includes(f)) }));
  };
  const upu = unitsPerPurchaseUnit(p);
  const save = () => {
    if (!p.name.trim()) { toast('Izena falta da'); return; }
    upsert('products', { ...p, name: p.name.trim() });
    toast(existing ? 'Produktua gordeta' : 'Produktua gehituta');
    back();
  };

  return (
    <>
      <TopBar title={existing ? 'Produktua editatu' : 'Produktu berria'} back />
      <div className="page">
        {p.unconfirmed.length > 0 && (
          <div className="notice">
            <span className="badge tbc">Berretsi gabe</span> {p.unconfirmed.map(f => FIELD_LABELS[f] ?? f).join(', ')}.
            <div style={{ marginTop: 8 }}><button className="btn sm" onClick={() => setP({ ...p, unconfirmed: [] })}>Dena berretsita markatu</button></div>
          </div>
        )}
        {p.notes && existing && <div className="notice info small">{p.notes}</div>}

        <TextField id="p-name" label="Izena" value={p.name} onChange={v => set({ name: v })} tbc={tbc('name')} />
        <div className="grid2">
          <TextField id="p-fmt" label="Formatua" value={p.format} onChange={v => set({ format: v })} placeholder="Lata 33 cl" tbc={tbc('format')} />
          <div className="field">
            <label htmlFor="p-color">Kolorea</label>
            <input id="p-color" type="color" className="input" value={p.color} onChange={e => set({ color: e.target.value })} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="p-cat">Mota</label>
          <select id="p-cat" className="input" value={p.categoryId ?? ''} onChange={e => set({ categoryId: e.target.value || null })}>
            {data.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div className="label">Inbentarioa (zer zenbatzen dugun)</div>
        <div className="field">
          <label>Nola zenbatzen da</label>
          <div className="seg">{MODES.map(([m, t]) => <button key={m} className={p.countMode === m ? 'on' : ''} onClick={() => set({ countMode: m, ...(m === 'container' && !p.containerVolumeL ? { containerVolumeL: 5 } : {}) })}>{t}</button>)}</div>
          <div className="small muted">{MODES.find(m => m[0] === p.countMode)?.[2]}</div>
        </div>
        <div className="grid2">
          <TextField id="p-iu" label="Inbentario-unitatea" value={p.inventoryUnit} onChange={v => set({ inventoryUnit: v })} placeholder="lata" />
          {p.countMode === 'container'
            ? <NumField id="p-vol" label="Litroak ontziko" value={p.containerVolumeL} onChange={v => set({ containerVolumeL: v })} />
            : <NumField id="p-pos" label="Posizioa" value={p.sortOrder} onChange={v => set({ sortOrder: v ?? 9999 })} />}
        </div>

        <div className="label">Erosketa (zer eskatzen dugun)</div>
        <div className="field">
          <label>Erosketa-unitatea</label>
          <div className="seg">{(['caja', 'unidad'] as PurchaseUnit[]).map(u => <button key={u} className={p.purchaseUnit === u ? 'on' : ''} onClick={() => set({ purchaseUnit: u })}>{u === 'unidad' ? 'ud. solteak' : 'pack'}</button>)}</div>
        </div>
        <div className="grid2">
          <NumField id="p-upb" label="Packeko unitateak" value={p.unitsPerBox} onChange={v => set({ unitsPerBox: v })} tbc={tbc('unitsPerBox')} />
        </div>
        <NumField id="p-pp" label="Erosketa-prezioa" suffix={`€ / ${p.inventoryUnit || 'unitate'}, BEZik gabe`} value={p.purchasePrice}
          onChange={v => { set({ purchasePrice: v }); setBoxPrice(null); }} tbc={tbc('purchasePrice')}
          hint={p.purchasePrice != null && upu && upu > 1 ? `= ${euro(round2(p.purchasePrice * upu))} / ${PURCHASE_UNIT_LABEL[p.purchaseUnit]} (${upu})` : undefined} />
        {upu && upu > 1 ? (
          <NumField id="p-boxp" label={`edo ${PURCHASE_UNIT_LABEL[p.purchaseUnit]}aren prezioa`} suffix="€" value={boxPrice}
            onChange={v => { setBoxPrice(v); if (v != null) set({ purchasePrice: Math.round((v / upu) * 10000) / 10000 }); }} />
        ) : null}
        <TextField id="p-code" label="Albaraneko kodea" value={p.supplierCode} onChange={v => set({ supplierCode: v })} />

        <div className="label">Stocka ({p.inventoryUnit || 'unitate'})</div>
        <div className="grid2">
          <NumField id="p-par" label="Helburua" value={p.parLevel} onChange={v => set({ parLevel: v })} hint={upu && p.parLevel ? `≈ ${num(p.parLevel / upu, 1)} ${PURCHASE_UNIT_LABEL[p.purchaseUnit]}` : undefined} />
          <NumField id="p-min" label="Gutxienekoa" value={p.minStock} onChange={v => set({ minStock: v })} hint="Azpitik: premiazkoa" />
        </div>

        <div className="label">Ontziak</div>
        <label className="check"><input type="checkbox" checked={p.returnable} onChange={e => set({ returnable: e.target.checked })} /> Itzulgarria (ontziagatik dirua itzultzen dute) <Tbc show={tbc('returnable')} /></label>
        {p.returnable && <NumField id="p-rv" label="Itzulketaren balioa ontziko" suffix="€" value={p.returnValue} onChange={v => set({ returnValue: v })} tbc={tbc('returnValue')} />}

        <div className="field"><label htmlFor="p-notes">Oharrak</label><textarea id="p-notes" className="input" style={{ minHeight: 70 }} value={p.notes} onChange={e => set({ notes: e.target.value })} /></div>

        <div className="form-actions">
          <button className="btn lg primary" onClick={save}>Gorde</button>
          {existing && (p.active
            ? <button className="btn danger" onClick={() => setConfirmOff(true)}>Produktua desaktibatu</button>
            : <button className="btn" onClick={() => { upsert('products', { ...p, active: true }); toast('Produktua aktibatuta'); back(); }}>Produktua aktibatu</button>)}
        </div>
      </div>
      {confirmOff && (
        <ConfirmSheet title="Produktua desaktibatu" ok="Desaktibatu" danger onClose={() => setConfirmOff(false)}
          text="Ez da inbentario eta eskaera berrietan agertuko. Historia gordetzen da, eta nahi duzunean berriro aktiba dezakezu."
          onOk={() => { upsert('products', { ...p, active: false }); toast('Produktua desaktibatuta'); back(); }} />
      )}
    </>
  );
}
