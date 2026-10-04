// Интеграционные тесты API и защитных механизмов сервера.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../server/server.mjs';

let server, base, tmp;
const PASSWORD = 'test-password-123';
const vid = 'f'.repeat(32);

before(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'haochi-'));
  ({ server } = createApp({ dbFile: ':memory:', uploadsDir: join(tmp, 'uploads'), adminPassword: PASSWORD, production: false }));
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); rmSync(tmp, { recursive: true, force: true }); });

const json = (method, path, body, headers = {}) => fetch(base + path, {
  method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
  body: body !== undefined ? JSON.stringify(body) : undefined,
});
const order = (over = {}) => ({
  items: [{ id: 'latiao-lobster', qty: 2 }],
  customer: { name: 'Тест', phone: '+7 900 000-00-01', email: 't@example.com', city: 'Москва', address: 'ул. Тестовая, 1' },
  delivery: 'courier', payment: 'cash', consents: { offer: true, pd: true }, visitorId: vid, ...over,
});

async function login() {
  const r = await json('POST', '/api/admin/login', { password: PASSWORD });
  assert.equal(r.status, 200);
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const { csrf } = await r.json();
  return { cookie, csrf };
}

test('health и заголовки безопасности', async () => {
  const r = await fetch(base + '/api/health');
  assert.deepEqual(await r.json(), { ok: true, mode: 'server' });
  const page = await fetch(base + '/');
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /default-src 'self'.*frame-ancestors 'none'/);
  assert.equal(page.headers.get('x-frame-options'), 'DENY');
  assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
});

