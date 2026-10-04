// Шаблоны страниц. Весь пользовательский/каталожный текст проходит через esc().
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = new Intl.NumberFormat('ru-RU');
export const money = (n) => `${nf.format(n)}&nbsp;₽`;

export const CATEGORIES = { drinks: 'Напитки', sweets: 'Сладости', spicy: 'Острое', snacks: 'Снеки', noodles: 'Лапша' };
const CAT_CN = { drinks: '饮料', sweets: '甜品', spicy: '辣味', snacks: '零食', noodles: '面条' };
const CAT_HINT = { drinks: 'молочный чай, коктейли, газировка', sweets: 'моти, желе, ириски', spicy: 'латяо, арахис мала', snacks: 'крекеры, чипсы, слива', noodles: 'острая лапша' };

const ICON = {
  cart: '<path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6.2"/><circle cx="10" cy="20" r="1.3"/><circle cx="17" cy="20" r="1.3"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  chili: '<path d="M8 4c1 0 2 1 2 2 4 0 8 3 8 8 0 3-3 6-7 6-3 0-6-1-7-3 3 0 6-2 6-6V6"/>',
  box: '<path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  truck: '<path d="M3 6h11v10H3zM14 9h4l3 3v4h-7"/><circle cx="7" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>',
  label: '<path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
};
export const icon = (n, cls = 'icon') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICON[n]}</svg>`;
const seal = (cls = 'seal') => `<span class="${cls}" aria-hidden="true"><span>好</span><span>吃</span></span>`;

export function spicy(level) {
  if (!level) return '';
  let s = `<span class="spicy" role="img" aria-label="Острота ${level} из 3">`;
  for (let i = 1; i <= 3; i++) s += icon('chili', i <= level ? '' : 'off');
  return s + '</span>';
}

export function productCard(p, r, eager = false) {
  return `<article class="card">
<div class="card-media">${p.badge ? `<span class="badge" data-kind="${esc(p.badge)}">${esc(p.badge)}</span>` : ''}<img src="${r}${esc(p.thumb)}" srcset="${r}${esc(p.thumb)} 360w, ${r}${esc(p.image)} 720w" sizes="(max-width: 560px) 46vw, 260px" alt="${esc(p.name)}" width="360" height="450" loading="${eager ? 'eager' : 'lazy'}" decoding="async"></div>
<div class="card-body"><div class="card-meta"><span>${esc(p.weight)}</span>${spicy(p.spicy)}</div>
<h3 class="card-title"><a href="${r}p/${esc(p.id)}.html">${esc(p.name)}</a></h3>
<div class="card-foot"><div class="price"><b>${money(p.price)}</b>${p.oldPrice ? `<s>${money(p.oldPrice)}</s>` : ''}</div><div data-buy="${esc(p.id)}"><button class="add-btn" type="button" data-add="${esc(p.id)}" aria-label="Добавить «${esc(p.name)}» в корзину">${icon('cart')}В корзину</button></div></div></div>
</article>`;
}

function header(r, active) {
  const nav = [
    ['catalog.html', 'Каталог', 'catalog'], ['catalog.html?cat=drinks', 'Напитки'], ['catalog.html?cat=sweets', 'Сладости'],
    ['catalog.html?cat=spicy', 'Острое'], ['delivery.html', 'Доставка и оплата', 'delivery'], ['contacts.html', 'Контакты', 'contacts'],
  ];
  return `<header class="header"><div class="container header-row">
