// Рендерит PNG-иконки и OG-картинку (превью для соцсетей) в Chromium.
// Запуск: node scripts/gen-icons.mjs
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const img = join(root, 'src/assets/img');
const b64 = (p) => readFileSync(p).toString('base64');
const favicon = readFileSync(join(img, 'favicon.svg'), 'utf8');
const fonts = `
@font-face{font-family:Manrope;src:url(data:font/woff2;base64,${b64(join(root, 'src/assets/fonts/manrope-cyrillic-wght-normal.woff2'))});font-weight:200 800}
@font-face{font-family:PF;src:url(data:font/woff2;base64,${b64(join(root, 'src/assets/fonts/playfair-display-cyrillic-700-normal.woff2'))});font-weight:700}
@font-face{font-family:PF;src:url(data:font/woff2;base64,${b64(join(root, 'src/assets/fonts/playfair-display-latin-700-normal.woff2'))});font-weight:700;unicode-range:U+0000-00FF}`;

const browser = await chromium.launch();
const page = await browser.newPage();

for (const size of [180, 192, 512]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${favicon.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  const name = size === 180 ? 'apple-touch-icon.png' : `icon-${size}.png`;
  await page.locator('svg').screenshot({ path: join(img, name), omitBackground: true });
}

const pic = (id) => `data:image/webp;base64,${b64(join(img, 'products', id + '.webp'))}`;
await page.setViewportSize({ width: 1200, height: 630 });
await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${fonts}
body{margin:0;width:1200px;height:630px;background:#FBF7F0;font-family:Manrope;position:relative;overflow:hidden}
.sun{position:absolute;right:-40px;top:40px;width:620px;height:620px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#D8432F,#B3261E 55%,#6E140F)}
.g{position:absolute;right:110px;top:70px;font-family:'WenQuanYi Zen Hei';font-size:150px;color:rgba(255,236,205,.18);letter-spacing:20px}
img{position:absolute;filter:drop-shadow(0 20px 20px rgba(40,10,0,.3))}
h1{font-family:PF;font-size:92px;margin:0;color:#1E1A17;letter-spacing:6px}
.t{position:absolute;left:70px;top:150px;width:560px}
p{font-size:34px;line-height:1.3;color:#3A332D;margin:18px 0 0}
.e{font-size:20px;font-weight:800;letter-spacing:5px;color:#B3261E;text-transform:uppercase;margin-bottom:18px}
.seal{display:inline-grid;place-items:center;width:84px;height:84px;border-radius:16px;background:#B3261E;color:#fff;font-family:'WenQuanYi Zen Hei';font-size:34px;flex-direction:column;line-height:1;display:inline-flex;justify-content:center;align-items:center;box-shadow:inset 0 0 0 4px #B3261E,inset 0 0 0 7px rgba(255,255,255,.8);margin-top:34px}
</style></head><body><div class="sun"></div><div class="g">好吃</div>
<img src="${pic('milktea-jasmine')}" style="width:250px;right:390px;bottom:-20px;transform:rotate(-8deg)">
<img src="${pic('latiao-lobster')}" style="width:220px;right:40px;top:70px;transform:rotate(10deg)">
<img src="${pic('hibaby-strawberry')}" style="width:280px;right:170px;bottom:-30px">
<div class="t"><div class="e">Китайские снеки и напитки</div><h1>ХАОЧИ</h1><p>Латяо, молочный чай, моти и редкие вкусы с доставкой по России</p><div class="seal"><span>好</span><span>吃</span></div></div></body></html>`);
await page.evaluate(() => document.fonts.ready);
const tmp = join(root, 'og.png');
await page.screenshot({ path: tmp });
execFileSync('convert', [tmp, '-quality', '86', join(img, 'og.jpg')]);
rmSync(tmp);
await browser.close();
console.log('icons + og.jpg ready');
