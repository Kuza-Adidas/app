// Клиентская логика витрины: корзина, каталог, страница товара, оформление заказа,
// cookie-согласие, аналитика (первый визит и покупка) и чат поддержки.
import { $, $$, h, icon, money, imgSrc, productUrl, toast, ROOT, local, session, randomHex, fmtDate } from './lib/dom.js';
import { getApi, ApiError } from './lib/api.js';
import { CATEGORIES, DELIVERY, detectSource, isVisitorId } from './lib/validate.js';

const CONSENT_VERSION = document.documentElement.dataset.docVersion || '1';
const page = document.body.dataset.page;
let api;
let catalog = []; // активные товары
let settings = {};
const byId = () => new Map(catalog.map(p => [p.id, p]));

// =====================================================================
// Корзина
// =====================================================================
const cart = {
  items: local.get('hc_cart', []).filter(i => i && typeof i.id === 'string' && Number.isInteger(i.qty) && i.qty > 0).slice(0, 50),
  save() { local.set('hc_cart', this.items); renderCart(); syncBuyControls(); },
  qty(id) { const it = this.items.find(i => i.id === id); return it ? it.qty : 0; },
  add(id, n = 1) {
    const p = byId().get(id);
    if (!p) return toast('Товар недоступен', 'err');
    const cur = this.qty(id);
    const next = Math.min(cur + n, p.stock, 99);
    if (next <= cur) return toast('Больше нет на складе', 'err');
    if (cur) this.items.find(i => i.id === id).qty = next; else this.items.push({ id, qty: next });
    if (!cur) { toast(`«${p.name}» в корзине`); analytics.track('add_to_cart', { productId: id }); }
    this.save();
  },
  set(id, qty) {
    const p = byId().get(id);
    qty = Math.max(0, Math.min(qty, p ? p.stock : 0, 99));
    if (!qty) this.items = this.items.filter(i => i.id !== id);
    else { const it = this.items.find(i => i.id === id); if (it) it.qty = qty; }
    this.save();
  },
  clear() { this.items = []; this.save(); },
  lines() {
    const m = byId();
    return this.items.map(i => ({ ...i, product: m.get(i.id) })).filter(l => l.product);
  },
  count() { return this.lines().reduce((s, l) => s + l.qty, 0); },
  subtotal() { return this.lines().reduce((s, l) => s + l.qty * l.product.price, 0); },
  // Убираем из корзины то, чего больше нет в каталоге, и подрезаем количество под остаток.
  reconcile() {
    const m = byId();
    const before = JSON.stringify(this.items);
    this.items = this.items.filter(i => m.has(i.id) && m.get(i.id).stock > 0).map(i => ({ id: i.id, qty: Math.min(i.qty, m.get(i.id).stock) }));
    if (JSON.stringify(this.items) !== before) local.set('hc_cart', this.items);
  },
};

function stepper(id, qty, label) {
  return h('div', { class: 'stepper', role: 'group', 'aria-label': label || 'Количество' },
    h('button', { type: 'button', 'aria-label': 'Уменьшить', dataset: { dec: id }, text: '−' }),
    h('output', { 'aria-live': 'polite', text: qty }),
    h('button', { type: 'button', 'aria-label': 'Увеличить', dataset: { inc: id }, text: '+' }));
}

function buyControl(p, big = false) {
  const q = cart.qty(p.id);
  if (q) return stepper(p.id, q, `Количество «${p.name}» в корзине`);
  if (p.stock <= 0) return h('button', { class: big ? 'btn btn-primary' : 'add-btn', type: 'button', disabled: true, text: 'Нет в наличии' });
  return h('button', { class: big ? 'btn btn-primary' : 'add-btn', type: 'button', dataset: { add: p.id }, 'aria-label': `Добавить «${p.name}» в корзину` },
    icon(big ? 'cart' : 'plus'), big ? 'Добавить в корзину' : h('span', { text: 'В корзину' }));
}