<a class="logo" href="${r}index.html">${seal()}<span class="logo-text"><b>ХАОЧИ</b><small>китайские снеки</small></span></a>
<nav class="nav" id="nav" aria-label="Основное меню">${nav.map(([href, label, key]) => `<a href="${r}${href}"${key && key === active ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav>
<div class="header-actions">
<a class="icon-btn" href="${r}catalog.html" aria-label="Поиск по каталогу">${icon('search')}</a>
<a class="icon-btn" href="${r}checkout.html" data-open-cart aria-label="Корзина">${icon('cart')}<span class="cart-count" hidden>0</span></a>
<button class="icon-btn burger" type="button" aria-label="Меню" aria-expanded="false" aria-controls="nav">${icon('menu')}</button>
</div></div></header>`;
}

function footer(r, site) {
  const s = site.settings;
  return `<footer class="footer"><div class="container">
<div class="footer-grid">
<div><a class="logo" href="${r}index.html">${seal()}<span class="logo-text"><b>ХАОЧИ</b><small>китайские снеки</small></span></a>
<p>Магазин азиатских снеков и напитков. Только товары с маркировкой на русском языке и документами о соответствии ЕАЭС.</p></div>
<div><h3>Покупателям</h3><ul><li><a href="${r}catalog.html">Каталог</a></li><li><a href="${r}delivery.html">Доставка и оплата</a></li><li><a href="${r}delivery.html#returns">Возврат и обмен</a></li><li><a href="${r}contacts.html">Контакты</a></li></ul></div>
<div><h3>Документы</h3><ul><li><a href="${r}offer.html">Публичная оферта</a></li><li><a href="${r}privacy.html">Политика обработки персональных данных</a></li><li><a href="${r}consent.html">Согласие на обработку данных</a></li><li><a href="${r}marketing.html">Согласие на рассылку</a></li><li><a href="${r}cookies.html">Политика cookie</a></li></ul></div>
<div><h3>Связаться</h3><ul><li><a href="tel:${esc(s.phone.replace(/[^\d+]/g, ''))}" data-setting="phone" data-setting-href="phone">${esc(s.phone)}</a></li><li><a href="mailto:${esc(s.email)}" data-setting="email" data-setting-href="email">${esc(s.email)}</a></li><li data-setting="address">${esc(s.address)}</li><li data-setting="hours">${esc(s.hours)}</li></ul></div>
</div>
<div class="footer-bottom"><span>© 2026 ${esc(site.legal.company)}. ИНН ${esc(site.legal.inn)}, ОГРН ${esc(site.legal.ogrn)}</span><span id="mode-flag"></span><button class="link-btn" type="button" data-open-consent>Настройки cookie</button></div>
</div></footer>`;
}

const drawer = (r) => `<div class="drawer-backdrop" data-close-cart></div>
<aside class="drawer" id="cart-drawer" aria-label="Корзина" aria-hidden="true" role="dialog" aria-modal="true">
<div class="drawer-head"><h2>Корзина</h2><button class="icon-btn" type="button" data-close-cart aria-label="Закрыть корзину">${icon('close')}</button></div>
<div class="drawer-body"></div><div class="drawer-foot" hidden></div></aside>`;

const consentBanner = (r) => `<section class="consent" id="consent" hidden aria-label="Согласие на использование cookie">
<p>Мы используем файлы cookie и аналогичные технологии: необходимые — для работы корзины и сайта, аналитические — чтобы понимать, как улучшить магазин (первый визит, просмотры, оформление заказа). Аналитика включается только с вашего согласия. Подробнее — в <a href="${r}cookies.html">Политике cookie</a> и <a href="${r}privacy.html">Политике обработки персональных данных</a>.</p>
<div class="consent-options" id="consent-options" hidden>
<label class="check"><input type="checkbox" checked disabled> <span><b>Необходимые</b> — корзина, настройки, безопасность. Всегда включены.</span></label>
<label class="check"><input type="checkbox" id="consent-analytics"> <span><b>Аналитические</b> — обезличенная статистика посещений и покупок.</span></label>
<button class="btn btn-ghost btn-sm" type="button" id="consent-save">Сохранить выбор</button>
</div>
<div class="consent-actions"><button class="btn btn-primary btn-sm" type="button" id="consent-accept">Принять все</button><button class="btn btn-ghost btn-sm" type="button" id="consent-necessary">Только необходимые</button><button class="link-btn" type="button" id="consent-settings">Настроить</button></div>
</section>`;

export const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'";

/**
 * Обёртка страницы.
 * path — путь файла относительно корня сайта (например, 'p/latiao.html').
 */
export function layout({ root: rootOverride, site, assets, path, title, description, body, pageId, jsonLd = [], noindex = false, preload = [], ogImage, ogType = 'website', active, scripts = ['shop'], bare = false }) {
  const depth = path.split('/').length - 1;
  const r = rootOverride ?? '../'.repeat(depth);
  const canonical = `${site.siteUrl}/${path === 'index.html' ? '' : path}`;
  const og = ogImage || `${site.siteUrl}/assets/img/og.jpg`;
  return `<!doctype html>
<html lang="ru" data-root="${r}" data-doc-version="${esc(site.docVersion)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta name="referrer" content="strict-origin-when-cross-origin">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="${noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large'}">
${noindex ? '' : `<link rel="canonical" href="${esc(canonical)}">`}
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="ХАОЧИ">
<meta property="og:locale" content="ru_RU">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(og)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#B3261E">
<link rel="icon" href="${r}assets/img/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="${r}assets/img/apple-touch-icon.png">
<link rel="manifest" href="${r}manifest.webmanifest">
<link rel="preload" href="${r}assets/fonts/manrope-cyrillic-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="${r}assets/fonts/playfair-display-cyrillic-700-normal.woff2" as="font" type="font/woff2" crossorigin>
${preload.map(src => `<link rel="preload" href="${r}${src}" as="image" fetchpriority="high">`).join('\n')}
<link rel="stylesheet" href="${r}assets/css/${scripts.includes('admin') ? 'admin' : 'main'}.css?v=${assets.css}">
${scripts.map(s => `<script type="module" src="${r}assets/js/${s}.js?v=${assets[s]}"></script>`).join('\n')}
${jsonLd.map(j => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`).join('\n')}
</head>
<body data-page="${pageId}">
${bare ? body : `<a class="skip-link" href="#main">Перейти к содержанию</a>
<div class="announce" data-setting="announcement">${esc(site.settings.announcement)}</div>
${header(r, active)}
<main id="main">
${body}
</main>
${footer(r, site)}
${drawer(r)}
${consentBanner(r)}`}
</body>
</html>`;
}

export function crumbs(r, items) {
  return `<nav aria-label="Хлебные крошки"><ol class="crumbs"><li><a href="${r}index.html">Главная</a></li>${items.map(([href, label], i) =>
    `<li>${href ? `<a href="${r}${href}">${esc(label)}</a>` : `<span aria-current="page"${i === items.length - 1 ? ' id="crumb-name"' : ''}>${esc(label)}</span>`}</li>`).join('')}</ol></nav>`;
}

export function crumbsLd(site, items) {
  return {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [['', 'Главная'], ...items].map(([href, name], i) => ({ '@type': 'ListItem', position: i + 1, name, item: `${site.siteUrl}/${href}` })),
  };
}

// ------------------------------- главная -------------------------------
export function homePage(site, products) {
  const r = '';
  const pick = (id) => products.find(p => p.id === id);
  const hits = products.filter(p => p.badge === 'Хит' || p.oldPrice).slice(0, 8);
  const fresh = products.filter(p => p.badge === 'Новинка').concat(products.filter(p => p.badge !== 'Новинка' && p.photo)).slice(0, 4);
  const catImg = { drinks: 'milktea-original', sweets: 'jelly-strawberry', spicy: 'latiao-lobster', snacks: 'rice-crackers', noodles: 'noodles-chongqing' };
  const faq = [
    ['Товары оригинальные?', 'Да. Мы работаем с официальными импортёрами: на каждой упаковке есть русскоязычная маркировка, а на товары — декларации о соответствии техническим регламентам ЕАЭС.'],
    ['Как быстро доставите?', 'По городу — курьером за 1–2 дня, в пункты выдачи и Почтой России — 2–5 рабочих дней. Стоимость рассчитывается при оформлении, при заказе от суммы бесплатной доставки — бесплатно.'],
    ['Насколько острые латяо?', 'Остроту мы указываем на каждой карточке шкалой из трёх перчиков. Если вы только знакомитесь с китайской кухней — начните с одного-двух.'],
    ['Можно ли вернуть товар?', 'Пищевые продукты надлежащего качества возврату не подлежат по закону, но если товар пришёл повреждённым или с истекающим сроком — заменим или вернём деньги.'],
    ['Как связаться с поддержкой?', 'Напишите в чат на сайте (кнопка в правом нижнем углу) — помощник ответит сразу, а оператор подключится в рабочее время.'],
  ];
  const body = `
