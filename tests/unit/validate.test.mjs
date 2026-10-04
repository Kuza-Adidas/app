import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateOrder, validateProduct, validateEvent, isSafeImage, cleanText, slugify, detectSource, botReply } from '../../src/assets/js/lib/validate.js';
import { computeStats } from '../../src/assets/js/lib/stats.js';

const products = new Map([
  ['a', { id: 'a', name: 'A', price: 100, stock: 5, active: true }],
  ['b', { id: 'b', name: 'B', price: 250, stock: 1, active: true }],
  ['hidden', { id: 'hidden', name: 'H', price: 10, stock: 9, active: false }],
]);
const good = {
  items: [{ id: 'a', qty: 2 }],
  customer: { name: 'Иван', phone: '+7 900 123-45-67', email: 'ivan@example.com', city: 'Москва', address: 'ул. Ленина, 1' },
  delivery: 'courier', payment: 'card', consents: { offer: true, pd: true },
};

test('заказ: цены берутся из каталога, а не из запроса', () => {
  const r = validateOrder({ ...good, items: [{ id: 'a', qty: 2, price: 1 }] }, products);
  assert.equal(r.ok, true);
  assert.equal(r.value.subtotal, 200);
  assert.equal(r.value.shipping, 290);
  assert.equal(r.value.total, 490);
});

test('заказ: бесплатная доставка от порога', () => {
  const r = validateOrder({ ...good, items: [{ id: 'a', qty: 5 }] }, products, { freeShippingFrom: 500 });
  assert.equal(r.value.shipping, 0);
});

test('заказ: без согласий не принимается', () => {
  const r = validateOrder({ ...good, consents: { offer: true } }, products);
  assert.equal(r.ok, false);
  assert.ok(r.errors.pd);
  const r2 = validateOrder({ ...good, consents: { pd: 'true' } }, products);
  assert.ok(r2.errors.offer && r2.errors.pd, 'строка "true" не считается согласием');
});

test('заказ: остаток, скрытые товары, некорректное количество', () => {
  assert.ok(validateOrder({ ...good, items: [{ id: 'b', qty: 2 }] }, products).errors.items);
  assert.ok(validateOrder({ ...good, items: [{ id: 'hidden', qty: 1 }] }, products).errors.items);
  assert.ok(validateOrder({ ...good, items: [{ id: 'a', qty: -1 }] }, products).errors.items);
  assert.ok(validateOrder({ ...good, items: [] }, products).errors.items);
});

test('заказ: ловушка для ботов и проверка контактов', () => {
  assert.equal(validateOrder({ ...good, website: 'http://spam' }, products).bot, true);
  const r = validateOrder({ ...good, customer: { ...good.customer, phone: '123', email: 'nope' } }, products);
  assert.ok(r.errors.phone && r.errors.email);
});

test('заказ: самовывоз не требует адреса', () => {
  const r = validateOrder({ ...good, delivery: 'pickup', customer: { ...good.customer, address: '' } }, products);
  assert.equal(r.ok, true);
});

test('cleanText удаляет управляющие символы и обрезает длину', () => {
  assert.equal(cleanText('  a\u0000b‮c  '), 'abc');
  assert.equal(cleanText('x'.repeat(50), 10).length, 10);
  assert.equal(cleanText('<script>alert(1)</script>'), '<script>alert(1)</script>', 'HTML не исполняется — выводится как текст');
});

test('isSafeImage пропускает только локальные пути и растровые data:-URL', () => {
  assert.equal(isSafeImage('assets/img/products/x.webp'), true);
  assert.equal(isSafeImage('uploads/abc.png'), true);
  assert.equal(isSafeImage('data:image/png;base64,iVBORw0KGgo='), true);
  assert.equal(isSafeImage('javascript:alert(1)'), false);
  assert.equal(isSafeImage('data:image/svg+xml;base64,PHN2Zz4='), false);
  assert.equal(isSafeImage('assets/img/../../etc/passwd.png'), false);
  assert.equal(isSafeImage('https://evil.example/x.png'), false);
});

test('validateProduct: обязательные поля и генерация id', () => {
  const r = validateProduct({ name: 'Новый снек', category: 'snacks', price: 99, image: 'assets/img/products/a.webp' }, { isNew: true, existingIds: [] });
  assert.equal(r.ok, true);
  assert.equal(r.value.id, 'novyy-snek');
  const bad = validateProduct({ id: 'Bad ID', name: 'x', category: 'zzz', price: -1, image: 'javascript:1' });
  assert.equal(bad.ok, false);
  for (const k of ['id', 'name', 'category', 'price', 'image']) assert.ok(bad.errors[k], k);
  const dup = validateProduct({ id: 'abc', name: 'Дубль', category: 'snacks', price: 1, image: 'uploads/a.png' }, { isNew: true, existingIds: ['abc'] });
  assert.ok(dup.errors.id);
});

test('validateEvent: покупку нельзя отправить с клиента', () => {
  const vid = 'a'.repeat(32);
  assert.equal(validateEvent({ type: 'purchase', visitorId: vid }), null);
  assert.equal(validateEvent({ type: 'first_visit', visitorId: 'short' }), null);
  assert.equal(validateEvent({ type: 'first_visit', visitorId: vid, path: '/x' }).type, 'first_visit');
});

test('slugify и detectSource', () => {
  assert.equal(slugify('Латяо острые!'), 'latyao-ostrye');
  assert.equal(detectSource('?utm_source=VK', '', 'x.ru'), 'vk');
  assert.equal(detectSource('', 'https://yandex.ru/search', 'x.ru'), 'yandex');
  assert.equal(detectSource('', '', 'x.ru'), 'direct');
});

test('botReply отвечает на частые вопросы', () => {
  assert.match(botReply('Сколько стоит доставка?'), /курьером/);
  assert.equal(botReply('Привет'), null);
});

test('computeStats: первый визит → покупка, конверсия и путь покупателя', () => {
  const now = Date.now();
  const v1 = '1'.repeat(32), v2 = '2'.repeat(32);
  const events = [
    { type: 'first_visit', visitorId: v1, ts: now - 3600_000, path: '/index.html', source: 'yandex', device: 'mobile' },
    { type: 'first_visit', visitorId: v2, ts: now - 1800_000, path: '/catalog.html', source: 'direct', device: 'desktop' },
    { type: 'add_to_cart', visitorId: v1, ts: now - 3000_000 },
    { type: 'purchase', visitorId: v1, ts: now - 600_000 },
  ];
  const orders = [{ number: 'HC-1', createdAt: now - 600_000, total: 500, items: [{ id: 'a', name: 'A', qty: 2, sum: 400 }], visitorId: v1, status: 'new' }];
  const s = computeStats({ events, orders, days: 7, now });
  assert.equal(s.totals.visitors, 2);
  assert.equal(s.totals.orders, 1);
  assert.equal(s.totals.conversion, 50);
  assert.equal(s.journeys[0].source, 'yandex');
  assert.equal(s.journeys[0].minutesToPurchase, 50);
  assert.equal(s.byDay.length, 7);
  assert.equal(s.funnel[1].value, 1);
});
