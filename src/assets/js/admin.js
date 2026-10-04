// Админ-панель: статистика, товары, заказы, чат поддержки, настройки сайта.
import { $, $$, h, money, imgSrc, toast, fmtDate, ROOT } from './lib/dom.js';
import { getApi, ApiError } from './lib/api.js';
import { CATEGORIES, ORDER_STATUSES, DELIVERY } from './lib/validate.js';

let api;
const app = $('#admin-app');
let chatTimer;

// ---------------------------------------------------------------- вход
async function boot() {
  api = await getApi();
  if (await api.admin.me()) return shell();
  const form = $('#login-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#login-error');
    const btn = $('button', form);
    btn.disabled = true; err.hidden = true;
    try {
      await api.admin.login(form.password.value);
      shell();
    } catch (ex) {
      err.textContent = ex.message || 'Ошибка входа';
      err.hidden = false;
      form.password.select();
    } finally { btn.disabled = false; }
  });
  form.password.focus();
}

function handle(ex) {
  if (ex instanceof ApiError && ex.status === 401) { toast('Сессия истекла, войдите снова', 'err'); setTimeout(() => location.reload(), 900); return; }
  toast(ex.message || 'Ошибка', 'err');
}

// ---------------------------------------------------------------- каркас
const TABS = [['stats', 'Статистика'], ['products', 'Товары'], ['orders', 'Заказы'], ['chat', 'Чат поддержки'], ['settings', 'Настройки']];

function shell() {
  const content = h('main', { class: 'admin-main', id: 'main', tabindex: '-1' });
  const nav = h('nav', { class: 'admin-nav', 'aria-label': 'Разделы' }, ...TABS.map(([id, label]) =>
    h('a', { href: `#${id}`, dataset: { tab: id }, text: label })));
  const chatBadge = h('span', { class: 'admin-badge', hidden: true });
  nav.querySelector('[data-tab="chat"]').append(chatBadge);
  app.replaceChildren(h('div', { class: 'admin' },
    h('aside', { class: 'admin-side' },
      h('a', { class: 'logo', href: `${ROOT}index.html` }, h('span', { class: 'seal', 'aria-hidden': 'true' }, h('span', { text: '好' }), h('span', { text: '吃' })),
        h('span', { class: 'logo-text' }, h('b', { text: 'ХАОЧИ' }), h('small', { text: 'админ-панель' }))),
      nav,
      h('div', { class: 'admin-side-foot' },
        h('span', { class: 'mode-pill', text: api.mode === 'server' ? 'База: SQLite (сервер)' : 'База: IndexedDB (демо)' }),
        h('a', { href: `${ROOT}index.html`, target: '_blank', rel: 'noopener', text: 'Открыть сайт' }),
        h('button', { class: 'link-btn', type: 'button', text: 'Выйти', onclick: async () => { await api.admin.logout(); location.reload(); } }))),
    content));
  const route = () => {
    const tab = TABS.some(([id]) => id === location.hash.slice(1)) ? location.hash.slice(1) : 'stats';
    for (const a of $$('[data-tab]', nav)) a.setAttribute('aria-current', a.dataset.tab === tab ? 'page' : 'false');
    clearInterval(chatTimer);
    ({ stats, products, orders, chat, settings })[tab](content);
  };
  window.addEventListener('hashchange', route);
  route();
  // индикатор непрочитанных сообщений
  const unread = async () => {
    try { const n = (await api.admin.chats()).reduce((s, t) => s + t.unread, 0); chatBadge.textContent = n; chatBadge.hidden = !n; } catch { /* */ }
  };
  unread(); setInterval(unread, 15000);
}

const head = (title, ...actions) => h('div', { class: 'admin-head' }, h('h1', { text: title }), h('div', { class: 'admin-actions' }, ...actions));
const loading = (el) => el.replaceChildren(h('p', { class: 'muted', text: 'Загрузка…' }));