<section class="hero"><div class="container hero-grid">
<div>
<span class="eyebrow">Китайские снеки и напитки</span>
<h1>Вкус Китая —<br><em>в&nbsp;каждой упаковке</em></h1>
<p class="hero-lead">Латяо, молочный чай, моти и ещё десятки вкусов, о которых вы слышали в обзорах. Привезли, проверили, доставим за 1–5 дней.</p>
<div class="hero-cta"><a class="btn btn-primary" href="catalog.html">Перейти в каталог</a><a class="btn btn-ghost" href="catalog.html?cat=spicy">Острое меню</a></div>
<div class="hero-facts"><div><b>${products.length}+</b><span>позиций в каталоге</span></div><div><b>1–5 дней</b><span>доставка по России</span></div><div><b data-setting="freeShippingFrom">${money(site.settings.freeShippingFrom)}</b><span>бесплатная доставка от</span></div></div>
</div>
<div class="hero-art" aria-hidden="true"><div class="hero-sun"></div><div class="hero-glyph">好吃</div>
<img class="p4" src="assets/img/products/latiao-lobster-360.webp" alt="" width="360" height="450" decoding="async">
<img class="p2" src="assets/img/products/milktea-jasmine-360.webp" alt="" width="360" height="450" decoding="async">
<img class="p3" src="assets/img/products/jelly-peach-360.webp" alt="" width="360" height="450" decoding="async">
<img class="p1" src="assets/img/products/hibaby-strawberry.webp" alt="" width="720" height="900" fetchpriority="high" decoding="async">
</div></div></section>