function syncBuyControls() {
  const m = byId();
  for (const box of $$('[data-buy]')) {
    const p = m.get(box.dataset.buy);
    if (!p) { box.replaceChildren(h('button', { class: 'add-btn', disabled: true, text: 'Недоступно' })); continue; }
    box.replaceChildren(buyControl(p, box.dataset.big === '1'));
  }
  const count = cart.count();
  for (const el of $$('.cart-count')) { el.textContent = count; el.hidden = count === 0; }
}

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-add],[data-inc],[data-dec],[data-remove],[data-open-cart],[data-close-cart],[data-open-consent]');
  if (!t) return;
  if (t.dataset.add) { flyToCart(t); cart.add(t.dataset.add); }
  else if (t.dataset.inc) cart.add(t.dataset.inc);
  else if (t.dataset.dec) cart.set(t.dataset.dec, cart.qty(t.dataset.dec) - 1);
  else if (t.dataset.remove) cart.set(t.dataset.remove, 0);
  else if ('openCart' in t.dataset) { e.preventDefault(); openDrawer(); }
  else if ('closeCart' in t.dataset) closeDrawer();
  else if ('openConsent' in t.dataset) consent.show(true);
});

// ---------- выезжающая корзина ----------
let lastFocus;
function openDrawer() {
  lastFocus = document.activeElement;
  document.body.classList.add('drawer-open');
  $('#cart-drawer').setAttribute('aria-hidden', 'false');
  $('#cart-drawer').inert = false;
  renderCart();
  setTimeout(() => $('#cart-drawer .icon-btn')?.focus(), 50);
}
function closeDrawer() {
  document.body.classList.remove('drawer-open');
  $('#cart-drawer').setAttribute('aria-hidden', 'true');
  $('#cart-drawer').inert = true;
  lastFocus?.focus?.();
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.body.classList.contains('drawer-open')) closeDrawer(); });

function lineItem(l) {
  return h('div', { class: 'line-item' },
    h('img', { src: imgSrc(l.product.thumb || l.product.image), alt: '', width: 72, height: 90, loading: 'lazy' }),
    h('div', {},
      h('b', {}, h('a', { href: productUrl(l.product), text: l.product.name })),
      h('span', { class: 'muted', text: `${l.product.weight} · ${money(l.product.price)}` }),
      stepper(l.id, l.qty)),
    h('div', {},
      h('div', { text: money(l.qty * l.product.price), class: 'line-sum' }),
      h('button', { class: 'remove', type: 'button', 'aria-label': `Удалить «${l.product.name}»`, dataset: { remove: l.id } }, icon('trash'))));
}

function shippingInfo(subtotal) {
  const free = settings.freeShippingFrom ?? 2500;
  const left = Math.max(0, free - subtotal);
  const wrap = h('div', { class: 'ship-progress' },
    left > 0 ? `До бесплатной доставки осталось ${money(left)}` : 'Доставка бесплатная',
    h('div', { class: 'bar' }, h('i', {})));
  wrap.querySelector('i').style.width = `${Math.min(100, (subtotal / (free || 1)) * 100)}%`;
  return wrap;
}

function renderCart() {
  const body = $('#cart-drawer .drawer-body');
  const foot = $('#cart-drawer .drawer-foot');
  if (!body) return;
  const lines = cart.lines();
  if (!lines.length) {
    body.replaceChildren(h('div', { class: 'empty' }, h('p', { text: 'В корзине пока пусто' }), h('a', { class: 'btn btn-ghost btn-sm', href: `${ROOT}catalog.html`, text: 'Перейти в каталог' })));
    foot.hidden = true;
    return;
  }
  foot.hidden = false;
  body.replaceChildren(...lines.map(lineItem));
  const sub = cart.subtotal();
  foot.replaceChildren(
    shippingInfo(sub),
    h('div', { class: 'totals' }, h('div', { class: 'grand' }, h('span', { text: 'Итого' }), h('span', { text: money(sub) }))),
    h('a', { class: 'btn btn-primary btn-block', href: `${ROOT}checkout.html`, text: 'Оформить заказ' }));
}

// =====================================================================
// Карточки и каталог
// =====================================================================
function spicyEl(level) {
  if (!level) return null;
  const s = h('span', { class: 'spicy', role: 'img', 'aria-label': `Острота ${level} из 3` });
  for (let i = 1; i <= 3; i++) { const ic = icon('chili', i <= level ? '' : 'off'); s.append(ic); }
  return s;
}

