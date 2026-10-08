import { useEffect, useMemo, useState } from 'react';
import type { Order, OrderLine, Product } from '../../../shared/types';
import {
  buildMessage, consumptionStats, currentStock, describeStock, emptyOrder, euro, latestClosed, lineCost, nowISO, num,
  orderLineFromRec, orderTotal, PURCHASE_UNIT_LABEL, purchaseUnitName, qtyLabel, recommendations, Recommendation, round2,
  shortDate, sortedProducts, uid, unitsPerPurchaseUnit,
} from '../../../shared/domain';
import { useStartReception } from './Receipt';
import { useApp } from '../state';
import { ConfirmSheet, copyText, NumField, StatusNotice, Swatch, TopBar } from '../ui/kit';
import { IconCheck, IconCopy, IconEdit, IconPlus, IconSend, IconX } from '../ui/icons';

const GENERAL = '';

function lineFor(p: Product, quantity: number): OrderLine {
  const upu = unitsPerPurchaseUnit(p) ?? 1;
  return {
    productId: p.id, supplierId: p.supplierId, quantity, purchaseUnit: p.purchaseUnit, unitsPerPurchaseUnit: upu,
    unitPrice: p.purchasePrice != null ? round2(p.purchasePrice * upu * 10000) / 10000 : null, recommended: 0, manual: true, note: '',
  };
}