// ---------------------------------------------------------------- статистика
function barChart({ data, value, label, format = (v) => v, title }) {
  const W = 640, H = 220, pad = { l: 36, r: 8, t: 12, b: 26 };
  const max = Math.max(1, ...data.map(value));
  const niceMax = Math.ceil(max / Math.pow(10, Math.floor(Math.log10(max)))) * Math.pow(10, Math.floor(Math.log10(max)));
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'chart');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', title);
  const el = (tag, attrs) => { const e = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + ih - (ih * i) / 4;
    svg.append(el('line', { x1: pad.l, x2: W - pad.r, y1: y, y2: y, class: 'grid' }));
    const t = el('text', { x: pad.l - 6, y: y + 4, 'text-anchor': 'end', class: 'axis' }); t.textContent = Math.round((niceMax * i) / 4); svg.append(t);
  }
  const step = iw / data.length;
  const bw = Math.max(2, Math.min(28, step - 2));
  const tip = h('div', { class: 'chart-tip', hidden: true });
  data.forEach((d, i) => {
    const v = value(d);
    const bh = (v / niceMax) * ih;
    const x = pad.l + i * step + (step - bw) / 2;
    const y = pad.t + ih - bh;
    const r = Math.min(4, bw / 2, bh);
    if (v > 0) svg.append(el('path', { class: 'bar', d: `M${x} ${pad.t + ih}V${y + r}q0 -${r} ${r} -${r}h${bw - 2 * r}q${r} 0 ${r} ${r}V${pad.t + ih}Z` }));
    const hit = el('rect', { x: pad.l + i * step, y: pad.t, width: step, height: ih, class: 'hit' });
    hit.addEventListener('mouseenter', () => {
      tip.hidden = false;
      tip.replaceChildren(h('b', { text: label(d) }), h('span', { text: `${title}: ${format(v)}` }));
      tip.style.left = `${((pad.l + i * step + step / 2) / W) * 100}%`;
    });
    hit.addEventListener('mouseleave', () => { tip.hidden = true; });
    svg.append(hit);
    if (data.length <= 14 || i % Math.ceil(data.length / 8) === 0) {
      const t = el('text', { x: pad.l + i * step + step / 2, y: H - 8, 'text-anchor': 'middle', class: 'axis' }); t.textContent = label(d); svg.append(t);
    }
  });
  svg.append(el('line', { x1: pad.l, x2: W - pad.r, y1: pad.t + ih, y2: pad.t + ih, class: 'baseline' }));
  return h('figure', { class: 'chart-box' }, h('figcaption', { text: title }), h('div', { class: 'chart-wrap' }, svg, tip));
}

function table(headers, rows, cls = '') {
  return h('div', { class: 'table-wrap' }, h('table', { class: `admin-table ${cls}` },
    h('thead', {}, h('tr', {}, ...headers.map(x => h('th', { scope: 'col', text: x })))),
    h('tbody', {}, ...(rows.length ? rows : [h('tr', {}, h('td', { colspan: headers.length, class: 'muted', text: 'Пока нет данных' }))]))));
}
const td = (...c) => h('td', {}, ...c);

const SOURCE_LABELS = { direct: 'Прямые заходы', internal: 'Внутренние', yandex: 'Яндекс', google: 'Google', vk: 'ВКонтакте', telegram: 'Telegram' };
const fmtMinutes = (m) => m === null || m === undefined ? '—' : m < 60 ? `${m} мин` : m < 1440 ? `${Math.floor(m / 60)} ч ${m % 60} мин` : `${Math.floor(m / 1440)} дн ${Math.floor((m % 1440) / 60)} ч`;