<div class="container"><div class="benefits">
<div class="benefit">${icon('shield')}<div><b>Оригинальная продукция</b><span>Официальный импорт и декларации ЕАЭС</span></div></div>
<div class="benefit">${icon('label')}<div><b>Маркировка на русском</b><span>Состав и сроки — на каждой упаковке</span></div></div>
<div class="benefit">${icon('truck')}<div><b>Доставка 1–5 дней</b><span>Курьер, пункты выдачи, Почта России</span></div></div>
<div class="benefit">${icon('tag')}<div><b>Честные цены</b><span>Без скрытых наценок и подписок</span></div></div>
</div></div>

<section class="section section-alt" aria-labelledby="cats-title"><div class="container">
<div class="section-head"><div><span class="ornament" aria-hidden="true"></span><h2 id="cats-title">Категории</h2></div><p>Выберите настроение: сладкое, острое или что-нибудь, чтобы запить.</p></div>
<div class="cats">${Object.entries(CATEGORIES).map(([k, v]) => `<a class="cat" href="catalog.html?cat=${k}"><span class="cn" lang="zh">${CAT_CN[k]}</span><img src="assets/img/products/${catImg[k]}-360.webp" alt="" width="360" height="450" loading="lazy" decoding="async"><b>${v}</b><span>${CAT_HINT[k]}</span></a>`).join('')}</div>
</div></section>

<section class="section" aria-labelledby="hits-title"><div class="container">
<div class="section-head"><div><span class="ornament" aria-hidden="true"></span><h2 id="hits-title">Хиты продаж</h2></div><a class="btn btn-ghost btn-sm" href="catalog.html">Весь каталог</a></div>
<div class="grid" data-grid="hits">${hits.map(p => productCard(p, r)).join('')}</div>
</div></section>