function useDraft(): Order | undefined {
  const { data, upsert } = useApp();
  const latest = latestClosed(data)?.id ?? null;
  const draft = data.orders.filter(o => o.status === 'borrador').sort((a, b) => b.date.localeCompare(a.date))[0];
  const stale = !draft || draft.basedOnSessionId !== latest;
  useEffect(() => {
    if (!stale) return;
    const eventType = draft?.eventType ?? data.settings.eventTypes[0] ?? GENERAL;
    const auto = recommendations(data, eventType || undefined).filter(r => r.qty > 0).map(orderLineFromRec);
    upsert('orders', emptyOrder({ id: draft?.id ?? uid(), basedOnSessionId: latest, eventType, lines: auto }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stale, latest]);
  return stale ? undefined : draft;
}

export function OrderScreen() {
  const { data, go, upsert } = useApp();
  const draft = useDraft();
  const eventType = draft?.eventType ?? GENERAL;
  const recs = useMemo(() => recommendations(data, eventType || undefined), [data, eventType]);
  if (!draft) return <><TopBar title="Eskaera" /><div className="page"><div className="muted">Kalkulatzen…</div></div></>;

  const recOf = (pid: string) => recs.find(r => r.product.id === pid);
  const save = (patch: Partial<Order>) => upsert('orders', { ...draft, ...patch, date: nowISO() });
  const setLines = (lines: OrderLine[]) => save({ lines });
  const autoLines = (et: string) => recommendations(data, et || undefined).filter(r => r.qty > 0).map(orderLineFromRec);

  const changeEvent = (et: string) => {
    const manual = draft.lines.filter(l => l.manual);
    const auto = autoLines(et).filter(a => !manual.some(m => m.productId === a.productId));
    save({ eventType: et, lines: [...auto, ...manual] });
  };
  const setQty = (i: number, q: number) => setLines(draft.lines.map((l, k) => (k === i ? { ...l, quantity: Math.max(0, q) } : l)));
  const replace = (i: number, pid: string) => {
    const p = data.products.find(x => x.id === pid);
    if (p) setLines(draft.lines.map((l, k) => (k === i ? lineFor(p, Math.max(1, l.quantity)) : l)));
  };
  const removeAt = (i: number) => setLines(draft.lines.filter((_, k) => k !== i));
  const add = () => {
    const used = new Set(draft.lines.map(l => l.productId));
    const p = sortedProducts(data.products).find(x => !used.has(x.id));
    if (p) setLines([...draft.lines, lineFor(p, 1)]);
  };

  const tot = orderTotal(data, draft.lines);
  const hasLines = draft.lines.some(l => l.quantity > 0);
  const active = sortedProducts(data.products);
  const fresh = recs.filter(r => r.qty > 0);
  const auto = draft.lines.filter(l => !l.manual);
  const differs = fresh.length !== auto.length || fresh.some(r => !auto.some(l => l.productId === r.product.id && l.recommended === r.qty));
  const noTarget = recs.filter(r => r.status === 'sin-objetivo').length;
  const types = data.settings.eventTypes;

  return (
    <>
      <TopBar title="Eskaera" />
      <div className="page">
        <StatusNotice />
        <PendingOrders />
        <div className="field">
          <label htmlFor="o-date">Noizko behar dugu?</label>
          <input id="o-date" type="date" className="input" value={draft.neededBy ?? ''} onChange={e => save({ neededBy: e.target.value || null })} />
        </div>
        <div className="field">
          <label>Hurrengo ekitaldia (iragarpenerako)</label>
          <div className="seg">
            {types.map(t => <button key={t} className={eventType === t ? 'on' : ''} onClick={() => changeEvent(t)}>{t}</button>)}
            <button className={eventType === GENERAL ? 'on' : ''} onClick={() => changeEvent(GENERAL)}>Orokorra</button>
          </div>
        </div>
        {!latestClosed(data) && <div className="notice info">Egin inbentario bat aplikazioak zer eskatu kalkula dezan. Bitartean, eskuz gehitu dezakezu.</div>}
        {differs && latestClosed(data) && (
          <div className="notice info row" style={{ justifyContent: 'space-between' }}>
            <span>Gomendioa aldatu da.</span>
            <button className="btn sm" onClick={() => changeEvent(eventType)}>Eguneratu</button>
          </div>
        )}

        {draft.lines.length > 0 && (
          <div className="olist">
            {draft.lines.map((l, i) => {
              const p = data.products.find(x => x.id === l.productId);
              if (!p) return null;
              const r = recOf(l.productId);
              const unit = PURCHASE_UNIT_LABEL[l.purchaseUnit];
              return (
                <div key={l.productId + i} className="orow">
                  <span className="stripe" style={{ background: p.color }} />
                  <div className="info">
                    <select value={l.productId} onChange={e => replace(i, e.target.value)} aria-label="Produktua">
                      {active.filter(x => x.id === l.productId || !draft.lines.some(o => o.productId === x.id)).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </select>
                    <div className="s">
                      <StatusText r={r} manual={l.manual} />
                      {r?.current != null ? ` · stocka ${describeStock(p, r.current)}` : ''}
                      {r?.target != null ? ` · helburua ${num(r.target)}` : ''}
                      {l.unitPrice != null ? ` · ${euro(lineCost(l))}` : ''}
                    </div>
                  </div>
                  <div className="stepper">
                    <button aria-label="Gutxiago" onClick={() => setQty(i, l.quantity - 1)}>−</button>
                    <div className="v">{l.quantity}<small>{unit}</small></div>
                    <button aria-label="Gehiago" onClick={() => setQty(i, l.quantity + 1)}>+</button>
                  </div>
                  <button className="x" aria-label="Kendu" onClick={() => removeAt(i)}><IconX /></button>
                </div>
              );
            })}
          </div>
        )}
        {draft.lines.length === 0 && latestClosed(data) && <div className="card empty"><b>Ez da ezer eskatu behar</b>Stockaren eta helburuen arabera. Gehitu eskuz behar duzuna.</div>}
        <button className="addrow" onClick={add} disabled={draft.lines.length >= active.length}><IconPlus /> Gehitu</button>

        {noTarget > 0 && (
          <button className="notice" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => go({ name: 'targets' })}>
            {noTarget} produktuk ez dute helbururik ezta daturik ere: ezin da kopururik gomendatu. <b>Helburuak ezarri</b>
          </button>
        )}

        <div className="totalbar">
          <div className="spread">
            <span>Guztira (estimatua){tot.missing ? <span className="small muted"> · {tot.missing} preziorik gabe</span> : null}</span>
            <span className="sum">{euro(tot.products)}</span>
          </div>
          <button className="btn lg primary" disabled={!hasLines} onClick={() => go({ name: 'orderMessage', orderId: draft.id })}><IconSend /> Mezua sortu</button>
        </div>
      </div>
    </>
  );
}

function StatusText({ r, manual }: { r?: Recommendation; manual: boolean }) {
  if (manual) return <span className="st">Eskuz</span>;
  if (!r) return null;
  const src = r.source === 'ekitaldia' ? `iragarpena (${r.basedOn})` : r.source === 'batezbestekoa' ? 'batez bestekoa' : 'helburua';
  return r.status === 'urgente'
    ? <><span className="st" style={{ color: 'var(--bad)' }}>Premiazkoa</span> · {src}</>
    : <span className="st" style={{ color: 'var(--warn)' }}>{src}</span>;
}

// ───────────────────────── mezua ─────────────────────────

export function OrderMessage({ orderId }: { orderId: string }) {
  const { data, upsert, toast } = useApp();
  const startReception = useStartReception();
  const order = data.orders.find(o => o.id === orderId);
  const generated = useMemo(() => (order ? buildMessage(data, order.lines, order.neededBy) : ''), [data, order]);
  const [text, setText] = useState(generated);
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!editing) setText(generated); }, [generated, editing]);
  if (!order) return <><TopBar title="Mezua" back /><div className="page"><div className="card empty"><b>Ez da aurkitu</b></div></div></>;
  const tot = orderTotal(data, order.lines);
  const wa = `https://wa.me/?text=${encodeURIComponent(text)}`;
  // kopiatu edo WhatsApp-era bidaltzean eskaera "bidalita" geratzen da, iristeko zain
  const markSent = () => { if (order.status === 'borrador') upsert('orders', { ...order, status: 'enviado', message: text, estimatedCost: tot.products, lines: order.lines.filter(l => l.quantity > 0) }); };

  return (
    <>
      <TopBar title="Mezua" back />
      <div className="page">
        {!order.neededBy && <div className="notice">Ez da datarik jarri. Jarri «Noizko behar dugu?» Eskaera pantailan, mezuan ager dadin.</div>}
        <div className="card">
          {editing
            ? <textarea id="msg" className="input mono" style={{ minHeight: 300 }} value={text} onChange={e => setText(e.target.value)} aria-label="Mezua" />
            : <div className="msgbox" aria-label="Mezua">{text}</div>}
        </div>
        <div className="btns two">
          <button className="btn" onClick={() => setEditing(!editing)}>{editing ? <><IconCheck /> Ados</> : <><IconEdit /> Editatu</>}</button>
          <button className="btn primary" onClick={async () => { const ok = await copyText(text); if (ok) markSent(); toast(ok ? 'Kopiatuta. Itsatsi WhatsApp-en' : 'Ezin izan da kopiatu: sakatu luze testuan'); }}><IconCopy /> Kopiatu</button>
        </div>
        <a className="btn" href={wa} target="_blank" rel="noreferrer" onClick={markSent}><IconSend /> WhatsApp-en ireki</a>
        {editing && text !== generated && <button className="btn sm" onClick={() => setText(generated)}>Sortutako testura itzuli</button>}
        <div className="spread"><span className="muted">Guztira (estimatua)</span><span className="num">{euro(tot.products)}</span></div>
        <hr style={{ border: 0, borderTop: '1px solid var(--line)', width: '100%', margin: '4px 0' }} />
        <button className="btn block" onClick={() => { markSent(); startReception({ ...order, status: 'enviado' }); }}>Eskaera iritsi da: zenbatu</button>
      </div>
    </>
  );
}