function card(p, eager = false) {
  return h('article', { class: 'card', dataset: { cat: p.category, reveal: '' } },
    h('div', { class: 'card-media' }, h('span', { class: 'plate', 'aria-hidden': 'true' }),
      p.badge ? h('span', { class: 'badge', dataset: { kind: p.badge }, text: p.badge }) : null,
      h('img', {
        src: imgSrc(p.thumb || p.image), srcset: p.thumb ? `${imgSrc(p.thumb)} 360w, ${imgSrc(p.image)} 720w` : null,
        sizes: '(max-width: 560px) 46vw, 260px', alt: p.name, width: 360, height: 450, loading: eager ? 'eager' : 'lazy', decoding: 'async',
      })),
    h('div', { class: 'card-body' },
      h('div', { class: 'card-meta' }, h('span', { text: p.weight }), spicyEl(p.spicy)),
      h('h3', { class: 'card-title' }, h('a', { href: productUrl(p), text: p.name })),
      h('div', { class: 'card-foot' },
        h('div', { class: 'price' }, h('b', { text: money(p.price) }), p.oldPrice ? h('s', { text: money(p.oldPrice) }) : null),
        h('div', { dataset: { buy: p.id } }, buyControl(p)))));
}

function selectProducts(filter) {
  const [kind, arg] = filter.split(':');
  if (kind === 'hits') return catalog.filter(p => p.badge === 'Хит' || p.oldPrice).slice(0, 8);
  if (kind === 'new') return catalog.filter(p => p.badge === 'Новинка' || !p.hasPage).concat(catalog.filter(p => ['lychee-soda', 'mochi-taro', 'hawthorn'].includes(p.id))).slice(0, 4);
  if (kind === 'category') return catalog.filter(p => p.category === arg);
  if (kind === 'related') {
    const cur = catalog.find(p => p.id === arg);
    return catalog.filter(p => p.id !== arg && (!cur || p.category === cur.category)).concat(catalog.filter(p => p.id !== arg && cur && p.category !== cur.category)).slice(0, 4);
  }
  return catalog;
}

function renderGrids() {
  for (const grid of $$('[data-grid]')) {
    if (grid.id === 'catalog-grid') continue;
    const list = selectProducts(grid.dataset.grid);
    grid.replaceChildren(...list.map(p => card(p)));
    reveal(grid, true);
  }
}

function initCatalog() {
  const grid = $('#catalog-grid');
  if (!grid) return;
  const params = new URLSearchParams(location.search);
  const state = {
    cat: CATEGORIES[params.get('cat')] ? params.get('cat') : 'all',
    q: (params.get('q') || '').slice(0, 60),
    sort: ['popular', 'price-asc', 'price-desc', 'name'].includes(params.get('sort')) ? params.get('sort') : 'popular',
    stock: params.get('stock') === '1',
  };
  const chips = $('#cat-chips');
  const search = $('#catalog-search');
  const sort = $('#catalog-sort');
  const stock = $('#catalog-stock');
  search.value = state.q; sort.value = state.sort; stock.checked = state.stock;

  function render() {
    for (const c of $$('[data-cat]', chips)) c.setAttribute('aria-current', String(c.dataset.cat === state.cat));
    const q = state.q.trim().toLowerCase();
    let list = catalog.filter(p => (state.cat === 'all' || p.category === state.cat)
      && (!q || `${p.name} ${p.cn} ${p.description}`.toLowerCase().includes(q))
      && (!state.stock || p.stock > 0));
    if (state.sort === 'price-asc') list = list.slice().sort((a, b) => a.price - b.price);
    if (state.sort === 'price-desc') list = list.slice().sort((a, b) => b.price - a.price);
    if (state.sort === 'name') list = list.slice().sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    grid.replaceChildren(...list.map((p, i) => card(p, i < 4)));
    reveal(grid, true);
    $('#catalog-empty').hidden = list.length > 0;
    $('#result-count').textContent = `Найдено товаров: ${list.length}`;
    const title = state.cat === 'all' ? 'Каталог' : CATEGORIES[state.cat];
    $('#catalog-title').textContent = title;
    const u = new URLSearchParams();
    if (state.cat !== 'all') u.set('cat', state.cat);
    if (state.q) u.set('q', state.q);
    if (state.sort !== 'popular') u.set('sort', state.sort);
    if (state.stock) u.set('stock', '1');
    history.replaceState(null, '', `${location.pathname}${u.toString() ? '?' + u : ''}`);
  }
  chips.addEventListener('click', (e) => { const c = e.target.closest('[data-cat]'); if (!c) return; e.preventDefault(); state.cat = c.dataset.cat; render(); });
  let timer;
  search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { state.q = search.value.slice(0, 60); render(); }, 150); });
  sort.addEventListener('change', () => { state.sort = sort.value; render(); });
  stock.addEventListener('change', () => { state.stock = stock.checked; render(); });
  render();
}

