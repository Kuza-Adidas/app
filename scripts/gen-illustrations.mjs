// Генерирует иллюстрации упаковок для всех товаров в едином стиле «стикер»:
// плоские цвета, контур тушью, жёсткая тень, кистевые иероглифы (Ma Shan Zheng).
// SVG-сцены рендерятся в Chromium (Playwright) в прозрачный PNG и конвертируются в WebP (ImageMagick).
// Запуск: node scripts/gen-illustrations.mjs
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
const INK = '#17110E';
const SW = 7; // толщина контура

// контур + жёсткая тень для любой фигуры
const sticker = (shape, fill, extra = '') => `<g transform="translate(14 16)">${shape.replace('/>', ` fill="${INK}"/>`)}</g>${shape.replace('/>', ` fill="${fill}" stroke="${INK}" stroke-width="${SW}" stroke-linejoin="round" ${extra}/>`)}`;
const line = (d, w = 5, c = INK) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const o = `stroke="${INK}" stroke-width="5" stroke-linejoin="round"`;

// ---------- мотивы ----------
const motifs = {
  chili: () => `<path d="M-10 -70 C 60 -60 90 10 40 80 C 20 108 -30 120 -60 110 C -10 90 30 40 10 -20 C 4 -40 -4 -56 -10 -70Z" fill="#E8392E" ${o}/>
    ${line('M4 -50 C 40 -36 52 6 30 44', 7, '#fff')}
    <path d="M-34 -70 C -16 -90 12 -88 24 -70 C 4 -58 -16 -58 -34 -70Z" fill="#3E9A41" ${o}/>${line('M-8 -74 C -12 -96 0 -110 18 -112', 9, '#2F7D32')}`,
  crackers: () => [[-60, -20, 62], [55, -40, 54], [10, 50, 66]].map(([cx, cy, r]) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#EFC57A" ${o}/>
    <circle cx="${cx}" cy="${cy}" r="${r - 16}" fill="none" stroke="#C99A45" stroke-width="3" stroke-dasharray="3 9"/>
    ${[0, 1, 2, 3].map(i => `<circle cx="${cx + Math.cos(i * 1.6) * r * .42}" cy="${cy + Math.sin(i * 1.6) * r * .42}" r="5" fill="#fff"/>`).join('')}`).join(''),
  mango: () => `<ellipse cx="0" cy="10" rx="92" ry="72" fill="#FF9F1C" ${o} transform="rotate(-18)"/>
    <ellipse cx="-26" cy="-14" rx="34" ry="16" fill="#FFD166" transform="rotate(-30)"/>
    <path d="M40 -64 C 70 -110 120 -100 130 -80 C 100 -60 70 -56 40 -64Z" fill="#2E8B57" ${o}/>`,
  taro: () => `<circle r="90" fill="#C3A6EC" ${o}/>${line('M-48 -8 C -30 -60 40 -60 50 -10 C 58 30 10 54 -14 30 C -34 10 -6 -18 16 -6', 12, '#fff')}`,
  candy: () => [[-50, -30, -14], [60, 34, 18]].map(([cx, cy, r]) => `<g transform="translate(${cx} ${cy}) rotate(${r})">
      <path d="M-68 0 L -112 -32 L -104 0 L -112 32Z M68 0 L 112 -32 L 104 0 L 112 32Z" fill="#fff" ${o}/>
      <rect x="-72" y="-36" width="144" height="72" rx="36" fill="#fff" ${o}/>
      <rect x="-38" y="-33" width="20" height="66" fill="#2F6DB5"/><rect x="18" y="-33" width="20" height="66" fill="#E8392E"/></g>`).join(''),
  sticks: () => `<g transform="rotate(-20)">${[-60, -30, 0, 30, 60].map((dx, i) => `<rect x="${dx - 11}" y="${-110 + (i % 2) * 14}" width="22" height="220" rx="11" fill="#E9BC74" ${o}/><rect x="${dx - 11}" y="${-110 + (i % 2) * 14}" width="22" height="150" rx="11" fill="#F27C9C" ${o}/>`).join('')}</g>`,
  noodles: () => `<path d="M-120 -10 L 120 -10 C 116 70 60 104 0 104 C -60 104 -116 70 -120 -10Z" fill="#fff" ${o}/>
    <ellipse cx="0" cy="-10" rx="120" ry="26" fill="#E8392E" ${o}/>
    ${[-70, -35, 0, 35, 70].map(dx => line(`M${dx - 18} -14 q 9 -18 18 0 t 18 0`, 7, '#F6D58C')).join('')}
    ${line('M60 -96 L 140 -30', 10, INK)}${line('M84 -106 L 154 -40', 10, INK)}`,
  cucumber: () => [[-56, -24, 64], [60, 30, 56]].map(([cx, cy, r]) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#2E7D32" ${o}/><circle cx="${cx}" cy="${cy}" r="${r - 12}" fill="#CDEBAE"/>
    ${[0, 1, 2, 3, 4, 5].map(i => `<ellipse cx="${cx + Math.cos(i) * r * .32}" cy="${cy + Math.sin(i) * r * .32}" rx="5" ry="9" fill="#F1FAE6"/>`).join('')}`).join(''),
  berries: () => [[-40, 0], [36, -18], [10, 52], [-70, 60], [76, 50]].map(([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="40" fill="#E0263F" ${o}/><circle cx="${cx - 12}" cy="${cy - 12}" r="9" fill="#fff" opacity=".6"/>`).join('')
    + `<path d="M-10 -62 C 20 -110 80 -100 96 -84 C 60 -64 24 -60 -10 -62Z" fill="#2E8B57" ${o}/>`,
  leaf: () => `<path d="M0 -110 C 90 -70 90 50 0 110 C -90 50 -90 -70 0 -110Z" fill="#5C9A44" ${o}/>${line('M0 -96 L 0 100', 5, '#E4F2D6')}
    ${[-50, -10, 30, 70].map(dy => line(`M0 ${dy} L 42 ${dy - 28} M0 ${dy} L -42 ${dy - 28}`, 4, '#E4F2D6')).join('')}`,
  lychee: () => `<circle cx="-30" cy="0" r="80" fill="#E2405C" ${o}/>
    ${Array.from({ length: 14 }, (_, i) => `<circle cx="${-30 + Math.cos(i * .9) * 48 * ((i % 3) / 3 + .4)}" cy="${Math.sin(i * .9) * 48 * ((i % 3) / 3 + .4)}" r="7" fill="#B8243E"/>`).join('')}
    <circle cx="72" cy="42" r="56" fill="#FFF8F2" ${o}/><ellipse cx="78" cy="48" rx="18" ry="24" fill="#6B3A2A"/>`,
  plum: () => [[-44, 6, 70], [52, -10, 60], [10, 72, 50]].map(([cx, cy, r]) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#8A2C7C" ${o}/><circle cx="${cx - r / 3}" cy="${cy - r / 3}" r="${r / 6}" fill="#fff" opacity=".45"/>`).join(''),
  seeds: () => Array.from({ length: 9 }, (_, i) => { const a = i * 0.7, rr = 26 + (i % 3) * 30; return `<g transform="translate(${Math.cos(a) * rr} ${Math.sin(a) * rr}) rotate(${i * 40})"><path d="M0 -34 C 22 -10 18 26 0 34 C -18 26 -22 -10 0 -34Z" fill="#2A1F18" ${o}/>${line('M0 -26 C 7 -8 7 16 0 26', 4, '#E8DCC8')}</g>`; }).join(''),
  peanuts: () => [[-50, -10, -30], [50, 10, 25], [0, 70, 80]].map(([cx, cy, r]) => `<g transform="translate(${cx} ${cy}) rotate(${r})"><path d="M-30 -30 a 32 32 0 0 1 60 0 C 30 -10 26 0 30 30 a 32 32 0 0 1 -60 0 C -26 0 -30 -10 -30 -30Z" fill="#DDA45E" ${o}/>${line('M-12 -36 L 12 -36 M-14 -12 L 14 -12 M-14 14 L 14 14', 4, '#B57A36')}</g>`).join(''),
  pig: () => `<path d="M-74 -60 L -50 -96 L -30 -66Z M74 -60 L 50 -96 L 30 -66Z" fill="#F7B5C4" ${o}/>
    <circle r="86" fill="#FAC3CF" ${o}/>
    <ellipse cx="0" cy="22" rx="42" ry="30" fill="#F28FA0" ${o}/><ellipse cx="-14" cy="22" rx="7" ry="10" fill="${INK}"/><ellipse cx="14" cy="22" rx="7" ry="10" fill="${INK}"/>
    <circle cx="-36" cy="-24" r="9" fill="${INK}"/><circle cx="36" cy="-24" r="9" fill="${INK}"/><circle cx="-33" cy="-27" r="3" fill="#fff"/><circle cx="39" cy="-27" r="3" fill="#fff"/>
    <ellipse cx="-62" cy="16" rx="12" ry="8" fill="#F28FA0" opacity=".7"/><ellipse cx="62" cy="16" rx="12" ry="8" fill="#F28FA0" opacity=".7"/>`,
  peach: () => `<path d="M0 -70 C 70 -90 110 -10 80 50 C 60 92 20 100 0 86 C -20 100 -60 92 -80 50 C -110 -10 -70 -90 0 -70Z" fill="#FFB3A1" ${o}/>
    ${line('M0 -66 C -16 -20 -14 40 0 84', 5, '#E77F73')}<ellipse cx="-44" cy="-14" rx="16" ry="26" fill="#fff" opacity=".45"/>
    <path d="M6 -70 C 30 -118 80 -116 92 -100 C 62 -78 34 -72 6 -70Z" fill="#45A05A" ${o}/>`,
  strawberry: () => `<path d="M0 -60 C 70 -70 100 -20 84 30 C 66 80 24 108 0 112 C -24 108 -66 80 -84 30 C -100 -20 -70 -70 0 -60Z" fill="#E8392E" ${o}/>
    ${Array.from({ length: 12 }, (_, i) => `<ellipse cx="${-50 + (i % 4) * 33 + (Math.floor(i / 4) % 2) * 16}" cy="${-20 + Math.floor(i / 4) * 34}" rx="4" ry="7" fill="#FFE08A"/>`).join('')}
    <path d="M-60 -64 L -30 -76 L -10 -100 L 6 -76 L 34 -96 L 36 -70 L 66 -66 L 30 -50 L 0 -60 L -30 -48Z" fill="#3E9A41" ${o}/>`,
  boba: () => `<path d="M-100 -40 L 100 -40 L 84 90 C 80 104 -80 104 -84 90Z" fill="#fff" ${o}/>
    <path d="M-96 -10 L 96 -10 L 84 90 C 80 104 -80 104 -84 90Z" fill="#C98A52"/>
    <ellipse cx="0" cy="-40" rx="100" ry="22" fill="#F4E3C9" ${o}/>
    ${[[-48, 30], [-10, 50], [30, 26], [56, 60], [-40, 70], [6, 80]].map(([x, y], i) => `<rect x="${x - 15}" y="${y - 15}" width="30" height="30" rx="5" fill="#FFF9EE" ${o} transform="rotate(${i * 17} ${x} ${y})"/>`).join('')}
    ${line('M-96 -10 L 96 -10', 0)}<path d="M-100 -40 L 100 -40 L 84 90 C 80 104 -80 104 -84 90Z" fill="none" ${o}/>`,
  lobster: () => `${line('M-20 -96 C -60 -150 -110 -150 -130 -130', 5)}${line('M20 -96 C 60 -150 110 -150 130 -130', 5)}
    <path d="M-36 -60 C -80 -80 -120 -120 -116 -150 C -96 -140 -100 -120 -84 -110 C -96 -130 -86 -150 -70 -150 C -66 -116 -40 -96 -24 -76Z" fill="#E8392E" ${o}/>
    <path d="M36 -60 C 80 -80 120 -120 116 -150 C 96 -140 100 -120 84 -110 C 96 -130 86 -150 70 -150 C 66 -116 40 -96 24 -76Z" fill="#E8392E" ${o}/>
    <ellipse cx="0" cy="-60" rx="40" ry="50" fill="#E8392E" ${o}/>
    ${[0, 1, 2, 3, 4].map(i => `<rect x="${-34 + i * 3}" y="${-12 + i * 30}" width="${68 - i * 6}" height="32" rx="14" fill="#E8392E" ${o}/>`).join('')}
    <path d="M0 140 L -46 176 L -18 186 L 0 166 L 18 186 L 46 176Z" fill="#E8392E" ${o}/>
    <circle cx="-14" cy="-84" r="6" fill="${INK}"/><circle cx="14" cy="-84" r="6" fill="${INK}"/>`,
};

// ---------- этикетка ----------
function label(p, { top, cx = 360, lw = 380, ms = 1, cnDy = 0 }) {
  const cnSize = p.cn.length > 3 ? 84 : p.cn.length > 2 ? 104 : 124;
  return `
    <text x="${cx}" y="${top + 100 + cnDy}" text-anchor="middle" font-family="MaShan" font-size="${cnSize}" fill="${p.cnColor || '#fff'}" stroke="${INK}" stroke-width="${p.cnStroke ? 4 : 0}" paint-order="stroke">${p.cn}</text>
    <g transform="translate(${cx} ${top + 280}) scale(${ms})">${motifs[p.motif]()}</g>
    <g transform="rotate(-3 ${cx} ${top + 450})"><rect x="${cx - lw / 2}" y="${top + 404}" width="${lw}" height="${p.ru.length > 1 ? 112 : 76}" rx="14" fill="#fff" ${o}/>
    ${p.ru.map((l, i) => `<text x="${cx}" y="${top + 452 + i * 40}" text-anchor="middle" font-family="Unbounded" font-weight="700" font-size="${l.length > 15 ? 22 : 27}" fill="${INK}">${l}</text>`).join('')}</g>
    <text x="${cx}" y="${top + 572}" text-anchor="middle" font-family="Neucha" font-size="34" fill="${p.accent}">${p.weight}</text>`;
}

function zigzag(x1, x2, y, dir) {
  let d = '';
  const n = 20, step = (x2 - x1) / n;
  for (let i = 0; i <= n; i++) d += ` L ${x1 + i * step} ${y + (i % 2 ? dir * 14 : 0)}`;
  return d;
}
const gloss = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${w / 2}" fill="#fff" opacity=".28"/>`;

const shapes = {
  bag: (p) => {
    const x1 = 140, x2 = 580, top = 80, bot = 840;
    const d = `M${x1} ${top}${zigzag(x1, x2, top, -1)} C ${x2 + 26} 300 ${x2 + 26} 620 ${x2} ${bot}${zigzag(x2, x1, bot, 1)} C ${x1 - 26} 620 ${x1 - 26} 300 ${x1} ${top}Z`;
    return `${sticker(`<path d="${d}"/>`, p.c1)}
      <path d="M${x1 + 4} ${top + 46} L ${x2 - 4} ${top + 46}" stroke="${p.band}" stroke-width="16"/>${line(`M${x1 + 4} ${top + 38} L ${x2 - 4} ${top + 38} M${x1 + 4} ${top + 54} L ${x2 - 4} ${top + 54}`, 3)}
      ${gloss(176, 150, 26, 620)}${label(p, { top: 120 })}`;
  },
  pouch: (p) => `${sticker('<rect x="150" y="74" width="420" height="768" rx="34"/>', p.c1)}
      ${line('M150 136 L 570 136', 3)}<path d="M150 116 l 16 -9 l 0 18Z M570 116 l -16 -9 l 0 18Z" fill="${INK}"/>
      <rect x="153" y="760" width="414" height="78" rx="0" fill="${p.c2}" opacity=".55"/>${line('M150 760 L 570 760', 4)}
      ${gloss(184, 170, 24, 560)}${label(p, { top: 140 })}`,
  box: (p) => `<g transform="translate(14 16)"><path d="M140 170 L 600 110 L 600 770 L 520 830 L 140 830Z" fill="${INK}"/></g>
      <path d="M140 170 L 520 170 L 600 110 L 220 110Z" fill="${p.c2}" ${o}/>
      <path d="M520 170 L 600 110 L 600 770 L 520 830Z" fill="${p.c2}" ${o}/>
      <rect x="140" y="170" width="380" height="660" fill="${p.c1}" stroke="${INK}" stroke-width="${SW}" stroke-linejoin="round"/>
      <rect x="143" y="174" width="374" height="20" fill="${p.band}"/><rect x="143" y="806" width="374" height="20" fill="${p.band}"/>
      ${label(p, { top: 196, cx: 330, lw: 340 })}`,
  cup: (p) => `${sticker('<path d="M118 172 L 602 172 L 548 836 L 172 836Z"/>', p.c1)}
      <ellipse cx="360" cy="168" rx="254" ry="44" fill="${p.band}" ${o}/><ellipse cx="360" cy="156" rx="236" ry="34" fill="#fff" ${o}/>
      ${gloss(196, 220, 24, 560)}${label(p, { top: 200 })}`,
  can: (p) => `${sticker('<rect x="168" y="104" width="384" height="716" rx="30"/>', p.c1)}
      <rect x="180" y="80" width="360" height="50" rx="18" fill="#D9DDE2" ${o}/><rect x="180" y="790" width="360" height="44" rx="16" fill="#C9CED4" ${o}/>
      ${gloss(206, 150, 24, 620)}${label(p, { top: 170 })}`,
  bottle: (p) => `<rect x="296" y="36" width="128" height="78" rx="14" fill="${p.band}" ${o}/>
      ${sticker('<path d="M308 112 L 412 112 L 412 172 C 522 222 542 262 542 332 L 542 822 C 542 848 522 862 496 862 L 224 862 C 198 862 178 848 178 822 L 178 332 C 178 262 198 222 308 172Z"/>', p.c1)}
      ${gloss(212, 300, 22, 520)}${label(p, { top: 262, lw: 330, ms: .8 })}`,
  // бутылочка с соской (молочные коктейли)
  babybottle: (p) => `
      <path d="M232 250 C 232 120 290 52 360 52 C 430 52 488 120 488 250Z" fill="${INK}" transform="translate(14 16)"/>
      <path d="M232 250 C 232 120 290 52 360 52 C 430 52 488 120 488 250Z" fill="#E7DEFA" fill-opacity=".9" ${o}/>
      <path d="M330 250 L 330 170 C 330 130 346 112 360 112 C 374 112 390 130 390 170 L 390 250Z" fill="#F4EFFF" ${o}/>
      ${sticker('<path d="M210 250 L 510 250 L 510 320 C 560 340 576 380 560 440 C 548 486 512 520 520 580 C 528 640 576 670 576 750 C 576 820 520 862 450 862 L 270 862 C 200 862 144 820 144 750 C 144 670 192 640 200 580 C 208 520 172 486 160 440 C 144 380 160 340 210 320Z"/>', p.c1)}
      <rect x="200" y="236" width="320" height="74" rx="14" fill="#E7DEFA" ${o}/>${[0, 1, 2, 3, 4, 5, 6].map(i => line(`M${232 + i * 42} 250 L ${232 + i * 42} 296`, 3)).join('')}
      ${gloss(196, 360, 22, 420)}${label(p, { top: 262, lw: 330, ms: .62, cnDy: 40 })}`,
  // дой-пак с носиком (питьевое желе)
  spout: (p) => `
      <circle cx="360" cy="96" r="58" fill="${INK}" transform="translate(14 16)"/><circle cx="360" cy="96" r="58" fill="${p.band}" ${o}/>
      <rect x="320" y="146" width="80" height="54" rx="8" fill="#fff" ${o}/>${line('M320 166 L 400 166 M320 182 L 400 182', 3)}
      ${sticker('<path d="M250 200 L 470 200 C 520 220 560 250 580 320 L 600 760 C 602 820 570 850 520 850 L 200 850 C 150 850 118 820 120 760 L 140 320 C 160 250 200 220 250 200Z"/>', p.c1)}
      ${gloss(176, 330, 24, 440)}${label(p, { top: 220, lw: 360, ms: .86 })}`,
  // стакан молочного чая с купольной крышкой
  teacup: (p) => `
      ${sticker('<path d="M150 230 L 570 230 L 530 850 L 190 850Z"/>', '#FFFBF3')}
      <path d="M156 470 L 564 470 L 530 850 L 190 850Z" fill="${p.c1}" ${o}/>
      <path d="M126 236 C 126 150 594 150 594 236Z" fill="${p.band}" ${o}/><rect x="112" y="220" width="496" height="36" rx="18" fill="${p.band}" ${o}/>
      ${gloss(188, 290, 22, 500)}${label(p, { top: 240, lw: 360, ms: .8 })}`,
};

export const illustrated = [
  // бывшие фото-позиции
  { id: 'hibaby-strawberry', shape: 'babybottle', c1: '#F6B3C1', band: '#E7DEFA', accent: INK, cn: '奶昔', cnColor: '#E8392E', ru: ['Hi Baby', 'клубника'], weight: '200 мл', motif: 'pig' },
  { id: 'hibaby-peach', shape: 'babybottle', c1: '#F8D46A', band: '#E7DEFA', accent: INK, cn: '奶昔', cnColor: '#E8392E', ru: ['Hi Baby', 'жёлтый персик'], weight: '200 мл', motif: 'pig' },
  { id: 'hibaby-original', shape: 'babybottle', c1: '#FFF4DC', band: '#E7DEFA', accent: INK, cn: '奶昔', cnColor: '#2F6DB5', ru: ['Hi Baby', 'классический'], weight: '200 мл', motif: 'pig' },
  { id: 'jelly-peach', shape: 'spout', c1: '#F7B0B4', c2: '#E58A94', band: '#F07F8F', accent: INK, cn: '吸吸冻', cnColor: '#fff', cnStroke: true, ru: ['Желе питьевое', 'белый персик'], weight: '170 г', motif: 'peach' },
  { id: 'jelly-strawberry', shape: 'spout', c1: '#E8392E', c2: '#B92418', band: '#E8392E', accent: '#fff', cn: '吸吸冻', ru: ['Желе питьевое', 'клубника'], weight: '170 г', motif: 'strawberry' },
  { id: 'milktea-jasmine', shape: 'teacup', c1: '#9BCB7E', band: '#4FA34A', accent: INK, cn: '奶茶', cnColor: '#2E7D32', ru: ['Молочный чай', 'с жасмином'], weight: '80 г', motif: 'boba' },
  { id: 'milktea-original', shape: 'teacup', c1: '#F2B866', band: '#E39B2D', accent: INK, cn: '奶茶', cnColor: '#C0561B', ru: ['Молочный чай', 'классический'], weight: '80 г', motif: 'boba' },
  { id: 'latiao-lobster', shape: 'pouch', c1: '#2C7FC9', c2: '#1B5C99', band: '#F2B705', accent: '#F2B705', cn: '龙虾辣条', cnColor: '#F2B705', cnStroke: true, ru: ['Латяо', '«Лобстер»'], weight: '18 г', motif: 'lobster', ms: .78 },
  // остальные
  { id: 'latiao-classic', shape: 'bag', c1: '#E8392E', c2: '#A41A10', band: '#F2B705', accent: '#fff', cn: '辣条', ru: ['Латяо острые', 'классические'], weight: '106 г', motif: 'chili' },
  { id: 'tofu-spicy', shape: 'pouch', c1: '#F07A2A', c2: '#B9500F', band: INK, accent: '#fff', cn: '麻辣豆干', ru: ['Соевые полоски', 'по-сычуаньски'], weight: '90 г', motif: 'chili' },
  { id: 'rice-crackers', shape: 'bag', c1: '#F6CF6E', c2: '#C7922E', band: '#E8392E', accent: INK, cnColor: '#B3261E', cn: '米饼', ru: ['Рисовые крекеры', 'с морской солью'], weight: '112 г', motif: 'crackers' },
  { id: 'mochi-mango', shape: 'box', c1: '#F8B925', c2: '#D08C00', band: '#E8392E', accent: INK, cnColor: '#B3261E', cn: '芒果麻薯', ru: ['Моти с манго', '6 штук'], weight: '210 г', motif: 'mango' },
  { id: 'mochi-taro', shape: 'box', c1: '#9475C9', c2: '#6A4E9E', band: '#F2B705', accent: '#fff', cn: '芋泥麻薯', ru: ['Моти с таро', '6 штук'], weight: '210 г', motif: 'taro' },
  { id: 'milk-candy', shape: 'bag', c1: '#2F6DB5', c2: '#1B467A', band: '#E8392E', accent: '#fff', cn: '奶糖', ru: ['Сливочные', 'ириски'], weight: '150 г', motif: 'candy' },
  { id: 'biscuit-sticks', shape: 'box', c1: '#F06A8C', c2: '#C2416A', band: '#fff', accent: '#fff', cn: '草莓棒', ru: ['Палочки', 'с клубникой'], weight: '45 г', motif: 'sticks' },
  { id: 'noodles-chongqing', shape: 'cup', c1: '#2A1A1A', c2: '#120A0A', band: '#E8392E', accent: '#F2B705', cnColor: '#F2B705', cn: '重庆小面', ru: ['Лапша острая', 'по-чунцински'], weight: '135 г', motif: 'noodles' },
  { id: 'chips-cucumber', shape: 'bag', c1: '#45A853', c2: '#24702F', band: '#F2B705', accent: '#fff', cn: '黄瓜味', ru: ['Чипсы со вкусом', 'огурца'], weight: '70 г', motif: 'cucumber' },
  { id: 'hawthorn', shape: 'pouch', c1: '#C21F38', c2: '#7C0C1E', band: '#F2B705', accent: '#fff', cn: '山楂片', ru: ['Пастила', 'из боярышника'], weight: '100 г', motif: 'berries' },
  { id: 'oolong', shape: 'bottle', c1: '#D29A44', c2: '#8F5F1C', band: '#2F5D3A', accent: INK, cn: '乌龙茶', ru: ['Чай улун', 'без сахара'], weight: '500 мл', motif: 'leaf' },
  { id: 'lychee-soda', shape: 'can', c1: '#F59AB3', c2: '#C9587A', band: '#fff', accent: INK, cn: '荔枝', ru: ['Газировка', 'личи'], weight: '330 мл', motif: 'lychee' },
  { id: 'plum-dried', shape: 'pouch', c1: '#5B1E4E', c2: '#3A0F32', band: '#F2B705', accent: '#F2B705', cn: '话梅', ru: ['Сушёная слива', 'со специями'], weight: '80 г', motif: 'plum' },
  { id: 'seeds-caramel', shape: 'bag', c1: '#B06A2C', c2: '#6E3C12', band: '#F2B705', accent: '#fff', cn: '焦糖瓜子', ru: ['Семечки', 'с карамелью'], weight: '160 г', motif: 'seeds' },
  { id: 'peanuts-mala', shape: 'can', c1: '#C62A20', c2: '#6E120D', band: '#F2B705', accent: '#F2B705', cn: '麻辣花生', ru: ['Арахис', 'мала'], weight: '120 г', motif: 'peanuts' },
];

const svgFor = (p) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${shapes[p.shape](p)}</svg>`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const font = (f) => readFileSync(join(root, 'src/assets/fonts', f)).toString('base64');
  const css = `
@font-face{font-family:MaShan;src:url(data:font/woff2;base64,${font('ma-shan-zheng-subset.woff2')}) format('woff2')}
@font-face{font-family:Unbounded;src:url(data:font/woff2;base64,${font('unbounded-cyrillic-wght-normal.woff2')}) format('woff2');unicode-range:U+0400-04FF;font-weight:200 900}
@font-face{font-family:Unbounded;src:url(data:font/woff2;base64,${font('unbounded-latin-wght-normal.woff2')}) format('woff2');font-weight:200 900}
@font-face{font-family:Neucha;src:url(data:font/woff2;base64,${font('neucha-cyrillic-400-normal.woff2')}) format('woff2');unicode-range:U+0400-04FF}
@font-face{font-family:Neucha;src:url(data:font/woff2;base64,${font('neucha-latin-400-normal.woff2')}) format('woff2')}
html,body{margin:0;background:transparent}`;
  const only = process.argv.slice(2);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  for (const p of illustrated.filter(x => !only.length || only.includes(x.id))) {
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${svgFor(p)}</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(50);
    const png = join(tmp, `${p.id}.png`);
    await page.locator('svg').screenshot({ path: png, omitBackground: true });
    execFileSync('convert', [png, '-quality', '84', '-define', 'webp:alpha-quality=90', join(out, `${p.id}.webp`)]);
    execFileSync('convert', [png, '-resize', '360x450', '-quality', '80', join(out, `${p.id}-360.webp`)]);
    console.log('ok', p.id);
  }
  await browser.close();
  rmSync(tmp, { recursive: true, force: true });
}
