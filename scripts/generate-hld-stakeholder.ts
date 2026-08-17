/**
 * Stakeholder briefing pack from the HLD: Word (.docx) + PowerPoint (.pptx).
 * Run: npm run docs:hld:stakeholder
 */
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { chromium } from 'playwright';
import {
  AlignmentType,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  BorderStyle,
} from 'docx';
import PptxGenJS from 'pptxgenjs';

const DOCS = path.join(process.cwd(), 'docs');
const DIAGRAM_DIR = path.join(DOCS, 'diagrams');
const LOGO = path.join(process.cwd(), 'src', 'reports', 'assets', 'testing-professor-logo.png');

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

/** Render mermaid diagrams from docs/hld.html to PNG files. */
async function renderHldDiagrams(): Promise<HldDiagram[]> {
  const html = path.join(DOCS, 'hld.html');
  if (!fs.existsSync(html)) {
    throw new Error(`Missing ${html}`);
  }
  fs.mkdirSync(DIAGRAM_DIR, { recursive: true });
  for (const existing of fs.readdirSync(DIAGRAM_DIR)) {
    if (existing.startsWith('hld-') && existing.endsWith('.png')) {
      fs.unlinkSync(path.join(DIAGRAM_DIR, existing));
    }
  }

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
    if (count === 0) {
      throw new Error('No mermaid diagrams found in docs/hld.html');
    }

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

const NAVY = '0B3B5A';
const BLUE = '0284C7';
const YELLOW = 'FACC15';
const SLATE = '475569';
const WHITE = 'FFFFFF';

function bullet(text: string, level = 0): Paragraph {
  return new Paragraph({
    text,
    bullet: { level },
    spacing: { after: 80 },
  });
}

function heading(text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel]): Paragraph {
  return new Paragraph({
    text,
    heading: level,
    spacing: { before: 240, after: 120 },
  });
}

function para(text: string, opts?: { bold?: boolean; color?: string; size?: number }): Paragraph {
  return new Paragraph({
    spacing: { after: 120 },
    children: [
      new TextRun({
        text,
        bold: opts?.bold,
        color: opts?.color || '0F172A',
        size: opts?.size || 22,
      }),
    ],
  });
}

function simpleTable(headers: string[], rows: string[][]): Table {
  const border = { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' };
  const borders = { top: border, bottom: border, left: border, right: border };
  const headerRow = new TableRow({
    children: headers.map(
      (h) =>
        new TableCell({
          borders,
          width: { size: Math.floor(9000 / headers.length), type: WidthType.DXA },
          shading: { fill: 'E0F2FE' },
          children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 20 })] })],
        }),
    ),
  });
  const body = rows.map(
    (row) =>
      new TableRow({
        children: row.map(
          (cell) =>
            new TableCell({
              borders,
              width: { size: Math.floor(9000 / headers.length), type: WidthType.DXA },
              children: [new Paragraph({ children: [new TextRun({ text: cell, size: 18 })] })],
            }),
        ),
      }),
  );
  return new Table({
    width: { size: 9000, type: WidthType.DXA },
    rows: [headerRow, ...body],
  });
}