async function stats(root, days = 30) {
  loading(root);
  let s;
  try { s = await api.admin.stats(days); } catch (e) { return handle(e); }
  const t = s.totals;
  const period = h('select', { class: 'select select-sm', 'aria-label': 'Период' },
    ...[7, 30, 90].map(d => h('option', { value: d, selected: d === days, text: `${d} дней` })));
  period.addEventListener('change', () => stats(root, Number(period.value)));
  const kpi = (label, value, hint) => h('div', { class: 'kpi' }, h('span', { text: label }), h('b', { text: value }), hint ? h('small', { text: hint }) : null);
  const short = (d) => d.date.slice(8, 10) + '.' + d.date.slice(5, 7);
  const maxFunnel = Math.max(1, s.funnel[0].value);
  root.replaceChildren(
    head('Статистика', period),
    h('p', { class: 'muted', text: 'Учитываются только посетители, давшие согласие на аналитические cookie. Покупка фиксируется на сервере в момент оформления заказа.' }),
    h('div', { class: 'kpis' },
      kpi('Первые визиты', t.visitors, `активных посетителей: ${t.activeVisitors}`),
      kpi('Заказы', t.orders, `покупателей: ${t.purchasers}`),
      kpi('Выручка', money(t.revenue)),
      kpi('Средний чек', money(t.avgCheck)),
      kpi('Конверсия в покупку', `${t.conversion}%`, 'покупатели / первые визиты'),
      kpi('От визита до покупки', fmtMinutes(t.medianMinutesToPurchase), 'медиана')),
    h('div', { class: 'charts' },
      barChart({ data: s.byDay, value: d => d.visitors, label: short, title: 'Первые визиты по дням' }),
      barChart({ data: s.byDay, value: d => d.orders, label: short, title: 'Заказы по дням' })),
    h('div', { class: 'cols' },
      h('section', { class: 'panel' }, h('h2', { text: 'Воронка' }),
        h('div', { class: 'funnel' }, ...s.funnel.map(f => {
          const bar = h('i', {}); bar.style.width = `${(f.value / maxFunnel) * 100}%`;
          return h('div', { class: 'funnel-row' }, h('span', { text: f.step }), h('div', { class: 'funnel-bar' }, bar), h('b', { text: f.value }));
        }))),
      h('section', { class: 'panel' }, h('h2', { text: 'Источники первого визита' }),
        table(['Источник', 'Визиты', 'Заказы', 'Выручка'], s.sources.map(x => h('tr', {}, td(SOURCE_LABELS[x.source] || x.source), td(x.visitors), td(x.orders), td(money(x.revenue)))))),
    ),
    h('section', { class: 'panel' }, h('h2', { text: 'Путь покупателя: первый визит и покупка' }),
      table(['Заказ', 'Первый визит', 'Источник', 'Страница входа', 'Покупка', 'Прошло', 'Сумма'], s.journeys.map(j => h('tr', {},
        td(h('b', { text: j.number })), td(j.firstVisitAt ? fmtDate(j.firstVisitAt) : 'нет согласия'), td(j.source ? (SOURCE_LABELS[j.source] || j.source) : '—'),
        td(h('code', { text: j.landing || '—' })), td(fmtDate(j.createdAt)), td(fmtMinutes(j.minutesToPurchase)), td(money(j.total)))))),
    h('section', { class: 'panel' }, h('h2', { text: 'Популярные товары' }),
      table(['Товар', 'Продано, шт.', 'Выручка'], s.topProducts.map(p => h('tr', {}, td(p.name), td(p.qty), td(money(p.revenue)))))),
    h('details', { class: 'panel' }, h('summary', { text: 'Таблица по дням' }),
      table(['Дата', 'Первые визиты', 'Просмотры', 'Заказы', 'Выручка'], s.byDay.slice().reverse().map(d => h('tr', {}, td(d.date), td(d.visitors), td(d.views), td(d.orders), td(money(d.revenue)))))),
  );
}