// =====================================================================
// Страница товара
// =====================================================================
async function initProduct() {
  const main = $('[data-product-id]');
  if (!main) return;
  let id = main.dataset.productId;
  if (!id) id = new URLSearchParams(location.search).get('id') || '';
  const p = catalog.find(x => x.id === id);
  if (!p) {
    $('#product-root').replaceChildren(h('div', { class: 'empty' },
      h('h1', { text: 'Товар недоступен' }),
      h('p', { text: 'Возможно, он закончился или был снят с продажи.' }),
      h('a', { class: 'btn btn-primary', href: `${ROOT}catalog.html`, text: 'Вернуться в каталог' })));
    return;
  }
  if (!main.dataset.productId) renderDynamicProduct(p);
  // Актуализация цены и наличия (данные могли измениться в админке после сборки).
  $('#p-price').textContent = money(p.price);
  const old = $('#p-old');
  old.textContent = p.oldPrice ? money(p.oldPrice) : '';
  old.hidden = !p.oldPrice;
  const st = $('#p-stock');
  st.textContent = p.stock > 0 ? (p.stock < 10 ? `Осталось ${p.stock} шт.` : 'В наличии') : 'Нет в наличии';
  st.classList.toggle('out', p.stock <= 0);
  for (const [sel, key] of [['#p-name', 'name'], ['#p-desc', 'description'], ['#p-comp', 'composition'], ['#p-storage', 'storage'], ['#p-weight', 'weight']]) {
    const el = $(sel); if (el && p[key]) el.textContent = p[key];
  }
  const img = $('#p-img');
  if (img && !img.getAttribute('src').endsWith(p.image)) { img.removeAttribute('srcset'); img.src = imgSrc(p.image); }
  analytics.track('page_view', { productId: p.id });
}

function renderDynamicProduct(p) {
  document.title = `${p.name} — купить в ХАОЧИ`;
  $('meta[name="description"]')?.setAttribute('content', p.description.slice(0, 160));
  $('#crumb-name').textContent = p.name;
  $('#product-root').replaceChildren(
    h('div', { class: 'product-media', dataset: { cat: p.category } }, h('span', { class: 'plate', 'aria-hidden': 'true' }),
      p.badge ? h('span', { class: 'badge', dataset: { kind: p.badge }, text: p.badge }) : null,
      h('img', { id: 'p-img', src: imgSrc(p.image), alt: p.name, width: 720, height: 900 })),
    h('div', { class: 'product-info' },
      h('h1', { id: 'p-name', text: p.name }),
      p.cn ? h('div', { class: 'cn', lang: 'zh', text: p.cn }) : null,
      spicyEl(p.spicy),
      h('div', { class: 'product-price' }, h('b', { id: 'p-price' }), h('s', { id: 'p-old' })),
      h('div', { class: 'product-buy' }, h('div', { dataset: { buy: p.id, big: '1' } }), h('span', { id: 'p-stock', class: 'stock' })),
      h('p', { id: 'p-desc', text: p.description }),
      h('dl', { class: 'specs' }, h('dt', { text: 'Вес / объём' }), h('dd', { id: 'p-weight', text: p.weight }),
        h('dt', { text: 'Категория' }), h('dd', { text: CATEGORIES[p.category] }), h('dt', { text: 'Страна' }), h('dd', { text: 'Китай' })),
      h('details', { open: true }, h('summary', { text: 'Состав' }), h('p', { id: 'p-comp', text: p.composition || '—' })),
      h('details', {}, h('summary', { text: 'Условия хранения' }), h('p', { id: 'p-storage', text: p.storage || '—' }))));
  const rel = $('[data-grid^="related"]');
  if (rel) rel.dataset.grid = `related:${p.id}`;
}