test('статика: обход каталога и 404', async () => {
  const r = await fetch(base + '/..%2f..%2fpackage.json');
  assert.ok([403, 404].includes(r.status));
  const r2 = await fetch(base + '/assets/../../server/server.mjs');
  assert.notEqual((await r2.text()).includes('createApp'), true);
  const r3 = await fetch(base + '/no/such/page');
  assert.equal(r3.status, 404);
  assert.match(await r3.text(), /href="\/assets\/css\/main\.css/, '404 переписан под корень сервера');
});

test('каталог товаров', async () => {
  const list = await (await fetch(base + '/api/products')).json();
  assert.equal(list.length, 23);
  const p = await (await fetch(base + '/api/products/latiao-lobster')).json();
  assert.equal(p.price, 69);
  assert.equal((await fetch(base + '/api/products/nope')).status, 404);
});

test('заказ: успешное оформление, списание остатка, событие покупки', async () => {
  await json('POST', '/api/events', { type: 'first_visit', visitorId: vid, path: '/index.html', source: 'yandex', device: 'mobile' });
  const before = (await (await fetch(base + '/api/products/latiao-lobster')).json()).stock;
  const r = await json('POST', '/api/orders', order({ items: [{ id: 'latiao-lobster', qty: 2, price: 1 }] }));
  assert.equal(r.status, 201);
  const body = await r.json();
  assert.match(body.number, /^HC-\d{6}$/);
  assert.equal(body.total, 69 * 2 + 290, 'цена из базы, не из запроса');
  const after = (await (await fetch(base + '/api/products/latiao-lobster')).json()).stock;
  assert.equal(after, before - 2);
});

test('заказ: отклоняется без согласия, сверх остатка и не-JSON', async () => {
  let r = await json('POST', '/api/orders', order({ consents: { offer: true } }));
  assert.equal(r.status, 422);
  assert.ok((await r.json()).errors.pd);
  r = await json('POST', '/api/orders', order({ items: [{ id: 'mochi-taro', qty: 99 }] }));
  assert.equal(r.status, 422);
  r = await fetch(base + '/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'a=1' });
  assert.equal(r.status, 415);
});

test('запросы с чужого Origin отклоняются', async () => {
  const r = await json('POST', '/api/orders', order(), { Origin: 'https://evil.example' });
  assert.equal(r.status, 403);
});

test('слишком большой запрос отклоняется', async () => {
  const r = await json('POST', '/api/chat', { text: 'x'.repeat(10_000) });
  assert.equal(r.status, 413);
});

test('чат: создание диалога, ответ бота, получение сообщений', async () => {
  const r = await json('POST', '/api/chat', { text: 'Как работает доставка?' });
  assert.equal(r.status, 200);
  const { token, messages } = await r.json();
  assert.match(token, /^[a-f0-9]{48}$/);
  assert.equal(messages[0].author, 'visitor');
  assert.equal(messages[1].author, 'bot');
  const again = await (await fetch(`${base}/api/chat?token=${token}&after=${messages[1].id}`)).json();
  assert.equal(again.messages.length, 0);
  assert.equal((await fetch(`${base}/api/chat?token=../../x`)).status, 400);
});

test('админка: без входа доступ закрыт', async () => {
  assert.equal((await fetch(base + '/api/admin/orders')).status, 401);
  assert.equal((await fetch(base + '/api/admin/stats', { headers: { Cookie: 'hc_sid=' + 'a'.repeat(43) } })).status, 401);
});

test('админка: CSRF-токен обязателен для изменений', async () => {
  const { cookie } = await login();
  const r = await json('DELETE', '/api/admin/products/latiao-lobster', undefined, { Cookie: cookie });
  assert.equal(r.status, 403);
  assert.equal((await fetch(base + '/api/products/latiao-lobster')).status, 200);
});

test('админка: CRUD товара, загрузка изображения с проверкой сигнатуры', async () => {
  const { cookie, csrf } = await login();
  const h = { Cookie: cookie, 'X-CSRF-Token': csrf };
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  let r = await json('POST', '/api/admin/products', { name: 'Тестовый снек <img src=x onerror=alert(1)>', category: 'snacks', price: 77, stock: 3, image: png }, h);
  assert.equal(r.status, 201);
  const p = await r.json();
  assert.match(p.image, /^uploads\/[a-f0-9]{24}\.png$/);
  assert.ok(existsSync(join(tmp, 'uploads', p.image.slice(8))));
  const img = await fetch(`${base}/${p.image}`);
  assert.equal(img.headers.get('content-type'), 'image/png');
  assert.match(img.headers.get('content-security-policy'), /sandbox/);
  // подделка: HTML под видом PNG
  r = await json('POST', '/api/admin/products', { name: 'Фейк', category: 'snacks', price: 1, image: 'data:image/png;base64,' + Buffer.from('<html><script>1</script>').toString('base64') }, h);
  assert.equal(r.status, 422);
  r = await json('PUT', `/api/admin/products/${p.id}`, { ...p, price: 88 }, h);
  assert.equal((await r.json()).price, 88);
  r = await json('DELETE', `/api/admin/products/${p.id}`, undefined, h);
  assert.equal(r.status, 200);
  assert.equal((await fetch(`${base}/api/products/${p.id}`)).status, 404);
});

test('админка: заказы, статусы, статистика первого визита и покупки', async () => {
  const { cookie, csrf } = await login();
  const h = { Cookie: cookie, 'X-CSRF-Token': csrf };
  const orders = await (await fetch(base + '/api/admin/orders', { headers: h })).json();
  assert.ok(orders.length >= 1);
  const r = await json('PATCH', `/api/admin/orders/${orders[0].id}`, { status: 'shipped' }, h);
  assert.equal(r.status, 200);
  assert.equal((await json('PATCH', `/api/admin/orders/${orders[0].id}`, { status: 'hacked' }, h)).status, 422);
  const s = await (await fetch(base + '/api/admin/stats?days=7', { headers: h })).json();
  assert.equal(s.totals.visitors, 1);
  assert.equal(s.totals.orders, 1);
  assert.equal(s.journeys[0].source, 'yandex');
  assert.notEqual(s.journeys[0].firstVisitAt, null);
});

test('админка: чат и настройки', async () => {
  const { cookie, csrf } = await login();
  const h = { Cookie: cookie, 'X-CSRF-Token': csrf };
  const threads = await (await fetch(base + '/api/admin/chats', { headers: h })).json();
  assert.ok(threads.length >= 1);
  const r = await json('POST', `/api/admin/chats/${threads[0].id}`, { text: 'Здравствуйте, оператор на связи' }, h);
  assert.equal((await r.json()).messages.at(-1).author, 'admin');
  const s = await (await json('PUT', '/api/admin/settings', { announcement: 'Новая акция', phone: '+7 999 111-22-33', email: 'a@b.ru', address: 'X', hours: '10-20', freeShippingFrom: 3000 }, h)).json();
  assert.equal(s.freeShippingFrom, 3000);
  assert.equal((await (await fetch(base + '/api/settings')).json()).announcement, 'Новая акция');
});

test('админка: выход завершает сессию', async () => {
  const { cookie, csrf } = await login();
  await json('POST', '/api/admin/logout', {}, { Cookie: cookie, 'X-CSRF-Token': csrf });
  assert.equal((await fetch(base + '/api/admin/me', { headers: { Cookie: cookie } })).status, 401);
});

test('админка: блокировка после 5 неверных паролей', async () => {
  for (let i = 0; i < 5; i++) assert.equal((await json('POST', '/api/admin/login', { password: 'wrong' + i })).status, 401);
  const r = await json('POST', '/api/admin/login', { password: PASSWORD });
  assert.equal(r.status, 429, 'даже верный пароль не принимается во время блокировки');
});