// ---------------------------------------------------------------- товары
async function products(root) {
  loading(root);
  let list;
  try { list = await api.admin.products(); } catch (e) { return handle(e); }
  const search = h('input', { class: 'input input-sm', type: 'search', placeholder: 'Поиск по названию', 'aria-label': 'Поиск товара' });
  const body = h('tbody');
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    body.replaceChildren(...list.filter(p => !q || p.name.toLowerCase().includes(q) || p.id.includes(q)).map(p => h('tr', { class: p.active ? '' : 'inactive' },
      td(h('img', { src: imgSrc(p.thumb || p.image), alt: '', width: 48, height: 60, class: 'thumb', loading: 'lazy' })),
      td(h('b', { text: p.name }), h('br'), h('small', { class: 'muted', text: p.id })),
      td(CATEGORIES[p.category] || p.category),
      td(money(p.price), p.oldPrice ? h('small', { class: 'muted', text: ` (было ${money(p.oldPrice)})` }) : null),
      td(h('span', { class: p.stock < 10 ? 'low' : '', text: p.stock })),
      td(p.active ? 'Да' : 'Скрыт'),
      td(h('div', { class: 'row-actions' },
        h('button', { class: 'btn btn-ghost btn-xs', type: 'button', text: 'Изменить', onclick: () => productForm(root, p) }),
        h('button', { class: 'btn btn-danger btn-xs', type: 'button', text: 'Удалить', onclick: async () => {
          if (!confirm(`Удалить товар «${p.name}»? Действие необратимо.`)) return;
          try { await api.admin.deleteProduct(p.id); toast('Товар удалён'); products(root); } catch (e) { handle(e); }
        } }))))));
  };
  search.addEventListener('input', draw);
  root.replaceChildren(
    head('Товары', search, h('button', { class: 'btn btn-primary btn-sm', type: 'button', text: 'Добавить товар', onclick: () => productForm(root, null) })),
    h('p', { class: 'muted', text: `Всего: ${list.length}. Скрытые товары не показываются на сайте.` }),
    h('div', { class: 'table-wrap' }, h('table', { class: 'admin-table' },
      h('thead', {}, h('tr', {}, ...['', 'Название', 'Категория', 'Цена', 'Остаток', 'На сайте', ''].map(x => h('th', { scope: 'col', text: x })))), body)));
  draw();
}

// Сжатие и конвертация картинки в WebP на стороне браузера (макс. 720×900).
function readImage(file) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return reject(new Error('Допустимы только PNG, JPEG и WebP'));
    if (file.size > 8 * 1024 * 1024) return reject(new Error('Файл больше 8 МБ'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 720 / img.width, 900 / img.height);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/webp', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Не удалось прочитать изображение')); };
    img.src = url;
  });
}

