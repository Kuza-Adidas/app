// Сквозные тесты в настоящем браузере (Chromium через Playwright) в двух режимах:
//  - server: Node-сервер + SQLite;
//  - demo:   статическая раздача dist/ под путём /app/ (как на GitHub Pages), данные в IndexedDB.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, existsSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname, extname, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createApp } from '../../server/server.mjs';

const dist = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist');
const PASSWORD = 'haochi-demo-2026';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.xml': 'application/xml', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain' };

function pagesLikeServer() {
  // Имитация GitHub Pages: сайт живёт в /app/, API нет.
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (!url.pathname.startsWith('/app/')) { res.statusCode = 404; return res.end('404'); }
    let file = resolve(dist, '.' + decodeURIComponent(url.pathname.slice(4)));
    if (!file.startsWith(dist + sep) && file !== dist) { res.statusCode = 403; return res.end(); }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) { res.statusCode = 404; res.setHeader('Content-Type', MIME['.html']); return res.end(readFileSync(join(dist, '404.html'))); }
    res.setHeader('Content-Type', MIME[extname(file)] || 'application/octet-stream');
    res.end(readFileSync(file));
  });
}

let browser, tmp;
const servers = {};

before(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'haochi-e2e-'));
  const { server } = createApp({ dbFile: ':memory:', uploadsDir: join(tmp, 'uploads'), adminPassword: PASSWORD });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  servers.server = { srv: server, base: `http://127.0.0.1:${server.address().port}/` };
  const pages = pagesLikeServer();
  await new Promise(r => pages.listen(0, '127.0.0.1', r));
  servers.demo = { srv: pages, base: `http://127.0.0.1:${pages.address().port}/app/` };
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
});
after(async () => {
  await browser?.close();
  for (const s of Object.values(servers)) s.srv.close();
  rmSync(tmp, { recursive: true, force: true });
});

function watch(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => {
    const t = m.text();
    // 404 на /api/health в демо-режиме — ожидаемая проверка наличия сервера.
    if (m.type() === 'error' && !/Failed to load resource.*404/.test(t)) errors.push(t);
    if (/Content Security Policy|Refused to/.test(t)) errors.push(t);
  });
  return errors;
}

