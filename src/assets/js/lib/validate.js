// Общие правила валидации: используются и в браузере (демо-режим без сервера),
// и на сервере (Node). Сервер никогда не доверяет данным клиента и проверяет всё повторно.

export const CATEGORIES = {
  drinks: 'Напитки',
  sweets: 'Сладости',
  spicy: 'Острое',
  snacks: 'Снеки',
  noodles: 'Лапша',
};

export const ORDER_STATUSES = {
  new: 'Новый',
  confirmed: 'Подтверждён',
  shipped: 'Отправлен',
  done: 'Выполнен',
  cancelled: 'Отменён',
};

export const DELIVERY = {
  courier: { label: 'Курьер по городу', price: 290 },
  pickup: { label: 'Пункт выдачи', price: 190 },
  post: { label: 'Почта России', price: 350 },
};

export const EVENT_TYPES = ['first_visit', 'page_view', 'add_to_cart', 'checkout_start', 'purchase'];

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/g;

/** Приводит значение к строке, удаляет управляющие символы, обрезает пробелы и длину. */
export function cleanText(value, max = 500) {
  if (value === undefined || value === null) return '';
  return String(value).replace(CONTROL, '').replace(/\r\n?/g, '\n').trim().slice(0, max);
}

export function isId(v) {
  return typeof v === 'string' && /^[a-z0-9][a-z0-9-]{1,60}$/.test(v);
}

export function slugify(s) {
  const map = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
  return String(s || '').toLowerCase().split('').map(c => map[c] ?? c).join('')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'item';
}

export const PHONE_RE = /^\+?[0-9\s\-()]{10,20}$/;
export const EMAIL_RE = /^[^\s@<>"']{1,64}@[^\s@<>"']{1,190}\.[a-z]{2,24}$/i;

/** Разрешены только локальные пути к картинкам или data:-URL растровых форматов. */
export function isSafeImage(src) {
  if (typeof src !== 'string' || src.length === 0) return false;
  if (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(src)) return src.length <= 3_000_000;
  return /^(assets\/img\/|uploads\/)[A-Za-z0-9_\-/]+\.(webp|png|jpe?g)$/.test(src) && !src.includes('..');
}

function num(v, { min = 0, max = 1e7, int = false } = {}) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return int ? Math.round(n) : Math.round(n * 100) / 100;
}

/** Проверка карточки товара из админки. Возвращает { ok, errors, value }. */
export function validateProduct(input, { existingIds = [], isNew = false } = {}) {
  const errors = {};
  const p = input && typeof input === 'object' ? input : {};
  const value = {
    id: cleanText(p.id, 60).toLowerCase(),
    name: cleanText(p.name, 120),
    cn: cleanText(p.cn, 60),
    category: cleanText(p.category, 20),
    price: num(p.price, { min: 1, max: 1_000_000 }),
    oldPrice: p.oldPrice === '' || p.oldPrice === null || p.oldPrice === undefined ? null : num(p.oldPrice, { min: 1, max: 1_000_000 }),
    weight: cleanText(p.weight, 30),
    badge: cleanText(p.badge, 20),
    spicy: num(p.spicy ?? 0, { min: 0, max: 3, int: true }),
    stock: num(p.stock ?? 0, { min: 0, max: 100_000, int: true }),
    description: cleanText(p.description, 2000),
    composition: cleanText(p.composition, 1000),
    storage: cleanText(p.storage, 500),
    image: typeof p.image === 'string' ? p.image : '',
    thumb: typeof p.thumb === 'string' ? p.thumb : '',
    active: p.active === undefined ? true : Boolean(p.active),
    photo: Boolean(p.photo),
  };
  if (isNew && !value.id) value.id = slugify(value.name);
  if (!isId(value.id)) errors.id = 'Латиница, цифры и дефис, 2–60 символов';
  else if (isNew && existingIds.includes(value.id)) errors.id = 'Такой идентификатор уже есть';
  if (value.name.length < 3) errors.name = 'Название слишком короткое';
  if (!CATEGORIES[value.category]) errors.category = 'Выберите категорию';
  if (value.price === null) errors.price = 'Цена от 1 до 1 000 000 ₽';
  const hasOld = !(p.oldPrice === '' || p.oldPrice === null || p.oldPrice === undefined);
  if (hasOld && value.oldPrice === null) errors.oldPrice = 'Некорректная цена';
  if (value.oldPrice !== null && value.price !== null && value.oldPrice <= value.price) value.oldPrice = null;
  if (value.spicy === null) errors.spicy = 'От 0 до 3';
  if (value.stock === null) errors.stock = 'От 0 до 100 000';
  if (!value.image || !isSafeImage(value.image)) errors.image = 'Загрузите изображение (PNG, JPEG или WebP)';
  if (value.thumb && !isSafeImage(value.thumb)) value.thumb = '';
  return { ok: Object.keys(errors).length === 0, errors, value };
}

