// Сборка статического сайта в dist/: пререндер всех страниц (SEO), бандлинг и минификация JS/CSS,
// sitemap.xml, robots.txt, манифест. Результат работает и на GitHub Pages, и через `npm start`.
import { build as esbuild, transform } from 'esbuild';
import { createHash, randomBytes, pbkdf2Sync } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  layout, homePage, catalogPage, productPage, dynamicProductPage, checkoutPage, textPage, crumbsLd, esc,
} from './templates.mjs';
import { privacyHtml, consentHtml, marketingHtml, cookiesHtml, offerHtml, deliveryHtml, contactsHtml } from './legal.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const site = JSON.parse(readFileSync(join(root, 'data/site.json'), 'utf8'));
if (process.env.SITE_URL) site.siteUrl = process.env.SITE_URL.replace(/\/$/, '');
const products = JSON.parse(readFileSync(join(root, 'data/products.json'), 'utf8')).map((p, i) => ({
  ...p,
  image: p.image || `assets/img/products/${p.id}.webp`,
  thumb: p.thumb || `assets/img/products/${p.id}-360.webp`,
  active: p.active !== false,
  hasPage: true,
  sort: i,
}));

for (const p of products) {
  for (const f of [p.image, p.thumb]) if (!existsSync(join(root, 'src', f))) throw new Error(`Нет изображения ${f} для ${p.id}`);
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'assets/js'), { recursive: true });
mkdirSync(join(dist, 'assets/css'), { recursive: true });

// ---------- демо-пароль админки (для статического режима) ----------
const demoPassword = process.env.DEMO_ADMIN_PASSWORD || 'haochi-demo-2026';
const salt = randomBytes(16).toString('hex');
const iterations = 210_000;
const demoAuth = { salt, iterations, hash: pbkdf2Sync(demoPassword, Buffer.from(salt, 'hex'), iterations, 32, 'sha256').toString('hex') };

// ---------- JS и CSS ----------
const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 10);
const assets = {};
for (const entry of ['shop', 'admin']) {
  const r = await esbuild({
    entryPoints: [join(root, `src/assets/js/${entry}.js`)], bundle: true, minify: true, format: 'esm', target: ['es2020'],
    write: false, legalComments: 'none', define: { __DEMO_AUTH__: JSON.stringify(demoAuth) },
  });
  const code = r.outputFiles[0].text;
  writeFileSync(join(dist, `assets/js/${entry}.js`), code);
  assets[entry] = hash(code);
}
for (const name of ['main', 'admin']) {
  let css = readFileSync(join(root, `src/assets/css/${name}.css`), 'utf8');
  if (name === 'admin') css = readFileSync(join(root, 'src/assets/css/main.css'), 'utf8') + '\n' + css;
  const out = (await transform(css, { loader: 'css', minify: true, target: ['chrome100', 'safari15', 'firefox100'] })).code;
  writeFileSync(join(dist, `assets/css/${name}.css`), out);
  assets[name === 'main' ? 'css' : 'admincss'] = hash(out);
}
cpSync(join(root, 'src/assets/img'), join(dist, 'assets/img'), { recursive: true });
cpSync(join(root, 'src/assets/fonts'), join(dist, 'assets/fonts'), { recursive: true });

// ---------- данные для демо-режима ----------
mkdirSync(join(dist, 'data'), { recursive: true });
writeFileSync(join(dist, 'data/products.json'), JSON.stringify(products));
writeFileSync(join(dist, 'data/site.json'), JSON.stringify({ settings: site.settings, docVersion: site.docVersion }));

// ---------- страницы ----------
const pages = [];
function page(path, opts) {
  const html = layout({ site, assets, path, ...opts });
  mkdirSync(dirname(join(dist, path)), { recursive: true });
  writeFileSync(join(dist, path), html);
  if (!opts.noindex) pages.push({ path, priority: opts.priority ?? 0.5 });
}

const home = homePage(site, products);
page('index.html', { title: 'ХАОЧИ — китайские снеки и напитки с доставкой', description: 'Интернет-магазин китайских снеков: латяо, молочный чай, моти, питьевое желе и редкие вкусы. Маркировка на русском, доставка по России за 1–5 дней.', body: home.body, jsonLd: home.jsonLd, preload: home.preload, pageId: 'home', priority: 1 });

const cat = catalogPage(site, products);
page('catalog.html', { title: 'Каталог китайских снеков и напитков — ХАОЧИ', description: `Каталог: ${products.length} позиций — латяо, молочный чай, моти, желе, лапша и газировка из Китая. Фильтры по категориям и остроте.`, body: cat.body, jsonLd: cat.jsonLd, pageId: 'catalog', active: 'catalog', priority: 0.9 });

for (const p of products) {
  const pp = productPage(site, p, products);
  page(`p/${p.id}.html`, {
    title: `${p.name}${p.weight ? `, ${p.weight}` : ''} — купить в ХАОЧИ`,
    description: `${p.description}`.slice(0, 155) + (p.description.length > 155 ? '…' : ''),
    body: pp.body, jsonLd: pp.jsonLd, preload: pp.preload, ogImage: pp.ogImage, ogType: pp.ogType, pageId: 'product', priority: 0.8,
  });
}
page('product.html', { title: 'Товар — ХАОЧИ', description: 'Карточка товара интернет-магазина ХАОЧИ.', body: dynamicProductPage(), pageId: 'product', noindex: true });
page('checkout.html', { title: 'Оформление заказа — ХАОЧИ', description: 'Оформление заказа в интернет-магазине ХАОЧИ.', body: checkoutPage(site), pageId: 'checkout', noindex: true });