function productForm(root, p) {
  const isNew = !p;
  const v = p || { id: '', name: '', cn: '', category: 'snacks', price: '', oldPrice: '', weight: '', badge: '', spicy: 0, stock: 10, description: '', composition: '', storage: '', image: '', active: true };
  let image = v.image;
  const f = (name, label, input) => h('div', { class: `field field-${name}` }, h('label', { for: `pf-${name}`, text: label }), input, h('div', { class: 'field-error', id: `pe-${name}` }));
  const inp = (name, attrs = {}) => h('input', { class: 'input', id: `pf-${name}`, name, value: v[name] ?? '', ...attrs });
  const area = (name, max) => { const t = h('textarea', { class: 'textarea', id: `pf-${name}`, name, maxlength: max }); t.value = v[name] || ''; return t; };
  const preview = h('img', { class: 'preview', alt: 'Изображение товара', src: image ? imgSrc(image) : null, hidden: !image });
  const file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', id: 'pf-image', class: 'input' });
  file.addEventListener('change', async () => {
    if (!file.files[0]) return;
    try { image = await readImage(file.files[0]); preview.src = image; preview.hidden = false; } catch (e) { toast(e.message, 'err'); file.value = ''; }
  });
  const form = h('form', { class: 'product-form', novalidate: true },
    h('div', { class: 'form-grid' },
      f('name', 'Название *', inp('name', { maxlength: 120, required: true })),
      f('id', 'Идентификатор (URL) *', inp('id', { maxlength: 60, pattern: '[a-z0-9-]+', disabled: !isNew, placeholder: 'заполнится из названия' })),
      f('cn', 'Название на китайском', inp('cn', { maxlength: 60, lang: 'zh' })),
      f('category', 'Категория *', h('select', { class: 'select', id: 'pf-category', name: 'category' }, ...Object.entries(CATEGORIES).map(([k, l]) => h('option', { value: k, selected: k === v.category, text: l })))),
      f('price', 'Цена, ₽ *', inp('price', { type: 'number', min: 1, step: '1', required: true })),
      f('oldPrice', 'Старая цена, ₽', inp('oldPrice', { type: 'number', min: 1, step: '1' })),
      f('weight', 'Вес / объём', inp('weight', { maxlength: 30, placeholder: '100 г' })),
      f('stock', 'Остаток, шт. *', inp('stock', { type: 'number', min: 0, step: '1' })),
      f('badge', 'Метка', h('select', { class: 'select', id: 'pf-badge', name: 'badge' }, ...['', 'Хит', 'Новинка', 'Скидка', 'Остро'].map(b => h('option', { value: b, selected: b === v.badge, text: b || 'Без метки' })))),
      f('spicy', 'Острота (0–3)', h('select', { class: 'select', id: 'pf-spicy', name: 'spicy' }, ...[0, 1, 2, 3].map(n => h('option', { value: n, selected: n === v.spicy, text: n })))),
      h('div', { class: 'field full' }, h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'active', checked: v.active }), h('span', { text: 'Показывать на сайте' }))),
      f('description', 'Описание', area('description', 2000)),
      f('composition', 'Состав', area('composition', 1000)),
      f('storage', 'Условия хранения', area('storage', 500)),
      h('div', { class: 'field full' }, h('label', { for: 'pf-image', text: 'Изображение * (PNG, JPEG, WebP — будет сжато до 720×900)' }), file, preview, h('div', { class: 'field-error', id: 'pe-image' }))),
    h('div', { class: 'dialog-actions' },
      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Отмена', onclick: () => dlg.close() }),
      h('button', { class: 'btn btn-primary btn-sm', type: 'submit', text: isNew ? 'Добавить' : 'Сохранить' })));
  for (const name of ['description', 'composition', 'storage']) form.querySelector(`.field-${name}`).classList.add('full');
  const dlg = h('dialog', { class: 'dialog', 'aria-label': isNew ? 'Новый товар' : 'Редактирование товара' },
    h('div', { class: 'dialog-head' }, h('h2', { text: isNew ? 'Новый товар' : `Редактирование: ${v.name}` })), form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    for (const el of $$('.field-error', form)) el.textContent = '';
    const fd = new FormData(form);
    const data = {
      id: isNew ? String(fd.get('id') || '') : v.id, name: fd.get('name'), cn: fd.get('cn'), category: fd.get('category'),
      price: fd.get('price'), oldPrice: fd.get('oldPrice'), weight: fd.get('weight'), stock: fd.get('stock'), badge: fd.get('badge'),
      spicy: fd.get('spicy'), active: fd.get('active') === 'on', description: fd.get('description'), composition: fd.get('composition'),
      storage: fd.get('storage'), image, thumb: image === v.image ? v.thumb : '', photo: v.photo,
    };
    const btn = $('button[type="submit"]', form);
    btn.disabled = true;
    try {
      await api.admin.saveProduct(data, isNew);
      toast(isNew ? 'Товар добавлен' : 'Изменения сохранены');
      dlg.close();
      products(root);
    } catch (ex) {
      if (ex instanceof ApiError && Object.keys(ex.errors).length) for (const [k, m] of Object.entries(ex.errors)) { const el = $(`#pe-${k}`, form); if (el) el.textContent = m; }
      handle(ex);
    } finally { btn.disabled = false; }
  });
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
}

