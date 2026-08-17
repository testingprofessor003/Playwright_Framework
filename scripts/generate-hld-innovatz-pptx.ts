/**
 * Separate HLD PowerPoint using Innovatz Global branding from
 * TestAutomation_2026_PW.pptx. Does not replace docs/hld-stakeholder.pptx.
 * Run: npm run docs:hld:innovatz
 */
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { chromium } from 'playwright';
import PptxGenJS from 'pptxgenjs';

const DOCS = path.join(process.cwd(), 'docs');
const DIAGRAM_DIR = path.join(DOCS, 'diagrams');
const BRAND = path.join(DOCS, 'branding');
const LOGO = path.join(BRAND, 'innovatz-logo.jpeg');
const COVER = path.join(BRAND, 'cover-robot.png');
const FOOTER_PILLS = path.join(BRAND, 'footer-pills.png');
const DARK_BG = path.join(BRAND, 'dark-bg.jpeg');

/** Innovatz palette from TestAutomation_2026_PW.pptx */
const NAVY = '0E2841';
const TEAL = '156082';
const CYAN = '0F9ED5';
const BLUE = '0070C0';
const LIME = '4EA72E';
const INK = '1F2937';
const MUTED = '64748B';
const WHITE = 'FFFFFF';
const WASH = 'E8F4F8';
const ROW = 'F7FBFC';
const FONT = 'Calibri';

interface HldDiagram {
  title: string;
  file: string;
}

