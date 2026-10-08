import { useState } from 'react';
import type { AppData } from '../../../shared/types';
import { flatInventoryLines, normalizeData, toCSV } from '../../../shared/domain';
import { DEFAULT_SETTINGS, seedData } from '../../../shared/seed';
import { getConnection, setConnection, TARGET } from '../data';
import { apiHealth, apiLogin } from '../data/apiStore';
import { useApp } from '../state';
import { ConfirmSheet, copyText, Sheet, TopBar } from '../ui/kit';

export function DataSettings() {
  const { data, store, replaceAll, toast } = useApp();
  const [fallback, setFallback] = useState<{ name: string; content: string } | null>(null);
  const [importing, setImporting] = useState<AppData | null>(null);
  const [reset, setReset] = useState(false);
  const stamp = new Date().toISOString().slice(0, 10);

  async function dl(name: string, content: string, mime: string) {
    const ok = await store.download?.(name, content, mime);
    if (!ok) setFallback({ name, content });
  }
  const csvs: [string, () => Record<string, unknown>[]][] = [
    ['produktuak', () => data.products.map(p => ({ ...p, unconfirmed: p.unconfirmed.join('|') }))],
    ['inbentarioak', () => data.sessions.map(({ lines, ...s }) => s)],
    ['zenbaketak', () => flatInventoryLines(data)],
    ['sarrerak', () => data.purchases as any],
    ['itzulketak', () => data.returns as any],
  ];

  return (
    <>
      <TopBar title="Datuak eta konexioa" back />
      <div className="page">
        <div className="card">
          <h2>Esportatu</h2>
          <p className="small muted" style={{ marginTop: 0 }}>JSONa babeskopia osoa da (berriro inporta daiteke). CSVak Excel-en irekitzen dira.</p>
          <button className="btn primary block" onClick={() => dl(`gaztetxe-stock-${stamp}.json`, JSON.stringify(data, null, 2), 'application/json')}>Dena esportatu (JSON)</button>
          <div className="seg" style={{ marginTop: 10 }}>
            {csvs.map(([n, fn]) => <button key={n} onClick={() => dl(`${n}-${stamp}.csv`, '﻿' + toCSV(fn()), 'text/csv')}>{n}.csv</button>)}
          </div>
        </div>
        <div className="card">
          <h2>Babeskopia berreskuratu</h2>
          <p className="small muted" style={{ marginTop: 0 }}>Uneko datu GUZTIAK fitxategiko datuekin ordezkatzen ditu.</p>
          <label className="btn block">JSON fitxategia aukeratu
            <input type="file" accept="application/json,.json" hidden onChange={async e => {
              const f = e.target.files?.[0]; e.target.value = '';
              if (!f) return;
              try { setImporting(normalizeData(JSON.parse(await f.text()), DEFAULT_SETTINGS)); } catch { toast('Fitxategia ez da baliozko babeskopia'); }
            }} />
          </label>
        </div>
        {TARGET === 'artifact' || store.mode === 'artifact' ? (
          <div className="card">
            <h2>Konexioa</h2>
            <p className="small" style={{ margin: 0 }}>Datuak esteka honen datu-base partekatuan gordetzen dira: sarbidea duten mugikor guztiek gauza bera ikusten dute zuzenean.</p>
          </div>
        ) : <Connection />}
        {store.mode === 'local' && TARGET !== 'artifact' && <button className="btn danger" onClick={() => setReset(true)}>Hasierako datuetara itzuli</button>}
      </div>
      {fallback && (
        <Sheet title={fallback.name} onClose={() => setFallback(null)}>
          <p className="small muted" style={{ margin: 0 }}>Nabigatzaile honek ez du fitxategia deskargatzen uzten. Kopiatu edukia eta gorde testu-fitxategi batean.</p>
          <textarea className="input mono" readOnly value={fallback.content} style={{ minHeight: 220, fontSize: 12 }} />
          <button className="btn primary" onClick={async () => toast((await copyText(fallback.content)) ? 'Kopiatuta' : 'Ezin izan da kopiatu')}>Kopiatu</button>
        </Sheet>
      )}
      {importing && (
        <ConfirmSheet title="Babeskopia berreskuratu" danger ok="Datuak ordezkatu"
          text={`Kopiak ${importing.products.length} produktu eta ${importing.sessions.length} inbentario ditu. Uneko datuak ezabatuko dira.`}
          onClose={() => setImporting(null)} onOk={async () => { await replaceAll(importing); toast('Babeskopia berreskuratuta'); }} />
      )}
      {reset && (
        <ConfirmSheet title="Hasierako datuak" danger ok="Berrezarri" text="Inbentarioak eta aldaketak ezabatuko dira eta hasierako produktuak kargatuko dira."
          onClose={() => setReset(false)} onOk={async () => { await replaceAll(seedData()); toast('Hasierako datuak kargatuta'); }} />
      )}
    </>
  );
}

function Connection() {
  const { store, toast } = useApp();
  const conn = getConnection();
  const [mode, setMode] = useState(conn.mode);
  const [url, setUrl] = useState(conn.url || '/api');
  const [pwd, setPwd] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  async function apply() {
    if (mode === 'local') { setConnection({ mode: 'local', url: '', token: null }); location.reload(); return; }
    setMsg('Egiaztatzen…');
    const h = await apiHealth(url);
    if (!h) { setMsg('Ez da zerbitzaririk aurkitu helbide horretan.'); return; }
    let token: string | null = conn.url === url ? conn.token : null;
    if (h.auth) {
      if (!pwd && !token) { setMsg('Zerbitzariak pasahitza eskatzen du.'); return; }
      if (pwd) { try { token = (await apiLogin(url, pwd)).token; } catch (e: any) { setMsg(e.message); return; } }
    }
    setConnection({ mode: 'api', url, token });
    toast('Konektatuta');
    location.reload();
  }
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h2>Non gordetzen dira datuak</h2>
      <div className="small">Orain: <b>{store.label}</b></div>
      <div className="seg">
        <button className={mode === 'local' ? 'on' : ''} onClick={() => setMode('local')}>Gailu honetan</button>
        <button className={mode === 'api' ? 'on' : ''} onClick={() => setMode('api')}>Gaztetxeko zerbitzaria</button>
      </div>
      {mode === 'api' && (
        <>
          <div className="field"><label htmlFor="c-url">Zerbitzariaren helbidea (API)</label><input id="c-url" className="input" value={url} onChange={e => setUrl(e.target.value)} placeholder="http://192.168.1.50:8080/api" /></div>
          <div className="field"><label htmlFor="c-pwd">Pasahitza</label><input id="c-pwd" type="password" className="input" value={pwd} onChange={e => setPwd(e.target.value)} /></div>
        </>
      )}
      {msg && <div className="small">{msg}</div>}
      <button className="btn primary" onClick={apply}>Konexioa gorde</button>
    </div>
  );
}