// ---------------------------------------------------------------- заказы
async function orders(root) {
  loading(root);
  let list;
  try { list = await api.admin.orders(); } catch (e) { return handle(e); }
  const filter = h('select', { class: 'select select-sm', 'aria-label': 'Статус' }, h('option', { value: '', text: 'Все статусы' }),
    ...Object.entries(ORDER_STATUSES).map(([k, l]) => h('option', { value: k, text: l })));
  const body = h('div', { class: 'orders' });
  const draw = () => {
    const rows = list.filter(o => !filter.value || o.status === filter.value);
    body.replaceChildren(...(rows.length ? rows.map(o => {
      const sel = h('select', { class: 'select select-sm', 'aria-label': `Статус заказа ${o.number}` }, ...Object.entries(ORDER_STATUSES).map(([k, l]) => h('option', { value: k, selected: k === o.status, text: l })));
      sel.addEventListener('change', async () => {
        try { await api.admin.setOrderStatus(o.id, sel.value); o.status = sel.value; toast(`Заказ ${o.number}: ${ORDER_STATUSES[sel.value]}`); } catch (e) { handle(e); sel.value = o.status; }
      });
      return h('details', { class: 'order panel' },
        h('summary', {}, h('b', { text: o.number }), h('span', { class: 'muted', text: fmtDate(o.createdAt) }), h('span', { text: o.customer.name }),
          h('span', { text: money(o.total) }), h('span', { class: `status status-${o.status}`, text: ORDER_STATUSES[o.status] })),
        h('div', { class: 'order-body' },
          h('dl', { class: 'specs' },
            h('dt', { text: 'Телефон' }), h('dd', {}, h('a', { href: `tel:${o.customer.phone.replace(/[^\d+]/g, '')}`, text: o.customer.phone })),
            h('dt', { text: 'E-mail' }), h('dd', {}, h('a', { href: `mailto:${o.customer.email}`, text: o.customer.email })),
            h('dt', { text: 'Доставка' }), h('dd', { text: `${DELIVERY[o.delivery]?.label || o.delivery}: ${o.customer.city}${o.customer.address ? ', ' + o.customer.address : ''}` }),
            h('dt', { text: 'Оплата' }), h('dd', { text: o.payment === 'card' ? 'Картой онлайн' : 'При получении' }),
            o.customer.comment ? [h('dt', { text: 'Комментарий' }), h('dd', { text: o.customer.comment })] : null,
            h('dt', { text: 'Статус' }), h('dd', {}, sel)),
          table(['Товар', 'Цена', 'Кол-во', 'Сумма'], [...o.items.map(i => h('tr', {}, td(i.name), td(money(i.price)), td(i.qty), td(money(i.sum)))),
            h('tr', {}, td('Доставка'), td(''), td(''), td(o.shipping ? money(o.shipping) : 'бесплатно')),
            h('tr', { class: 'total-row' }, td(h('b', { text: 'Итого' })), td(''), td(''), td(h('b', { text: money(o.total) })))])));
    }) : [h('p', { class: 'muted', text: 'Заказов пока нет. Оформите тестовый заказ на сайте.' })]));
  };
  filter.addEventListener('change', draw);
  root.replaceChildren(head('Заказы', filter), body);
  draw();
}

