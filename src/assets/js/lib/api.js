// Слой данных. Два режима:
//  - server: сайт запущен через `npm start` — данные в SQLite на сервере (REST API);
//  - demo:   статический хостинг (GitHub Pages) — данные в IndexedDB браузера.
// Интерфейс у обоих адаптеров одинаковый, поэтому интерфейс сайта не знает, где лежат данные.
import { ROOT, session, local, randomHex } from './dom.js';
import { validateOrder, validateProduct, validateEvent, validateSettings, cleanText, botReply, ORDER_STATUSES } from './validate.js';
import { computeStats } from './stats.js';

export class ApiError extends Error {
  constructor(status, message, errors) { super(message); this.status = status; this.errors = errors || {}; }
}

// ---------------- серверный адаптер ----------------
function remoteApi() {
  let csrf = session.get('hc_csrf', '');
  async function call(method, path, body) {
    const res = await fetch(`${ROOT}api/${path}`, {
      method,
      credentials: 'same-origin',
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, data.error || 'Ошибка сервера', data.errors);
    return data;
  }
  return {
    mode: 'server',
    products: () => call('GET', 'products'),
    product: (id) => call('GET', `products/${encodeURIComponent(id)}`).catch(e => { if (e.status === 404) return null; throw e; }),
    settings: () => call('GET', 'settings'),
    createOrder: (o) => call('POST', 'orders', o),
    track: (e) => call('POST', 'events', e).catch(() => null),
    logConsent: (kind, visitorId) => call('POST', 'consents', { kind, visitorId }).catch(() => null),
    chatSend: (token, text, after, website) => call('POST', 'chat', { token, text, after, website }),
    chatFetch: (token, after) => call('GET', `chat?token=${encodeURIComponent(token)}&after=${after}`),
    admin: {
      login: async (password) => { const r = await call('POST', 'admin/login', { password }); csrf = r.csrf; session.set('hc_csrf', csrf); return r; },
      logout: async () => { await call('POST', 'admin/logout', {}).catch(() => null); csrf = ''; session.del('hc_csrf'); },
      me: async () => { try { const r = await call('GET', 'admin/me'); csrf = r.csrf; session.set('hc_csrf', csrf); return true; } catch { return false; } },
      products: () => call('GET', 'admin/products'),
      saveProduct: (p, isNew) => isNew ? call('POST', 'admin/products', p) : call('PUT', `admin/products/${encodeURIComponent(p.id)}`, p),
      deleteProduct: (id) => call('DELETE', `admin/products/${encodeURIComponent(id)}`),
      orders: () => call('GET', 'admin/orders'),
      setOrderStatus: (id, status) => call('PATCH', `admin/orders/${id}`, { status }),
      stats: (days) => call('GET', `admin/stats?days=${days}`),
      chats: () => call('GET', 'admin/chats'),
      chat: (id) => call('GET', `admin/chats/${id}`),
      chatReply: (id, text) => call('POST', `admin/chats/${id}`, { text }),
      saveSettings: (s) => call('PUT', 'admin/settings', s),
    },
  };
}

// ---------------- IndexedDB (демо-режим) ----------------
function kvStore() {
  let dbp;
  const mem = new Map();
  const open = () => dbp || (dbp = new Promise((resolve) => {
    try {
      const req = indexedDB.open('haochi', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  }));
  return {
    async get(key, def) {
      const db = await open();
      if (!db) return mem.has(key) ? structuredClone(mem.get(key)) : def;
      return new Promise((resolve) => {
        const r = db.transaction('kv').objectStore('kv').get(key);
        r.onsuccess = () => resolve(r.result === undefined ? def : r.result);
        r.onerror = () => resolve(def);
      });
    },
    async set(key, value) {
      const db = await open();
      if (!db) { mem.set(key, structuredClone(value)); return; }
      return new Promise((resolve, reject) => {
        const tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },
  };
}

// Хеш демо-пароля вычисляется при сборке (PBKDF2-SHA256). Сам пароль в коде не хранится.
/* global __DEMO_AUTH__ */
const DEMO_AUTH = typeof __DEMO_AUTH__ !== 'undefined' ? __DEMO_AUTH__ : { salt: '', hash: '', iterations: 1 };

async function pbkdf2(password, saltHex, iterations) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const salt = new Uint8Array(saltHex.match(/../g).map(x => parseInt(x, 16)));
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function localApi() {
  const kv = kvStore();
  const bc = 'BroadcastChannel' in window ? new BroadcastChannel('haochi') : null;
  const notify = (topic) => { try { bc && bc.postMessage(topic); } catch { /* */ } };
  // Все операции «прочитать-изменить-записать» сериализуются (в том числе между вкладками через Web Locks),
  // иначе параллельные события затирали бы друг друга.
  let chain = Promise.resolve();
  const locked = (fn) => (navigator.locks ? navigator.locks.request('haochi-db', fn) : (chain = chain.then(fn, fn)));
  let seeded;

  async function products() {
    if (!seeded) seeded = locked(async () => {
      if (!(await kv.get('products'))) {
        const res = await fetch(`${ROOT}data/products.json`);
        await kv.set('products', await res.json());
      }
      return true;
    }).catch((e) => { seeded = null; throw e; });
    await seeded;
    return kv.get('products', []);
  }
  async function settings() {
    let s = await kv.get('settings');
    if (!s) { s = await fetch(`${ROOT}data/site.json`).then(r => r.json()).then(j => j.settings); await kv.set('settings', s); }
    return s;
  }
  const isAdmin = () => (session.get('hc_demo_admin', 0) || 0) > Date.now();
  const guard = () => { if (!isAdmin()) throw new ApiError(401, 'Требуется вход'); };

  async function addEventRaw(e) {
    const events = await kv.get('events', []);
    if (e.type === 'first_visit' && events.some(x => x.type === 'first_visit' && x.visitorId === e.visitorId)) return;
    events.push({ ...e, ts: e.ts || Date.now() });
    await kv.set('events', events.slice(-20000));
  }
  const addEvent = (e) => locked(() => addEventRaw(e));

  async function chatThreads() { return kv.get('chats', {}); }

  return {
    mode: 'demo',
    onChange: (fn) => bc && bc.addEventListener('message', (e) => fn(e.data)),
    products: async () => (await products()).filter(p => p.active),
    product: async (id) => (await products()).find(p => p.id === id && p.active) || null,
    settings,
    createOrder(input) { return products().then(() => locked(() => this._createOrder(input))); },
    async _createOrder(input) {
      const list = await products();
      const s = await settings();
      const v = validateOrder(input, new Map(list.map(p => [p.id, p])), { freeShippingFrom: s.freeShippingFrom ?? 2500 });
      if (!v.ok) throw new ApiError(422, 'Проверьте данные заказа', v.errors);
      for (const it of v.value.items) list.find(p => p.id === it.id).stock -= it.qty;
      const orders = await kv.get('orders', []);
      let number;
      do { number = 'HC-' + String(100000 + Math.floor(Math.random() * 900000)); } while (orders.some(o => o.number === number));
      const order = { id: orders.length + 1, number, createdAt: Date.now(), status: 'new', ...v.value };
      orders.push(order);
      await kv.set('products', list);
      await kv.set('orders', orders);
      if (order.visitorId) await addEventRaw({ type: 'purchase', visitorId: order.visitorId, path: '/checkout' });
      notify('orders'); notify('products');
      return { number, total: order.total };
    },
    track: async (e) => { const v = validateEvent(e); if (v) await addEvent(v); },
    logConsent: (kind, visitorId) => locked(async () => {
      const log = await kv.get('consents', []);
      log.push({ kind, visitorId, ts: Date.now() });
      await kv.set('consents', log.slice(-1000));
    }),
    chatSend(token, text, after = 0, website = '') { return locked(() => this._chatSend(token, text, after, website)); },
    async _chatSend(token, text, after = 0, website = '') {
      if (cleanText(website, 50)) throw new ApiError(422, 'Сообщение отклонено');
      const msg = cleanText(text, 1000);
      if (!msg) throw new ApiError(422, 'Пустое сообщение');
      const threads = await chatThreads();
      if (!token || !threads[token]) {
        token = randomHex(24);
        threads[token] = { id: randomHex(6), createdAt: Date.now(), updatedAt: Date.now(), unread: 0, lastGeneric: 0, seq: 0, messages: [] };
      }
      const t = threads[token];
      const push = (author, txt) => t.messages.push({ id: ++t.seq, author, text: txt, ts: Date.now() });
      push('visitor', msg); t.unread++; t.updatedAt = Date.now();
      const reply = botReply(msg);
      const s = await settings();
      if (reply) push('bot', reply);
      else if (Date.now() - t.lastGeneric > 10 * 60_000) { push('bot', `Спасибо за сообщение! Оператор ответит в ближайшее время (${s.hours || 'ежедневно 9:00–21:00'}).`); t.lastGeneric = Date.now(); }
      await kv.set('chats', threads);
      notify('chats');
      return { token, messages: t.messages.filter(m => m.id > after) };
    },
    async chatFetch(token, after = 0) {
      const t = (await chatThreads())[token];
      return { messages: t ? t.messages.filter(m => m.id > after) : [] };
    },
    admin: {
      async login(password) {
        const f = local.get('hc_demo_fails', { count: 0, until: 0 });
        if (f.until > Date.now()) throw new ApiError(429, `Слишком много попыток. Повторите через ${Math.ceil((f.until - Date.now()) / 60000)} мин.`);
        const hash = await pbkdf2(String(password).slice(0, 200), DEMO_AUTH.salt, DEMO_AUTH.iterations);
        if (hash !== DEMO_AUTH.hash) {
          f.count++;
          if (f.count >= 5) { f.until = Date.now() + 5 * 60_000; f.count = 0; }
          local.set('hc_demo_fails', f);
          await new Promise(r => setTimeout(r, 400));
          throw new ApiError(401, 'Неверный пароль');
        }
        local.del('hc_demo_fails');
        session.set('hc_demo_admin', Date.now() + 2 * 3600_000);
        return { ok: true };
      },
      logout: async () => session.del('hc_demo_admin'),
      me: async () => isAdmin(),
      products: async () => { guard(); return products(); },
      saveProduct(p, isNew) { return products().then(() => locked(() => this._saveProduct(p, isNew))); },
      async _saveProduct(p, isNew) {
        guard();
        const list = await products();
        const v = validateProduct(p, { existingIds: list.map(x => x.id), isNew });
        if (!v.ok) throw new ApiError(422, 'Проверьте поля товара', v.errors);
        if (isNew) list.push({ ...v.value, hasPage: false });
        else {
          const i = list.findIndex(x => x.id === v.value.id);
          if (i < 0) throw new ApiError(404, 'Товар не найден');
          const thumb = v.value.image === list[i].image ? list[i].thumb : '';
          list[i] = { ...list[i], ...v.value, thumb };
        }
        await kv.set('products', list);
        notify('products');
        return list.find(x => x.id === v.value.id);
      },
      deleteProduct(id) { return products().then(() => locked(() => this._deleteProduct(id))); },
      async _deleteProduct(id) {
        guard();
        const list = await products();
        await kv.set('products', list.filter(p => p.id !== id));
        notify('products');
        return { ok: true };
      },
      orders: async () => { guard(); return (await kv.get('orders', [])).slice().sort((a, b) => b.createdAt - a.createdAt); },
      setOrderStatus(id, status) { return locked(() => this._setOrderStatus(id, status)); },
      async _setOrderStatus(id, status) {
        guard();
        if (!ORDER_STATUSES[status]) throw new ApiError(422, 'Некорректный статус');
        const orders = await kv.get('orders', []);
        const o = orders.find(x => x.id === id);
        if (!o) throw new ApiError(404, 'Заказ не найден');
        o.status = status;
        await kv.set('orders', orders);
        return { ok: true };
      },
      async stats(days) {
        guard();
        return computeStats({ events: await kv.get('events', []), orders: await kv.get('orders', []), days });
      },
      async chats() {
        guard();
        return Object.values(await chatThreads()).map(t => ({
          id: t.id, createdAt: t.createdAt, updatedAt: t.updatedAt, unread: t.unread, total: t.messages.length,
          lastText: t.messages.length ? t.messages[t.messages.length - 1].text : '',
        })).sort((a, b) => b.updatedAt - a.updatedAt);
      },
      chat(id) { return locked(() => this._chat(id)); },
      async _chat(id) {
        guard();
        const threads = await chatThreads();
        const t = Object.values(threads).find(x => x.id === id);
        if (!t) throw new ApiError(404, 'Диалог не найден');
        t.unread = 0; await kv.set('chats', threads);
        return { messages: t.messages };
      },
      chatReply(id, text) { return locked(() => this._chatReply(id, text)); },
      async _chatReply(id, text) {
        guard();
        const msg = cleanText(text, 1000);
        if (!msg) throw new ApiError(422, 'Пустое сообщение');
        const threads = await chatThreads();
        const t = Object.values(threads).find(x => x.id === id);
        if (!t) throw new ApiError(404, 'Диалог не найден');
        t.messages.push({ id: ++t.seq, author: 'admin', text: msg, ts: Date.now() });
        t.updatedAt = Date.now();
        await kv.set('chats', threads);
        notify('chats');
        return { messages: t.messages };
      },
      saveSettings(s) { return locked(() => this._saveSettings(s)); },
      async _saveSettings(s) {
        guard();
        const v = validateSettings(s);
        if (!v.ok) throw new ApiError(422, 'Проверьте настройки', v.errors);
        await kv.set('settings', v.value);
        notify('settings');
        return v.value;
      },
    },
  };
}

// ---------------- выбор режима ----------------
let apiPromise;
export function getApi() {
  if (apiPromise) return apiPromise;
  apiPromise = (async () => {
    const cached = session.get('hc_mode');
    if (cached === 'server') return remoteApi();
    if (cached === 'demo') return localApi();
    let mode = 'demo';
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 1500);
      const res = await fetch(`${ROOT}api/health`, { signal: ctl.signal, cache: 'no-store' });
      clearTimeout(timer);
      if (res.ok && (await res.json()).mode === 'server') mode = 'server';
    } catch { /* статический хостинг */ }
    session.set('hc_mode', mode);
    return mode === 'server' ? remoteApi() : localApi();
  })();
  return apiPromise;
}
