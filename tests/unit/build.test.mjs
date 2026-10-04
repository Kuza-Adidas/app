// Проверки собранного сайта: SEO, безопасность разметки, отсутствие эмодзи.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = join(dirname(fileURLToPath(import.meta.url)), '../../dist');
const walk = (d) => readdirSync(d).flatMap(f => statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]);
const html = walk(dist).filter(f => f.endsWith('.html'));
const products = JSON.parse(readFileSync(join(dist, '../data/products.json'), 'utf8'));
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}\u{FE0F}]/u;

test('все страницы собраны', () => {
  assert.ok(existsSync(join(dist, 'index.html')));
  for (const p of products) assert.ok(existsSync(join(dist, `p/${p.id}.html`)), p.id);
  for (const f of ['catalog', 'checkout', 'privacy', 'consent', 'marketing', 'cookies', 'offer', 'delivery', 'contacts', '404']) assert.ok(existsSync(join(dist, `${f}.html`)), f);
  assert.ok(existsSync(join(dist, 'admin/index.html')));
});

test('каждая страница: title, description, CSP, lang, без inline-скриптов и стилей', () => {
  for (const f of html) {
    const s = readFileSync(f, 'utf8');
    assert.match(s, /<html lang="ru"/, f);
    assert.match(s, /<title>[^<]{10,}<\/title>/, f);
    assert.match(s, /<meta name="description" content="[^"]{20,}">/, f);
    assert.match(s, /http-equiv="Content-Security-Policy"/, f);
    assert.doesNotMatch(s, /\sstyle="/, `inline style в ${f}`);
    assert.doesNotMatch(s, /\son[a-z]+="/, `inline-обработчик в ${f}`);
    for (const m of s.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>/g)) assert.match(m[1], /application\/ld\+json/, `inline script в ${f}`);
  }
});

test('на сайте нет эмодзи', () => {
  for (const f of walk(dist).filter(f => /\.(html|js|css|json)$/.test(f))) {
    const m = readFileSync(f, 'utf8').match(EMOJI);
    assert.equal(m, null, `эмодзи «${m && m[0]}» в ${f}`);
  }
});

test('у всех изображений есть alt, width и height', () => {
  for (const f of html) {
    for (const m of readFileSync(f, 'utf8').matchAll(/<img\b[^>]*>/g)) {
      assert.match(m[0], /\balt="/, `${f}: ${m[0].slice(0, 80)}`);
      assert.match(m[0], /\bwidth="\d+"/, f);
      assert.match(m[0], /\bheight="\d+"/, f);
    }
  }
});

test('SEO: canonical, JSON-LD Product, sitemap и robots', () => {
  const page = readFileSync(join(dist, 'p/latiao-lobster.html'), 'utf8');
  assert.match(page, /<link rel="canonical" href="https:\/\/[^"]+\/p\/latiao-lobster\.html">/);
  const ld = [...page.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map(m => JSON.parse(m[1]));
  const prod = ld.find(x => x['@type'] === 'Product');
  assert.equal(prod.offers.priceCurrency, 'RUB');
  assert.equal(prod.offers.price, 69);
  assert.equal(prod.aggregateRating, undefined, 'никаких выдуманных рейтингов');
  assert.equal(page.match(/<h1\b/g).length, 1, 'один h1 на странице');
  const sitemap = readFileSync(join(dist, 'sitemap.xml'), 'utf8');
  assert.equal((sitemap.match(/<url>/g) || []).length, products.length + 9);
  assert.doesNotMatch(sitemap, /admin|checkout/);
  assert.match(readFileSync(join(dist, 'robots.txt'), 'utf8'), /Disallow: \/admin\//);
  assert.match(readFileSync(join(dist, 'admin/index.html'), 'utf8'), /noindex/);
});

test('производительность: размер ресурсов в разумных пределах', () => {
  const size = (p) => statSync(join(dist, p)).size;
  assert.ok(size('assets/js/shop.js') < 80_000);
  assert.ok(size('assets/css/main.css') < 50_000, 'CSS до 50 КБ (≈10 КБ в gzip)');
  for (const f of walk(join(dist, 'assets/img/products'))) assert.ok(statSync(f).size < 80_000, f);
  const home = readFileSync(join(dist, 'index.html'), 'utf8');
  assert.match(home, /rel="preload"[^>]+as="font"/);
  assert.match(home, /loading="lazy"/);
});

test('согласия на странице оформления', () => {
  const s = readFileSync(join(dist, 'checkout.html'), 'utf8');
  assert.match(s, /name="offer" required/);
  assert.match(s, /name="pd" required/);
  assert.match(s, /name="marketing">/, 'рассылка — необязательная галочка без предустановки');
  assert.doesNotMatch(s, /name="marketing"[^>]*checked/);
});
