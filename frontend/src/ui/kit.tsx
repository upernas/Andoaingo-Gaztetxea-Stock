import { ReactNode, useEffect, useState } from 'react';
import { useApp } from '../state';
import { IconBack, IconX } from './icons';

export function SyncChip() {
  const { status } = useApp();
  const txt = {
    saved: 'Gordeta',
    saving: 'Gordetzen…',
    offline: `Konexiorik gabe${status.pending ? ` · ${status.pending} zain` : ''}`,
    login: 'Sartu behar da',
    error: 'Errorea gordetzean',
  }[status.state];
  return <span className={'sync ' + status.state} title={status.message} role="status">{txt}</span>;
}

export function TopBar({ title, back = false, right }: { title: string; back?: boolean; right?: ReactNode }) {
  const app = useApp();
  return (
    <header className="top">
      {back && <button className="iconbtn" aria-label="Atzera" onClick={app.back}><IconBack /></button>}
      <h1>{title}</h1>
      {right}
      <SyncChip />
    </header>
  );
}

export function StatusNotice() {
  const { status, go } = useApp();
  if (status.state === 'offline') return <div className="notice">Konexiorik gabe: {status.pending} aldaketa bidaltzeko zain. Konexioa itzultzean bakarrik bidaliko dira.</div>;
  if (status.state === 'login') return <div className="notice">{status.message} <button className="btn sm" onClick={() => go({ name: 'dataSettings' })}>Pasahitza sartu</button></div>;
  if (status.state === 'error') return <div className="notice bad">{status.message ?? 'Ezin izan da gorde'}</div>;
  return null;
}

export function Tbc({ show = true }: { show?: boolean }) {
  return show ? <span className="badge tbc">Berretsi gabe</span> : null;
}

export function Swatch({ color, tall }: { color: string; tall?: boolean }) {
  return <span className={'sw' + (tall ? ' tall' : '')} style={{ background: color }} aria-hidden />;
}

export function Sheet({ title, onClose, children }: { title: string; onClose(): void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={title} onClick={e => e.stopPropagation()}>
        <div className="spread"><h3>{title}</h3><button className="iconbtn" aria-label="Itxi" onClick={onClose}><IconX /></button></div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmSheet({ title, text, ok, danger, onOk, onClose }: {
  title: string; text: ReactNode; ok: string; danger?: boolean; onOk(): void; onClose(): void;
}) {
  return (
    <Sheet title={title} onClose={onClose}>
      <div>{text}</div>
      <div className="btns two">
        <button className="btn" onClick={onClose}>Utzi</button>
        <button className={'btn ' + (danger ? 'danger' : 'primary')} onClick={() => { onOk(); onClose(); }}>{ok}</button>
      </div>
    </Sheet>
  );
}

/** eremu numerikoa: hutsik = null, koma hamartarra onartzen du */
export function NumField({ id, label, value, onChange, tbc, suffix, hint, placeholder }: {
  id: string; label: ReactNode; value: number | null; onChange(v: number | null): void; tbc?: boolean;
  suffix?: string; hint?: ReactNode; placeholder?: string;
}) {
  const [txt, setTxt] = useState(value == null ? '' : String(value).replace('.', ','));
  useEffect(() => {
    const parsed = txt.trim() === '' ? null : Number(txt.replace(',', '.'));
    if (parsed !== value && !(parsed != null && isNaN(parsed))) setTxt(value == null ? '' : String(value).replace('.', ','));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <div className="field">
      <label htmlFor={id}>{label}{suffix ? <span>({suffix})</span> : null}<Tbc show={!!tbc} /></label>
      <input
        id={id} className={'input num' + (tbc ? ' tbc' : '')} inputMode="decimal" value={txt}
        placeholder={placeholder ?? (tbc ? 'BERRETSI GABE' : '')}
        onChange={e => {
          const t = e.target.value;
          setTxt(t);
          if (t.trim() === '') onChange(null);
          else { const n = Number(t.replace(',', '.')); if (!isNaN(n)) onChange(n); }
        }}
      />
      {hint && <div className="small muted">{hint}</div>}
    </div>
  );
}

export function TextField({ id, label, value, onChange, tbc, placeholder, type = 'text' }: {
  id: string; label: ReactNode; value: string; onChange(v: string): void; tbc?: boolean; placeholder?: string; type?: string;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}<Tbc show={!!tbc} /></label>
      <input id={id} type={type} className={'input' + (tbc ? ' tbc' : '')} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
    </div>
  );
}

export function Toast() {
  const { toastMsg } = useApp();
  return toastMsg ? <div className="toast" role="status">{toastMsg}</div> : null;
}

export function fmtDate(iso: string, withTime = false) {
  const d = new Date(iso);
  if (isNaN(+d)) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}` + (withTime ? ` ${p(d.getHours())}:${p(d.getMinutes())}` : '');
}

export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* jarraitu */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch { return false; }
}