async function writeDocx(diagrams: HldDiagram[]): Promise<string> {
  const children: (Paragraph | Table)[] = [];

  if (fs.existsSync(LOGO)) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { after: 120 },
        children: [
          new ImageRun({
            type: 'png',
            data: fs.readFileSync(LOGO),
            transformation: { width: 72, height: 72 },
            altText: { title: 'Testing Professor', description: 'Testing Professor logo', name: 'logo' },
          }),
        ],
      }),
    );
  }

  children.push(
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: 'High Level Design — Stakeholder Briefing', bold: true, color: NAVY })],
    }),
    para('Testing Professor · Playwright BDD Cucumber Framework · Version 1.4 · 16 Aug 2026', {
      color: SLATE,
      size: 18,
    }),
    heading('1. Executive summary', HeadingLevel.HEADING_1),
    para(
      'A reusable UI test automation platform that describes business flows in plain English (Gherkin), drives a real browser with Playwright, and produces branded HTML reports, videos, and optional AI failure insights.',
    ),
    para(
      'Application under test: https://corebanking.testingprofessor.net/ — staff login, bank-manager customer lifecycle, and customer deposit journeys.',
      { bold: true },
    ),
    para(
      'Credentials are never committed. Local runs use .env; CI injects repository secrets (see section 6).',
    ),
    heading('2. Why this investment matters', HeadingLevel.HEADING_1),
    simpleTable(
      ['Business outcome', 'How the framework helps'],
      [
        ['Readable tests for BA / QA / Dev', 'Gherkin features; thin steps call business classes'],
        ['Maintainable automation', 'Page Object Model + single PlaywrightActions utility'],
        ['Faster failure analysis', 'Extent activity log, custom failure HTML, optional LLM triage'],
        ['Evidence for audits / demos', 'Screenshots, scenario video, traces, branded reports'],
        ['CI confidence', 'GitHub Actions / Jenkins / Docker against the real AUT'],
        ['Resilience', 'Optional self-heal; DB and LLM are optional add-ons'],
      ],
    ),
    heading('3. Architecture at a glance', HeadingLevel.HEADING_1),
    para('Call chain: Feature → Step → Business → Page → PlaywrightActions → Playwright'),
    bullet('Authoring: Gherkin features and thin Cucumber step definitions'),
    bullet('Business layer: LoginBusiness, CustomerBusiness, ApplicationBusiness'),
    bullet('Page objects: Login, Add Customer, Customers, Open Account, Customer Dashboard'),
    bullet('Actions: clicks, drag/drop, frames, shadow DOM, upload/download, scroll, JavaScript'),
    bullet('Optional self-heal: cache → heuristics → optional LLM when SELF_HEAL_ENABLED=true'),
    bullet('Reporting: Allure, Extent activity HTML, custom failures, historical dashboard'),
    heading('3.1 HLD diagrams', HeadingLevel.HEADING_1),
    para('Captured from docs/hld.html (Mermaid) so stakeholders see the same architecture views as the HTML design.'),
    ...diagrams.flatMap((diagram) => {
      const { width, height } = pngSize(diagram.file);
      const fit = fitBox(width, height, 620, 380);
      return [
        para(diagram.title, { bold: true }),
        new Paragraph({
          spacing: { after: 200 },
          children: [
            new ImageRun({
              type: 'png',
              data: fs.readFileSync(diagram.file),
              transformation: { width: fit.w, height: fit.h },
              altText: { title: diagram.title, description: diagram.title, name: diagram.title },
            }),
          ],
        }),
      ];
    }),
    heading('4. Current automation scope', HeadingLevel.HEADING_1),
    simpleTable(
      ['Area', 'Coverage'],
      [
        ['Login', 'Staff sign-in with encrypted credentials from .env / CI secrets'],
        ['Customers', 'Add, search (first name), open accounts, data-driven examples'],
        ['Customer portal', 'Continue as customer, deposit flows (e2e tags)'],
        ['Quality tags', '@smoke, @positive, @negative, @datadriven, @e2e'],
      ],
    ),
    heading('5. Evidence and reporting', HeadingLevel.HEADING_1),
    bullet('Extent activity report — every Gherkin step and Playwright action (Testing Professor branded)'),
    bullet('Custom failure report — mapped errors and optional AI notes'),
    bullet('Dashboard — historical trends, flaky tests, AI insights (port 3000)'),
    bullet('Artifacts — screenshots, recordings/test-runs videos, Playwright traces'),
    heading('6. Delivery, CI, and secrets', HeadingLevel.HEADING_1),
    bullet('Local: Node 24+, Playwright browsers, optional MySQL/Postgres'),
    bullet('CI: GitHub Actions matrix (Chromium / Firefox / WebKit) against the real AUT'),
    bullet('Cloud: BrowserStack via EXECUTION_ENV=browserstack'),
    bullet('LLM triage (optional): hosted Ollama; disabled by default in CI (LLM_ENABLED=false)'),
    para('CI repository secrets (Settings → Secrets and variables → Actions):', { bold: true }),
    simpleTable(
      ['Secret', 'Required', 'Purpose'],
      [
        ['APP_USERNAME', 'Yes', 'Core banking login user'],
        ['APP_PASSWORD', 'Yes', 'Password or enc.v1… ciphertext'],
        ['APP_ENCRYPTION_KEY', 'If password encrypted', 'Decrypts APP_PASSWORD at runtime'],
        ['BROWSERSTACK_USERNAME / ACCESS_KEY', 'Optional', 'BrowserStack job only'],
      ],
    ),
    para(
      'The workflow fails before tests if APP_USERNAME or APP_PASSWORD is missing. Optional repo variable BASE_URL overrides the default AUT URL. Never commit secrets to source control.',
    ),
    heading('7. Non-functional highlights', HeadingLevel.HEADING_1),
    bullet('Isolation: new browser context per scenario'),
    bullet('Parallel-safe shared data via file-locked global buffer'),
    bullet('Secrets never committed — APP_* and LLM_API_KEY via env / CI secrets only'),
    bullet('Extensible: new page + business method + feature + thin step'),
    heading('8. Related materials', HeadingLevel.HEADING_1),
    bullet('Technical detail: docs/lld.html / docs/lld.pdf'),
    bullet('Interactive HTML: docs/hld.html'),
    bullet('Diagram PNGs: docs/diagrams/ (embedded in this briefing)'),
    bullet('This briefing: docs/hld-stakeholder.docx and docs/hld-stakeholder.pptx'),
  );

  const doc = new Document({
    creator: 'Testing Professor',
    title: 'HLD Stakeholder Briefing — Playwright BDD Framework',
    description: 'High Level Design summary for stakeholders',
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  const out = path.join(DOCS, 'hld-stakeholder.docx');
  fs.writeFileSync(out, await Packer.toBuffer(doc));
  return out;
}

async function writePptx(diagrams: HldDiagram[]): Promise<string> {
  const pptx = new PptxGenJS();
  pptx.author = 'Testing Professor';
  pptx.title = 'HLD Stakeholder Briefing — Playwright BDD Framework';
  pptx.subject = 'High Level Design';

  const logoOpts = fs.existsSync(LOGO)
    ? { path: LOGO, x: 8.6, y: 0.25, w: 0.85, h: 0.85 }
    : undefined;

  const addLogo = (slide: PptxGenJS.Slide) => {
    if (logoOpts) slide.addImage(logoOpts);
  };

  // Title
  {
    const s = pptx.addSlide();
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 10, h: 5.625, fill: { color: NAVY } });
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 4.9, w: 10, h: 0.725, fill: { color: YELLOW } });
    if (fs.existsSync(LOGO)) {
      s.addImage({ path: LOGO, x: 0.5, y: 0.45, w: 1.1, h: 1.1 });
    }
    s.addText('High Level Design', {
      x: 0.5,
      y: 1.9,
      w: 9,
      h: 0.6,
      fontSize: 36,
      bold: true,
      color: WHITE,
    });
    s.addText('Playwright BDD Cucumber Framework', {
      x: 0.5,
      y: 2.55,
      w: 9,
      h: 0.4,
      fontSize: 20,
      color: 'BAE6FD',
    });
    s.addText('Testing Professor · Stakeholder briefing · v1.4 · Aug 2026', {
      x: 0.5,
      y: 5.05,
      w: 8,
      h: 0.35,
      fontSize: 14,
      color: NAVY,
      bold: true,
    });
  }

  // Executive summary
  {
    const s = pptx.addSlide();
    s.addText('Executive summary', { x: 0.5, y: 0.35, w: 8, h: 0.45, fontSize: 28, bold: true, color: NAVY });
    addLogo(s);
    s.addShape(pptx.ShapeType.roundRect, {
      x: 0.5,
      y: 1.0,
      w: 9,
      h: 4.1,
      fill: { color: 'EFF6FF' },
      rectRadius: 0.1,
    });
    s.addText(
      [
        {
          text: 'What it is\n',
          options: { bold: true, color: BLUE, breakLine: false },
        },
        {
          text: 'Reusable UI automation: Gherkin (plain English) + Playwright browsers + branded reports and optional AI triage.\n\n',
          options: { color: '0F172A' },
        },
        { text: 'What we test\n', options: { bold: true, color: BLUE } },
        {
          text: 'Core banking at corebanking.testingprofessor.net — login, customer lifecycle, deposits.\n\n',
          options: { color: '0F172A' },
        },
        { text: 'Why it matters\n', options: { bold: true, color: BLUE } },
        {
          text: 'Faster regression feedback, living documentation, audit-ready evidence, CI on real AUT.',
          options: { color: '0F172A' },
        },
      ],
      { x: 0.75, y: 1.2, w: 8.5, h: 3.7, fontSize: 16, valign: 'top' },
    );
  }

  // Outcomes
  {
    const s = pptx.addSlide();
    s.addText('Business outcomes', { x: 0.5, y: 0.35, w: 8, h: 0.45, fontSize: 28, bold: true, color: NAVY });
    addLogo(s);
    s.addTable(
      [
        [
          { text: 'Outcome', options: { bold: true, fill: { color: 'E0F2FE' } } },
          { text: 'Framework support', options: { bold: true, fill: { color: 'E0F2FE' } } },
        ],
        ['Readable tests', 'Gherkin + business classes'],
        ['Maintainable automation', 'POM + PlaywrightActions'],
        ['Faster failure analysis', 'Extent, custom HTML, optional LLM'],
        ['Audit / demo evidence', 'Screenshots, video, traces'],
        ['CI confidence', 'GHA / Jenkins / Docker / BrowserStack'],
      ],
      {
        x: 0.5,
        y: 1.0,
        w: 9,
        colW: [3.2, 5.8],
        border: [{ pt: 0.5, color: 'CBD5E1' }],
        fontSize: 14,
        color: '0F172A',
        align: 'left',
        valign: 'middle',
      },
    );
  }

  // Architecture
  {
    const s = pptx.addSlide();
    s.addText('Architecture at a glance', {
      x: 0.5,
      y: 0.35,
      w: 8,
      h: 0.45,
      fontSize: 28,
      bold: true,
      color: NAVY,
    });
    addLogo(s);
    const layers = [
      { t: 'Feature', d: 'Gherkin scenarios' },
      { t: 'Step', d: 'Thin Cucumber glue' },
      { t: 'Business', d: 'Flow orchestration' },
      { t: 'Page', d: 'Locators & UI' },
      { t: 'Actions', d: 'Playwright APIs' },
    ];
    layers.forEach((layer, i) => {
      const x = 0.4 + i * 1.85;
      s.addShape(pptx.ShapeType.roundRect, {
        x,
        y: 1.3,
        w: 1.7,
        h: 1.5,
        fill: { color: i % 2 === 0 ? BLUE : NAVY },
        rectRadius: 0.08,
      });
      s.addText(layer.t, {
        x,
        y: 1.5,
        w: 1.7,
        h: 0.45,
        fontSize: 14,
        bold: true,
        color: WHITE,
        align: 'center',
      });
      s.addText(layer.d, {
        x: x + 0.05,
        y: 2.05,
        w: 1.6,
        h: 0.55,
        fontSize: 11,
        color: 'E0F2FE',
        align: 'center',
      });
      if (i < layers.length - 1) {
        s.addText('→', {
          x: x + 1.55,
          y: 1.75,
          w: 0.35,
          h: 0.4,
          fontSize: 18,
          color: YELLOW,
          bold: true,
        });
      }
    });
    s.addText('Optional SelfHeal retries failed locators (cache → heuristics → LLM).', {
      x: 0.5,
      y: 3.2,
      w: 9,
      h: 0.4,
      fontSize: 14,
      color: SLATE,
    });
    s.addText(
      'Stack: Cucumber runner · Playwright 1.62 · TypeScript · Allure + Extent + Dashboard · GitHub Actions',
      { x: 0.5, y: 3.7, w: 9, h: 0.5, fontSize: 13, color: '0F172A' },
    );
  }

  // HLD diagrams section divider
  {
    const s = pptx.addSlide();
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 10, h: 5.625, fill: { color: NAVY } });
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 4.9, w: 10, h: 0.725, fill: { color: YELLOW } });
    s.addText('HLD diagrams', {
      x: 0.5,
      y: 1.9,
      w: 9,
      h: 0.7,
      fontSize: 36,
      bold: true,
      color: WHITE,
    });
    s.addText('Captured from docs/hld.html — system context through LLM routing', {
      x: 0.5,
      y: 2.7,
      w: 9,
      h: 0.45,
      fontSize: 16,
      color: 'BAE6FD',
    });
    s.addText(`${diagrams.length} architecture views attached`, {
      x: 0.5,
      y: 5.05,
      w: 9,
      h: 0.35,
      fontSize: 14,
      color: NAVY,
      bold: true,
    });
  }

  for (const diagram of diagrams) {
    const s = pptx.addSlide();
    s.addText(diagram.title, {
      x: 0.4,
      y: 0.22,
      w: 8,
      h: 0.4,
      fontSize: 22,
      bold: true,
      color: NAVY,
    });
    addLogo(s);
    const { width, height } = pngSize(diagram.file);
    const fit = fitBox(width, height, 9.2, 4.7);
    s.addImage({
      path: diagram.file,
      x: Number(((10 - fit.w) / 2).toFixed(3)),
      y: Number((0.7 + (4.75 - fit.h) / 2).toFixed(3)),
      w: fit.w,
      h: fit.h,
    });
  }

  // Scope
  {
    const s = pptx.addSlide();
    s.addText('Current automation scope', {
      x: 0.5,
      y: 0.35,
      w: 8,
      h: 0.45,
      fontSize: 28,
      bold: true,
      color: NAVY,
    });
    addLogo(s);
    const cards = [
      { title: 'Login', body: 'Staff sign-in\nEncrypted secrets\nCI credentials' },
      { title: 'Customers', body: 'Add / search\nOpen accounts\nData-driven' },
      { title: 'Customer portal', body: 'Continue as user\nDeposits\nE2E tags' },
      { title: 'Quality tags', body: '@smoke\n@positive / @negative\n@datadriven / @e2e' },
    ];
    cards.forEach((c, i) => {
      const x = 0.45 + (i % 4) * 2.35;
      s.addShape(pptx.ShapeType.roundRect, {
        x,
        y: 1.2,
        w: 2.2,
        h: 3.2,
        fill: { color: 'F8FAFC' },
        line: { color: 'CBD5E1', pt: 1 },
        rectRadius: 0.1,
      });
      s.addShape(pptx.ShapeType.rect, { x, y: 1.2, w: 2.2, h: 0.55, fill: { color: BLUE } });
      s.addText(c.title, {
        x,
        y: 1.28,
        w: 2.2,
        h: 0.4,
        fontSize: 14,
        bold: true,
        color: WHITE,
        align: 'center',
      });
      s.addText(c.body, {
        x: x + 0.12,
        y: 2.0,
        w: 1.96,
        h: 2.1,
        fontSize: 13,
        color: '0F172A',
        valign: 'top',
      });
    });
  }

  // Reporting
  {
    const s = pptx.addSlide();
    s.addText('Evidence & reporting', {
      x: 0.5,
      y: 0.35,
      w: 8,
      h: 0.45,
      fontSize: 28,
      bold: true,
      color: NAVY,
    });
    addLogo(s);
    s.addTable(
      [
        [
          { text: 'Channel', options: { bold: true, fill: { color: 'E0F2FE' } } },
          { text: 'Audience', options: { bold: true, fill: { color: 'E0F2FE' } } },
        ],
        ['Extent activity HTML (branded)', 'Step + action log, video, traces'],
        ['Custom failures.html (branded)', 'Root-cause review'],
        ['Historical dashboard (branded)', 'Leads / trends / flaky / AI'],
        ['Allure', 'QA / CI standard report'],
        ['Screenshots · Video · Trace', 'Debug and demo evidence'],
      ],
      {
        x: 0.5,
        y: 1.0,
        w: 9,
        colW: [4.5, 4.5],
        border: [{ pt: 0.5, color: 'CBD5E1' }],
        fontSize: 14,
        color: '0F172A',
      },
    );
  }

  // Delivery + CI secrets
  {
    const s = pptx.addSlide();
    s.addText('Delivery & CI secrets', {
      x: 0.5,
      y: 0.3,
      w: 8,
      h: 0.4,
      fontSize: 26,
      bold: true,
      color: NAVY,
    });
    addLogo(s);
    s.addText('Pipeline: GitHub Actions · Chromium / Firefox / WebKit · real AUT · LLM off in CI', {
      x: 0.5,
      y: 0.75,
      w: 9,
      h: 0.35,
      fontSize: 13,
      color: SLATE,
    });
    s.addTable(
      [
        [
          { text: 'Secret', options: { bold: true, fill: { color: 'E0F2FE' } } },
          { text: 'Required', options: { bold: true, fill: { color: 'E0F2FE' } } },
          { text: 'Purpose', options: { bold: true, fill: { color: 'E0F2FE' } } },
        ],
        ['APP_USERNAME', 'Yes', 'Core banking login user'],
        ['APP_PASSWORD', 'Yes', 'Password or enc.v1… ciphertext'],
        ['APP_ENCRYPTION_KEY', 'If encrypted', 'Decrypts APP_PASSWORD'],
        ['BROWSERSTACK_*', 'Optional', 'BrowserStack job only'],
      ],
      {
        x: 0.5,
        y: 1.2,
        w: 9,
        colW: [3.2, 1.8, 4],
        border: [{ pt: 0.5, color: 'CBD5E1' }],
        fontSize: 13,
        color: '0F172A',
      },
    );
    s.addText(
      'CI fails before tests if APP_USERNAME or APP_PASSWORD is missing. Optional variable: BASE_URL. Never commit secrets.',
      { x: 0.5, y: 4.6, w: 9, h: 0.55, fontSize: 13, color: NAVY, bold: true },
    );
  }

  // Closing
  {
    const s = pptx.addSlide();
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 10, h: 5.625, fill: { color: NAVY } });
    if (fs.existsSync(LOGO)) {
      s.addImage({ path: LOGO, x: 4.35, y: 0.55, w: 1.3, h: 1.3 });
    }
    s.addText('Next steps', {
      x: 0.5,
      y: 2.1,
      w: 9,
      h: 0.5,
      fontSize: 28,
      bold: true,
      color: WHITE,
      align: 'center',
    });
    s.addText(
      [
        { text: 'Review HTML/PDF design docs · Open branded Extent after a demo run\n', options: { breakLine: true } },
        {
          text: 'Confirm CI secrets: APP_USERNAME, APP_PASSWORD (+ APP_ENCRYPTION_KEY if needed)\n',
          options: { breakLine: true },
        },
        { text: 'Prioritize next feature areas with the business team', options: {} },
      ],
      { x: 1, y: 2.8, w: 8, h: 2, fontSize: 15, color: 'BAE6FD', align: 'center' },
    );
  }

  const out = path.join(DOCS, 'hld-stakeholder.pptx');
  await pptx.writeFile({ fileName: out });
  return out;
}

async function main(): Promise<void> {
  fs.mkdirSync(DOCS, { recursive: true });
  const diagrams = await renderHldDiagrams();
  console.log(`Captured ${diagrams.length} HLD diagrams under docs/diagrams/`);
  for (const diagram of diagrams) {
    console.log(`  - ${diagram.title} (${path.relative(process.cwd(), diagram.file)})`);
  }
  const docxPath = await writeDocx(diagrams);
  console.log(`Wrote ${docxPath}`);
  const pptxPath = await writePptx(diagrams);
  console.log(`Wrote ${pptxPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