for (const mode of ['server', 'demo']) {
  test(`[${mode}] покупка: cookie, корзина, оформление заказа с согласиями`, async () => {
    const { base } = servers[mode];
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    const errors = watch(page);
    await page.goto(base + 'index.html?utm_source=telegram');
    await page.getByRole('button', { name: 'Принять все' }).click();
    await assert.doesNotReject(page.locator('#consent').waitFor({ state: 'hidden' }));

    // добавляем хит с главной
    await page.locator('[data-grid="hits"] [data-add]').first().click();
    await page.locator('.cart-count:not([hidden])').waitFor();
    assert.equal(await page.locator('.header .cart-count').textContent(), '1');

    // страница товара
    await page.goto(base + 'p/milktea-jasmine.html');
    await page.locator('.product-buy [data-add]').click();
    await page.getByRole('button', { name: 'Увеличить' }).first().click();
    assert.equal(await page.locator('.header .cart-count').textContent(), '3');

    // корзина в выезжающей панели
    await page.locator('.header [data-open-cart]').click();
    await page.locator('#cart-drawer .line-item').nth(1).waitFor();
    assert.equal(await page.locator('#cart-drawer .line-item').count(), 2);
    await page.getByRole('link', { name: 'Оформить заказ' }).click();

    // оформление: сначала без согласий
    await page.waitForURL(/checkout/);
    await page.fill('#f-name', 'Анна');
    await page.fill('#f-phone', '+7 912 345-67-89');
    await page.fill('#f-email', 'anna@example.com');
    await page.fill('#f-city', 'Казань');
    await page.fill('#f-address', 'ул. Баумана, 10');
    await page.getByRole('button', { name: 'Подтвердить заказ' }).click();
    await page.locator('#err-pd:not(:empty)').waitFor();
    assert.match(await page.locator('#err-offer').textContent(), /оферты/);

    await page.locator('input[name="offer"]').check();
    await page.locator('input[name="pd"]').check();
    await page.getByRole('button', { name: 'Подтвердить заказ' }).click();
    await page.locator('#checkout-success:not([hidden])').waitFor();
    const number = await page.locator('#order-number').textContent();
    assert.match(number, /^HC-\d{6}$/);
    assert.equal(await page.locator('#checkout-main').isVisible(), false, 'форма скрыта после заказа');
    assert.equal(await page.locator('#checkout-empty').isVisible(), false);
    assert.equal(await page.locator('.header .cart-count').isHidden(), true, 'корзина очищена');
    assert.deepEqual(errors, []);
    servers[mode].order = number;
    servers[mode].ctx = ctx;
  });

  test(`[${mode}] чат поддержки: бот отвечает, оператор отвечает из админки`, async () => {
    const { base, ctx } = servers[mode];
    const page = await ctx.newPage();
    const errors = watch(page);
    await page.goto(base + 'catalog.html');
    await page.getByRole('button', { name: 'Чат поддержки' }).click();
    await page.getByRole('button', { name: 'Сроки доставки' }).click();
    await page.locator('.msg.bot', { hasText: 'курьером' }).waitFor();

    const admin = await ctx.newPage();
    await admin.goto(base + 'admin/#chat');
    await admin.fill('input[name="password"]', PASSWORD);
    await admin.getByRole('button', { name: 'Войти' }).click();
    await admin.locator('.thread').first().waitFor();
    await admin.locator('.admin-reply textarea').fill('Здравствуйте! Отправим сегодня.');
    await admin.getByRole('button', { name: 'Отправить' }).click();
    await admin.locator('.admin-log .msg', { hasText: 'Отправим сегодня' }).waitFor();

    await page.locator('.msg.admin', { hasText: 'Отправим сегодня' }).waitFor({ timeout: 10_000 });
    assert.deepEqual(errors, []);
    servers[mode].admin = admin;
  });

  test(`[${mode}] админка: статистика, заказ, добавление и удаление товара, настройки`, async () => {
    const { base, ctx, admin, order } = servers[mode];
    const errors = watch(admin);
    await admin.goto(base + 'admin/#stats');
    await admin.locator('.kpi').first().waitFor();
    const kpi = async (label) => admin.locator('.kpi').filter({ has: admin.locator('span', { hasText: new RegExp(`^${label}$`) }) }).locator('b').textContent();
    assert.equal(await kpi('Первые визиты'), '1');
    assert.equal(await kpi('Заказы'), '1');
    assert.equal(await admin.locator('.admin-table', { hasText: order }).locator('td', { hasText: 'telegram' }).count(), 1, 'источник первого визита в пути покупателя');

    await admin.goto(base + 'admin/#orders');
    await admin.locator('.order summary', { hasText: order }).click();
    await admin.locator('.order[open] select').selectOption('confirmed');
    await admin.locator('.toast', { hasText: 'Подтверждён' }).waitFor();

    // новый товар с картинкой
    await admin.goto(base + 'admin/#products');
    await admin.getByRole('button', { name: 'Добавить товар' }).click();
    await admin.fill('#pf-name', 'Тестовые рисовые палочки');
    await admin.fill('#pf-price', '155');
    await admin.fill('#pf-stock', '7');
    await admin.locator('#pf-image').setInputFiles(join(dist, 'assets/img/icon-192.png'));
    await admin.locator('.preview:not([hidden])').waitFor();
    await admin.getByRole('button', { name: 'Добавить', exact: true }).click();
    await admin.locator('.toast', { hasText: 'Товар добавлен' }).waitFor();
    await admin.locator('td', { hasText: 'Тестовые рисовые палочки' }).waitFor();

    const shop = await ctx.newPage();
    await shop.goto(base + 'catalog.html?q=' + encodeURIComponent('рисовые палочки'));
    await shop.locator('#catalog-grid .card').first().waitFor();
    await shop.locator('#catalog-grid .card-title a').first().click();
    await shop.waitForURL(/product\.html\?id=/);
    await shop.locator('#p-name', { hasText: 'Тестовые рисовые палочки' }).waitFor();
    assert.match(await shop.locator('#p-price').textContent(), /155/);

    admin.once('dialog', d => d.accept());
    await admin.locator('tr', { hasText: 'Тестовые рисовые палочки' }).getByRole('button', { name: 'Удалить' }).click();
    await admin.locator('.toast', { hasText: 'Товар удалён' }).waitFor();

    // настройки отражаются на сайте
    await admin.goto(base + 'admin/#settings');
    await admin.fill('#sf-announcement', 'Скидка 10% на латяо до воскресенья');
    await admin.getByRole('button', { name: 'Сохранить' }).click();
    await admin.locator('.toast', { hasText: 'Настройки сохранены' }).waitFor();
    await shop.goto(base + 'index.html');
    await shop.locator('.announce', { hasText: 'Скидка 10% на латяо' }).waitFor();
    assert.deepEqual(errors, []);
  });

  test(`[${mode}] админка: неверный пароль и отказ без входа`, async () => {
    const { base } = servers[mode];
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(base + 'admin/');
    await page.fill('input[name="password"]', 'wrong-password');
    await page.getByRole('button', { name: 'Войти' }).click();
    await page.locator('#login-error', { hasText: 'Неверный пароль' }).waitFor();
    assert.equal(await page.locator('.admin-nav').count(), 0);
    await ctx.close();
  });

  test(`[${mode}] мобильная версия без горизонтального скролла, отказ от аналитики`, async () => {
    const { base } = servers[mode];
    const ctx = await browser.newContext({ viewport: { width: 375, height: 740 }, isMobile: true });
    const page = await ctx.newPage();
    const errors = watch(page);
    for (const p of ['index.html', 'catalog.html', 'p/latiao-lobster.html', 'checkout.html', 'privacy.html']) {
      await page.goto(base + p);
      const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
      assert.ok(sw <= cw, `${p}: scrollWidth ${sw} > ${cw}`);
    }
    await page.getByRole('button', { name: 'Только необходимые' }).click();
    assert.equal(await page.evaluate(() => localStorage.getItem('hc_vid')), null, 'без согласия идентификатор не создаётся');
    await page.locator('.burger').click();
    await page.locator('#nav.open').waitFor();
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}