/**
 * Проверка заказа. Цены всегда берутся из каталога, а не из запроса.
 * products — Map id -> product.
 */
export function validateOrder(input, products, { freeShippingFrom = 2500 } = {}) {
  const errors = {};
  const o = input && typeof input === 'object' ? input : {};
  const c = o.customer && typeof o.customer === 'object' ? o.customer : {};
  const consents = o.consents && typeof o.consents === 'object' ? o.consents : {};

  // Ловушка для ботов: скрытое поле должно остаться пустым.
  if (cleanText(o.website, 100)) return { ok: false, errors: { form: 'Заявка отклонена' }, bot: true };

  const customer = {
    name: cleanText(c.name, 80),
    phone: cleanText(c.phone, 20),
    email: cleanText(c.email, 254).toLowerCase(),
    city: cleanText(c.city, 80),
    address: cleanText(c.address, 200),
    comment: cleanText(c.comment, 500),
  };
  if (customer.name.length < 2) errors.name = 'Укажите имя';
  if (!PHONE_RE.test(customer.phone) || customer.phone.replace(/\D/g, '').length < 10) errors.phone = 'Укажите телефон, например +7 900 000-00-00';
  if (!EMAIL_RE.test(customer.email)) errors.email = 'Укажите корректный e-mail';
  const delivery = DELIVERY[o.delivery] ? o.delivery : null;
  if (!delivery) errors.delivery = 'Выберите способ доставки';
  if (customer.city.length < 2) errors.city = 'Укажите город';
  if (delivery !== 'pickup' && customer.address.length < 5) errors.address = 'Укажите адрес доставки';
  const payment = ['cash', 'card'].includes(o.payment) ? o.payment : null;
  if (!payment) errors.payment = 'Выберите способ оплаты';
  if (consents.offer !== true) errors.offer = 'Необходимо принять условия оферты';
  if (consents.pd !== true) errors.pd = 'Необходимо согласие на обработку персональных данных';

  const items = [];
  const rawItems = Array.isArray(o.items) ? o.items.slice(0, 50) : [];
  for (const it of rawItems) {
    const id = cleanText(it && it.id, 60);
    const qty = num(it && it.qty, { min: 1, max: 99, int: true });
    const p = products.get(id);
    if (!p || !p.active || qty === null) { errors.items = 'Некоторые товары недоступны'; continue; }
    if (p.stock < qty) { errors.items = `Недостаточно товара «${p.name}» на складе (доступно ${p.stock})`; continue; }
    if (items.some(x => x.id === id)) continue;
    items.push({ id, name: p.name, price: p.price, qty, sum: p.price * qty });
  }
  if (!items.length && !errors.items) errors.items = 'Корзина пуста';

  const subtotal = items.reduce((s, i) => s + i.sum, 0);
  const shipping = delivery ? (subtotal >= freeShippingFrom ? 0 : DELIVERY[delivery].price) : 0;
  return {
    ok: Object.keys(errors).length === 0,
    errors,
    value: {
      customer, delivery, payment, items, subtotal, shipping, total: subtotal + shipping,
      consents: { offer: true, pd: true, marketing: consents.marketing === true },
      visitorId: isVisitorId(o.visitorId) ? o.visitorId : null,
    },
  };
}