// =====================================================================
// Оформление заказа
// =====================================================================
function initCheckout() {
  const form = $('#checkout-form');
  if (!form) return;
  const summary = $('#summary-lines');
  const totals = $('#summary-totals');
  const emptyBox = $('#checkout-empty');

  function deliveryKey() { return form.delivery.value || 'courier'; }
  let done = false;
  function renderSummary() {
    if (done) return;
    const lines = cart.lines();
    emptyBox.hidden = lines.length > 0;
    $('#checkout-main').hidden = lines.length === 0;
    if (!lines.length) return;
    summary.replaceChildren(...lines.map(lineItem));
    const sub = cart.subtotal();
    const free = settings.freeShippingFrom ?? 2500;
    const ship = sub >= free ? 0 : DELIVERY[deliveryKey()].price;
    totals.replaceChildren(
      h('div', {}, h('span', { text: 'Товары' }), h('span', { text: money(sub) })),
      h('div', {}, h('span', { text: 'Доставка' }), h('span', { text: ship ? money(ship) : 'бесплатно' })),
      h('div', { class: 'grand' }, h('span', { text: 'К оплате' }), h('span', { text: money(sub + ship) })));
    $('#address-req').hidden = deliveryKey() === 'pickup';
    $('#address-label').firstChild.textContent = deliveryKey() === 'pickup' ? 'Адрес пункта выдачи (необязательно) ' : 'Адрес доставки ';
  }
  form.addEventListener('change', (e) => { if (e.target.name === 'delivery') renderSummary(); });
  document.addEventListener('cart:change', renderSummary);
  renderSummary();
  if (cart.lines().length && !session.get('hc_checkout_tracked')) { analytics.track('checkout_start'); session.set('hc_checkout_tracked', true); }

  // Маска телефона: оставляем только допустимые символы.
  form.phone.addEventListener('input', () => { form.phone.value = form.phone.value.replace(/[^\d+\-()\s]/g, '').slice(0, 20); });

  function showErrors(errors) {
    for (const el of $$('[aria-invalid]', form)) el.removeAttribute('aria-invalid');
    for (const el of $$('.field-error', form)) el.textContent = '';
    let first;
    for (const [k, msg] of Object.entries(errors)) {
      const err = $(`#err-${k}`, form);
      if (err) err.textContent = msg;
      const input = form.elements[k];
      if (input && input.setAttribute) { input.setAttribute('aria-invalid', 'true'); first ||= input; }
      else if (input && input[0]) first ||= input[0];
    }
    const general = errors.items || errors.form;
    $('#form-error').textContent = general || (Object.keys(errors).length ? 'Проверьте выделенные поля' : '');
    $('#form-error').hidden = !$('#form-error').textContent;
    first?.focus?.();
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('button[type="submit"]', form);
    const data = {
      items: cart.items,
      customer: { name: form.name.value, phone: form.phone.value, email: form.email.value, city: form.city.value, address: form.address.value, comment: form.comment.value },
      delivery: form.delivery.value, payment: form.payment.value,
      consents: { offer: form.offer.checked, pd: form.pd.checked, marketing: form.marketing.checked },
      website: form.website.value,
      visitorId: analytics.visitorId(),
    };
    // Быстрая проверка на клиенте; окончательная — на сервере.
    const errs = {};
    if (!data.consents.offer) errs.offer = 'Необходимо принять условия оферты';
    if (!data.consents.pd) errs.pd = 'Необходимо согласие на обработку персональных данных';
    if (Object.keys(errs).length) return showErrors(errs);
    btn.disabled = true; btn.textContent = 'Отправляем…';
    try {
      const r = await api.createOrder(data);
      done = true;
      cart.clear();
      session.del('hc_checkout_tracked');
      $('#checkout-main').hidden = true;
      const ok = $('#checkout-success');
      ok.hidden = false;
      $('#order-number').textContent = r.number;
      $('#order-total').textContent = money(r.total);
      ok.focus({ preventScroll: true });
      window.scrollTo({ top: 0 });
    } catch (err) {
      if (err instanceof ApiError) showErrors(Object.keys(err.errors).length ? err.errors : { form: err.message });
      else showErrors({ form: 'Не удалось отправить заказ. Проверьте соединение.' });
      if (err.status === 409 || err.errors?.items) { await loadCatalog(); cart.reconcile(); renderSummary(); syncBuyControls(); }
    } finally {
      btn.disabled = false; btn.textContent = 'Подтвердить заказ';
    }
  });
}