/** bidalitako eta iristeko dauden eskaerak */
function PendingOrders() {
  const { data, go, remove } = useApp();
  const startReception = useStartReception();
  const [del, setDel] = useState<Order | null>(null);
  const pending = data.orders.filter(o => o.status === 'enviado').sort((a, b) => (a.neededBy ?? '').localeCompare(b.neededBy ?? ''));
  if (!pending.length) return null;
  return (
    <>
      {pending.map(o => {
        const rec = data.sessions.find(s => s.kind === 'reception' && s.orderId === o.id);
        const n = o.lines.filter(l => l.quantity > 0).length;
        return (
          <div key={o.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h2 style={{ margin: 0 }}>Bidalitako eskaera, iristeko</h2>
            <div className="small muted">{o.neededBy ? shortDate(o.neededBy) + ' fetxarako · ' : ''}{n} produktu · {euro(o.estimatedCost)}</div>
            <div className="btns two">
              {rec?.status === 'closed'
                ? <button className="btn primary" onClick={() => go({ name: 'receiptCheck', sessionId: rec.id })}>Egiaztapena ikusi</button>
                : <button className="btn primary" onClick={() => startReception(o)}>{rec ? 'Zenbatzen jarraitu' : 'Iritsi da: zenbatu'}</button>}
              <button className="btn" onClick={() => go({ name: 'orderMessage', orderId: o.id })}>Mezua</button>
            </div>
            <button className="btn sm danger" onClick={() => setDel(o)}>Eskaera ezabatu</button>
          </div>
        );
      })}
      {del && <ConfirmSheet title="Eskaera ezabatu" danger ok="Ezabatu" text="Bidalitako eskaera hau ezabatuko da (ez da stockera ezer gehituko)." onClose={() => setDel(null)} onOk={() => remove('orders', del.id)} />}
    </>
  );
}

// ───────────────────────── stock helburuak ─────────────────────────

export function Targets() {
  const { data, upsert, toast } = useApp();
  const stats = useMemo(() => consumptionStats(data), [data]);
  const products = sortedProducts(data.products);
  const set = (p: Product, patch: Partial<Product>) => {
    const fields = Object.keys(patch);
    upsert('products', { ...p, ...patch, unconfirmed: p.unconfirmed.filter(f => !fields.includes(f)) });
  };
  return (
    <>
      <TopBar title="Stock helburuak" back />
      <div className="page">
        <div className="notice info small">
          <b>Helburua</b>: ekitaldi baten aurretik izan nahi duzuna. <b>Gutxienekoa</b>: horren azpitik premiazkoa da. Inbentario-unitatetan.
          Ekitaldi motaren datuak daudenean, eskaerak iragarpena erabiltzen du (kontsumoa × {1 + data.settings.safetyPct / 100}).
        </div>
        {products.map(p => {
          const st = stats.find(s => s.product.id === p.id);
          const cur = currentStock(data, p).units;
          const upu = unitsPerPurchaseUnit(p);
          return (
            <div key={p.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="spread"><span className="row"><Swatch color={p.color} /><b>{p.name}</b></span><span className="small muted num">orain {describeStock(p, cur)}</span></div>
              {st?.n ? <div className="small muted">Ekitaldiko kontsumoa: batez beste {num(st.avg, 1)} · min {num(st.min, 1)} · max {num(st.max, 1)} ({st.n})</div> : null}
              <div className="grid2">
                <NumField id={'par-' + p.id} label="Helburua" value={p.parLevel} onChange={v => set(p, { parLevel: v })}
                  hint={upu && p.parLevel ? `≈ ${num(p.parLevel / upu, 1)} ${purchaseUnitName(p)}` : undefined} />
                <NumField id={'min-' + p.id} label="Gutxienekoa" value={p.minStock} onChange={v => set(p, { minStock: v })} />
              </div>
              {st?.suggestedPar != null && st.suggestedPar !== p.parLevel && (
                <button className="btn sm" onClick={() => { set(p, { parLevel: st.suggestedPar }); toast(`${p.name}: helburua ${st.suggestedPar}`); }}>
                  Iradokitakoa erabili: {qtyLabel(st.suggestedPar, p.inventoryUnit)}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
