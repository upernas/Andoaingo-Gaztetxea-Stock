import { useState } from 'react';
import type { Order } from '../../../shared/types';
import { emptySession, num, nowISO, receiptCheck, round2, uid } from '../../../shared/domain';
import { useApp } from '../state';
import { ConfirmSheet, copyText, fmtDate, Swatch, TopBar } from '../ui/kit';

/** iritsitako eskaera zenbatzen hasi (edo jarraitu) */
export function useStartReception() {
  const { data, upsert, go } = useApp();
  return (order: Order) => {
    const open = data.sessions.find(s => s.kind === 'reception' && s.orderId === order.id && s.status === 'open');
    if (open) { go({ name: 'count', sessionId: open.id, index: 0 }); return; }
    const s = emptySession({ kind: 'reception', orderId: order.id, eventType: 'Harrera', eventName: 'Eskaeraren harrera' });
    upsert('sessions', s);
    go({ name: 'count', sessionId: s.id, index: 0 });
  };
}

/** egiaztagiria: eskatutakoa vs iritsitakoa → onartu → stockera */
export function ReceiptCheck({ sessionId }: { sessionId: string }) {
  const { data, upsert, go, toast } = useApp();
  const [confirm, setConfirm] = useState(false);
  const session = data.sessions.find(s => s.id === sessionId);
  const order = data.orders.find(o => o.id === session?.orderId);
  if (!session || !order) return <><TopBar title="Harrera" back /><div className="page"><div className="card empty"><b>Ez da aurkitu</b></div></div></>;

  const rows = receiptCheck(data, order, session);
  const missing = rows.filter(r => r.diff < 0);
  const extra = rows.filter(r => r.diff > 0);
  const accepted = order.status === 'recibido';

  const accept = () => {
    const date = nowISO();
    for (const r of rows) {
      if (r.received <= 0) continue;
      const l = order.lines.find(x => x.productId === r.product.id)!;
      const unitPrice = l.unitPrice != null ? round2((l.unitPrice / l.unitsPerPurchaseUnit) * 10000) / 10000 : null;
      upsert('purchases', { id: uid(), date, supplierId: l.supplierId, productId: r.product.id, quantity: r.received, unitPrice,
        total: unitPrice != null ? round2(unitPrice * r.received) : null, orderId: order.id, invoiceRef: '', notes: 'Eskaeraren harrera' });
    }
    upsert('orders', { ...order, status: 'recibido', receivedAt: date });
    toast('Stockera gehituta');
    go({ name: 'inventory' });
  };

  const missingText = () => ['Kaixo! Eskaeran hau falta da:', '', ...missing.map(r => `- ${r.product.name}: ${num(-r.diff)} ud.`), '', 'Eskerrik asko!'].join('\n');

  return (
    <>
      <TopBar title="Harreraren egiaztapena" back />
      <div className="page">
        <div className="small muted">Eskaera{order.neededBy ? ` · ${fmtDate(order.neededBy + 'T12:00:00')}rako` : ''} · zenbatua {fmtDate(session.closedAt ?? session.date, true)}</div>
        {missing.length === 0 && extra.length === 0
          ? <div className="notice ok"><b>Dena iritsi da.</b> Eskatutako guztia bat dator.</div>
          : <div className="notice bad"><b>{missing.length ? `${missing.length} produktutan falta da generoa.` : ''}</b>{extra.length ? ` ${extra.length} produktutan eskatutakoa baino gehiago iritsi da.` : ''}</div>}

        <div className="card">
          <div className="tablewrap">
            <table className="t">
              <thead><tr><th>Produktua</th><th>Eskatua</th><th>Iritsia</th><th>Aldea</th></tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.product.id}>
                    <td><Swatch color={r.product.color} />{r.product.name}</td>
                    <td>{num(r.ordered)}</td>
                    <td>{num(r.received)}</td>
                    <td style={{ color: r.diff < 0 ? 'var(--bad)' : r.diff > 0 ? 'var(--warn)' : 'var(--ok)', fontWeight: 600 }}>
                      {r.diff === 0 ? 'ados' : r.diff < 0 ? `falta ${num(-r.diff)}` : `+${num(r.diff)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small muted" style={{ marginBottom: 0 }}>Unitateetan (ud.).</p>
        </div>

        {missing.length > 0 && !accepted && (
          <button className="btn" onClick={async () => toast((await copyText(missingText())) ? 'Falta dena kopiatuta' : 'Ezin izan da kopiatu')}>Falta dena kopiatu (WhatsApp)</button>
        )}
        {accepted ? (
          <div className="notice ok">Onartuta eta stockera gehituta ({fmtDate(order.receivedAt ?? '', true)}).</div>
        ) : (
          <div className="btns two">
            <button className="btn" onClick={() => { upsert('sessions', { ...session, status: 'open', closedAt: null }); go({ name: 'count', sessionId: session.id, index: 0 }, true); }}>Zenbaketa zuzendu</button>
            <button className="btn primary" onClick={() => setConfirm(true)}>Onartu</button>
          </div>
        )}
      </div>
      {confirm && (
        <ConfirmSheet title="Onartu eta stockera gehitu" ok="Stockera gehitu" onClose={() => setConfirm(false)} onOk={accept}
          text={<>Iritsitakoa stockari gehituko zaio:<ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            {rows.filter(r => r.received > 0).map(r => <li key={r.product.id}>{r.product.name}: {num(r.received)} ud.</li>)}
          </ul>{missing.length > 0 && <p className="small" style={{ marginBottom: 0 }}>Falta dena ez da gehituko.</p>}</>} />
      )}
    </>
  );
}
