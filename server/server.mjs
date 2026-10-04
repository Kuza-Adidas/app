// HTTP-сервер магазина: отдаёт собранный сайт (dist/) и REST API.
// Без внешних зависимостей: node:http + node:sqlite + node:crypto.
import http from 'node:http';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, extname, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { openDb, loadSeed } from './db.mjs';
import {
  validateProduct, validateOrder, validateEvent, validateSettings, cleanText, isId, botReply, ORDER_STATUSES,
} from '../src/assets/js/lib/validate.js';
import { computeStats } from '../src/assets/js/lib/stats.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
};
const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.json', '.xml', '.txt', '.svg', '.webmanifest']);

const SESSION_TTL = 8 * 3600_000;
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

// ---------- ограничение частоты запросов (token bucket по IP) ----------
class RateLimiter {
  constructor() { this.buckets = new Map(); setInterval(() => this.sweep(), 60_000).unref(); }
  take(key, limit, windowMs) {
    const now = Date.now();
    let b = this.buckets.get(key);
    if (!b || now - b.start > windowMs) { b = { start: now, count: 0, windowMs }; this.buckets.set(key, b); }
    b.count++;
    return b.count <= limit;
  }
  sweep() { const now = Date.now(); for (const [k, b] of this.buckets) if (now - b.start > b.windowMs) this.buckets.delete(k); }
}

class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}