<section class="section pt-0"><div class="container"><div class="promo">
<div><span class="eyebrow eyebrow-gold">Острый вызов</span><h2>Сколько перчиков выдержите вы?</h2><p>Латяо, соевые полоски мала и лапша по-чунцински — собрали самые острые снеки Китая в одном разделе. Шкала остроты на каждой карточке.</p><a class="btn btn-light" href="catalog.html?cat=spicy">Выбрать острое</a></div>
<div class="promo-art" aria-hidden="true"><img src="assets/img/products/latiao-classic-360.webp" alt="" width="360" height="450" loading="lazy"><img src="assets/img/products/latiao-lobster-360.webp" alt="" width="360" height="450" loading="lazy"><img src="assets/img/products/noodles-chongqing-360.webp" alt="" width="360" height="450" loading="lazy"></div>
</div></div></section>

<section class="section section-alt" aria-labelledby="new-title"><div class="container">
<div class="section-head"><div><span class="ornament" aria-hidden="true"></span><h2 id="new-title">Новинки и находки</h2></div><p>То, что недавно появилось на полках и уже разлетается.</p></div>
<div class="grid" data-grid="new">${fresh.map(p => productCard(p, r)).join('')}</div>
</div></section>

<section class="section" aria-labelledby="about-title"><div class="container about">
<div><span class="ornament" aria-hidden="true"></span><h2 id="about-title">Почему ХАОЧИ</h2><p class="muted">«Хаочи» (好吃) по-китайски значит «вкусно». Мы пробуем каждую новинку сами и оставляем в каталоге только то, за что не стыдно.</p>
<a class="btn btn-ghost" href="delivery.html">Условия доставки</a></div>
<ol class="about-list">
<li><span class="num">1</span><div><b>Отбираем вкусы</b><span>Следим за трендами китайских маркетплейсов и тестируем новинки.</span></div></li>
<li><span class="num">2</span><div><b>Проверяем документы</b><span>Работаем только с товарами, прошедшими сертификацию в ЕАЭС.</span></div></li>
<li><span class="num">3</span><div><b>Бережно упаковываем</b><span>Хрупкое — в пузырчатую плёнку, напитки — в отдельный пакет.</span></div></li>
<li><span class="num">4</span><div><b>Остаёмся на связи</b><span>Чат на сайте и ответы оператора каждый день.</span></div></li>
</ol></div></section>

