import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const src = path.join(process.cwd(), 'src', 'reports', 'assets', 'testing-professor-logo.png');
const outPng = path.join(process.cwd(), 'src', 'reports', 'assets', 'testing-professor-favicon.png');
const outIco = path.join(process.cwd(), 'src', 'reports', 'assets', 'favicon.ico');
const b64 = fs.readFileSync(src).toString('base64');

function pngToIco(png: Buffer, size: number): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size >= 256 ? 0 : size, 0);
  entry.writeUInt8(size >= 256 ? 0 : size, 1);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(22, 12);
  return Buffer.concat([header, entry, png]);
}

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 64, height: 64 } });
  await page.setContent(
    `<!DOCTYPE html>
<html>
<body style="margin:0;background:transparent">
<canvas id="c" width="64" height="64"></canvas>
<script>
window.__ready = new Promise((resolve) => {
  const img = new Image();
  img.onload = () => {
    const c = document.getElementById('c');
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, 64, 64);
    resolve(c.toDataURL('image/png'));
  };
  img.src = 'data:image/png;base64,${b64}';
});
</script>
</body>
</html>`,
    { waitUntil: 'load' },
  );
  const dataUrl = await page.evaluate(() => (window as Window & { __ready: Promise<string> }).__ready);
  const png = Buffer.from(String(dataUrl).split(',')[1], 'base64');
  fs.writeFileSync(outPng, png);
  fs.writeFileSync(outIco, pngToIco(png, 64));
  console.log(`wrote ${outPng} (${png.length} bytes)`);
  console.log(`wrote ${outIco}`);
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
