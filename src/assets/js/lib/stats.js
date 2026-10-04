// Расчёт статистики для админ-панели. Общий код для сервера и демо-режима.

const DAY = 86_400_000;

export function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * events: [{ type, visitorId, ts, path, source, device, productId }]
 * orders: [{ number, createdAt, total, items, visitorId, status }]
 * firstVisits: Map visitorId -> first_visit event (за всё время, для «пути покупателя»)
 */
export function computeStats({ events, orders, days = 30, now = Date.now(), firstVisits }) {
  const from = new Date(now - (days - 1) * DAY); from.setHours(0, 0, 0, 0);
  const since = from.getTime();
  const ev = events.filter(e => e.ts >= since);
  const ord = orders.filter(o => o.createdAt >= since && o.status !== 'cancelled');

  const uniq = (type) => new Set(ev.filter(e => e.type === type).map(e => e.visitorId));
  const visitors = uniq('first_visit');
  const active = new Set(ev.map(e => e.visitorId));
  const carted = uniq('add_to_cart');
  const checkout = uniq('checkout_start');
  const purchasers = new Set(ord.map(o => o.visitorId).filter(Boolean));
  const revenue = ord.reduce((s, o) => s + o.total, 0);

  const byDayMap = new Map();
  for (let t = since; t <= now; t += DAY) byDayMap.set(dayKey(t), { date: dayKey(t), visitors: 0, views: 0, orders: 0, revenue: 0 });
  for (const e of ev) {
    const row = byDayMap.get(dayKey(e.ts)); if (!row) continue;
    if (e.type === 'first_visit') row.visitors++;
    if (e.type === 'page_view') row.views++;
  }
  for (const o of ord) {
    const row = byDayMap.get(dayKey(o.createdAt)); if (!row) continue;
    row.orders++; row.revenue += o.total;
  }

  const fv = firstVisits || new Map(events.filter(e => e.type === 'first_visit').map(e => [e.visitorId, e]));
  const sourceMap = new Map();
  for (const e of ev.filter(x => x.type === 'first_visit')) {
    const s = sourceMap.get(e.source || 'direct') || { source: e.source || 'direct', visitors: 0, orders: 0, revenue: 0 };
    s.visitors++; sourceMap.set(s.source, s);
  }
  for (const o of ord) {
    const first = o.visitorId && fv.get(o.visitorId);
    const key = first ? (first.source || 'direct') : 'неизвестно';
    const s = sourceMap.get(key) || { source: key, visitors: 0, orders: 0, revenue: 0 };
    s.orders++; s.revenue += o.total; sourceMap.set(key, s);
  }

  const deviceMap = {};
  for (const e of ev.filter(x => x.type === 'first_visit')) deviceMap[e.device || 'desktop'] = (deviceMap[e.device || 'desktop'] || 0) + 1;

  const prod = new Map();
  for (const o of ord) for (const i of o.items) {
    const p = prod.get(i.id) || { id: i.id, name: i.name, qty: 0, revenue: 0 };
    p.qty += i.qty; p.revenue += i.sum; prod.set(i.id, p);
  }

  const journeys = orders.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, 25).map(o => {
    const first = o.visitorId && fv.get(o.visitorId);
    return {
      number: o.number,
      createdAt: o.createdAt,
      total: o.total,
      status: o.status,
      firstVisitAt: first ? first.ts : null,
      source: first ? first.source : null,
      landing: first ? first.path : null,
      minutesToPurchase: first ? Math.max(0, Math.round((o.createdAt - first.ts) / 60000)) : null,
    };
  });
  const mins = journeys.map(j => j.minutesToPurchase).filter(v => v !== null).sort((a, b) => a - b);

  return {
    period: { days, from: since, to: now },
    totals: {
      visitors: visitors.size,
      activeVisitors: active.size,
      pageViews: ev.filter(e => e.type === 'page_view').length,
      addToCart: carted.size,
      checkoutStart: checkout.size,
      orders: ord.length,
      purchasers: purchasers.size,
      revenue,
      avgCheck: ord.length ? Math.round(revenue / ord.length) : 0,
      conversion: visitors.size ? Math.round((purchasers.size / visitors.size) * 1000) / 10 : 0,
      medianMinutesToPurchase: mins.length ? mins[Math.floor(mins.length / 2)] : null,
    },
    funnel: [
      { step: 'Первый визит', value: visitors.size },
      { step: 'Добавили в корзину', value: carted.size },
      { step: 'Начали оформление', value: checkout.size },
      { step: 'Купили', value: purchasers.size },
    ],
    byDay: [...byDayMap.values()],
    sources: [...sourceMap.values()].sort((a, b) => b.visitors - a.visitors).slice(0, 10),
    devices: deviceMap,
    topProducts: [...prod.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10),
    journeys,
  };
}
