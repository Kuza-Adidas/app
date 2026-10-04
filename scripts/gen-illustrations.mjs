// Генерирует упаковочные иллюстрации для товаров без фотографий.
// SVG-сцены рендерятся в Chromium (Playwright) в прозрачный PNG, затем
// конвертируются в WebP через ImageMagick. Запуск: node scripts/gen-illustrations.mjs
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'src/assets/img/products');
const tmp = join(root, '.tmp-illustrations');
mkdirSync(out, { recursive: true });
mkdirSync(tmp, { recursive: true });

const W = 720, H = 900;

// ---------- мотивы (рисунок в центре упаковки) ----------
const motifs = {
  chili: (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})">
    <path d="M-10 -70 C 60 -60 90 10 40 80 C 20 108 -30 120 -60 110 C -10 90 30 40 10 -20 C 4 -40 -4 -56 -10 -70Z" fill="#E3241B"/>
    <path d="M-2 -62 C 40 -50 58 0 30 50" stroke="#fff" stroke-opacity=".35" stroke-width="8" fill="none" stroke-linecap="round"/>
    <path d="M-12 -72 C -20 -96 -6 -110 14 -112" stroke="#2F7D32" stroke-width="12" fill="none" stroke-linecap="round"/>
    <path d="M-30 -70 C -14 -86 10 -84 22 -70 C 4 -60 -16 -60 -30 -70Z" fill="#3E9A41"/></g>`,
  crackers: (x, y) => `<g transform="translate(${x} ${y})">
    ${[[-60, -20, 62], [55, -40, 54], [10, 50, 66]].map(([cx, cy, r]) => `
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="#E9C27A" stroke="#C99A45" stroke-width="5"/>
    <circle cx="${cx}" cy="${cy}" r="${r - 14}" fill="none" stroke="#D4A551" stroke-width="3" stroke-dasharray="4 10"/>
    ${[0, 1, 2, 3, 4].map(i => `<circle cx="${cx + Math.cos(i * 1.3) * r * .45}" cy="${cy + Math.sin(i * 1.3) * r * .45}" r="4" fill="#fff" opacity=".8"/>`).join('')}`).join('')}</g>`,
  mango: (x, y) => `<g transform="translate(${x} ${y})">
    <ellipse cx="0" cy="10" rx="92" ry="74" fill="#FF9F1C" transform="rotate(-18)"/>
    <ellipse cx="-24" cy="-14" rx="40" ry="22" fill="#FFD166" opacity=".7" transform="rotate(-30)"/>
    <path d="M40 -66 C 70 -110 120 -100 130 -80 C 100 -60 70 -58 40 -66Z" fill="#2E8B57"/>
    <path d="M36 -60 L 46 -82" stroke="#5B3A1A" stroke-width="7" stroke-linecap="round"/>
    <circle cx="-110" cy="70" r="34" fill="#fff"/><circle cx="-110" cy="70" r="26" fill="#FBE3B4"/></g>`,
  taro: (x, y) => `<g transform="translate(${x} ${y})">
    <circle r="92" fill="#B79AE0"/><circle r="92" fill="url(#taroSwirl)"/>
    <path d="M-50 -10 C -30 -60 40 -60 50 -10 C 58 30 10 54 -14 30 C -34 10 -6 -18 16 -6" stroke="#F1E8FF" stroke-width="12" fill="none" stroke-linecap="round"/>
    <circle cx="-112" cy="64" r="34" fill="#fff"/><circle cx="-112" cy="64" r="26" fill="#E9DDFB"/></g>`,
  candy: (x, y) => `<g transform="translate(${x} ${y})">
    ${[[-50, -30, -14], [60, 30, 18]].map(([cx, cy, r]) => `<g transform="translate(${cx} ${cy}) rotate(${r})">
      <path d="M-70 0 L -110 -30 L -104 0 L -110 30Z M70 0 L 110 -30 L 104 0 L 110 30Z" fill="#fff" stroke="#BFD3EE" stroke-width="4"/>
      <rect x="-72" y="-36" width="144" height="72" rx="36" fill="#fff" stroke="#BFD3EE" stroke-width="4"/>
      <rect x="-40" y="-36" width="22" height="72" fill="#2F6DB5"/><rect x="18" y="-36" width="22" height="72" fill="#E23D3D"/></g>`).join('')}</g>`,
  sticks: (x, y) => `<g transform="translate(${x} ${y}) rotate(-20)">
    ${[-60, -30, 0, 30, 60].map((dx, i) => `<rect x="${dx - 9}" y="${-110 + (i % 2) * 14}" width="18" height="220" rx="9" fill="#E7B66B"/>
    <rect x="${dx - 10}" y="${-110 + (i % 2) * 14}" width="20" height="150" rx="10" fill="#F07C9A"/>
    <rect x="${dx - 4}" y="${-100 + (i % 2) * 14}" width="5" height="120" rx="3" fill="#fff" opacity=".5"/>`).join('')}</g>`,
  noodles: (x, y) => `<g transform="translate(${x} ${y})">
    <path d="M-120 -10 L 120 -10 C 116 70 60 104 0 104 C -60 104 -116 70 -120 -10Z" fill="#fff"/>
    <path d="M-120 -10 L 120 -10 C 116 70 60 104 0 104 C -60 104 -116 70 -120 -10Z" fill="none" stroke="#E5D8C8" stroke-width="4"/>
    <ellipse cx="0" cy="-10" rx="120" ry="26" fill="#C8341E"/>
    ${[-70, -35, 0, 35, 70].map(dx => `<path d="M${dx - 18} -14 q 9 -18 18 0 t 18 0" stroke="#F6D58C" stroke-width="7" fill="none" stroke-linecap="round"/>`).join('')}
    <path d="M60 -90 L 140 -30" stroke="#6B4A2B" stroke-width="9" stroke-linecap="round"/><path d="M80 -100 L 150 -40" stroke="#6B4A2B" stroke-width="9" stroke-linecap="round"/>
    <circle cx="-60" cy="-16" r="10" fill="#3FA34D"/><circle cx="30" cy="-6" r="8" fill="#3FA34D"/></g>`,
  cucumber: (x, y) => `<g transform="translate(${x} ${y})">
    ${[[-56, -24, 64], [60, 30, 56]].map(([cx, cy, r]) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#2E7D32"/><circle cx="${cx}" cy="${cy}" r="${r - 9}" fill="#C5E8A5"/>
    ${[0, 1, 2, 3, 4, 5].map(i => `<ellipse cx="${cx + Math.cos(i) * r * .32}" cy="${cy + Math.sin(i) * r * .32}" rx="5" ry="9" fill="#EAF7D9" transform="rotate(${i * 57} ${cx + Math.cos(i) * r * .32} ${cy + Math.sin(i) * r * .32})"/>`).join('')}`).join('')}
    <path d="M-120 90 C -60 60 40 70 120 100 C 40 120 -60 120 -120 90Z" fill="#F2C14E"/></g>`,
  berries: (x, y) => `<g transform="translate(${x} ${y})">
    ${[[-40, 0], [36, -18], [10, 52], [-70, 60], [76, 50]].map(([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="40" fill="#D7263D"/><circle cx="${cx - 12}" cy="${cy - 12}" r="10" fill="#fff" opacity=".45"/><circle cx="${cx + 4}" cy="${cy + 30}" r="5" fill="#7A1020"/>`).join('')}
    <path d="M-10 -60 C 20 -110 80 -100 96 -84 C 60 -64 24 -60 -10 -60Z" fill="#2E8B57"/></g>`,
  leaf: (x, y) => `<g transform="translate(${x} ${y})">
    <path d="M0 -110 C 90 -70 90 50 0 110 C -90 50 -90 -70 0 -110Z" fill="#4F8A3A"/>
    <path d="M0 -100 L 0 104" stroke="#CFE6B8" stroke-width="6"/>
    ${[-60, -20, 20, 60].map(dy => `<path d="M0 ${dy} L 46 ${dy - 30} M0 ${dy} L -46 ${dy - 30}" stroke="#CFE6B8" stroke-width="4"/>`).join('')}</g>`,
  lychee: (x, y) => `<g transform="translate(${x} ${y})">
    <circle cx="-30" cy="0" r="80" fill="#E2405C"/>
    ${Array.from({ length: 16 }, (_, i) => `<circle cx="${-30 + Math.cos(i * .8) * 50 * ((i % 3) / 3 + .4)}" cy="${Math.sin(i * .8) * 50 * ((i % 3) / 3 + .4)}" r="7" fill="#B8243E"/>`).join('')}
    <circle cx="70" cy="40" r="56" fill="#FFF8F2" stroke="#F3D6DC" stroke-width="5"/><ellipse cx="78" cy="46" rx="18" ry="24" fill="#6B3A2A"/>
    <path d="M-30 -80 C -20 -110 10 -116 30 -110" stroke="#2E8B57" stroke-width="9" fill="none" stroke-linecap="round"/></g>`,
  plum: (x, y) => `<g transform="translate(${x} ${y})">
    ${[[-44, 6, 70], [52, -10, 60], [10, 70, 50]].map(([cx, cy, r]) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#6D2161"/><path d="M${cx} ${cy - r + 6} C ${cx - 10} ${cy} ${cx - 10} ${cy + r / 2} ${cx} ${cy + r - 6}" stroke="#4A1342" stroke-width="5" fill="none"/><circle cx="${cx - r / 3}" cy="${cy - r / 3}" r="${r / 6}" fill="#fff" opacity=".35"/>`).join('')}</g>`,
  seeds: (x, y) => `<g transform="translate(${x} ${y})">
    ${Array.from({ length: 9 }, (_, i) => { const a = i * 0.7, rr = 26 + (i % 3) * 30; const cx = Math.cos(a) * rr, cy = Math.sin(a) * rr; return `<g transform="translate(${cx} ${cy}) rotate(${i * 40})"><path d="M0 -34 C 22 -10 18 26 0 34 C -18 26 -22 -10 0 -34Z" fill="#3A2A20"/><path d="M0 -28 C 8 -8 8 18 0 28" stroke="#E8DCC8" stroke-width="4" fill="none"/></g>`; }).join('')}</g>`,
  peanuts: (x, y) => `<g transform="translate(${x} ${y})">
    ${[[-50, -10, -30], [50, 10, 25], [0, 70, 80]].map(([cx, cy, r]) => `<g transform="translate(${cx} ${cy}) rotate(${r})"><circle cx="0" cy="-26" r="34" fill="#D9A15B"/><circle cx="0" cy="26" r="34" fill="#D9A15B"/><rect x="-26" y="-26" width="52" height="52" fill="#D9A15B"/><path d="M-14 -40 L 14 -40 M-18 -20 L 18 -20 M-18 10 L 18 10 M-14 34 L 14 34" stroke="#B57A36" stroke-width="4" stroke-linecap="round"/></g>`).join('')}
    <g transform="translate(-100 -80) scale(.5)">${'' }</g></g>`,
};

// ---------- общая "этикетка" ----------
function label({ cn, ru, weight, accent, ink = '#1B1B1B', cnColor = '#fff', top, center, motif, ms = 1 }) {
  return `
    <text x="${center}" y="${top + 92}" text-anchor="middle" font-family="WenQuanYi Zen Hei, sans-serif" font-size="${cn.length > 3 ? 74 : 92}" font-weight="700" fill="${cnColor}" letter-spacing="4">${cn}</text>
    ${motifs[motif](center, top + 270, ms)}
    <rect x="${center - 190}" y="${top + 400}" width="380" height="${ru.length > 1 ? 112 : 78}" rx="18" fill="#fff" opacity=".96"/>
    ${ru.map((l, i) => `<text x="${center}" y="${top + 448 + i * 40}" text-anchor="middle" font-family="Manrope" font-weight="800" font-size="30" fill="${ink}">${l}</text>`).join('')}
    <text x="${center}" y="${top + 560}" text-anchor="middle" font-family="Manrope" font-weight="700" font-size="26" fill="${accent}" opacity=".95">${weight}</text>`;
}

const defs = (id, c1, c2) => `
  <linearGradient id="body${id}" x1="0" x2="1"><stop offset="0" stop-color="${c2}"/><stop offset=".22" stop-color="${c1}"/><stop offset=".7" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
  <linearGradient id="gloss${id}" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".32"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <radialGradient id="taroSwirl"><stop offset="0" stop-color="#fff" stop-opacity=".25"/><stop offset="1" stop-color="#6E4FA8" stop-opacity=".3"/></radialGradient>
  <filter id="shadow${id}" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="18" stdDeviation="16" flood-color="#3b1d10" flood-opacity=".22"/></filter>`;

function zigzag(x1, x2, y, dir) {
  let d = '';
  const n = 22, step = (x2 - x1) / n;
  for (let i = 0; i <= n; i++) d += ` L ${x1 + i * step} ${y + (i % 2 ? dir * 12 : 0)}`;
  return d;
}

const shapes = {
  bag: (p) => {
    const x1 = 130, x2 = 590, top = 90, bot = 830;
    const body = `M${x1} ${top}${zigzag(x1, x2, top, -1)} L ${x2} ${top} C ${x2 + 24} 300 ${x2 + 24} 620 ${x2} ${bot} ${zigzag(x2, x1, bot, 1).replace(/^ L/, ' L')} L ${x1} ${bot} C ${x1 - 24} 620 ${x1 - 24} 300 ${x1} ${top}Z`;
    return `<g filter="url(#shadow${p.id})"><path d="${body}" fill="url(#body${p.id})"/>
      <rect x="${x1}" y="${top}" width="${x2 - x1}" height="34" fill="#000" opacity=".12"/>
      <rect x="${x1}" y="${bot - 34}" width="${x2 - x1}" height="34" fill="#000" opacity=".12"/>
      <path d="M${x1 + 8} ${top + 50} L ${x2 - 8} ${top + 50}" stroke="${p.band}" stroke-width="10" opacity=".9"/>
      ${label({ ...p, top: 130, center: 360 })}
      <rect x="200" y="${top + 10}" width="90" height="${bot - top - 20}" fill="url(#gloss${p.id})"/></g>`;
  },
  pouch: (p) => `<g filter="url(#shadow${p.id})">
      <rect x="150" y="80" width="420" height="760" rx="30" fill="url(#body${p.id})"/>
      <path d="M150 140 L 570 140" stroke="#000" stroke-opacity=".12" stroke-width="3" stroke-dasharray="10 8"/>
      <path d="M150 120 l 14 -8 l 0 16Z M570 120 l -14 -8 l 0 16Z" fill="#fff" opacity=".7"/>
      <rect x="150" y="760" width="420" height="80" rx="0" fill="#000" opacity=".08"/>
      ${label({ ...p, top: 140, center: 360 })}
      <rect x="210" y="90" width="80" height="740" fill="url(#gloss${p.id})"/></g>`,
  box: (p) => `<g filter="url(#shadow${p.id})">
      <path d="M140 170 L 520 170 L 600 110 L 220 110Z" fill="${p.c1}"/><path d="M140 170 L 520 170 L 600 110 L 220 110Z" fill="#fff" opacity=".28"/>
      <path d="M520 170 L 600 110 L 600 770 L 520 830Z" fill="${p.c2}"/>
      <rect x="140" y="170" width="380" height="660" fill="${p.c1}"/>
      <rect x="140" y="170" width="380" height="18" fill="${p.band}"/><rect x="140" y="812" width="380" height="18" fill="${p.band}"/>
      ${label({ ...p, top: 190, center: 330 })}
      <rect x="170" y="172" width="60" height="656" fill="url(#gloss${p.id})"/></g>`,
  cup: (p) => `<g filter="url(#shadow${p.id})">
      <path d="M120 170 L 600 170 L 548 830 L 172 830Z" fill="url(#body${p.id})"/>
      <ellipse cx="360" cy="170" rx="250" ry="42" fill="${p.band}"/><ellipse cx="360" cy="160" rx="250" ry="42" fill="#fff" opacity=".9"/>
      <ellipse cx="360" cy="160" rx="200" ry="28" fill="none" stroke="${p.band}" stroke-width="6"/>
      <path d="M172 830 L 548 830 L 552 800 L 168 800Z" fill="#000" opacity=".15"/>
      ${label({ ...p, top: 200, center: 360 })}
      <path d="M190 190 L 260 190 L 240 810 L 196 810Z" fill="url(#gloss${p.id})"/></g>`,
  can: (p) => `<g filter="url(#shadow${p.id})">
      <rect x="170" y="110" width="380" height="700" rx="26" fill="url(#body${p.id})"/>
      <rect x="182" y="84" width="356" height="46" rx="18" fill="#D9DDE2"/><rect x="182" y="84" width="356" height="46" rx="18" fill="url(#gloss${p.id})"/>
      <rect x="182" y="792" width="356" height="40" rx="16" fill="#C9CED4"/>
      ${label({ ...p, top: 170, center: 360 })}
      <rect x="220" y="130" width="70" height="660" fill="url(#gloss${p.id})"/></g>`,
  bottle: (p) => `<g filter="url(#shadow${p.id})">
      <rect x="300" y="40" width="120" height="70" rx="12" fill="${p.band}"/>
      <path d="M310 110 L 410 110 L 410 170 C 520 220 540 260 540 330 L 540 820 C 540 846 520 860 494 860 L 226 860 C 200 860 180 846 180 820 L 180 330 C 180 260 200 220 310 170Z" fill="url(#body${p.id})" opacity=".96"/>
      <rect x="180" y="300" width="360" height="520" fill="${p.c1}"/>
      ${label({ ...p, top: 280, center: 360, ms: .85 })}
      <rect x="220" y="200" width="60" height="640" fill="url(#gloss${p.id})"/></g>`,
};

export const illustrated = [
  { id: 'latiao-classic', shape: 'bag', c1: '#D7261E', c2: '#8E0E0E', band: '#F6C343', accent: '#fff', cn: '辣条', ru: ['Латяо острые', 'классические'], weight: '106 г', motif: 'chili' },
  { id: 'tofu-spicy', shape: 'pouch', c1: '#E8641B', c2: '#A93E0A', band: '#2B2B2B', accent: '#fff', cn: '麻辣豆干', ru: ['Соевые полоски', 'по-сычуаньски'], weight: '90 г', motif: 'chili', ms: .9 },
  { id: 'rice-crackers', shape: 'bag', c1: '#F3C969', c2: '#C7922E', band: '#B3261E', accent: '#5A3A10', cnColor: '#7A1C14', cn: '米饼', ru: ['Рисовые крекеры', 'с морской солью'], weight: '112 г', motif: 'crackers' },
  { id: 'mochi-mango', shape: 'box', c1: '#F6B21B', c2: '#C98400', band: '#B3261E', accent: '#5A3A10', cnColor: '#7A1C14', cn: '芒果麻薯', ru: ['Моти с манго', '6 штук'], weight: '210 г', motif: 'mango' },
  { id: 'mochi-taro', shape: 'box', c1: '#8D6CC2', c2: '#5E4392', band: '#F3C969', accent: '#fff', cn: '芋泥麻薯', ru: ['Моти с таро', '6 штук'], weight: '210 г', motif: 'taro' },
  { id: 'milk-candy', shape: 'bag', c1: '#2F6DB5', c2: '#1B467A', band: '#E23D3D', accent: '#fff', cn: '奶糖', ru: ['Сливочные', 'ириски'], weight: '150 г', motif: 'candy' },
  { id: 'biscuit-sticks', shape: 'box', c1: '#E9557A', c2: '#B23256', band: '#fff', accent: '#fff', cn: '草莓棒', ru: ['Палочки', 'с клубникой'], weight: '45 г', motif: 'sticks' },
  { id: 'noodles-chongqing', shape: 'cup', c1: '#2A1A1A', c2: '#120A0A', band: '#C8341E', accent: '#F6C343', cn: '重庆小面', ru: ['Лапша острая', 'по-чунцински'], weight: '135 г', motif: 'noodles' },
  { id: 'chips-cucumber', shape: 'bag', c1: '#3FA34D', c2: '#24702F', band: '#F2C14E', accent: '#fff', cn: '黄瓜味', ru: ['Чипсы со вкусом', 'огурца'], weight: '70 г', motif: 'cucumber' },
  { id: 'hawthorn', shape: 'pouch', c1: '#B5172F', c2: '#7C0C1E', band: '#F3C969', accent: '#fff', cn: '山楂片', ru: ['Пастила', 'из боярышника'], weight: '100 г', motif: 'berries' },
  { id: 'oolong', shape: 'bottle', c1: '#C8913A', c2: '#8F5F1C', band: '#2F5D3A', accent: '#fff', cn: '乌龙茶', ru: ['Чай улун', 'без сахара'], weight: '500 мл', motif: 'leaf' },
  { id: 'lychee-soda', shape: 'can', c1: '#F28CA8', c2: '#C9587A', band: '#fff', accent: '#fff', cn: '荔枝', ru: ['Газировка', 'личи'], weight: '330 мл', motif: 'lychee' },
  { id: 'plum-dried', shape: 'pouch', c1: '#5B1E4E', c2: '#3A0F32', band: '#F3C969', accent: '#F3C969', cn: '话梅', ru: ['Сушёная слива', 'со специями'], weight: '80 г', motif: 'plum' },
  { id: 'seeds-caramel', shape: 'bag', c1: '#A5622A', c2: '#6E3C12', band: '#F3C969', accent: '#fff', cn: '焦糖瓜子', ru: ['Семечки', 'со вкусом карамели'], weight: '160 г', motif: 'seeds' },
  { id: 'peanuts-mala', shape: 'can', c1: '#B3261E', c2: '#6E120D', band: '#F3C969', accent: '#F3C969', cn: '麻辣花生', ru: ['Арахис', 'мала'], weight: '120 г', motif: 'peanuts' },
];

function svgFor(p) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><defs>${defs(p.id, p.c1, p.c2)}</defs>${shapes[p.shape](p)}</svg>`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const font = (f) => readFileSync(join(root, 'src/assets/fonts', f)).toString('base64');
  const css = `@font-face{font-family:Manrope;src:url(data:font/woff2;base64,${font('manrope-cyrillic-wght-normal.woff2')}) format('woff2');unicode-range:U+0400-04FF;font-weight:200 800}
@font-face{font-family:Manrope;src:url(data:font/woff2;base64,${font('manrope-latin-wght-normal.woff2')}) format('woff2');font-weight:200 800}
html,body{margin:0;background:transparent}`;
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  for (const p of illustrated) {
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${svgFor(p)}</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    const png = join(tmp, `${p.id}.png`);
    await page.locator('svg').screenshot({ path: png, omitBackground: true });
    execFileSync('convert', [png, '-quality', '84', '-define', 'webp:alpha-quality=90', join(out, `${p.id}.webp`)]);
    execFileSync('convert', [png, '-resize', '360x450', '-quality', '80', join(out, `${p.id}-360.webp`)]);
    console.log('ok', p.id);
  }
  await browser.close();
  rmSync(tmp, { recursive: true, force: true });
}
