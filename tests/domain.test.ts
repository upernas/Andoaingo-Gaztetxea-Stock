// Kalkuluen proba osoa: 1. ekitaldia → 2. ekitaldia → eskaera → mezua.
import { describe, expect, it } from 'vitest';
import { seedData } from '../shared/seed';
import {
  boxBreakdown, buildMessage, consumptionStats, currentStock, emptyOrder, emptySession, inkOn, latestClosed, receiptCheck, lineTotal, newProduct, orderLineFromRec,
  orderTotal, recommend, recommendations, sessionSummary, stockValueNow,
} from '../shared/domain';
import type { AppData, InventoryLine } from '../shared/types';

const L = (quantity: number, partialQuantity = 0, emptyContainers = 0): InventoryLine =>
  ({ quantity, partialQuantity, emptyContainers, counted: true });

function scenario(): AppData {
  const data = seedData();
  const P = (id: string) => data.products.find(p => p.id === id)!;
  Object.assign(P('p-sm'), { parLevel: 100, minStock: 40, salePrice: 1.5, servingsPerUnit: 1 });
  Object.assign(P('p-coca'), { parLevel: 48, salePrice: 2 });
  Object.assign(P('p-agua'), { parLevel: 70 });
  Object.assign(P('p-barcelo'), { parLevel: 6 });
  data.sessions.push(emptySession({
    id: 'e1', date: '2026-10-01T22:00:00.000Z', eventType: 'Kontzertua', status: 'closed',
    lines: { 'p-sm': L(100), 'p-coca': L(60), 'p-agua': L(70), 'p-barcelo': L(4, 0.5), 'p-vino': L(2, 2.3) },
  }));
  data.purchases.push({ id: 'pc1', date: '2026-10-02T10:00:00.000Z', supplierId: null, productId: 'p-coca',
    quantity: 24, unitPrice: 0.53, total: 12.72, orderId: null, invoiceRef: '', notes: '' });
  data.sessions.push(emptySession({
    id: 'e2', date: '2026-10-04T23:30:00.000Z', eventType: 'Reggaeton', status: 'closed',
    lines: { 'p-sm': L(38, 0, 84), 'p-coca': L(12), 'p-agua': L(70), 'p-barcelo': L(2, 0.25), 'p-vino': L(1, 1.3) },
  }));
  return data;
}

describe('kaxa-tamainak (erabiltzaileak emanak)', () => {
  const d = seedData();
  const box = (id: string) => d.products.find(p => p.id === id)!.unitsPerBox;
  it('San Miguel 20 cl eta 0,0 → 30; glutenik gabe eta latak 24; botilak 6; ura 35', () => {
    for (const id of ['p-sm', 'p-sm00']) expect(box(id)).toBe(30);
    for (const id of ['p-smsg', 'p-coca', 'p-kasn', 'p-kasl', 'p-schw']) expect(box(id)).toBe(24);
    for (const id of ['p-barcelo', 'p-seagrams', 'p-beefeater', 'p-absolut', 'p-jd', 'p-plata', 'p-turbo']) expect(box(id)).toBe(6);
    expect(box('p-agua')).toBe(35);
    expect(d.purchases).toHaveLength(0); // fakturen historia kenduta
  });
  it('kaxa banaketa eta kolorearen gaineko testua', () => {
    const sm = d.products.find(p => p.id === 'p-sm')!;
    expect(boxBreakdown(sm, 95)).toBe('3×30 + 5');
    expect(boxBreakdown(sm, 60)).toBe('2×30');
    expect(inkOn('#c8102e')).toBe('#ffffff');
    expect(inkOn('#e2c400')).toBe('#111417');
  });
});

describe('inbentarioa eta kontsumoa', () => {
  const data = scenario();
  const sum = sessionSummary(data, data.sessions.find(s => s.id === 'e2')!);
  const line = (id: string) => sum.lines.find(l => l.product.id === id)!;
  it('ardoa: kaxa itxiak + litro irekiak', () => {
    expect(lineTotal(data.products.find(p => p.id === 'p-vino')!, L(2, 2.3)) * 5).toBeCloseTo(12.3, 6);
  });
  it('kontsumoa = aurrekoa + sarrerak − oraingoa', () => {
    expect(line('p-sm').consumption).toBe(62);
    expect(line('p-coca').consumption).toBe(72);
    expect(line('p-agua').consumption).toBe(0);
    expect(line('p-barcelo').consumption).toBe(2.25);
    expect(line('p-vino').consumption).toBeCloseTo(1.2, 6);
  });
  it('kostua, stocka, ontziak', () => {
    expect(sum.consumptionCost).toBe(96.33);
    expect(sum.estSales).toBe(237);
    expect(sum.margin).toBe(140.67);
    expect(sum.stockCost).toBe(79.02);
    expect(sum.empties).toBe(84);
    expect(sum.refundValue).toBe(7.56);
    expect(stockValueNow(data).cost).toBe(79.02);
  });
});