// =====================================================================
// Cookie-согласие (152-ФЗ): аналитика включается только после согласия
// =====================================================================
const consent = {
  state: local.get('hc_consent'),
  valid() { return this.state && this.state.v === CONSENT_VERSION; },
  analytics() { return this.valid() && this.state.analytics === true; },
  show(force = false) {
    const box = $('#consent');
    if (!box || (!force && this.valid())) return;
    box.hidden = false;
    document.body.classList.add('consent-visible');
    if (force) { $('#consent-options').hidden = false; $('#consent-analytics').checked = this.analytics(); }
  },
  save(analyticsAllowed, kind) {
    this.state = { v: CONSENT_VERSION, necessary: true, analytics: analyticsAllowed, ts: Date.now() };
    local.set('hc_consent', this.state);
    $('#consent').hidden = true;
    document.body.classList.remove('consent-visible');
    if (analyticsAllowed) analytics.start();
    else analytics.stop();
    api?.logConsent(kind, analyticsAllowed ? analytics.visitorId() : null);
  },
  init() {
    const box = $('#consent');
    if (!box) return;
    $('#consent-accept').addEventListener('click', () => this.save(true, 'cookies_all'));
    $('#consent-necessary').addEventListener('click', () => this.save(false, 'cookies_necessary'));
    $('#consent-settings').addEventListener('click', () => { const o = $('#consent-options'); o.hidden = !o.hidden; });
    $('#consent-save').addEventListener('click', () => this.save($('#consent-analytics').checked, 'cookies_custom'));
    this.show();
  },
};

// =====================================================================
// Аналитика: первый визит, просмотры, корзина, оформление, покупка
// =====================================================================
const analytics = {
  started: false,
  visitorId() {
    if (!consent.analytics()) return null;
    let id = local.get('hc_vid');
    if (!isVisitorId(id)) { id = randomHex(16); local.set('hc_vid', id); }
    return id;
  },
  device() { const w = window.innerWidth; return w < 640 ? 'mobile' : w < 1024 ? 'tablet' : 'desktop'; },
  captureLanding() {
    // Точка входа запоминается до согласия (без персональных данных), отправляется только после него.
    if (!session.get('hc_landing')) {
      session.set('hc_landing', {
        path: location.pathname.slice(-200),
        source: detectSource(location.search, document.referrer, location.hostname),
        referrer: document.referrer ? (() => { try { return new URL(document.referrer).hostname; } catch { return ''; } })() : '',
      });
    }
  },
  start() {
    if (this.started || !consent.analytics() || !api) return;
    this.started = true;
    const vid = this.visitorId();
    if (!local.get('hc_fv_sent')) {
      const l = session.get('hc_landing') || {};
      api.track({ type: 'first_visit', visitorId: vid, path: l.path || location.pathname, source: l.source || 'direct', referrer: l.referrer || '', device: this.device() });
      local.set('hc_fv_sent', Date.now());
    }
    if (page !== 'product') this.track('page_view');
  },
  stop() { this.started = false; local.del('hc_vid'); local.del('hc_fv_sent'); },
  track(type, extra = {}) {
    if (!consent.analytics() || !api) return;
    api.track({ type, visitorId: this.visitorId(), path: location.pathname.slice(-200), device: this.device(), ...extra });
  },
};

