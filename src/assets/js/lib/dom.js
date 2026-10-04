// Безопасные помощники для работы с DOM. Пользовательские данные выводятся только
// через textContent — innerHTML с данными не используется нигде (защита от XSS).

export const ROOT = document.documentElement.dataset.root || '';

export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

/** h('div', { class: 'x', onclick: fn }, 'текст', childNode) */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'href' || k === 'src') el.setAttribute(k, safeUrl(String(v)));
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/** Запрещает javascript:, vbscript: и прочие опасные схемы в ссылках. */
export function safeUrl(u) {
  const s = u.trim();
  if (/^(data:image\/(png|jpeg|webp);base64,|blob:)/i.test(s)) return s;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s) && !/^(https?:|mailto:|tel:)/i.test(s)) return '#';
  return s;
}

// Иконки — статичная разметка из кода (не пользовательские данные).
const ICONS = {
  cart: '<path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6.2"/><circle cx="10" cy="20" r="1.3"/><circle cx="17" cy="20" r="1.3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  chili: '<path d="M8 4c1 0 2 1 2 2 4 0 8 3 8 8 0 3-3 6-7 6-3 0-6-1-7-3 3 0 6-2 6-6V6"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  send: '<path d="M4 12l16-8-6 16-2-7z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
};

export function icon(name, cls = 'icon') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', cls);
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = ICONS[name] || '';
  return svg;
}

const nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
export const money = (n) => `${nf.format(n)} ₽`;

export function imgSrc(path) {
  if (!path) return `${ROOT}assets/img/favicon.svg`;
  if (path.startsWith('data:') || path.startsWith('blob:')) return path;
  return ROOT + path;
}

export function productUrl(p) {
  return p.hasPage ? `${ROOT}p/${p.id}.html` : `${ROOT}product.html?id=${encodeURIComponent(p.id)}`;
}

export function toast(text, kind = '') {
  let box = $('.toasts');
  if (!box) { box = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.append(box); }
  const t = h('div', { class: `toast ${kind}`, text });
  box.append(t);
  setTimeout(() => t.remove(), 3200);
}

export function fmtDate(ts, withTime = true) {
  return new Date(ts).toLocaleString('ru-RU', withTime
    ? { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function randomHex(bytes) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function storage(kind = 'local') {
  // Обёртка: в приватном режиме доступ к хранилищу может бросать исключение.
  const s = (() => { try { return kind === 'local' ? window.localStorage : window.sessionStorage; } catch { return null; } })();
  return {
    get(k, def = null) { try { const v = s && s.getItem(k); return v === null || v === undefined ? def : JSON.parse(v); } catch { return def; } },
    set(k, v) { try { s && s.setItem(k, JSON.stringify(v)); } catch { /* квота или запрет */ } },
    del(k) { try { s && s.removeItem(k); } catch { /* */ } },
  };
}
export const local = storage('local');
export const session = storage('session');
