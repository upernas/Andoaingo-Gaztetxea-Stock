import { useMemo } from 'react';
import { closedSessions, consumptionHistory, consumptionStats, euro, num, round2, sessionSummary, stockValueNow } from '../../../shared/domain';
import { useApp } from '../state';
import { fmtDate, Swatch, TopBar } from '../ui/kit';

export function Stats() {
  const { data, go } = useApp();
  const history = useMemo(() => consumptionHistory(data), [data]);
  const stats = useMemo(() => consumptionStats(data, data.settings, history), [data, history]);
  const stock = useMemo(() => stockValueNow(data), [data]);
  const top = stats.filter(s => s.n > 0).map(s => {
    const total = s.values.reduce((a, b) => a + b, 0);
    return { ...s, total, cost: total * (s.product.purchasePrice ?? 0) };
  }).sort((a, b) => b.cost - a.cost || b.total - a.total).slice(0, 10);
  const maxCost = Math.max(1, ...top.map(t => t.cost));

  // ekitaldi motaren araberako kontsumoa (iragarpenaren oinarria)
  const byType = useMemo(() => {
    const m = new Map<string, { n: number; cost: number; units: number }>();
    for (const h of history) {
      const e = m.get(h.session.eventType) ?? { n: 0, cost: 0, units: 0 };
      e.n++; e.cost += h.consumptionCost; e.units += h.consumptionUnits;
      m.set(h.session.eventType, e);
    }
    return [...m.entries()];
  }, [history]);

  const purchasesTotal = round2(data.purchases.reduce((s, p) => s + (p.total ?? 0), 0));
  const refunds = round2(data.returns.reduce((s, r) => s + r.totalRefund, 0));
  const sessions = closedSessions(data).slice().reverse();

  return (
    <>
      <TopBar title="Estatistikak" />
      <div className="page">
        <div className="card">
          <h2>Stockaren balioa</h2>
          <div className="kv">
            <div><div className="k">Erosketa-prezioan</div><div className="v">{euro(stock.cost)}</div></div>
          </div>
        </div>

        <div className="card">
          <h2>Gehien kontsumitutakoak</h2>
          {top.length === 0 ? <p className="muted small" style={{ margin: 0 }}>Bigarren inbentariotik aurrera agertzen dira.</p> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {top.map((t, i) => (
                <div key={t.product.id}>
                  <div className="spread small"><span className="row"><span className="num muted">{i + 1}.</span><Swatch color={t.product.color} />{t.product.name}</span><span className="num">{num(t.total, 1)} · {euro(t.cost)}</span></div>
                  <div className="bar" style={{ width: `${(t.cost / maxCost) * 100}%`, background: t.product.color }} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h2>Ekitaldi motaren arabera</h2>
          {byType.length === 0 ? <p className="muted small" style={{ margin: 0 }}>Daturik ez oraindik.</p> : (
            <div className="tablewrap">
              <table className="t">
                <thead><tr><th>Mota</th><th>Ekitaldiak</th><th>Kostua / ek.</th><th>Ud. / ek.</th></tr></thead>
                <tbody>{byType.map(([t, e]) => <tr key={t}><td>{t}</td><td>{e.n}</td><td>{euro(e.cost / e.n)}</td><td>{num(e.units / e.n, 1)}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <h2>Ekitaldiko batez besteko kontsumoa</h2>
          {history.length === 0 ? <p className="muted small" style={{ margin: 0 }}>Daturik ez oraindik.</p> : (
            <>
              <div className="tablewrap">
                <table className="t">
                  <thead><tr><th>Produktua</th><th>Batez b.</th><th>Min</th><th>Max</th><th>Joera</th><th>Helb. irad.</th></tr></thead>
                  <tbody>
                    {stats.filter(s => s.n).map(s => (
                      <tr key={s.product.id}>
                        <td><Swatch color={s.product.color} />{s.product.name}</td><td><b>{num(s.avg, 1)}</b></td><td>{num(s.min, 1)}</td><td>{num(s.max, 1)}</td>
                        <td>{s.trend === 'sube' ? 'gora' : s.trend === 'baja' ? 'behera' : s.trend === 'estable' ? '=' : ''}</td>
                        <td>{s.suggestedPar ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button className="btn sm" style={{ marginTop: 10 }} onClick={() => go({ name: 'targets' })}>Helburu iradokiak aplikatu</button>
            </>
          )}
        </div>

        <div className="card">
          <h2>Ekitaldiak</h2>
          {sessions.length === 0 ? <p className="muted small" style={{ margin: 0 }}>Inbentariorik ez.</p> : (
            <div className="tablewrap">
              <table className="t">
                <thead><tr><th>Ekitaldia</th><th>Pers.</th><th>Kontsumoa</th><th>Kostua</th></tr></thead>
                <tbody>
                  {sessions.map(s => {
                    const sum = sessionSummary(data, s);
                    return (
                      <tr key={s.id} onClick={() => go({ name: 'invDone', sessionId: s.id })} style={{ cursor: 'pointer' }}>
                        <td>{s.eventName || s.eventType}<div className="small muted">{s.eventType} · {fmtDate(s.date)}</div></td>
                        <td>{s.attendees ?? ''}</td>
                        <td>{sum.previous ? num(sum.consumptionUnits, 1) + ' ud.' : 'hasiera'}</td>
                        <td>{sum.previous ? euro(sum.consumptionCost) : ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <h2>Sarrerak eta itzulketak</h2>
          <div className="kv">
            <div><div className="k">Erosketak guztira</div><div className="v">{euro(purchasesTotal)}</div></div>
            <div><div className="k">Ontziengatik berreskuratua</div><div className="v ok">{euro(refunds)}</div></div>
          </div>
        </div>
      </div>
    </>
  );
}
