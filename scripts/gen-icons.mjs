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
@font-face{font-family:Golos;src:url(data:font/woff2;base64,${b64(join(root, 'src/assets/fonts/golos-text-cyrillic-wght-normal.woff2'))});font-weight:400 900}
@font-face{font-family:Unb;src:url(data:font/woff2;base64,${b64(join(root, 'src/assets/fonts/unbounded-cyrillic-wght-normal.woff2'))});font-weight:200 900}
@font-face{font-family:Neucha;src:url(data:font/woff2;base64,${b64(join(root, 'src/assets/fonts/neucha-cyrillic-400-normal.woff2'))})}
@font-face{font-family:MaShan;src:url(data:font/woff2;base64,${b64(join(root, 'src/assets/fonts/ma-shan-zheng-subset.woff2'))})}`;

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
body{margin:0;width:1200px;height:630px;background:#F4EBD8;background-image:radial-gradient(rgba(23,17,14,.08) 1.2px,transparent 1.5px);background-size:14px 14px;font-family:Golos;position:relative;overflow:hidden;color:#17110E}
.frame{position:absolute;inset:18px;border:3px solid #17110E;border-radius:22px}
.g{position:absolute;right:60px;top:90px;font-family:MaShan;font-size:300px;line-height:1;color:#D7301F}
img{position:absolute}
h1{font-family:Unb;font-weight:900;font-size:110px;margin:0;letter-spacing:2px;line-height:1}
.t{position:absolute;left:70px;top:120px;width:600px}
p{font-size:32px;line-height:1.3;color:#3B302A;margin:22px 0 0}
.tag{display:inline-block;margin-top:30px;font-family:Neucha;font-size:40px;background:#F2B705;border:3px solid #17110E;border-radius:10px;padding:6px 18px 2px;transform:rotate(-4deg);box-shadow:6px 6px 0 #17110E}
.sign{display:inline-block;font-family:MaShan;font-size:40px;color:#F2B705;background:#D7301F;border:3px solid #17110E;border-radius:8px;padding:2px 12px;box-shadow:4px 4px 0 #17110E;transform:rotate(-3deg);margin-bottom:22px}
</style></head><body><div class="frame"></div><div class="g">好吃</div>
<img src="${pic('milktea-jasmine')}" style="width:260px;right:360px;bottom:-30px;transform:rotate(-10deg)">
<img src="${pic('latiao-lobster')}" style="width:240px;right:40px;top:40px;transform:rotate(12deg)">
<img src="${pic('hibaby-strawberry')}" style="width:300px;right:150px;bottom:-60px">
<div class="t"><div class="sign">夜市</div><h1>ХАОЧИ</h1><p>Китайские снеки и напитки: латяо, молочный чай, моти — с доставкой</p><div class="tag">от 69 ₽</div></div></body></html>`);
await page.evaluate(() => document.fonts.ready);
const tmp = join(root, 'og.png');
await page.screenshot({ path: tmp });
execFileSync('convert', [tmp, '-quality', '86', join(img, 'og.jpg')]);
rmSync(tmp);
await browser.close();
console.log('icons + og.jpg ready');