const text = (path, title, description, html, opts = {}) => page(path, {
  title: `${title} — ХАОЧИ`, description, body: textPage('', title, [[null, title]], html), pageId: 'text',
  jsonLd: [crumbsLd(site, [[path, title]])], priority: 0.3, ...opts,
});
text('delivery.html', 'Доставка и оплата', 'Курьер, пункты выдачи и Почта России. Бесплатная доставка от 2 500 ₽. Оплата картой или при получении.', deliveryHtml(site), { active: 'delivery', priority: 0.6 });
text('contacts.html', 'Контакты', 'Телефон, e-mail, адрес и реквизиты интернет-магазина ХАОЧИ.', contactsHtml(site), { active: 'contacts', priority: 0.5 });
text('offer.html', 'Публичная оферта', 'Условия договора розничной купли-продажи товаров дистанционным способом.', offerHtml(site));
text('privacy.html', 'Политика обработки персональных данных', 'Политика в отношении обработки персональных данных в соответствии со 152-ФЗ.', privacyHtml(site));
text('consent.html', 'Согласие на обработку персональных данных', 'Согласие пользователя на обработку персональных данных для оформления заказа.', consentHtml(site));
text('marketing.html', 'Согласие на получение рекламной рассылки', 'Согласие на получение рекламных и информационных сообщений.', marketingHtml(site));
text('cookies.html', 'Политика использования cookie', 'Какие cookie и данные локального хранилища использует сайт и зачем.', cookiesHtml(site));

const basePath = new URL(site.siteUrl + '/').pathname;
writeFileSync(join(dist, 'build-info.json'), JSON.stringify({ basePath, builtAt: new Date().toISOString() }));
page('404.html', {
  root: basePath,
  title: 'Страница не найдена — ХАОЧИ', description: 'Такой страницы нет — перейдите в каталог китайских снеков ХАОЧИ.', pageId: 'text', noindex: true,
  body: `<div class="container"><div class="empty"><p class="cn" lang="zh" aria-hidden="true">找不到</p><h1>Страница не найдена</h1><p>Возможно, она переехала или была удалена. Зато каталог на месте.</p><a class="btn btn-primary" href="${basePath}catalog.html">Перейти в каталог</a></div></div>`,
});

// Админ-панель: отдельная страница без индексации.
page('admin/index.html', {
  title: 'Админ-панель — ХАОЧИ', description: 'Панель управления магазином.', pageId: 'admin', noindex: true, scripts: ['admin'], bare: true,
  body: `<div id="admin-app"><main class="login-wrap" id="main"><form class="login panel" id="login-form" autocomplete="on">
<span class="seal" aria-hidden="true"><span>好</span><span>吃</span></span><h1>Вход в админ-панель</h1>
<label class="field"><span>Пароль администратора</span><input class="input" type="password" name="password" autocomplete="current-password" required maxlength="200"></label>
<p class="notice err" id="login-error" role="alert" hidden></p>
<button class="btn btn-primary btn-block" type="submit">Войти</button>
<p class="muted login-hint">Демо-пароль указан в README репозитория. После 5 неудачных попыток вход блокируется.</p>
<a class="muted" href="../index.html">Вернуться на сайт</a></form></main></div>`,
});
// у админки свой хеш CSS
const adminHtml = readFileSync(join(dist, 'admin/index.html'), 'utf8').replace(`admin.css?v=${assets.css}`, `admin.css?v=${assets.admincss}`);
writeFileSync(join(dist, 'admin/index.html'), adminHtml);

// ---------- служебные файлы ----------
const today = new Date().toISOString().slice(0, 10);
writeFileSync(join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map(p => `  <url><loc>${esc(`${site.siteUrl}/${p.path === 'index.html' ? '' : p.path}`)}</loc><lastmod>${today}</lastmod><priority>${p.priority.toFixed(1)}</priority></url>`).join('\n')}
</urlset>
`);
writeFileSync(join(dist, 'robots.txt'), `User-agent: *
Allow: /
Disallow: /admin/
Disallow: /checkout.html
Disallow: /api/

Sitemap: ${site.siteUrl}/sitemap.xml
`);
writeFileSync(join(dist, 'manifest.webmanifest'), JSON.stringify({
  name: 'ХАОЧИ — китайские снеки', short_name: 'ХАОЧИ', lang: 'ru', start_url: './', display: 'standalone',
  background_color: '#FBF7F0', theme_color: '#B3261E',
  icons: [{ src: 'assets/img/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'assets/img/icon-512.png', sizes: '512x512', type: 'image/png' }],
}));
writeFileSync(join(dist, '.nojekyll'), '');

console.log(`Готово: ${pages.length} индексируемых страниц, ${products.length} товаров → dist/`);