// ---------------------------------------------------------------- чат
async function chat(root, selected) {
  let threads;
  try { threads = await api.admin.chats(); } catch (e) { return handle(e); }
  const list = h('div', { class: 'threads' });
  const log = h('div', { class: 'chat-log admin-log', role: 'log', 'aria-live': 'polite' });
  const input = h('textarea', { class: 'textarea', maxlength: 1000, placeholder: 'Ответ клиенту…', 'aria-label': 'Ответ', rows: 2 });
  const form = h('form', { class: 'chat-form admin-reply' }, input, h('button', { class: 'btn btn-primary btn-sm', type: 'submit', text: 'Отправить' }));
  let current = selected || threads[0]?.id;
  const drawThreads = () => list.replaceChildren(...(threads.length ? threads.map(t => h('button', {
    type: 'button', class: `thread${t.id === current ? ' active' : ''}`, onclick: () => { current = t.id; drawThreads(); openThread(); },
  }, h('b', { text: `Диалог #${t.id.slice(0, 6)}` }), t.unread ? h('span', { class: 'admin-badge', text: t.unread }) : null,
    h('small', { class: 'muted', text: `${fmtDate(t.updatedAt)} · ${t.total} сообщ.` }), h('span', { class: 'thread-last', text: t.lastText.slice(0, 80) }))) : [h('p', { class: 'muted', text: 'Обращений пока нет' })]));
  const drawMessages = (messages) => {
    log.replaceChildren(...messages.map(m => h('div', { class: `msg ${m.author === 'visitor' ? 'bot' : 'visitor'}` },
      h('span', { class: 'who', text: m.author === 'visitor' ? 'Клиент' : m.author === 'bot' ? 'Бот' : 'Вы' }), m.text, h('small', { text: fmtDate(m.ts) }))));
    log.scrollTop = log.scrollHeight;
  };
  async function openThread() {
    if (!current) return;
    try { drawMessages((await api.admin.chat(current)).messages); } catch (e) { handle(e); }
  }
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!current || !input.value.trim()) return;
    try { drawMessages((await api.admin.chatReply(current, input.value)).messages); input.value = ''; } catch (ex) { handle(ex); }
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
  root.replaceChildren(head('Чат поддержки', h('span', { class: 'muted', text: 'Сообщения обновляются автоматически' })),
    h('div', { class: 'chat-admin' }, list, h('div', { class: 'chat-pane panel' }, log, form)));
  drawThreads();
  openThread();
  chatTimer = setInterval(async () => {
    try { threads = await api.admin.chats(); drawThreads(); if (current) drawMessages((await api.admin.chat(current)).messages); } catch { /* */ }
  }, 5000);
}

// ---------------------------------------------------------------- настройки
async function settings(root) {
  loading(root);
  let s;
  try { s = await api.settings(); } catch (e) { return handle(e); }
  const fields = [['announcement', 'Текст в верхней плашке', 160], ['phone', 'Телефон', 30], ['email', 'E-mail', 120], ['address', 'Адрес', 200], ['hours', 'Режим работы', 80], ['freeShippingFrom', 'Бесплатная доставка от, ₽', 6]];
  const form = h('form', { class: 'panel settings-form', novalidate: true },
    h('div', { class: 'form-grid' }, ...fields.map(([k, l, max]) => h('div', { class: `field${k === 'announcement' ? ' full' : ''}` },
      h('label', { for: `sf-${k}`, text: l }), h('input', { class: 'input', id: `sf-${k}`, name: k, maxlength: max, value: s[k] ?? '', type: k === 'freeShippingFrom' ? 'number' : 'text' }),
      h('div', { class: 'field-error', id: `se-${k}` })))),
    h('button', { class: 'btn btn-primary btn-sm mt-14', type: 'submit', text: 'Сохранить' }));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    for (const el of $$('.field-error', form)) el.textContent = '';
    const data = Object.fromEntries(new FormData(form));
    try { await api.admin.saveSettings(data); toast('Настройки сохранены'); } catch (ex) {
      if (ex instanceof ApiError) for (const [k, m] of Object.entries(ex.errors)) { const el = $(`#se-${k}`, form); if (el) el.textContent = m; }
      handle(ex);
    }
  });
  root.replaceChildren(head('Настройки сайта'), h('p', { class: 'muted', text: 'Контакты и тексты применяются на всех страницах сайта без пересборки.' }), form);
}

boot();