function pngSize(file: string): { width: number; height: number } {
  const buf = fs.readFileSync(file);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function fitBox(pxW: number, pxH: number, maxW: number, maxH: number): { w: number; h: number } {
  const scale = Math.min(maxW / pxW, maxH / pxH);
  return { w: Number((pxW * scale).toFixed(3)), h: Number((pxH * scale).toFixed(3)) };
}

function slug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function launchHeadlessBrowser() {
  try {
    return await chromium.launch({ headless: true });
  } catch {
    return await chromium.launch({ headless: true, channel: 'chrome' });
  }
}

async function renderHldDiagrams(): Promise<HldDiagram[]> {
  const html = path.join(DOCS, 'hld.html');
  if (!fs.existsSync(html)) {
    throw new Error(`Missing ${html}`);
  }
  fs.mkdirSync(DIAGRAM_DIR, { recursive: true });

  const browser = await launchHeadlessBrowser();
  const page = await browser.newPage({
    viewport: { width: 1400, height: 900 },
    deviceScaleFactor: 2,
  });
  try {
    await page.goto(pathToFileURL(html).href, { waitUntil: 'networkidle', timeout: 60_000 });
    await page.addStyleTag({
      content: '.mermaid { background: #ffffff; padding: 16px; border-radius: 8px; }',
    });
    await page.waitForFunction(
      () => {
        const nodes = [...document.querySelectorAll('.mermaid')];
        return nodes.length > 0 && nodes.every((node) => node.querySelector('svg'));
      },
      { timeout: 30_000 },
    );

    const titles = (await page.evaluate(`(() => {
      const nodes = [...document.querySelectorAll('.mermaid')];
      return nodes.map((el) => {
        let cur = el.previousElementSibling;
        while (cur) {
          if (cur.matches('h2, h3')) {
            return (cur.textContent || '').replace(/^\\d+(?:\\.\\d+)*\\.?\\s+/, '').trim();
          }
          cur = cur.previousElementSibling;
        }
        return 'HLD diagram';
      });
    })()`)) as string[];

    const locators = page.locator('.mermaid');
    const count = await locators.count();
    const diagrams: HldDiagram[] = [];
    for (let i = 0; i < count; i++) {
      const title = titles[i] || `HLD diagram ${i + 1}`;
      const file = path.join(DIAGRAM_DIR, `hld-${String(i + 1).padStart(2, '0')}-${slug(title)}.png`);
      await locators.nth(i).screenshot({ path: file, type: 'png' });
      diagrams.push({ title, file });
    }
    return diagrams;
  } finally {
    await browser.close();
  }
}

function requireAsset(file: string, label: string): void {
  if (!fs.existsSync(file)) {
    throw new Error(`Missing ${label}: ${file}`);
  }
}

async function writePptx(diagrams: HldDiagram[]): Promise<string> {
  requireAsset(LOGO, 'Innovatz logo');
  requireAsset(COVER, 'cover image');
  requireAsset(FOOTER_PILLS, 'footer motif');

  const pptx = new PptxGenJS();
  pptx.author = 'Innovatz Global';
  pptx.title = 'High Level Design — Playwright BDD Cucumber Framework';
  pptx.subject = 'HLD stakeholder briefing (Innovatz branding)';
  pptx.defineLayout({ name: 'INNOVATZ_WIDE', width: 20, height: 11.25 });
  pptx.layout = 'INNOVATZ_WIDE';

  const addLogo = (slide: PptxGenJS.Slide, opts?: { x?: number; y?: number; w?: number }) => {
    slide.addImage({
      path: LOGO,
      x: opts?.x ?? 0.35,
      y: opts?.y ?? 0.22,
      w: opts?.w ?? 1.15,
      h: opts?.w ?? 1.15,
    });
  };

  const addFooter = (slide: PptxGenJS.Slide) => {
    slide.addImage({ path: FOOTER_PILLS, x: 16.7, y: 10.72, w: 2.9, h: 0.28 });
    slide.addText('Innovatz Global  ·  High Level Design  ·  Confidential', {
      x: 1.4,
      y: 10.7,
      w: 14,
      h: 0.32,
      fontFace: FONT,
      fontSize: 11,
      color: MUTED,
    });
  };

  const contentSlide = (title: string): PptxGenJS.Slide => {
    const s = pptx.addSlide();
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 20, h: 11.25, fill: { color: WHITE } });
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.18, h: 11.25, fill: { color: TEAL } });
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 20, h: 0.08, fill: { color: LIME } });
    addLogo(s);
    s.addText(title, {
      x: 1.7,
      y: 0.38,
      w: 16.5,
      h: 0.7,
      fontFace: FONT,
      fontSize: 32,
      bold: true,
      color: NAVY,
    });
    addFooter(s);
    return s;
  };

  // 1. Title
  {
    const s = pptx.addSlide();
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 20, h: 11.25, fill: { color: WHITE } });
    addLogo(s, { x: 0.45, y: 0.28, w: 1.25 });
    s.addImage({ path: COVER, x: 12.35, y: 0.75, w: 6.72, h: 9.4 });
    s.addImage({ path: FOOTER_PILLS, x: 16.7, y: 10.55, w: 2.9, h: 0.28 });
    s.addText('Accelerate Your Release Cadence with', {
      x: 1.05,
      y: 2.55,
      w: 10.4,
      h: 0.7,
      fontFace: FONT,
      fontSize: 28,
      bold: true,
      color: NAVY,
      align: 'center',
    });
    s.addText('Playwright', {
      x: 1.05,
      y: 3.25,
      w: 10.4,
      h: 0.85,
      fontFace: FONT,
      fontSize: 40,
      bold: true,
      color: BLUE,
      align: 'center',
      underline: { color: BLUE, style: 'sng' },
    });
    s.addText('High Level Design', {
      x: 1.05,
      y: 4.25,
      w: 10.4,
      h: 0.5,
      fontFace: FONT,
      fontSize: 22,
      color: TEAL,
      align: 'center',
    });
    s.addText(
      'Playwright BDD Cucumber framework — Gherkin authoring, Page Object Model, branded reports, and optional AI failure triage for core banking.',
      {
        x: 1.2,
        y: 7.55,
        w: 10.1,
        h: 1.4,
        fontFace: FONT,
        fontSize: 16,
        color: INK,
      },
    );
    s.addText('Innovatz Global  ·  Stakeholder briefing  ·  2026', {
      x: 1.2,
      y: 10.55,
      w: 10,
      h: 0.32,
      fontFace: FONT,
      fontSize: 12,
      color: MUTED,
    });
  }

  // 2. Executive summary
  {
    const s = contentSlide('Executive summary');
    const cards = [
      {
        k: 'What it is',
        v: 'Reusable UI automation: Gherkin (plain English) + Playwright browsers + branded reports and optional AI triage.',
      },
      {
        k: 'What we test',
        v: 'Core banking at corebanking.testingprofessor.net — staff login, customer lifecycle, and deposits.',
      },
      {
        k: 'Why it matters',
        v: 'Faster regression feedback, living documentation, audit-ready evidence, and CI against the real AUT.',
      },
    ];
    cards.forEach((card, i) => {
      const y = 1.45 + i * 2.85;
      s.addShape(pptx.ShapeType.roundRect, {
        x: 1.15,
        y,
        w: 17.5,
        h: 2.6,
        fill: { color: WASH },
        rectRadius: 0.12,
      });
      s.addShape(pptx.ShapeType.rect, { x: 1.15, y, w: 0.16, h: 2.6, fill: { color: i === 1 ? LIME : TEAL } });
      s.addText(card.k, {
        x: 1.6,
        y: y + 0.22,
        w: 16.7,
        h: 0.45,
        fontFace: FONT,
        fontSize: 18,
        bold: true,
        color: BLUE,
      });
      s.addText(card.v, {
        x: 1.6,
        y: y + 0.75,
        w: 16.7,
        h: 1.5,
        fontFace: FONT,
        fontSize: 18,
        color: INK,
      });
    });
  }

  // 3. Outcomes
  {
    const s = contentSlide('Business outcomes');
    s.addTable(
      [
        [
          { text: 'Outcome', options: { bold: true, color: WHITE, fill: { color: TEAL } } },
          { text: 'Framework support', options: { bold: true, color: WHITE, fill: { color: TEAL } } },
        ],
        [
          { text: 'Readable tests', options: { fill: { color: ROW } } },
          { text: 'Gherkin + business classes', options: { fill: { color: ROW } } },
        ],
        ['Maintainable automation', 'POM + PlaywrightActions'],
        [
          { text: 'Faster failure analysis', options: { fill: { color: ROW } } },
          { text: 'Extent, custom HTML, optional LLM', options: { fill: { color: ROW } } },
        ],
        ['Audit / demo evidence', 'Screenshots, video, traces'],
        [
          { text: 'CI confidence', options: { fill: { color: ROW } } },
          { text: 'GitHub Actions / Jenkins / Docker / BrowserStack', options: { fill: { color: ROW } } },
        ],
      ],
      {
        x: 1.15,
        y: 1.45,
        w: 17.5,
        colW: [6.2, 11.3],
        border: [{ pt: 0.5, color: 'D6E4EA' }],
        fontFace: FONT,
        fontSize: 16,
        color: INK,
        valign: 'middle',
        rowH: 1.3,
      },
    );
  }

  // 4. Architecture
  {
    const s = contentSlide('Architecture at a glance');
    const layers = [
      { t: 'Feature', d: 'Gherkin scenarios' },
      { t: 'Step', d: 'Thin Cucumber glue' },
      { t: 'Business', d: 'Flow orchestration' },
      { t: 'Page', d: 'Locators & UI' },
      { t: 'Actions', d: 'Playwright APIs' },
    ];
    layers.forEach((layer, i) => {
      const x = 1.15 + i * 3.55;
      s.addShape(pptx.ShapeType.roundRect, {
        x,
        y: 2.1,
        w: 3.15,
        h: 3.2,
        fill: { color: i % 2 === 0 ? TEAL : NAVY },
        rectRadius: 0.1,
      });
      s.addText(layer.t, {
        x,
        y: 2.45,
        w: 3.15,
        h: 0.7,
        fontFace: FONT,
        fontSize: 20,
        bold: true,
        color: WHITE,
        align: 'center',
      });
      s.addText(layer.d, {
        x: x + 0.1,
        y: 3.3,
        w: 2.95,
        h: 1.3,
        fontFace: FONT,
        fontSize: 16,
        color: 'D6EEF7',
        align: 'center',
      });
      if (i < layers.length - 1) {
        s.addText('→', {
          x: x + 2.95,
          y: 3.15,
          w: 0.55,
          h: 0.55,
          fontFace: FONT,
          fontSize: 22,
          color: LIME,
          bold: true,
        });
      }
    });
    s.addText('Optional SelfHeal retries failed locators (cache → heuristics → LLM).', {
      x: 1.15,
      y: 5.7,
      w: 17.5,
      h: 0.5,
      fontFace: FONT,
      fontSize: 16,
      color: MUTED,
    });
    s.addText(
      'Stack: Cucumber runner  ·  Playwright 1.62  ·  TypeScript  ·  Allure + Extent + Dashboard  ·  GitHub Actions',
      {
        x: 1.15,
        y: 6.4,
        w: 17.5,
        h: 0.55,
        fontFace: FONT,
        fontSize: 16,
        color: INK,
      },
    );
  }

  // 5. Diagrams divider
  {
    const s = pptx.addSlide();
    if (fs.existsSync(DARK_BG)) {
      s.addImage({ path: DARK_BG, x: 0, y: 0, w: 20, h: 11.25 });
    } else {
      s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 20, h: 11.25, fill: { color: '0A0A0A' } });
    }
    addLogo(s);
    s.addImage({ path: FOOTER_PILLS, x: 16.7, y: 10.55, w: 2.9, h: 0.28 });
    s.addText('HLD diagrams', {
      x: 1.5,
      y: 4.1,
      w: 17,
      h: 1,
      fontFace: FONT,
      fontSize: 44,
      bold: true,
      color: WHITE,
    });
    s.addText('System context through LLM routing — captured from the High Level Design', {
      x: 1.5,
      y: 5.2,
      w: 17,
      h: 0.55,
      fontFace: FONT,
      fontSize: 18,
      color: CYAN,
    });
    s.addText(`${diagrams.length} architecture views`, {
      x: 1.5,
      y: 6.0,
      w: 17,
      h: 0.4,
      fontFace: FONT,
      fontSize: 16,
      color: LIME,
    });
  }

  for (const diagram of diagrams) {
    const s = contentSlide(diagram.title);
    const { width, height } = pngSize(diagram.file);
    const fit = fitBox(width, height, 17.6, 8.4);
    s.addImage({
      path: diagram.file,
      x: Number(((20 - fit.w) / 2).toFixed(3)),
      y: Number((1.35 + (8.9 - fit.h) / 2).toFixed(3)),
      w: fit.w,
      h: fit.h,
    });
  }

  // Scope
  {
    const s = contentSlide('Current automation scope');
    const cards = [
      { title: 'Login', body: 'Staff sign-in\nEncrypted secrets\nCI credentials' },
      { title: 'Customers', body: 'Add / search\nOpen accounts\nData-driven examples' },
      { title: 'Customer portal', body: 'Continue as user\nDeposits\nE2E tags' },
      { title: 'Quality tags', body: '@smoke\n@positive / @negative\n@datadriven / @e2e' },
    ];
    cards.forEach((c, i) => {
      const x = 1.15 + i * 4.5;
      s.addShape(pptx.ShapeType.roundRect, {
        x,
        y: 1.7,
        w: 4.2,
        h: 7.4,
        fill: { color: ROW },
        line: { color: 'D6E4EA', pt: 1 },
        rectRadius: 0.12,
      });
      s.addShape(pptx.ShapeType.rect, { x, y: 1.7, w: 4.2, h: 1.05, fill: { color: i % 2 === 0 ? TEAL : NAVY } });
      s.addText(c.title, {
        x,
        y: 1.88,
        w: 4.2,
        h: 0.7,
        fontFace: FONT,
        fontSize: 18,
        bold: true,
        color: WHITE,
        align: 'center',
      });
      s.addText(c.body, {
        x: x + 0.3,
        y: 3.15,
        w: 3.6,
        h: 5.3,
        fontFace: FONT,
        fontSize: 18,
        color: INK,
        valign: 'top',
      });
    });
  }

  // Reporting
  {
    const s = contentSlide('Evidence & reporting');
    s.addTable(
      [
        [
          { text: 'Channel', options: { bold: true, color: WHITE, fill: { color: TEAL } } },
          { text: 'Audience', options: { bold: true, color: WHITE, fill: { color: TEAL } } },
        ],
        [
          { text: 'Extent activity HTML (branded)', options: { fill: { color: ROW } } },
          { text: 'Step + action log, video, traces', options: { fill: { color: ROW } } },
        ],
        ['Custom failures.html (branded)', 'Root-cause review'],
        [
          { text: 'Historical dashboard (branded)', options: { fill: { color: ROW } } },
          { text: 'Leads / trends / flaky / AI', options: { fill: { color: ROW } } },
        ],
        ['Allure', 'QA / CI standard report'],
        [
          { text: 'Screenshots · Video · Trace', options: { fill: { color: ROW } } },
          { text: 'Debug and demo evidence', options: { fill: { color: ROW } } },
        ],
      ],
      {
        x: 1.15,
        y: 1.45,
        w: 17.5,
        colW: [8.5, 9],
        border: [{ pt: 0.5, color: 'D6E4EA' }],
        fontFace: FONT,
        fontSize: 16,
        color: INK,
        valign: 'middle',
        rowH: 1.3,
      },
    );
  }

  // Delivery
  {
    const s = contentSlide('Delivery & CI secrets');
    s.addText('Pipeline: GitHub Actions  ·  Chromium / Firefox / WebKit  ·  real AUT  ·  LLM off in CI', {
      x: 1.15,
      y: 1.35,
      w: 17.5,
      h: 0.4,
      fontFace: FONT,
      fontSize: 15,
      color: MUTED,
    });
    s.addTable(
      [
        [
          { text: 'Secret', options: { bold: true, color: WHITE, fill: { color: TEAL } } },
          { text: 'Required', options: { bold: true, color: WHITE, fill: { color: TEAL } } },
          { text: 'Purpose', options: { bold: true, color: WHITE, fill: { color: TEAL } } },
        ],
        [
          { text: 'APP_USERNAME', options: { fill: { color: ROW } } },
          { text: 'Yes', options: { fill: { color: ROW } } },
          { text: 'Core banking login user', options: { fill: { color: ROW } } },
        ],
        ['APP_PASSWORD', 'Yes', 'Password or enc.v1… ciphertext'],
        [
          { text: 'APP_ENCRYPTION_KEY', options: { fill: { color: ROW } } },
          { text: 'If encrypted', options: { fill: { color: ROW } } },
          { text: 'Decrypts APP_PASSWORD', options: { fill: { color: ROW } } },
        ],
        ['BROWSERSTACK_*', 'Optional', 'BrowserStack job only'],
      ],
      {
        x: 1.15,
        y: 1.95,
        w: 17.5,
        colW: [5.5, 3.2, 8.8],
        border: [{ pt: 0.5, color: 'D6E4EA' }],
        fontFace: FONT,
        fontSize: 15,
        color: INK,
        valign: 'middle',
        rowH: 1.15,
      },
    );
    s.addText(
      'CI fails before tests if APP_USERNAME or APP_PASSWORD is missing. Never commit secrets.',
      {
        x: 1.15,
        y: 9.7,
        w: 17.5,
        h: 0.45,
        fontFace: FONT,
        fontSize: 15,
        bold: true,
        color: NAVY,
      },
    );
  }

  // Closing
  {
    const s = pptx.addSlide();
    if (fs.existsSync(DARK_BG)) {
      s.addImage({ path: DARK_BG, x: 0, y: 0, w: 20, h: 11.25 });
    } else {
      s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 20, h: 11.25, fill: { color: '0A0A0A' } });
    }
    addLogo(s, { x: 9.35, y: 1.2, w: 1.3 });
    s.addImage({ path: FOOTER_PILLS, x: 16.7, y: 10.55, w: 2.9, h: 0.28 });
    s.addText('Next steps', {
      x: 1.5,
      y: 3.2,
      w: 17,
      h: 0.8,
      fontFace: FONT,
      fontSize: 36,
      bold: true,
      color: WHITE,
      align: 'center',
    });
    s.addText(
      [
        { text: 'Review the HLD diagrams with architecture and delivery owners\n', options: { breakLine: true } },
        { text: 'Confirm CI secrets: APP_USERNAME, APP_PASSWORD (+ APP_ENCRYPTION_KEY if needed)\n', options: { breakLine: true } },
        { text: 'Prioritize the next feature areas with the business team', options: {} },
      ],
      {
        x: 2.5,
        y: 4.3,
        w: 15,
        h: 2.6,
        fontFace: FONT,
        fontSize: 18,
        color: CYAN,
        align: 'center',
      },
    );
    s.addText('Join us in revolutionizing your testing strategy with AI-driven insights', {
      x: 2,
      y: 8.4,
      w: 16,
      h: 0.5,
      fontFace: FONT,
      fontSize: 16,
      color: LIME,
      align: 'center',
    });
  }

  const out = path.join(DOCS, 'hld-innovatz.pptx');
  await pptx.writeFile({ fileName: out });
  return out;
}

async function main(): Promise<void> {
  fs.mkdirSync(DOCS, { recursive: true });
  const diagrams = await renderHldDiagrams();
  console.log(`Captured ${diagrams.length} HLD diagrams`);
  const pptxPath = await writePptx(diagrams);
  console.log(`Wrote ${pptxPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
