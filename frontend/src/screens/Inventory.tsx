import { CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import type { InventoryLine, InventorySession, Order } from '../../../shared/types';
import { ReceiptCheck } from './Receipt';
import {
  boxBreakdown, closedSessions, describeStock, emptySession, euro, inkOn, latestClosed, lineTotal, nowISO, num, openSession,
  purchaseUnitName, qtyLabel, recommendations, sessionSummary, sortedProducts,
} from '../../../shared/domain';
import { safeGet, safeSet } from '../data/store';
import { useApp } from '../state';
import { ConfirmSheet, fmtDate, Sheet, StatusNotice, Swatch, TopBar } from '../ui/kit';
import { Fraction, IconBack, IconList, IconNext } from '../ui/icons';

const EMPTY_LINE: InventoryLine = { quantity: 0, partialQuantity: 0, emptyContainers: 0, counted: false };
const OTHER = '__beste';

// ───────────────────────── inbentarioaren hasiera ─────────────────────────

export function InventoryHome() {
  const { data, go, upsert, saveSettings } = useApp();
  const open = openSession(data);
  const types = data.settings.eventTypes;
  const [type, setType] = useState(types[0] ?? OTHER);
  const [custom, setCustom] = useState('');
  const [name, setName] = useState('');
  const [attendees, setAttendees] = useState('');
  const [who, setWho] = useState(() => safeGet('gz-who') ?? '');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const history = closedSessions(data).slice().reverse();
  const last = history[0];
  const eventType = type === OTHER ? custom.trim() : type;

  function start() {
    if (!eventType) return;
    safeSet('gz-who', who);
    // mota berria hurrengorako gordetzen da
    if (!types.some(t => t.toLowerCase() === eventType.toLowerCase())) saveSettings({ ...data.settings, eventTypes: [...types, eventType] });
    const today = new Date().toISOString().slice(0, 10);
    const iso = date === today ? nowISO() : new Date(date + 'T23:00:00').toISOString();
    const s = emptySession({ date: iso, eventType, eventName: name.trim(), attendees: attendees ? Number(attendees) : null, createdBy: who.trim() });
    upsert('sessions', s);
    go({ name: 'count', sessionId: s.id, index: 0 });
  }

  return (
    <>
      <TopBar title="Inbentarioa" />
      <div className="page">
        <StatusNotice />
        {open ? (
          <div className="card">
            <h2>Amaitu gabeko inbentarioa</h2>
            <p className="small muted" style={{ marginTop: 0 }}>{open.eventName || open.eventType} · {fmtDate(open.date, true)} · {Object.values(open.lines).filter(l => l.counted).length} zenbatuta</p>
            <button className="btn lg primary block" onClick={() => go({ name: 'count', sessionId: open.id })}>Zenbatzen jarraitu</button>
          </div>
        ) : (
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h2>Inbentario berria</h2>
            <div className="field">
              <label>Zein ekitaldiren ondoren?</label>
              <div className="seg">
                {types.map(t => <button key={t} className={t === type ? 'on' : ''} onClick={() => setType(t)}>{t}</button>)}
                <button className={type === OTHER ? 'on' : ''} onClick={() => setType(OTHER)}>Beste bat</button>
              </div>
              {type === OTHER && (
                <input className="input" autoFocus placeholder="Ekitaldi mota (hurrengorako gordeko da)" value={custom} onChange={e => setCustom(e.target.value)} aria-label="Ekitaldi mota" />
              )}
            </div>
            <div className="field">
              <label htmlFor="ev-name">Ekitaldiaren izena <span>(aukerakoa)</span></label>
              <input id="ev-name" className="input" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="grid2">
              <div className="field"><label htmlFor="ev-date">Data</label><input id="ev-date" type="date" className="input" value={date} onChange={e => setDate(e.target.value)} /></div>
              <div className="field"><label htmlFor="ev-att">Jende kopurua</label><input id="ev-att" className="input num" inputMode="numeric" value={attendees} onChange={e => setAttendees(e.target.value.replace(/\D/g, ''))} /></div>
            </div>
            <div className="field"><label htmlFor="ev-who">Nork zenbatzen du? <span>(aukerakoa)</span></label><input id="ev-who" className="input" value={who} onChange={e => setWho(e.target.value)} /></div>
            <p className="small muted" style={{ margin: 0 }}>Produktu guztiak zenbatu behar dira, biltegiko ordenan.</p>
            <button className="btn lg primary" onClick={start} disabled={!eventType || !sortedProducts(data.products).length}>Zenbatzen hasi</button>
          </div>
        )}

        {last && <CountTable session={last} title={`Azken zenbaketa · ${last.eventName || last.eventType} · ${fmtDate(last.date)}`} />}

        <div className="label">Inbentarioen historia</div>
        {history.length === 0 ? <div className="card empty"><b>Inbentariorik ez oraindik</b>Lehenak abiapuntu gisa balio du; kontsumoa bigarrenetik aurrera agertzen da.</div> : (
          <div className="list">
            {history.map(s => {
              const sum = sessionSummary(data, s);
              return (
                <button key={s.id} className="item" onClick={() => go({ name: 'invDone', sessionId: s.id })}>
                  <div className="main">
                    <div className="t">{s.eventName || s.eventType}</div>
                    <div className="s">{fmtDate(s.date)} · {s.eventType}{s.attendees ? ` · ${s.attendees} pertsona` : ''}</div>
                  </div>
                  <div className="end"><div>{euro(sum.stockCost)}</div><div className="small muted">{sum.previous ? 'kontsumoa ' + euro(sum.consumptionCost) : 'hasierakoa'}</div></div>
                  <span className="chev"><IconNext /></span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

/** zenbatutakoa, produktuz produktu */
export function CountTable({ session, title }: { session: InventorySession; title: string }) {
  const { data } = useApp();
  const rows = sortedProducts(data.products, false).filter(p => session.lines[p.id]?.counted);
  return (
    <div className="card">
      <h2>{title}</h2>
      <div className="tablewrap">
        <table className="t">
          <thead><tr><th>Produktua</th><th>Kopurua</th><th>Pack</th></tr></thead>
          <tbody>
            {rows.map(p => {
              const l = session.lines[p.id];
              const tot = lineTotal(p, l);
              return (
                <tr key={p.id}>
                  <td><Swatch color={p.color} />{p.name}</td>
                  <td>{describeStock(p, tot)}{p.returnable && l.emptyContainers ? <div className="small muted">{l.emptyContainers} huts</div> : null}</td>
                  <td className="muted">{boxBreakdown(p, tot) ?? ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ───────────────────────── zenbaketa ─────────────────────────

function orderedOf(order: Order | undefined, pid: string): number | null {
  const l = order?.lines.find(x => x.productId === pid);
  return l ? l.quantity * l.unitsPerPurchaseUnit : null;
}

const FRACTIONS: [number, string][] = [[0, '0'], [0.25, '¼'], [0.5, '½'], [0.75, '¾']];

export function Count({ sessionId, index }: { sessionId: string; index?: number }) {
  const { data, setLine, upsert, go } = useApp();
  const session = data.sessions.find(s => s.id === sessionId);
  const isRec = session?.kind === 'reception';
  const order = isRec ? data.orders.find(o => o.id === session?.orderId) : undefined;
  // harrera: eskatutako produktuak bakarrik
  const products = useMemo(() => {
    const all = sortedProducts(data.products, !isRec);
    return isRec ? all.filter(p => order?.lines.some(l => l.productId === p.id && l.quantity > 0)) : all;
  }, [data.products, isRec, order]);
  const firstUncounted = useMemo(() => {
    const i = products.findIndex(p => !session?.lines[p.id]?.counted);
    return i < 0 ? 0 : i;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [idx, setIdx] = useState(index ?? firstUncounted);
  const [editing, setEditing] = useState(false);
  const [showList, setShowList] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const prevSession = useMemo(() => [...closedSessions(data)].reverse().find(s => s.id !== sessionId), [data, sessionId]);

  useEffect(() => { setEditing(false); }, [idx]);

  if (!session) return <><TopBar title="Inbentarioa" back /><div className="page"><div className="card empty"><b>Ez da aurkitu</b></div></div></>;
  if (session.status === 'closed') return isRec ? <ReceiptCheck sessionId={sessionId} /> : <InvDone sessionId={sessionId} />;
  if (!products.length) return <><TopBar title="Inbentarioa" back /><div className="page"><div className="card empty"><b>Ez dago produktu aktiborik</b></div></div></>;

  const i = Math.min(idx, products.length - 1);
  const p = products[i];
  const line = session.lines[p.id] ?? EMPTY_LINE;
  const counted = Object.values(session.lines).filter(l => l.counted).length;
  const prevLine = prevSession?.lines[p.id];
  const box = p.unitsPerBox && p.unitsPerBox > 1 ? p.unitsPerBox : 5;
  const style = { background: p.color, '--on': inkOn(p.color), '--onbg': p.color } as CSSProperties;

  const put = (patch: Partial<InventoryLine>) => {
    const next = { ...line, ...patch, counted: true };
    next.quantity = Math.max(0, Math.round(next.quantity));
    next.partialQuantity = Math.max(0, next.partialQuantity);
    next.emptyContainers = Math.max(0, Math.round(next.emptyContainers));
    setLine(session.id, p.id, next);
  };
  const nextProduct = () => {
    if (!line.counted) put({});
    if (i < products.length - 1) setIdx(i + 1); else setFinishing(true);
  };
  const prevProduct = () => { if (i > 0) setIdx(i - 1); };

  function close(zeroRest: boolean) {
    const lines = { ...session!.lines };
    if (!lines[p.id]?.counted) lines[p.id] = { ...line, counted: true };
    if (zeroRest) for (const x of products) if (!lines[x.id]?.counted) lines[x.id] = { ...EMPTY_LINE, counted: true };
    upsert('sessions', { ...session!, lines, status: 'closed', closedAt: nowISO() });
    go({ name: isRec ? 'receiptCheck' : 'invDone', sessionId: session!.id }, true);
  }

  const breakdown = boxBreakdown(p, line.quantity);
  const missing = products.filter(x => !(x.id === p.id ? true : session.lines[x.id]?.counted));

  return (
    <>
      <TopBar title={session.eventName || session.eventType} back
        right={<button className="iconbtn" aria-label="Produktuen zerrenda" onClick={() => setShowList(true)}><IconList /></button>} />
      <div
        className="count" style={style}
        onTouchStart={e => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
        onTouchEnd={e => {
          if (!touch.current || editing) return;
          const dx = e.changedTouches[0].clientX - touch.current.x, dy = e.changedTouches[0].clientY - touch.current.y;
          touch.current = null;
          if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) (dx < 0 ? nextProduct : prevProduct)();
        }}
      >
        <div className="bar" aria-hidden><i style={{ width: `${(counted / products.length) * 100}%` }} /></div>
        <div className="meta"><span>{i + 1} / {products.length}</span><span>{counted} zenbatuta</span></div>
        <div>
          <h2 className="pname">{p.name}</h2>
          <div className="pfmt">{p.format}{p.unitsPerBox && p.unitsPerBox > 1 ? ` · ${purchaseUnitName(p)}: ${p.unitsPerBox}` : ''}</div>
        </div>

        {editing ? (
          <input className="bignum-input" autoFocus inputMode="numeric" defaultValue={line.counted ? String(line.quantity) : ''} aria-label="Kopurua"
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            onBlur={e => { const v = parseInt(e.target.value, 10); if (!isNaN(v)) put({ quantity: v }); setEditing(false); }} />
        ) : (
          <button className={'bignum' + (line.counted ? '' : ' uncounted')} onClick={() => setEditing(true)} aria-label="Kopurua idatzi">{line.quantity}</button>
        )}
        <div className="sub">
          {p.countMode === 'container' ? `${p.inventoryUnit} itxiak` : p.inventoryUnit}
          {breakdown ? ` · ${breakdown}` : ''}{!line.counted ? ' · zenbatu gabe' : ''}
        </div>
        <div className="steps">
          <button className="box" onClick={() => put({ quantity: line.quantity - box })}>−{box}</button>
          <button onClick={() => put({ quantity: line.quantity - 1 })}>−1</button>
          <button onClick={() => put({ quantity: line.quantity + 1 })}>+1</button>
          <button className="box" onClick={() => put({ quantity: line.quantity + box })}>+{box}</button>
        </div>

        {isRec && orderedOf(order, p.id) != null && <div className="hint">Eskatua: {num(orderedOf(order, p.id))} ud.{boxBreakdown(p, orderedOf(order, p.id)!) ? ` (${boxBreakdown(p, orderedOf(order, p.id)!)})` : ''}</div>}

        {!isRec && p.countMode === 'bottle' && (
          <div className="panel">
            <div className="subhead"><span>Botila irekia</span><span className="mono">guztira {num(lineTotal(p, line), 2)}</span></div>
            <div className="fractions">
              {FRACTIONS.map(([v, t]) => (
                <button key={v} className={line.partialQuantity === v ? 'on' : ''} onClick={() => put({ partialQuantity: v })} aria-label={`Botila irekia ${t}`}>
                  <Fraction f={v} />{t}
                </button>
              ))}
            </div>
          </div>
        )}

        {!isRec && p.countMode === 'container' && (
          <div className="panel">
            <div className="subhead"><span>Kaxa irekiko litroak</span><b>{num(line.partialQuantity, 1)} L</b></div>
            <div className="steps small">
              <button onClick={() => put({ partialQuantity: Math.max(0, +(line.partialQuantity - 0.5).toFixed(2)) })}>−0,5</button>
              <button onClick={() => put({ partialQuantity: Math.max(0, +(line.partialQuantity - 0.1).toFixed(2)) })}>−0,1</button>
              <button onClick={() => put({ partialQuantity: Math.min(p.containerVolumeL ?? 99, +(line.partialQuantity + 0.1).toFixed(2)) })}>+0,1</button>
              <button onClick={() => put({ partialQuantity: Math.min(p.containerVolumeL ?? 99, +(line.partialQuantity + 0.5).toFixed(2)) })}>+0,5</button>
            </div>
            <div className="hint">Guztira: {describeStock(p, lineTotal(p, line))}</div>
          </div>
        )}

        {!isRec && p.returnable && (
          <div className="panel">
            <div className="subhead"><span>Botila hutsak</span><b>{line.emptyContainers}</b></div>
            <div className="steps small">
              <button className="box" onClick={() => put({ emptyContainers: line.emptyContainers - box })}>−{box}</button>
              <button onClick={() => put({ emptyContainers: line.emptyContainers - 1 })}>−1</button>
              <button onClick={() => put({ emptyContainers: line.emptyContainers + 1 })}>+1</button>
              <button className="box" onClick={() => put({ emptyContainers: line.emptyContainers + box })}>+{box}</button>
            </div>
            {p.returnValue != null && line.emptyContainers > 0 && <div className="hint">{line.emptyContainers} × {euro(p.returnValue)} = {euro(line.emptyContainers * p.returnValue)}</div>}
          </div>
        )}

        {!isRec && prevLine?.counted && <div className="hint">Aurreko inbentarioa: {describeStock(p, lineTotal(p, prevLine))}</div>}

        <div className="navrow">
          <button className="prev" onClick={prevProduct} disabled={i === 0} aria-label="Aurrekoa"><IconBack /></button>
          <button className="next" onClick={nextProduct}>{i < products.length - 1 ? 'Hurrengoa' : 'Amaitu'}</button>
        </div>
      </div>

      {showList && (
        <Sheet title="Produktuak" onClose={() => setShowList(false)}>
          <div className="list">
            {products.map((x, k) => {
              const l = session.lines[x.id];
              return (
                <button key={x.id} className="item" onClick={() => { setIdx(k); setShowList(false); }}>
                  <Swatch color={x.color} />
                  <div className="main"><div className="t">{x.name}</div></div>
                  <div className="end">{l?.counted ? num(lineTotal(x, l), 2) : <span className="badge warn">zenbatu gabe</span>}</div>
                </button>
              );
            })}
          </div>
          <button className="btn primary" onClick={() => { setShowList(false); setFinishing(true); }}>Inbentarioa amaitu</button>
        </Sheet>
      )}

      {finishing && (
        <Sheet title="Inbentarioa amaitu" onClose={() => setFinishing(false)}>
          {missing.length ? (
            <>
              <p style={{ margin: 0 }}>Dena zenbatu behar da. <b>{missing.length}</b> produktu zenbatu gabe: {missing.slice(0, 8).map(x => x.name).join(', ')}{missing.length > 8 ? '…' : ''}</p>
              <button className="btn primary" onClick={() => { setFinishing(false); setIdx(products.indexOf(missing[0])); }}>Zenbatu gabekoetara joan</button>
              <button className="btn" onClick={() => close(true)}>{isRec ? 'Horiek ez dira iritsi (0)' : 'Ez dago ezer horietatik (0 gisa zenbatu)'}</button>
            </>
          ) : (
            <>
              <p style={{ margin: 0 }}>{isRec ? 'Dena zenbatuta. Orain eskatutakoarekin alderatuko da.' : 'Dena zenbatuta. Amaitzean kontsumoa eta eskaera-gomendioa kalkulatzen dira.'}</p>
              <button className="btn lg primary" onClick={() => close(false)}>{isRec ? 'Egiaztatu' : 'Inbentarioa amaitu'}</button>
            </>
          )}
        </Sheet>
      )}
    </>
  );
}

// ───────────────────────── laburpena ─────────────────────────

export function InvDone({ sessionId }: { sessionId: string }) {
  const { data, go, upsert, remove, back } = useApp();
  const [confirm, setConfirm] = useState<'reopen' | 'delete' | null>(null);
  const session = data.sessions.find(s => s.id === sessionId);
  const sum = useMemo(() => (session ? sessionSummary(data, session) : null), [data, session]);
  const isLatest = latestClosed(data)?.id === sessionId;
  const recs = useMemo(() => recommendations(data).filter(r => r.qty > 0), [data]);
  if (!session || !sum) return <><TopBar title="Inbentarioa" back /><div className="page"><div className="card empty"><b>Ez da aurkitu</b></div></div></>;
  const justClosed = !!session.closedAt && Date.now() - +new Date(session.closedAt) < 30 * 60 * 1000 && isLatest;
  const consLines = sum.lines.filter(l => l.consumption != null && l.consumption !== 0);

  return (
    <>
      <TopBar title={session.eventName || session.eventType} back />
      <div className="page">
        {justClosed && <div className="notice ok"><b>Inbentarioa osatuta.</b> Zenbaketa beheko taulan eta Inbentarioa fitxan dago ikusgai.</div>}
        <div className="small muted">{session.eventType} · {fmtDate(session.date, true)}{session.attendees ? ` · ${session.attendees} pertsona` : ''}{session.createdBy ? ` · ${session.createdBy}` : ''}</div>

        <div className="card">
          <h2>Stockaren balioa</h2>
          <div className="kv">
            <div><div className="k">Erosketa-prezioan</div><div className="v big">{euro(sum.stockCost)}</div></div>
          </div>
        </div>

        <div className="card">
          <h2>Aurreko inbentariotik kontsumoa</h2>
          {!sum.previous ? <p className="muted small" style={{ margin: 0 }}>Lehen inbentarioa da: abiapuntua. Kontsumoa hurrengoan agertuko da.</p> : (
            <>
              <div className="small muted" style={{ marginBottom: 10 }}>«{sum.previous.eventName || sum.previous.eventType}» ({fmtDate(sum.previous.date)}) ondoren</div>
              <div className="kv">
                <div><div className="k">Kontsumoa</div><div className="v">{num(sum.consumptionUnits, 1)} ud.</div></div>
                <div><div className="k">Kontsumoaren kostua</div><div className="v">{euro(sum.consumptionCost)}</div></div>
              </div>
              <p className="small muted" style={{ marginBottom: 0 }}>Kontsumoa = aurrekoa + sarrerak − orain. Gonbidapenak, hausturak eta barne-kontsumoa barne.</p>
            </>
          )}
        </div>

        {sum.empties > 0 && (
          <div className="card">
            <h2>Ontziak</h2>
            <div className="kv">
              <div><div className="k">Botila hutsak</div><div className="v">{sum.empties}</div></div>
              <div><div className="k">Itzulketaren balioa</div><div className="v ok">+{euro(sum.refundValue)}</div></div>
            </div>
            <button className="btn sm" style={{ marginTop: 10 }} onClick={() => go({ name: 'returns' })}>Itzulketa erregistratu</button>
          </div>
        )}

        {sum.anomalies.length > 0 && (
          <div className="notice">Berrikusi: lehen baino stock gehiago dago, sarrerarik erregistratu gabe: {sum.anomalies.map(a => a.product.name).join(', ')}. Erosketa bat erregistratzeko falta da edo zenbaketa-akatsa izan da?</div>
        )}
        {sum.missingPurchasePrice.length > 0 && sum.previous && (
          <div className="notice">
            <span className="badge tbc">Berretsi gabe</span> Guztizkoetan ez daude preziorik gabeko produktuak
            {sum.missingPurchasePrice.length > 0 && <> · erosketa: {sum.missingPurchasePrice.map(p => p.name).join(', ')}</>}
          </div>
        )}

        {isLatest && (
          <div className="card">
            <h2>Eskaera-gomendioa</h2>
            {recs.length === 0 ? <p className="muted small">Ez da ezer eskatu behar (edo helbururik ez dago).</p> : (
              <div className="list" style={{ marginBottom: 10 }}>
                {recs.slice(0, 8).map(r => (
                  <div key={r.product.id} className="item">
                    <Swatch color={r.product.color} />
                    <div className="main"><div className="t">{r.product.name}</div><div className="s">Orain {num(r.current, 1)} · helburua {num(r.target)}</div></div>
                    <div className="end">{qtyLabel(r.qty, purchaseUnitName(r.product))}</div>
                  </div>
                ))}
              </div>
            )}
            <button className="btn lg primary block" onClick={() => go({ name: 'order' })}>Eskaera egin</button>
          </div>
        )}

        <CountTable session={session} title="Zenbatutakoa" />

        {sum.previous && consLines.length > 0 && (
          <div className="card">
            <h2>Kontsumoa produktuz produktu</h2>
            <div className="tablewrap">
              <table className="t">
                <thead><tr><th>Produktua</th><th>Lehen</th><th>Sarrerak</th><th>Orain</th><th>Kontsumoa</th><th>Kostua</th></tr></thead>
                <tbody>
                  {consLines.map(l => (
                    <tr key={l.product.id}>
                      <td><Swatch color={l.product.color} />{l.product.name}{l.anomaly && ' (!)'}</td>
                      <td>{num(l.previous, 2)}</td><td>{l.purchased ? num(l.purchased, 2) : ''}</td><td>{num(l.current, 2)}</td>
                      <td><b>{num(l.consumption, 2)}</b></td><td>{l.cost != null ? euro(l.cost) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="btns two">
          <button className="btn" onClick={() => setConfirm('reopen')}>Zenbaketa zuzendu</button>
          <button className="btn danger" onClick={() => setConfirm('delete')}>Ezabatu</button>
        </div>
      </div>
      {confirm === 'reopen' && (
        <ConfirmSheet title="Zenbaketa zuzendu" text="Inbentarioa berriro irekiko da kopuruak zuzentzeko. Amaitzean dena berriro kalkulatuko da." ok="Berriro ireki"
          onClose={() => setConfirm(null)} onOk={() => { upsert('sessions', { ...session, status: 'open', closedAt: null }); go({ name: 'count', sessionId: session.id, index: 0 }, true); }} />
      )}
      {confirm === 'delete' && (
        <ConfirmSheet title="Inbentarioa ezabatu" danger ok="Ezabatu" text="Inbentario hau eta bere zenbaketak ezabatuko dira. Ezin da desegin."
          onClose={() => setConfirm(null)} onOk={() => { remove('sessions', session.id); back(); }} />
      )}
    </>
  );
}