// =====================================================================
// Чат поддержки
// =====================================================================
function initChat() {
  let token = local.get('hc_chat_token');
  let lastId = 0;
  let open = false;
  let timer;
  const shown = new Set();
  const fab = h('button', { class: 'chat-fab', type: 'button', 'aria-label': 'Чат поддержки', 'aria-expanded': 'false', 'aria-controls': 'chat' },
    icon('chat'), h('span', { text: 'Поддержка' }), h('i', { class: 'dot', hidden: true, 'aria-label': 'Новое сообщение' }));
  const log = h('div', { class: 'chat-log', role: 'log', 'aria-live': 'polite' });
  const input = h('input', { class: 'input', name: 'message', maxlength: 1000, autocomplete: 'off', placeholder: 'Напишите сообщение…', 'aria-label': 'Сообщение', required: true });
  const hp = h('input', { class: 'hp', name: 'website', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true' });
  const form = h('form', { class: 'chat-form' }, hp, input, h('button', { class: 'btn btn-primary', type: 'submit', 'aria-label': 'Отправить' }, icon('send')));
  const quick = h('div', { class: 'quick' }, ...['Сроки доставки', 'Способы оплаты', 'Что самое острое?', 'Возврат товара'].map(q =>
    h('button', { type: 'button', text: q, onclick: () => send(q) })));
  const box = h('section', { class: 'chat', id: 'chat', hidden: true, 'aria-label': 'Чат поддержки' },
    h('div', { class: 'chat-head' }, h('span', { class: 'seal', 'aria-hidden': 'true' }, h('span', { text: '好' }), h('span', { text: '吃' })),
      h('div', {}, h('b', { text: 'Поддержка ХАОЧИ' }), h('small', { 'data-setting': 'hours', text: settings.hours || 'Ежедневно 9:00–21:00' })),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Закрыть чат', onclick: () => toggle(false) }, icon('close'))),
    log, form,
    h('p', { class: 'chat-note' }, 'Отправляя сообщение, вы даёте ', h('a', { href: `${ROOT}consent.html`, text: 'согласие на обработку персональных данных' }), '. Не сообщайте в чате данные банковских карт.'));
  document.body.append(fab, box);

  function bubble(m) {
    if (shown.has(m.id)) return;
    shown.add(m.id);
    const who = m.author === 'admin' ? 'Оператор' : m.author === 'bot' ? 'Помощник' : null;
    log.append(h('div', { class: `msg ${m.author}` }, who ? h('span', { class: 'who', text: who }) : null, m.text, h('small', { text: fmtDate(m.ts).slice(-5) })));
  }
  function greet() {
    if (log.childElementCount) return;
    log.append(h('div', { class: 'msg bot' }, h('span', { class: 'who', text: 'Помощник' }),
      'Здравствуйте! Подскажем со вкусами, доставкой и заказом. Выберите вопрос или напишите свой.'), quick);
  }
  function apply(messages) {
    for (const m of messages) { bubble(m); lastId = Math.max(lastId, m.id); }
    if (messages.length) log.scrollTop = log.scrollHeight;
    const lastSeen = local.get('hc_chat_seen', 0);
    if (!open && messages.some(m => m.author === 'admin' && m.id > lastSeen)) fab.querySelector('.dot').hidden = false;
    if (open) local.set('hc_chat_seen', lastId);
  }
  async function poll() {
    if (!token) return;
    try { apply((await api.chatFetch(token, lastId)).messages); } catch { /* сеть */ }
  }
  async function send(text) {
    text = String(text).trim();
    if (!text) return;
    quick.remove();
    input.value = '';
    try {
      const r = await api.chatSend(token, text, lastId, hp.value);
      if (r.token !== token) { token = r.token; local.set('hc_chat_token', token); }
      apply(r.messages);
    } catch (e) { toast(e.message || 'Не удалось отправить сообщение', 'err'); input.value = text; }
  }
  function schedule() { clearInterval(timer); timer = setInterval(poll, open ? 4000 : 30000); }
  async function toggle(state) {
    open = state;
    box.hidden = !open;
    fab.setAttribute('aria-expanded', String(open));
    if (open) {
      fab.querySelector('.dot').hidden = true;
      greet();
      await poll();
      local.set('hc_chat_seen', lastId);
      input.focus();
    } else fab.focus();
    schedule();
  }
  fab.addEventListener('click', () => toggle(!open));
  form.addEventListener('submit', (e) => { e.preventDefault(); send(input.value); });
  box.addEventListener('keydown', (e) => { if (e.key === 'Escape') toggle(false); });
  api.onChange?.((topic) => { if (topic === 'chats') poll(); });
  if (token) poll();
  schedule();
}


// =====================================================================
// Анимации: появление при прокрутке и «полёт» товара в корзину
// =====================================================================
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const io = !reduceMotion && 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
  let k = 0;
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    e.target.style.setProperty('--d', `${Math.min(k++, 6) * 70}ms`);
    e.target.classList.add('in');
    io.unobserve(e.target);
  }
}, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }) : null;