export function isVisitorId(v) {
  return typeof v === 'string' && /^[a-f0-9]{32}$/.test(v);
}

export function validateEvent(input) {
  const e = input && typeof input === 'object' ? input : {};
  if (!EVENT_TYPES.includes(e.type) || e.type === 'purchase') return null; // покупка пишется только сервером
  if (!isVisitorId(e.visitorId)) return null;
  return {
    type: e.type,
    visitorId: e.visitorId,
    path: cleanText(e.path, 200),
    referrer: cleanText(e.referrer, 200),
    source: cleanText(e.source, 60),
    device: ['mobile', 'tablet', 'desktop'].includes(e.device) ? e.device : 'desktop',
    productId: isId(e.productId) ? e.productId : null,
  };
}

export function validateSettings(input) {
  const s = input && typeof input === 'object' ? input : {};
  const value = {
    announcement: cleanText(s.announcement, 160),
    phone: cleanText(s.phone, 30),
    email: cleanText(s.email, 120),
    address: cleanText(s.address, 200),
    hours: cleanText(s.hours, 80),
    freeShippingFrom: num(s.freeShippingFrom, { min: 0, max: 100000, int: true }),
  };
  const errors = {};
  if (value.email && !EMAIL_RE.test(value.email)) errors.email = 'Некорректный e-mail';
  if (value.phone && !PHONE_RE.test(value.phone)) errors.phone = 'Некорректный телефон';
  if (value.freeShippingFrom === null) errors.freeShippingFrom = 'Число от 0 до 100 000';
  return { ok: !Object.keys(errors).length, errors, value };
}

/** Определение источника перехода по UTM или referrer. */
export function detectSource(search, referrer, ownHost) {
  try {
    const utm = new URLSearchParams(search).get('utm_source');
    if (utm) return cleanText(utm, 60).toLowerCase();
  } catch { /* ignore */ }
  if (!referrer) return 'direct';
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, '');
    if (ownHost && host === ownHost.replace(/^www\./, '')) return 'internal';
    if (/yandex\./.test(host)) return 'yandex';
    if (/google\./.test(host)) return 'google';
    if (/vk\.com|vk\.ru/.test(host)) return 'vk';
    if (/t\.me|telegram/.test(host)) return 'telegram';
    return host.slice(0, 60);
  } catch { return 'direct'; }
}

// ---------- чат-бот: ответы на частые вопросы ----------
const FAQ = [
  [/достав|курьер|привез|сдэк|почт/i, 'Доставляем курьером по городу (290 ₽), в пункты выдачи (190 ₽) и Почтой России (350 ₽). При заказе от суммы бесплатной доставки — доставка за наш счёт. Срок — 1–5 рабочих дней.'],
  [/оплат|карт|налич/i, 'Оплатить можно банковской картой онлайн или при получении. Чек отправляем на e-mail.'],
  [/возврат|вернуть|обмен/i, 'Пищевые продукты надлежащего качества возврату не подлежат (Постановление Правительства РФ № 2463). Если товар повреждён или просрочен — напишите номер заказа, заменим или вернём деньги.'],
  [/остр|чили|перец/i, 'Остроту обозначаем шкалой от 0 до 3 перчиков на карточке товара. Самые острые — «Латяо классические» и «Лапша по-чунцински».'],
  [/состав|аллерг|глютен|halal|халял/i, 'Состав указан на странице каждого товара. Вся продукция имеет маркировку на русском языке и декларации ЕАЭС.'],
  [/срок|годн|свеж/i, 'Отправляем товары с остаточным сроком годности не менее 50 %. Дата указана на упаковке.'],
  [/заказ|статус|номер/i, 'Подскажите номер заказа (например, HC-123456) — оператор проверит статус.'],
];

export function botReply(text) {
  for (const [re, answer] of FAQ) if (re.test(text)) return answer;
  return null;
}