describe('gomendioa eta biribiltzea', () => {
  it('37 / 100, 24ko kaxak → 3 kaxa', () => {
    const d = seedData();
    const p = newProduct({ id: 'x', parLevel: 100, unitsPerBox: 24, purchaseUnit: 'caja', purchasePrice: 1 });
    d.products.push(p);
    d.sessions.push(emptySession({ id: 's', status: 'closed', lines: { x: L(37) } }));
    expect(recommend(d, p)).toMatchObject({ need: 63, qty: 3 });
  });
  it('helburuaren arabera', () => {
    const data = scenario();
    const rec = (id: string) => recommendations(data).find(r => r.product.id === id)!;
    expect(rec('p-sm')).toMatchObject({ status: 'urgente', need: 62, qty: 3, upu: 30, source: 'helburua' });
    expect(rec('p-coca')).toMatchObject({ status: 'recomendado', need: 36, qty: 2 });
    expect(rec('p-agua').status).toBe('ok');
    expect(rec('p-barcelo')).toMatchObject({ qty: 1, upu: 6 });
    expect(rec('p-tequila').status).toBe('sin-objetivo');
  });
  it('ekitaldi motaren araberako iragarpena', () => {
    const data = scenario();
    const reg = (id: string) => recommendations(data, 'Reggaeton').find(r => r.product.id === id)!;
    // Reggaeton-en San Miguel 62 kontsumitu zen → helburua ⌈62 × 1,25⌉ = 78 → 40 falta → 2 pack (30)
    expect(reg('p-sm')).toMatchObject({ source: 'ekitaldia', basedOn: 1, target: 78, need: 40, qty: 2 });
    expect(reg('p-coca')).toMatchObject({ target: 90, qty: 4 });
    // Tekno-ren daturik ez → helburura jo
    expect(recommendations(data, 'Tekno').find(r => r.product.id === 'p-sm')).toMatchObject({ source: 'helburua', qty: 3 });
  });
  it('sarrera batek stocka igotzen du', () => {
    const data = scenario();
    data.purchases.push({ id: 'r', date: '2026-10-05T10:00:00.000Z', supplierId: null, productId: 'p-sm', quantity: 72,
      unitPrice: null, total: null, orderId: null, invoiceRef: '', notes: '' });
    expect(currentStock(data, data.products.find(p => p.id === 'p-sm')!).units).toBe(110);
  });
});

describe('eskaera eta mezua', () => {
  it('kostua, aldaketak eta mezua euskaraz', () => {
    const data = scenario();
    const lines = recommendations(data).filter(r => r.qty > 0).map(orderLineFromRec);
    lines.find(l => l.productId === 'p-sm')!.quantity = 4;
    lines.push({ productId: 'p-jd', supplierId: null, quantity: 1, purchaseUnit: 'unidad', unitsPerPurchaseUnit: 1,
      unitPrice: 15.78, recommended: 0, manual: true, note: '' });
    lines.push({ productId: 'p-vino', supplierId: null, quantity: 2, purchaseUnit: 'unidad', unitsPerPurchaseUnit: 1,
      unitPrice: null, recommended: 0, manual: true, note: '' });
    const t = orderTotal(data, lines);
    expect(t.products).toBe(Math.round((4 * 14.895 + 2 * 12.72 + 73.02 + 15.78) * 100) / 100);
    expect(t.missing).toBe(1);
    const msg = buildMessage(data, lines, '2026-10-09');
    expect(msg.split('\n')[0]).toBe('Kaixo!');
    expect(msg).toContain('09/10/26 fetxarako hurrengoa behar dugu:');
    expect(msg).toContain('- San Miguel: 4 pack');
    expect(msg).toContain('- Coca-Cola: 2 pack');
    expect(msg).toContain("- Jack Daniel's: 1 ud.");
    expect(msg).toContain('- Ardoa: 2 ud.');
    expect(buildMessage(data, lines)).toContain('Hurrengoa behar dugu:');
    expect(msg).toContain('Eskerrik asko!');
    expect(msg.indexOf('San Miguel')).toBeLessThan(msg.indexOf('Coca-Cola')); // biltegiko ordena
  });
});

describe('eskaeraren harrera', () => {
  it('eskatutakoa vs iritsitakoa', () => {
    const data = scenario();
    const order = emptyOrder({ lines: [
      { productId: 'p-sm', supplierId: null, quantity: 3, purchaseUnit: 'caja', unitsPerPurchaseUnit: 30, unitPrice: 14.895, recommended: 3, manual: false, note: '' },
      { productId: 'p-coca', supplierId: null, quantity: 2, purchaseUnit: 'caja', unitsPerPurchaseUnit: 24, unitPrice: 12.72, recommended: 2, manual: false, note: '' },
    ] });
    const rec = emptySession({ kind: 'reception', orderId: order.id, status: 'closed', date: '2026-10-09T10:00:00.000Z',
      lines: { 'p-sm': L(90), 'p-coca': L(24) } });
    data.sessions.push(rec);
    const r = receiptCheck(data, order, rec);
    expect(r.map(x => [x.product.id, x.ordered, x.received, x.diff])).toEqual([['p-sm', 90, 90, 0], ['p-coca', 48, 24, -24]]);
    // harrera ez da inbentario gisa zenbatzen
    expect(latestClosed(data)!.id).toBe('e2');
  });
});

describe('historiatik ikasi', () => {
  it('helburu iradokia = batez bestekoa × 1,25', () => {
    const data = scenario();
    data.purchases.push({ id: 'p72', date: '2026-10-06T10:00:00.000Z', supplierId: null, productId: 'p-sm', quantity: 72,
      unitPrice: null, total: null, orderId: null, invoiceRef: '', notes: '' });
    data.sessions.push(emptySession({ id: 'e3', date: '2026-10-08T23:00:00.000Z', eventType: 'Tekno', status: 'closed',
      lines: { 'p-sm': L(38 + 72 - 72) } }));
    const st = consumptionStats(data).find(s => s.product.id === 'p-sm')!;
    expect(st.values).toEqual([62, 72]);
    expect(st.suggestedPar).toBe(84);
  });
});