<section class="section section-alt" aria-labelledby="faq-title"><div class="container">
<div class="section-head"><div><span class="ornament" aria-hidden="true"></span><h2 id="faq-title">Частые вопросы</h2></div></div>
<div class="faq">${faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</div>
</div></section>`;
  const jsonLd = [
    { '@context': 'https://schema.org', '@type': 'OnlineStore', name: 'ХАОЧИ', url: site.siteUrl + '/', logo: `${site.siteUrl}/assets/img/icon-512.png`, image: `${site.siteUrl}/assets/img/og.jpg`, email: site.settings.email, telephone: site.settings.phone, address: { '@type': 'PostalAddress', streetAddress: site.settings.address, addressCountry: 'RU' } },
    { '@context': 'https://schema.org', '@type': 'WebSite', name: 'ХАОЧИ', url: site.siteUrl + '/', inLanguage: 'ru', potentialAction: { '@type': 'SearchAction', target: `${site.siteUrl}/catalog.html?q={search_term_string}`, 'query-input': 'required name=search_term_string' } },
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
  ];
  return { body, jsonLd, preload: ['assets/img/products/hibaby-strawberry.webp'] };
}

// ------------------------------- каталог -------------------------------
export function catalogPage(site, products) {
  const r = '';
  const body = `
<div class="page-head"><div class="container">${crumbs(r, [[null, 'Каталог']])}<h1 id="catalog-title">Каталог</h1><p class="muted m-0">Китайские снеки, сладости и напитки — ${products.length} позиций с доставкой по России.</p></div></div>
<div class="container">
<div class="toolbar">
<div class="chips" id="cat-chips" role="group" aria-label="Категории"><a class="chip" href="catalog.html" data-cat="all" aria-current="true">Все</a>${Object.entries(CATEGORIES).map(([k, v]) => `<a class="chip" href="catalog.html?cat=${k}" data-cat="${k}" aria-current="false">${v}</a>`).join('')}</div>
<div class="filters">
<label class="search"><span class="visually-hidden">Поиск</span>${icon('search')}<input class="input" id="catalog-search" type="search" placeholder="Найти снек" maxlength="60" autocomplete="off"></label>
<label><span class="visually-hidden">Сортировка</span><select class="select" id="catalog-sort"><option value="popular">По популярности</option><option value="price-asc">Сначала дешевле</option><option value="price-desc">Сначала дороже</option><option value="name">По названию</option></select></label>
<label class="check"><input type="checkbox" id="catalog-stock"> <span>В наличии</span></label>
</div></div>
<p class="result-count" id="result-count" aria-live="polite">Найдено товаров: ${products.length}</p>
<h2 class="visually-hidden">Товары</h2><div class="grid" id="catalog-grid" data-grid="all">${products.map((p, i) => productCard(p, r, i < 4)).join('')}</div>
<div class="empty" id="catalog-empty" hidden><p>Ничего не найдено. Попробуйте изменить запрос или выбрать другую категорию.</p></div>
<div class="spacer"></div>
</div>`;
  const jsonLd = [
    crumbsLd(site, [['catalog.html', 'Каталог']]),
    { '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: products.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: `${site.siteUrl}/p/${p.id}.html`, name: p.name })) },
  ];
  return { body, jsonLd };
}

// ------------------------------- товар -------------------------------
export function productPage(site, p, products) {
  const r = '../';
  const related = products.filter(x => x.id !== p.id && x.category === p.category).concat(products.filter(x => x.id !== p.id && x.category !== p.category)).slice(0, 4);
  const body = `
<div class="container" data-product-id="${esc(p.id)}">
<div class="pt-24">${crumbs(r, [['catalog.html', 'Каталог'], [`catalog.html?cat=${p.category}`, CATEGORIES[p.category]], [null, p.name]])}</div>
<div class="product" id="product-root">
<div class="product-media">${p.badge ? `<span class="badge" data-kind="${esc(p.badge)}">${esc(p.badge)}</span>` : ''}<img id="p-img" src="${r}${esc(p.image)}" alt="${esc(p.name)}" width="720" height="900" fetchpriority="high" decoding="async"></div>
<div class="product-info">
<h1 id="p-name">${esc(p.name)}</h1>
${p.cn ? `<div class="cn" lang="zh">${esc(p.cn)}</div>` : ''}
${spicy(p.spicy)}
<div class="product-price"><b id="p-price">${money(p.price)}</b><s id="p-old"${p.oldPrice ? '' : ' hidden'}>${p.oldPrice ? money(p.oldPrice) : ''}</s></div>
<div class="product-buy"><div data-buy="${esc(p.id)}" data-big="1"><button class="btn btn-primary" type="button" data-add="${esc(p.id)}">${icon('cart')}Добавить в корзину</button></div><span class="stock${p.stock > 0 ? '' : ' out'}" id="p-stock">${p.stock > 0 ? 'В наличии' : 'Нет в наличии'}</span></div>
<p id="p-desc">${esc(p.description)}</p>
<dl class="specs"><dt>Вес / объём</dt><dd id="p-weight">${esc(p.weight)}</dd><dt>Категория</dt><dd>${CATEGORIES[p.category]}</dd><dt>Страна</dt><dd>Китай</dd><dt>Маркировка</dt><dd>на русском языке</dd></dl>
<details open><summary>Состав</summary><p id="p-comp">${esc(p.composition)}</p></details>
<details><summary>Условия хранения</summary><p id="p-storage">${esc(p.storage)}</p></details>
<details><summary>Доставка и оплата</summary><p>Курьер по городу — 290 ₽, пункт выдачи — 190 ₽, Почта России — 350 ₽. Бесплатно при заказе от <span data-setting="freeShippingFrom">${money(site.settings.freeShippingFrom)}</span>. Оплата картой онлайн или при получении.</p></details>
</div></div>
<section class="section pt-0" aria-labelledby="rel-title"><h2 id="rel-title">С этим покупают</h2><div class="grid" data-grid="related:${esc(p.id)}">${related.map(x => productCard(x, r)).join('')}</div></section>
</div>`;
  const url = `${site.siteUrl}/p/${p.id}.html`;
  const jsonLd = [
    crumbsLd(site, [['catalog.html', 'Каталог'], [`catalog.html?cat=${p.category}`, CATEGORIES[p.category]], [`p/${p.id}.html`, p.name]]),
    {
      '@context': 'https://schema.org', '@type': 'Product', name: p.name, sku: p.id, image: [`${site.siteUrl}/${p.image}`],
      description: p.description, category: CATEGORIES[p.category], countryOfOrigin: 'CN', ...(p.weight ? { size: p.weight } : {}),
      offers: {
        '@type': 'Offer', url, priceCurrency: 'RUB', price: p.price, itemCondition: 'https://schema.org/NewCondition',
        availability: p.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        seller: { '@type': 'Organization', name: 'ХАОЧИ' },
      },
    },
  ];
  return { body, jsonLd, preload: [p.image], ogImage: `${site.siteUrl}/${p.image}`, ogType: 'product' };
}

export function dynamicProductPage() {
  const r = '';
  return `<div class="container" data-product-id="">
<div class="pt-24">${crumbs(r, [['catalog.html', 'Каталог'], [null, 'Товар']])}</div>
<div class="product" id="product-root"><div class="empty"><p>Загружаем товар…</p></div></div>
<section class="section pt-0" aria-labelledby="rel-title"><h2 id="rel-title">Вам может понравиться</h2><div class="grid" data-grid="related:"></div></section>
</div>`;
}

// ------------------------------- оформление -------------------------------
export function checkoutPage(site) {
  const r = '';
  const field = (name, label, attrs = '', req = true, full = false) => `<div class="field${full ? ' full' : ''}"><label for="f-${name}"${name === 'address' ? ' id="address-label"' : ''}>${label} ${req ? `<span class="req"${name === 'address' ? ' id="address-req"' : ''} aria-hidden="true">*</span>` : ''}</label><input class="input" id="f-${name}" name="${name}" ${attrs} aria-describedby="err-${name}"><div class="field-error" id="err-${name}" role="alert"></div></div>`;
  return `
<div class="page-head"><div class="container">${crumbs(r, [[null, 'Оформление заказа']])}<h1>Оформление заказа</h1></div></div>
<div class="container">
<div class="empty" id="checkout-empty" hidden><h2>Корзина пуста</h2><p>Добавьте товары из каталога, чтобы оформить заказ.</p><a class="btn btn-primary" href="catalog.html">Перейти в каталог</a></div>
<div class="panel success" id="checkout-success" hidden tabindex="-1">${seal()}<h2>Спасибо! Заказ <span id="order-number"></span> принят</h2><p>Сумма заказа: <b id="order-total"></b>. Мы свяжемся с вами по телефону или e-mail, чтобы подтвердить заказ и детали доставки.</p><a class="btn btn-primary" href="catalog.html">Продолжить покупки</a></div>
<div class="checkout" id="checkout-main">
<form id="checkout-form" novalidate>
<div class="panel"><fieldset><legend>Контактные данные</legend><div class="form-grid">
${field('name', 'Имя', 'autocomplete="name" maxlength="80" required')}
${field('phone', 'Телефон', 'type="tel" autocomplete="tel" inputmode="tel" maxlength="20" placeholder="+7 900 000-00-00" required')}
${field('email', 'E-mail', 'type="email" autocomplete="email" maxlength="254" required', true, true)}
</div></fieldset></div>
<div class="panel"><fieldset><legend>Доставка</legend>
<div class="radio-cards" role="radiogroup">
<label class="radio-card"><input type="radio" name="delivery" value="courier" checked><span>Курьер по городу</span><small>290 ₽ · 1–2 дня</small></label>
<label class="radio-card"><input type="radio" name="delivery" value="pickup"><span>Пункт выдачи</span><small>190 ₽ · 2–4 дня</small></label>
<label class="radio-card"><input type="radio" name="delivery" value="post"><span>Почта России</span><small>350 ₽ · 3–7 дней</small></label>
</div><div class="field-error" id="err-delivery" role="alert"></div>
<div class="form-grid mt-14">
${field('city', 'Город', 'autocomplete="address-level2" maxlength="80" required')}
${field('address', 'Адрес доставки', 'autocomplete="street-address" maxlength="200"')}
<div class="field full"><label for="f-comment">Комментарий к заказу</label><textarea class="textarea" id="f-comment" name="comment" maxlength="500"></textarea></div>
</div></fieldset></div>
<div class="panel"><fieldset><legend>Оплата</legend>
<div class="radio-cards" role="radiogroup">
<label class="radio-card"><input type="radio" name="payment" value="card" checked><span>Картой онлайн</span><small>после подтверждения</small></label>
<label class="radio-card"><input type="radio" name="payment" value="cash"><span>При получении</span><small>картой или наличными</small></label>
</div><div class="field-error" id="err-payment" role="alert"></div>
<p class="muted small-note">Ссылку на оплату пришлём после подтверждения наличия. Данные карт обрабатываются только на стороне банка-эквайера и не передаются магазину.</p>
</fieldset></div>
<div class="panel">
<input class="hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
<div class="consents">
<label class="check"><input type="checkbox" name="offer" required aria-describedby="err-offer"><span>Я ознакомлен(а) и согласен(на) с <a href="offer.html" target="_blank" rel="noopener">условиями публичной оферты</a> и <a href="delivery.html" target="_blank" rel="noopener">условиями доставки и возврата</a> <span class="req" aria-hidden="true">*</span></span></label>
<div class="field-error" id="err-offer" role="alert"></div>
<label class="check"><input type="checkbox" name="pd" required aria-describedby="err-pd"><span>Даю <a href="consent.html" target="_blank" rel="noopener">согласие на обработку персональных данных</a> для оформления и доставки заказа в соответствии с <a href="privacy.html" target="_blank" rel="noopener">Политикой обработки персональных данных</a> <span class="req" aria-hidden="true">*</span></span></label>
<div class="field-error" id="err-pd" role="alert"></div>
<label class="check"><input type="checkbox" name="marketing"><span>Хочу получать новости и персональные предложения (<a href="marketing.html" target="_blank" rel="noopener">согласие на рекламную рассылку</a>). Необязательно, можно отозвать в любой момент.</span></label>
</div>
<div class="notice err" id="form-error" role="alert" hidden></div>
<button class="btn btn-primary btn-block mt-14" type="submit">Подтвердить заказ</button>
</div>
</form>
<aside class="summary panel" aria-labelledby="sum-title"><h2 id="sum-title">Ваш заказ</h2><div id="summary-lines"></div><div class="totals mt-14" id="summary-totals"></div></aside>
</div></div>`;
}

export function textPage(r, title, crumbsArr, html) {
  return `<div class="page-head"><div class="container">${crumbs(r, crumbsArr)}<h1>${esc(title)}</h1></div></div><div class="container"><article class="prose">${html}</article></div>`;
}