export function createApp(opts = {}) {
  const production = opts.production ?? process.env.NODE_ENV === 'production';
  const distDir = resolve(opts.distDir || join(ROOT, 'dist'));
  const uploadsDir = resolve(opts.uploadsDir || join(ROOT, 'data/uploads'));
  const trustProxy = opts.trustProxy ?? process.env.TRUST_PROXY === '1';
  const site = JSON.parse(readFileSync(join(ROOT, 'data/site.json'), 'utf8'));
  const db = openDb(opts.dbFile || process.env.DB_FILE || join(ROOT, 'data/shop.db'),
    loadSeed(join(ROOT, 'data/products.json'), join(ROOT, 'data/site.json')));
  mkdirSync(uploadsDir, { recursive: true });

  // Пароль администратора хранится только в виде хеша scrypt.
  let password = opts.adminPassword || process.env.ADMIN_PASSWORD;
  if (!password) {
    if (production) {
      password = randomBytes(12).toString('base64url');
      console.warn(`[security] ADMIN_PASSWORD не задан. Сгенерирован одноразовый пароль: ${password}`);
    } else {
      password = 'haochi-demo-2026';
      console.warn('[security] Используется демо-пароль администратора. Задайте ADMIN_PASSWORD для боевого запуска.');
    }
  }
  const pwSalt = randomBytes(16);
  const pwHash = scryptSync(password, pwSalt, 64);
  password = null;

  const limiter = new RateLimiter();
  const loginFails = new Map(); // ipHash -> { count, until }
  const staticCache = new Map();
  const ipSalt = randomBytes(16).toString('hex');

  const clientIp = (req) => {
    if (trustProxy) { const f = req.headers['x-forwarded-for']; if (f) return String(f).split(',')[0].trim(); }
    return req.socket.remoteAddress || 'unknown';
  };
  const isHttps = (req) => req.socket.encrypted || (trustProxy && req.headers['x-forwarded-proto'] === 'https');

  function securityHeaders(req, res) {
    res.setHeader('Content-Security-Policy', [
      "default-src 'self'", "script-src 'self'", "style-src 'self'", "img-src 'self' data: blob:", "font-src 'self'",
      "connect-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
      ...(isHttps(req) ? ['upgrade-insecure-requests'] : []),
    ].join('; '));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    if (isHttps(req)) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  function send(req, res, status, body, type = 'application/json; charset=utf-8', extraHeaders = {}) {
    let buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    res.statusCode = status;
    res.setHeader('Content-Type', type);
    for (const [k, v] of Object.entries(extraHeaders)) res.setHeader(k, v);
    if (type.startsWith('application/json')) res.setHeader('Cache-Control', 'no-store');
    const ae = String(req.headers['accept-encoding'] || '');
    if (buf.length > 1024 && /json|text|javascript|xml|svg/.test(type) && !extraHeaders['Content-Encoding']) {
      if (ae.includes('br')) { buf = brotliCompressSync(buf); res.setHeader('Content-Encoding', 'br'); }
      else if (ae.includes('gzip')) { buf = gzipSync(buf); res.setHeader('Content-Encoding', 'gzip'); }
      res.setHeader('Vary', 'Accept-Encoding');
    }
    res.setHeader('Content-Length', buf.length);
    res.end(req.method === 'HEAD' ? undefined : buf);
  }

  async function readJson(req, limit) {
    const ct = String(req.headers['content-type'] || '');
    // Требование JSON блокирует CSRF через обычные HTML-формы.
    if (!ct.startsWith('application/json')) throw new HttpError(415, 'Ожидается JSON');
    const len = Number(req.headers['content-length'] || 0);
    if (len > limit) throw new HttpError(413, 'Слишком большой запрос');
    const chunks = []; let size = 0;
    for await (const c of req) { size += c.length; if (size > limit) throw new HttpError(413, 'Слишком большой запрос'); chunks.push(c); }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { throw new HttpError(400, 'Некорректный JSON'); }
  }

  function parseCookies(req) {
    const out = {};
    for (const part of String(req.headers.cookie || '').split(';')) {
      const i = part.indexOf('='); if (i < 0) continue;
      out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    }
    return out;
  }

  function sameOrigin(req) {
    const origin = req.headers.origin;
    if (!origin) return true; // запросы без Origin (curl, тесты) — дополнительно защищены CSRF-токеном для админки
    try { return new URL(origin).host === req.headers.host; } catch { return false; }
  }

  function requireAdmin(req) {
    const sid = parseCookies(req).hc_sid;
    if (!sid || !/^[A-Za-z0-9_-]{40,60}$/.test(sid)) throw new HttpError(401, 'Требуется вход');
    const s = db.getSession(sha256(sid));
    if (!s) throw new HttpError(401, 'Сессия истекла');
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const token = String(req.headers['x-csrf-token'] || '');
      const a = Buffer.from(token), b = Buffer.from(s.csrf);
      if (a.length !== b.length || !timingSafeEqual(a, b)) throw new HttpError(403, 'Неверный CSRF-токен');
    }
    return s;
  }

  function limit(req, group, max, windowMs) {
    if (!limiter.take(`${group}:${clientIp(req)}`, max, windowMs)) throw new HttpError(429, 'Слишком много запросов, попробуйте позже');
  }

  const publicProduct = (p) => { const { sort, ...rest } = p; return rest; };

  // ---------- маршруты API ----------
  async function api(req, res, url) {
    const path = url.pathname;
    const m = req.method;
    if (m !== 'GET' && m !== 'HEAD' && !sameOrigin(req)) throw new HttpError(403, 'Запрос с чужого источника отклонён');
    limit(req, 'api', 300, 60_000);

    if (path === '/api/health' && m === 'GET') return send(req, res, 200, { ok: true, mode: 'server' });

    if (path === '/api/products' && m === 'GET') return send(req, res, 200, db.listProducts().map(publicProduct));
    let mm = path.match(/^\/api\/products\/([a-z0-9-]{2,60})$/);
    if (mm && m === 'GET') {
      const p = db.getProduct(mm[1]);
      if (!p || !p.active) throw new HttpError(404, 'Товар не найден');
      return send(req, res, 200, publicProduct(p));
    }
    if (path === '/api/settings' && m === 'GET') return send(req, res, 200, db.getSettings());

    if (path === '/api/orders' && m === 'POST') {
      limit(req, 'orders', 10, 10 * 60_000);
      const body = await readJson(req, 16_384);
      const products = new Map(db.listProducts(true).map(p => [p.id, p]));
      const settings = db.getSettings();
      const v = validateOrder(body, products, { freeShippingFrom: settings.freeShippingFrom ?? 2500 });
      if (!v.ok) throw new HttpError(422, 'Проверьте данные заказа', { errors: v.errors });
      try {
        const r = db.createOrder(v.value, sha256(ipSalt + clientIp(req)), site.docVersion);
        return send(req, res, 201, { number: r.number, total: v.value.total });
      } catch (e) {
        if (e.code === 'STOCK') throw new HttpError(409, 'Товар закончился, обновите корзину');
        throw e;
      }
    }

    if (path === '/api/events' && m === 'POST') {
      limit(req, 'events', 120, 60_000);
      const e = validateEvent(await readJson(req, 4096));
      if (!e) throw new HttpError(422, 'Некорректное событие');
      db.addEvent(e);
      return send(req, res, 204, '');
    }

    if (path === '/api/consents' && m === 'POST') {
      limit(req, 'consents', 30, 60_000);
      const b = await readJson(req, 2048);
      const kind = ['cookies_all', 'cookies_necessary', 'cookies_custom'].includes(b.kind) ? b.kind : null;
      if (!kind) throw new HttpError(422, 'Некорректные данные');
      db.logConsent(kind, site.docVersion, /^[a-f0-9]{32}$/.test(b.visitorId || '') ? b.visitorId : null, sha256(ipSalt + clientIp(req)));
      return send(req, res, 204, '');
    }

    // ---------- чат поддержки ----------
    if (path === '/api/chat' && m === 'GET') {
      limit(req, 'chat-read', 120, 60_000);
      const token = url.searchParams.get('token') || '';
      if (!/^[a-f0-9]{48}$/.test(token)) throw new HttpError(400, 'Некорректный токен');
      const t = db.getThread(sha256(token));
      if (!t) return send(req, res, 200, { messages: [] });
      const after = Math.max(0, Number(url.searchParams.get('after')) || 0);
      return send(req, res, 200, { messages: db.messages(t.token_hash, after) });
    }
    if (path === '/api/chat' && m === 'POST') {
      limit(req, 'chat', 20, 60_000);
      const b = await readJson(req, 4096);
      if (cleanText(b.website, 50)) throw new HttpError(422, 'Сообщение отклонено');
      const text = cleanText(b.text, 1000);
      if (text.length < 1) throw new HttpError(422, 'Пустое сообщение');
      let token = typeof b.token === 'string' && /^[a-f0-9]{48}$/.test(b.token) ? b.token : null;
      let t = token && db.getThread(sha256(token));
      if (!t) { token = randomBytes(24).toString('hex'); t = db.createThread(sha256(token), randomBytes(6).toString('hex')); }
      if (db.countMessages(t.token_hash) > 500) throw new HttpError(429, 'Слишком длинный диалог');
      db.addMessage(t.token_hash, 'visitor', text);
      const reply = botReply(text);
      if (reply) db.addMessage(t.token_hash, 'bot', reply);
      else if (Date.now() - t.last_generic > 10 * 60_000) {
        db.addMessage(t.token_hash, 'bot', `Спасибо за сообщение! Оператор ответит в ближайшее время (${db.getSettings().hours || 'ежедневно 9:00–21:00'}).`);
        db.setGeneric(t.token_hash, Date.now());
      }
      const after = Math.max(0, Number(b.after) || 0);
      return send(req, res, 200, { token, messages: db.messages(t.token_hash, after) });
    }

    // ---------- администрирование ----------
    if (path === '/api/admin/login' && m === 'POST') {
      const ipKey = sha256(ipSalt + clientIp(req));
      const f = loginFails.get(ipKey);
      if (f && f.until > Date.now()) throw new HttpError(429, `Слишком много попыток. Повторите через ${Math.ceil((f.until - Date.now()) / 60000)} мин.`);
      limit(req, 'login', 20, 15 * 60_000);
      const b = await readJson(req, 1024);
      const candidate = scryptSync(String(b.password || '').slice(0, 200), pwSalt, 64);
      if (!timingSafeEqual(candidate, pwHash)) {
        const now = Date.now();
        const cur = f && now - f.first < 15 * 60_000 ? f : { count: 0, first: now, until: 0 };
        cur.count++;
        if (cur.count >= 5) { cur.until = now + 15 * 60_000; cur.count = 0; cur.first = now; }
        loginFails.set(ipKey, cur);
        await new Promise(r => setTimeout(r, 400));
        throw new HttpError(401, 'Неверный пароль');
      }
      loginFails.delete(ipKey);
      const sid = randomBytes(32).toString('base64url');
      const csrf = randomBytes(24).toString('base64url');
      db.createSession(sha256(sid), csrf, SESSION_TTL);
      const cookie = `hc_sid=${sid}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL / 1000}${isHttps(req) ? '; Secure' : ''}`;
      return send(req, res, 200, { ok: true, csrf }, undefined, { 'Set-Cookie': cookie });
    }
    if (path === '/api/admin/logout' && m === 'POST') {
      const sid = parseCookies(req).hc_sid;
      if (sid) db.deleteSession(sha256(sid));
      return send(req, res, 200, { ok: true }, undefined, { 'Set-Cookie': 'hc_sid=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0' });
    }
    if (path.startsWith('/api/admin/')) {
      const s = requireAdmin(req);
      if (path === '/api/admin/me' && m === 'GET') return send(req, res, 200, { ok: true, csrf: s.csrf });

      if (path === '/api/admin/products' && m === 'GET') return send(req, res, 200, db.listProducts(true));
      if (path === '/api/admin/products' && m === 'POST') {
        const b = await readJson(req, 3_500_000);
        const v = validateProduct(b, { existingIds: db.listProducts(true).map(p => p.id), isNew: true });
        if (!v.ok) throw new HttpError(422, 'Проверьте поля товара', { errors: v.errors });
        v.value.image = persistImage(v.value.image);
        v.value.thumb = v.value.thumb ? persistImage(v.value.thumb) : '';
        return send(req, res, 201, db.createProduct(v.value));
      }
      mm = path.match(/^\/api\/admin\/products\/([a-z0-9-]{2,60})$/);
      if (mm && m === 'PUT') {
        const cur = db.getProduct(mm[1]);
        if (!cur) throw new HttpError(404, 'Товар не найден');
        const b = await readJson(req, 3_500_000);
        const v = validateProduct({ ...b, id: cur.id });
        if (!v.ok) throw new HttpError(422, 'Проверьте поля товара', { errors: v.errors });
        v.value.image = persistImage(v.value.image);
        v.value.thumb = v.value.image === cur.image ? (v.value.thumb ? persistImage(v.value.thumb) : '') : '';
        return send(req, res, 200, db.updateProduct(v.value));
      }
      if (mm && m === 'DELETE') {
        if (!db.deleteProduct(mm[1])) throw new HttpError(404, 'Товар не найден');
        return send(req, res, 200, { ok: true });
      }

      if (path === '/api/admin/orders' && m === 'GET') return send(req, res, 200, db.listOrders(500));
      mm = path.match(/^\/api\/admin\/orders\/(\d{1,10})$/);
      if (mm && m === 'PATCH') {
        const b = await readJson(req, 1024);
        if (!ORDER_STATUSES[b.status]) throw new HttpError(422, 'Некорректный статус');
        if (!db.setOrderStatus(Number(mm[1]), b.status)) throw new HttpError(404, 'Заказ не найден');
        return send(req, res, 200, { ok: true });
      }

      if (path === '/api/admin/stats' && m === 'GET') {
        const days = [7, 30, 90].includes(Number(url.searchParams.get('days'))) ? Number(url.searchParams.get('days')) : 30;
        const since = Date.now() - days * 86_400_000 - 86_400_000;
        return send(req, res, 200, computeStats({ events: db.eventsSince(since), orders: db.allOrders(), days, firstVisits: db.firstVisits() }));
      }

      if (path === '/api/admin/chats' && m === 'GET') return send(req, res, 200, db.threads());
      mm = path.match(/^\/api\/admin\/chats\/([a-f0-9]{12})$/);
      if (mm) {
        const t = db.getThreadByPublic(mm[1]);
        if (!t) throw new HttpError(404, 'Диалог не найден');
        if (m === 'GET') { db.readThread(t.token_hash); return send(req, res, 200, { messages: db.messages(t.token_hash, 0) }); }
        if (m === 'POST') {
          const b = await readJson(req, 4096);
          const text = cleanText(b.text, 1000);
          if (!text) throw new HttpError(422, 'Пустое сообщение');
          db.addMessage(t.token_hash, 'admin', text);
          return send(req, res, 200, { messages: db.messages(t.token_hash, 0) });
        }
      }

      if (path === '/api/admin/settings' && m === 'PUT') {
        const v = validateSettings(await readJson(req, 4096));
        if (!v.ok) throw new HttpError(422, 'Проверьте настройки', { errors: v.errors });
        db.saveSettings(v.value);
        return send(req, res, 200, db.getSettings());
      }
    }
    throw new HttpError(404, 'Не найдено');
  }

  // Сохраняет загруженную картинку (data:-URL) на диск после проверки сигнатуры файла.
  function persistImage(src) {
    if (!src.startsWith('data:')) return src;
    const m = src.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!m) throw new HttpError(422, 'Недопустимый формат изображения');
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 2_500_000) throw new HttpError(413, 'Изображение больше 2,5 МБ');
    const sig = buf.subarray(0, 12);
    const kind = sig[0] === 0x89 && sig.toString('ascii', 1, 4) === 'PNG' ? 'png'
      : sig[0] === 0xff && sig[1] === 0xd8 && sig[2] === 0xff ? 'jpg'
        : sig.toString('ascii', 0, 4) === 'RIFF' && sig.toString('ascii', 8, 12) === 'WEBP' ? 'webp' : null;
    if (!kind) throw new HttpError(422, 'Файл не является изображением');
    const name = `${randomBytes(12).toString('hex')}.${kind}`;
    writeFileSync(join(uploadsDir, name), buf);
    return `uploads/${name}`;
  }

  // ---------- статика ----------
  function serveStatic(req, res, url) {
    let rel;
    try { rel = decodeURIComponent(url.pathname); } catch { return send(req, res, 400, 'Bad request', 'text/plain; charset=utf-8'); }
    if (rel.includes('\0')) return send(req, res, 400, 'Bad request', 'text/plain; charset=utf-8');
    let base = distDir;
    if (rel.startsWith('/uploads/')) { base = uploadsDir; rel = rel.slice('/uploads'.length); }
    let file = resolve(base, '.' + rel);
    if (file !== base && !file.startsWith(base + sep)) return send(req, res, 403, 'Forbidden', 'text/plain; charset=utf-8');
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file) && base === distDir && !extname(file)) file += '.html';
    let status = 200;
    if (!existsSync(file) || !statSync(file).isFile()) {
      if (base !== distDir) return send(req, res, 404, 'Not found', 'text/plain; charset=utf-8');
      file = join(distDir, '404.html'); status = 404;
      if (!existsSync(file)) return send(req, res, 404, 'Not found', 'text/plain; charset=utf-8');
      // 404.html собран с абсолютными путями для GitHub Pages (/app/...) — переписываем под корень сервера.
      let html = readFileSync(file, 'utf8');
      try {
        const { basePath } = JSON.parse(readFileSync(join(distDir, 'build-info.json'), 'utf8'));
        if (basePath && basePath !== '/') html = html.split(`"${basePath}`).join('"/');
      } catch { /* нет build-info */ }
      return send(req, res, 404, html, MIME['.html'], { 'Cache-Control': 'no-cache' });
    }
    const ext = extname(file).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const headers = {};
    if (base === uploadsDir) headers['Content-Security-Policy'] = "default-src 'none'; sandbox";
    headers['Cache-Control'] = ext === '.html' || ext === '.xml' || ext === '.txt' ? 'no-cache'
      : url.searchParams.has('v') || ext === '.woff2' || base === uploadsDir ? 'public, max-age=31536000, immutable' : 'public, max-age=86400';
    const ae = String(req.headers['accept-encoding'] || '');
    const enc = COMPRESSIBLE.has(ext) ? (ae.includes('br') ? 'br' : ae.includes('gzip') ? 'gzip' : null) : null;
    const mtime = statSync(file).mtimeMs;
    const key = `${file}|${enc}`;
    let entry = staticCache.get(key);
    if (!entry || entry.mtime !== mtime) {
      const raw = readFileSync(file);
      const body = enc === 'br' ? brotliCompressSync(raw) : enc === 'gzip' ? gzipSync(raw) : raw;
      entry = { mtime, body, etag: `"${sha256(raw).slice(0, 20)}"` };
      staticCache.set(key, entry);
    }
    headers.ETag = entry.etag;
    if (enc) { headers['Content-Encoding'] = enc; headers.Vary = 'Accept-Encoding'; }
    if (status === 200 && req.headers['if-none-match'] === entry.etag) { res.statusCode = 304; for (const [k, v] of Object.entries(headers)) res.setHeader(k, v); return res.end(); }
    return send(req, res, status, entry.body, type, headers);
  }

  const server = http.createServer(async (req, res) => {
    securityHeaders(req, res);
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { return send(req, res, 400, { error: 'Bad request' }); }
    try {
      if (url.pathname.startsWith('/api/')) return await api(req, res, url);
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Метод не поддерживается');
      return serveStatic(req, res, url);
    } catch (e) {
      if (e instanceof HttpError) return send(req, res, e.status, { error: e.message, ...(e.extra || {}) });
      console.error(e);
      return send(req, res, 500, { error: 'Внутренняя ошибка сервера' });
    }
  });
  server.headersTimeout = 15_000;
  server.requestTimeout = 30_000;
  server.on('close', () => db.close());
  return { server, db };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!existsSync(join(ROOT, 'dist/index.html'))) {
    console.error('Сначала соберите сайт: npm run build');
    process.exit(1);
  }
  const port = Number(process.env.PORT) || 3000;
  const { server } = createApp();
  server.listen(port, process.env.HOST || '127.0.0.1', () => console.log(`ХАОЧИ: http://localhost:${port}  (админка: /admin/)`));
}
