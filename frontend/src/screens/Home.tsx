import { useMemo } from 'react';
import { euro, shortDate, latestClosed, openSession, orderLineFromRec, orderTotal, recommendations, sessionSummary, sortedProducts, stockValueNow } from '../../../shared/domain';
import { useApp } from '../state';
import { fmtDate, StatusNotice, TopBar } from '../ui/kit';
import { IconBox, IconCart } from '../ui/icons';

export function Home() {
  const { data, go, notice } = useApp();
  const stock = useMemo(() => stockValueNow(data), [data]);
  const last = latestClosed(data);
  const lastSum = useMemo(() => (last ? sessionSummary(data, last) : null), [data, last]);
  const open = openSession(data);
  const recs = useMemo(() => recommendations(data), [data]);
  const toOrder = recs.filter(r => r.qty > 0);
  const cost = orderTotal(data, toOrder.map(orderLineFromRec));
  const active = sortedProducts(data.products);
  const tbc = active.filter(p => p.unconfirmed.length).length;

  return (
    <>
      <TopBar title={data.settings.gaztetxeName || 'Gaztetxea'} />
      <div className="page">
        {notice && <div className="notice">{notice}</div>}
        <StatusNotice />
        {data.products.length === 0 && (
          <div className="card empty"><b>Ez dago produkturik oraindik</b>Gehitu lehena Ezarpenak → Produktuak atalean, edo kargatu babeskopia bat Ezarpenak → Datuak atalean.</div>
        )}

        <div className="btns">
          {open ? (
            <button className="btn lg primary" onClick={() => go({ name: 'count', sessionId: open.id })}>
              <IconBox /> Inbentarioarekin jarraitu
              <span className="num small">{Object.values(open.lines).filter(l => l.counted).length}/{active.length}</span>
            </button>
          ) : (
            <button className="btn lg primary" onClick={() => go({ name: 'inventory' })}><IconBox /> Inbentarioa egin</button>
          )}
          <button className="btn lg" onClick={() => go({ name: 'order' })}><IconCart /> Eskaera egin</button>
        </div>

        {data.orders.filter(o => o.status === 'enviado').map(o => (
          <button key={o.id} className="notice info" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => go({ name: 'order' })}>
            Bidalitako eskaera iristeko{o.neededBy ? ` (${shortDate(o.neededBy)})` : ''}. Iristean, sakatu eta zenbatu.
          </button>
        ))}

        <div className="card">
          <h2>Stocka</h2>
          {stock.counted === 0 ? <p className="muted small" style={{ margin: 0 }}>Egin lehen inbentarioa stockaren balioa ikusteko.</p> : (
            <div className="kv">
              <div><div className="k">Balioa, erosketa-prezioan</div><div className="v big">{euro(stock.cost)}</div></div>
            </div>
          )}
          {stock.missingCost > 0 && <p className="small muted" style={{ marginBottom: 0 }}>{stock.missingCost} produktuk ez dute erosketa-preziorik.</p>}
        </div>

        <div className="card">
          <h2>Azken ekitaldia</h2>
          {!last ? <p className="muted small" style={{ margin: 0 }}>Ez dago itxitako inbentariorik.</p> : (
            <>
              <div className="small muted" style={{ marginBottom: 8 }}>{last.eventName || last.eventType} · {fmtDate(last.date)}</div>
              {lastSum?.previous ? (
                <div className="kv">
                  <div><div className="k">Kontsumoa (kostua)</div><div className="v">{euro(lastSum.consumptionCost)}</div></div>
                  <div><div className="k">Kontsumoa (ud.)</div><div className="v">{lastSum.consumptionUnits.toLocaleString('es-ES', { maximumFractionDigits: 1 })}</div></div>
                </div>
              ) : <p className="small muted" style={{ margin: 0 }}>Lehen inbentarioa da: kontsumoa hurrengotik aurrera kalkulatzen da.</p>}
              <button className="btn sm" style={{ marginTop: 10 }} onClick={() => go({ name: 'invDone', sessionId: last.id })}>Zenbaketa ikusi</button>
            </>
          )}
        </div>

        <div className="card">
          <h2>Eskaera</h2>
          <div className="kv">
            <div><div className="k">Eskatzeko produktuak</div><div className="v">{toOrder.length}</div></div>
            <div><div className="k">Kostu estimatua</div><div className="v">{euro(cost.products)}</div></div>
          </div>
        </div>

        {tbc > 0 && (
          <button className="notice" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => go({ name: 'products' })}>
            <span className="badge tbc">Berretsi gabe</span> {tbc} produktuk berretsi gabeko datuak dituzte (erosketa-prezioa, formatua…). Sakatu berrikusteko.
          </button>
        )}
      </div>
    </>
  );
}
