import fs from 'fs';
import path from 'path';

/** Canonical logo shipped with the framework (copied into each report output folder). */
export const REPORT_LOGO_FILENAME = 'testing-professor-logo.png';

export function reportLogoSourcePath(): string {
  return path.join(__dirname, 'assets', REPORT_LOGO_FILENAME);
}

/** Copy the brand logo into `destDir` and return the filename for relative HTML `src`. */
export function ensureReportLogo(destDir: string): string {
  const source = reportLogoSourcePath();
  if (!fs.existsSync(source)) {
    throw new Error(`Report logo missing at ${source}`);
  }
  fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, REPORT_LOGO_FILENAME);
  fs.copyFileSync(source, dest);
  return REPORT_LOGO_FILENAME;
}

export function reportBrandCss(): string {
  return `
    .brand-lockup { display: flex; align-items: center; gap: 14px; min-width: 0; }
    .brand-lockup img.brand-logo {
      height: 56px;
      width: 56px;
      object-fit: contain;
      border-radius: 50%;
      background: #facc15;
      flex-shrink: 0;
    }
    .brand-lockup .brand-copy { min-width: 0; }
    .brand-lockup .brand-eyebrow {
      margin: 0 0 2px;
      font-size: 11px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #facc15;
      font-weight: 600;
    }
  `;
}

/**
 * Shared header brand markup for customized HTML reports.
 * `logoSrc` should be a path relative to the HTML file (usually the logo filename).
 */
export function reportBrandMarkup(options: {
  logoSrc: string;
  titleHtml: string;
  subtitle?: string;
}): string {
  const subtitle = options.subtitle
    ? `<div class="muted">${options.subtitle}</div>`
    : '';
  return `<div class="brand-lockup">
      <img class="brand-logo" src="${options.logoSrc}" alt="Testing Professor" width="56" height="56"/>
      <div class="brand-copy">
        <p class="brand-eyebrow">Testing Professor</p>
        ${options.titleHtml}
        ${subtitle}
      </div>
    </div>`;
}