/** instant — элементы, уже попавшие в экран, показываются сразу (при перерисовке сетки без мигания). */
function reveal(root = document, instant = false) {
  for (const el of $$('[data-reveal]:not(.in)', root)) {
    if (!io) { el.classList.add('in'); continue; }
    if (instant && el.getBoundingClientRect().top < window.innerHeight) el.classList.add('in');
    else io.observe(el);
  }
}

function flyToCart(btn) {
  if (reduceMotion) return;
  const img = btn.closest('.card, .product')?.querySelector('.card-media img, #p-img');
  const target = $('.header .cart-btn');
  if (!img || !target || !img.animate) return;
  const a = img.getBoundingClientRect();
  const b = target.getBoundingClientRect();
  const ghost = img.cloneNode(false);
  ghost.removeAttribute('srcset');
  ghost.removeAttribute('id');
  ghost.className = 'fly-ghost';
  ghost.alt = '';
  Object.assign(ghost.style, { left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px` });
  document.body.append(ghost);
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  ghost.animate([
    { transform: 'translate(0, 0) scale(1) rotate(0deg)', opacity: 1 },
    { transform: `translate(${dx * 0.55}px, ${dy * 0.35 - 80}px) scale(.55) rotate(-14deg)`, opacity: 1, offset: 0.55 },
    { transform: `translate(${dx}px, ${dy}px) scale(.08) rotate(-30deg)`, opacity: 0.4 },
  ], { duration: 720, easing: 'cubic-bezier(.5,0,.3,1)' }).finished.then(() => {
    ghost.remove();
    target.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.25) rotate(-8deg)' }, { transform: 'scale(1)' }], { duration: 380, easing: 'ease-out' });
  }).catch(() => ghost.remove());
}

// =====================================================================
// Общие элементы и запуск
// =====================================================================
function applySettings() {
  for (const el of $$('[data-setting]')) {
    const v = settings[el.dataset.setting];
    if (v === undefined || v === null || v === '') continue;
    el.textContent = el.dataset.setting === 'freeShippingFrom' ? money(v) : v;
  }
  for (const el of $$('[data-setting-href]')) {
    const v = settings[el.dataset.settingHref];
    if (!v) continue;
    el.setAttribute('href', el.dataset.settingHref === 'phone' ? `tel:${v.replace(/[^\d+]/g, '')}` : `mailto:${v}`);
  }
  const ann = $('.announce');
  if (ann) ann.textContent = settings.announcement || '';
}

async function loadCatalog() {
  catalog = await api.products();
}

function initHeader() {
  const burger = $('.burger');
  const nav = $('#nav');
  burger?.addEventListener('click', () => {
    const openNow = nav.classList.toggle('open');
    burger.setAttribute('aria-expanded', String(openNow));
  });
  nav?.addEventListener('click', (e) => { if (e.target.closest('a')) nav.classList.remove('open'); });
}

async function main() {
  initHeader();
  analytics.captureLanding();
  const drawer = $('#cart-drawer');
  if (drawer) drawer.inert = true;
  try {
    api = await getApi();
    [settings] = await Promise.all([api.settings().catch(() => ({})), loadCatalog()]);
  } catch {
    toast('Не удалось загрузить каталог. Обновите страницу.', 'err');
    return;
  }
  const demo = $('#mode-flag');
  if (demo) demo.textContent = api.mode === 'demo'
    ? 'Демо-режим: заказы, чат и правки из админки хранятся в вашем браузере (IndexedDB).'
    : 'Режим сервера: данные хранятся в базе SQLite.';
  applySettings();
  cart.reconcile();
  const origSave = cart.save.bind(cart);
  cart.save = () => { origSave(); document.dispatchEvent(new Event('cart:change')); };
  if (page === 'product') await initProduct();
  renderGrids();
  initCatalog();
  initCheckout();
  syncBuyControls();
  renderCart();
  consent.init();
  analytics.start();
  initChat();
  reveal();
  // В демо-режиме изменения из админки в соседней вкладке применяются сразу.
  api.onChange?.(async (topic) => {
    if (topic === 'products') { await loadCatalog(); cart.reconcile(); renderGrids(); syncBuyControls(); renderCart(); }
    if (topic === 'settings') { settings = await api.settings(); applySettings(); }
  });
}

main();
