// Слой работы с базой данных (встроенный в Node модуль node:sqlite, без внешних зависимостей).
// Все запросы параметризованы — SQL-инъекции исключены.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  cn TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL,
  price REAL NOT NULL CHECK (price > 0),
  old_price REAL,
  weight TEXT NOT NULL DEFAULT '',
  badge TEXT NOT NULL DEFAULT '',
  spicy INTEGER NOT NULL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  description TEXT NOT NULL DEFAULT '',
  composition TEXT NOT NULL DEFAULT '',
  storage TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL,
  thumb TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  photo INTEGER NOT NULL DEFAULT 0,
  has_page INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  customer TEXT NOT NULL,
  items TEXT NOT NULL,
  delivery TEXT NOT NULL,
  payment TEXT NOT NULL,
  subtotal REAL NOT NULL,
  shipping REAL NOT NULL,
  total REAL NOT NULL,
  visitor_id TEXT
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  path TEXT NOT NULL DEFAULT '',
  referrer TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  device TEXT NOT NULL DEFAULT '',
  product_id TEXT
);
CREATE INDEX IF NOT EXISTS events_ts ON events(ts);
CREATE UNIQUE INDEX IF NOT EXISTS events_first_visit ON events(visitor_id) WHERE type = 'first_visit';
CREATE TABLE IF NOT EXISTS consents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  kind TEXT NOT NULL,
  doc_version TEXT NOT NULL,
  order_number TEXT,
  visitor_id TEXT,
  ip_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS chat_threads (
  token_hash TEXT PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  unread INTEGER NOT NULL DEFAULT 0,
  last_generic INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread TEXT NOT NULL REFERENCES chat_threads(token_hash) ON DELETE CASCADE,
  author TEXT NOT NULL CHECK (author IN ('visitor', 'admin', 'bot')),
  text TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS chat_messages_thread ON chat_messages(thread, id);
CREATE TABLE IF NOT EXISTS sessions (
  id_hash TEXT PRIMARY KEY,
  csrf TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

const PRODUCT_COLS = ['id', 'name', 'cn', 'category', 'price', 'old_price', 'weight', 'badge', 'spicy', 'stock', 'description', 'composition', 'storage', 'image', 'thumb', 'active', 'photo', 'has_page', 'sort', 'created_at', 'updated_at'];

export function rowToProduct(r) {
  return {
    id: r.id, name: r.name, cn: r.cn, category: r.category, price: r.price,
    oldPrice: r.old_price ?? null, weight: r.weight, badge: r.badge, spicy: r.spicy, stock: r.stock,
    description: r.description, composition: r.composition, storage: r.storage,
    image: r.image, thumb: r.thumb, active: !!r.active, photo: !!r.photo, hasPage: !!r.has_page, sort: r.sort,
  };
}

function rowToOrder(r) {
  return {
    id: r.id, number: r.number, createdAt: r.created_at, status: r.status,
    customer: JSON.parse(r.customer), items: JSON.parse(r.items),
    delivery: r.delivery, payment: r.payment, subtotal: r.subtotal, shipping: r.shipping, total: r.total,
    visitorId: r.visitor_id,
  };
}

function rowToEvent(r) {
  return { type: r.type, visitorId: r.visitor_id, ts: r.ts, path: r.path, source: r.source, device: r.device, productId: r.product_id };
}

export function openDb(file, { seedProducts, seedSettings }) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(SCHEMA);

  const tx = (fn) => (...args) => {
    db.exec('BEGIN IMMEDIATE');
    try { const r = fn(...args); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
  };

  const insertProduct = db.prepare(`INSERT INTO products (${PRODUCT_COLS.join(',')}) VALUES (${PRODUCT_COLS.map(c => ':' + c).join(',')})`);
  const productParams = (p, sort, now, createdAt = now) => ({
    id: p.id, name: p.name, cn: p.cn || '', category: p.category, price: p.price, old_price: p.oldPrice ?? null,
    weight: p.weight || '', badge: p.badge || '', spicy: p.spicy || 0, stock: p.stock || 0,
    description: p.description || '', composition: p.composition || '', storage: p.storage || '',
    image: p.image, thumb: p.thumb || '', active: p.active === false ? 0 : 1, photo: p.photo ? 1 : 0,
    has_page: p.hasPage ? 1 : 0, sort, created_at: createdAt, updated_at: now,
  });

  if (db.prepare('SELECT COUNT(*) AS n FROM products').get().n === 0 && seedProducts) {
    const now = Date.now();
    tx(() => seedProducts.forEach((p, i) => insertProduct.run(productParams({ ...p, hasPage: true }, i, now))))();
  }
  const setSetting = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  if (db.prepare('SELECT COUNT(*) AS n FROM settings').get().n === 0 && seedSettings) {
    for (const [k, v] of Object.entries(seedSettings)) setSetting.run(k, JSON.stringify(v));
  }

  const q = {
    products: db.prepare('SELECT * FROM products ORDER BY sort, created_at'),
    activeProducts: db.prepare('SELECT * FROM products WHERE active = 1 ORDER BY sort, created_at'),
    product: db.prepare('SELECT * FROM products WHERE id = ?'),
    deleteProduct: db.prepare('DELETE FROM products WHERE id = ?'),
    maxSort: db.prepare('SELECT COALESCE(MAX(sort), 0) AS s FROM products'),
    updateProduct: db.prepare(`UPDATE products SET name=:name, cn=:cn, category=:category, price=:price, old_price=:old_price, weight=:weight,
      badge=:badge, spicy=:spicy, stock=:stock, description=:description, composition=:composition, storage=:storage, image=:image,
      thumb=:thumb, active=:active, photo=:photo, updated_at=:updated_at WHERE id=:id`),
    decStock: db.prepare('UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?'),
    insertOrder: db.prepare(`INSERT INTO orders (number, created_at, status, customer, items, delivery, payment, subtotal, shipping, total, visitor_id)
      VALUES (?, ?, 'new', ?, ?, ?, ?, ?, ?, ?, ?)`),
    orderByNumber: db.prepare('SELECT id FROM orders WHERE number = ?'),
    orders: db.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT ?'),
    allOrders: db.prepare('SELECT * FROM orders'),
    setStatus: db.prepare('UPDATE orders SET status = ? WHERE id = ?'),
    insertEvent: db.prepare('INSERT OR IGNORE INTO events (type, visitor_id, ts, path, referrer, source, device, product_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
    eventsSince: db.prepare('SELECT * FROM events WHERE ts >= ?'),
    firstVisits: db.prepare("SELECT * FROM events WHERE type = 'first_visit'"),
    insertConsent: db.prepare('INSERT INTO consents (ts, kind, doc_version, order_number, visitor_id, ip_hash) VALUES (?, ?, ?, ?, ?, ?)'),
    thread: db.prepare('SELECT * FROM chat_threads WHERE token_hash = ?'),
    threadByPublic: db.prepare('SELECT * FROM chat_threads WHERE public_id = ?'),
    insertThread: db.prepare('INSERT INTO chat_threads (token_hash, public_id, created_at, updated_at) VALUES (?, ?, ?, ?)'),
    touchThread: db.prepare('UPDATE chat_threads SET updated_at = ?, unread = unread + ? WHERE token_hash = ?'),
    setGeneric: db.prepare('UPDATE chat_threads SET last_generic = ? WHERE token_hash = ?'),
    readThread: db.prepare('UPDATE chat_threads SET unread = 0 WHERE token_hash = ?'),
    insertMessage: db.prepare('INSERT INTO chat_messages (thread, author, text, ts) VALUES (?, ?, ?, ?)'),
    messages: db.prepare('SELECT id, author, text, ts FROM chat_messages WHERE thread = ? AND id > ? ORDER BY id LIMIT 200'),
    threads: db.prepare(`SELECT t.public_id, t.created_at, t.updated_at, t.unread,
      (SELECT text FROM chat_messages m WHERE m.thread = t.token_hash ORDER BY id DESC LIMIT 1) AS last_text,
      (SELECT COUNT(*) FROM chat_messages m WHERE m.thread = t.token_hash) AS total
      FROM chat_threads t ORDER BY t.updated_at DESC LIMIT 100`),
    countMessages: db.prepare('SELECT COUNT(*) AS n FROM chat_messages WHERE thread = ?'),
    insertSession: db.prepare('INSERT INTO sessions (id_hash, csrf, created_at, expires_at) VALUES (?, ?, ?, ?)'),
    session: db.prepare('SELECT * FROM sessions WHERE id_hash = ? AND expires_at > ?'),
    deleteSession: db.prepare('DELETE FROM sessions WHERE id_hash = ?'),
    purgeSessions: db.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
    settings: db.prepare('SELECT key, value FROM settings'),
  };

  return {
    raw: db,
    close: () => db.close(),
    listProducts: (all = false) => (all ? q.products : q.activeProducts).all().map(rowToProduct),
    getProduct: (id) => { const r = q.product.get(id); return r ? rowToProduct(r) : null; },
    createProduct: (p) => {
      const now = Date.now();
      insertProduct.run(productParams(p, q.maxSort.get().s + 1, now));
      return rowToProduct(q.product.get(p.id));
    },
    updateProduct: (p) => {
      const params = productParams(p, 0, Date.now());
      delete params.sort; delete params.created_at; delete params.has_page;
      q.updateProduct.run(params);
      return rowToProduct(q.product.get(p.id));
    },
    deleteProduct: (id) => q.deleteProduct.run(id).changes > 0,

    createOrder: tx((order, ipHash, docVersion) => {
      for (const it of order.items) {
        if (q.decStock.run(it.qty, it.id, it.qty).changes !== 1) throw Object.assign(new Error('stock'), { code: 'STOCK' });
      }
      let number;
      do { number = 'HC-' + String(Math.floor(100000 + Math.random() * 900000)); } while (q.orderByNumber.get(number));
      const now = Date.now();
      q.insertOrder.run(number, now, JSON.stringify(order.customer), JSON.stringify(order.items), order.delivery, order.payment,
        order.subtotal, order.shipping, order.total, order.visitorId);
      if (order.visitorId) q.insertEvent.run('purchase', order.visitorId, now, '/checkout', '', '', '', null);
      for (const kind of ['offer', 'pd', ...(order.consents.marketing ? ['marketing'] : [])]) {
        q.insertConsent.run(now, kind, docVersion, number, order.visitorId, ipHash);
      }
      return { number, createdAt: now };
    }),
    listOrders: (limit = 200) => q.orders.all(limit).map(rowToOrder),
    allOrders: () => q.allOrders.all().map(rowToOrder),
    setOrderStatus: (id, status) => q.setStatus.run(status, id).changes > 0,

    addEvent: (e) => q.insertEvent.run(e.type, e.visitorId, Date.now(), e.path, e.referrer, e.source, e.device, e.productId),
    eventsSince: (ts) => q.eventsSince.all(ts).map(rowToEvent),
    firstVisits: () => new Map(q.firstVisits.all().map(r => [r.visitor_id, rowToEvent(r)])),
    logConsent: (kind, docVersion, visitorId, ipHash) => q.insertConsent.run(Date.now(), kind, docVersion, null, visitorId, ipHash),

    getThread: (tokenHash) => q.thread.get(tokenHash),
    getThreadByPublic: (pid) => q.threadByPublic.get(pid),
    createThread: (tokenHash, publicId) => { const now = Date.now(); q.insertThread.run(tokenHash, publicId, now, now); return q.thread.get(tokenHash); },
    addMessage: (tokenHash, author, text) => {
      const ts = Date.now();
      q.insertMessage.run(tokenHash, author, text, ts);
      q.touchThread.run(ts, author === 'visitor' ? 1 : 0, tokenHash);
    },
    setGeneric: (tokenHash, ts) => q.setGeneric.run(ts, tokenHash),
    readThread: (tokenHash) => q.readThread.run(tokenHash),
    messages: (tokenHash, after = 0) => q.messages.all(tokenHash, after),
    countMessages: (tokenHash) => q.countMessages.get(tokenHash).n,
    threads: () => q.threads.all().map(r => ({ id: r.public_id, createdAt: r.created_at, updatedAt: r.updated_at, unread: r.unread, lastText: r.last_text || '', total: r.total })),

    createSession: (idHash, csrf, ttl) => { const now = Date.now(); q.purgeSessions.run(now); q.insertSession.run(idHash, csrf, now, now + ttl); },
    getSession: (idHash) => q.session.get(idHash, Date.now()),
    deleteSession: (idHash) => q.deleteSession.run(idHash),

    getSettings: () => Object.fromEntries(q.settings.all().map(r => [r.key, JSON.parse(r.value)])),
    saveSettings: tx((obj) => { for (const [k, v] of Object.entries(obj)) setSetting.run(k, JSON.stringify(v)); }),
  };
}

export function loadSeed(productsFile, siteFile) {
  return {
    seedProducts: JSON.parse(readFileSync(productsFile, 'utf8')).map(p => ({
      ...p,
      image: p.image || `assets/img/products/${p.id}.webp`,
      thumb: p.thumb || `assets/img/products/${p.id}-360.webp`,
    })),
    seedSettings: JSON.parse(readFileSync(siteFile, 'utf8')).settings,
  };
}
