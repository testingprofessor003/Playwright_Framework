import { chromium } from 'playwright';
import path from 'path';
import { pathToFileURL } from 'url';
import fs from 'fs';

async function renderPdf(htmlFile: string, pdfFile: string): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const fileUrl = pathToFileURL(path.resolve(htmlFile)).href;
  await page.goto(fileUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  fs.mkdirSync(path.dirname(pdfFile), { recursive: true });
  await page.pdf({
    path: pdfFile,
    format: 'A4',
    printBackground: true,
    margin: { top: '16mm', bottom: '16mm', left: '12mm', right: '12mm' },
  });
  await browser.close();
  console.log(`Wrote ${pdfFile}`);
}

async function main(): Promise<void> {
  const docs = path.join(process.cwd(), 'docs');
  await renderPdf(path.join(docs, 'hld.html'), path.join(docs, 'hld.pdf'));
  await renderPdf(path.join(docs, 'lld.html'), path.join(docs, 'lld.pdf'));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
