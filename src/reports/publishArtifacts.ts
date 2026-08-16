import fs from 'fs';
import path from 'path';
import * as allure from 'allure-js-commons';
import { ContentType } from 'allure-js-commons';
import { EXTENT_REPORT_DIR, SCREENSHOTS_DIR, STEP_SCREENSHOTS_DIR, ACTION_SCREENSHOTS_DIR } from '../config/paths';
import { getActivityReporter } from './extent/ActivityReporter';

/** Copy an artifact under reports/extent so file:// HTML can load it (no `..` paths). */
export function stageExtentArtifact(absPath: string, subdir: 'screenshots' | 'videos' | 'traces'): string | undefined {
  if (!absPath || !fs.existsSync(absPath)) return undefined;
  const destDir = path.join(EXTENT_REPORT_DIR, subdir);
  fs.mkdirSync(destDir, { recursive: true });
  const fileName = path.basename(absPath);
  const dest = path.join(destDir, fileName);
  if (path.resolve(absPath) !== path.resolve(dest)) {
    fs.copyFileSync(absPath, dest);
  }
  return `${subdir}/${fileName}`.replace(/\\/g, '/');
}

/**
 * Publish a screenshot to disk + Extent activity + Allure + Cucumber attach.
 * Returns the absolute path written under reports/screenshots (or steps/actions/).
 */
export async function publishScreenshot(options: {
  buffer: Buffer;
  absPath: string;
  title: string;
  attachToWorld?: (data: Buffer, mediaType: string) => Promise<void> | void;
  /** When false, skip creating a separate Extent "Screenshot" log row (e.g. action already has the image). */
  extentActivity?: boolean;
  /** When false, skip Allure attachment (useful for high-volume action shots). */
  allure?: boolean;
}): Promise<string> {
  fs.mkdirSync(path.dirname(options.absPath), { recursive: true });
  fs.writeFileSync(options.absPath, options.buffer);

  if (options.extentActivity !== false) {
    getActivityReporter()?.attachScreenshot(options.absPath, options.title);
  }

  if (options.allure !== false) {
    try {
      await allure.attachment(options.title, options.buffer, { contentType: ContentType.PNG, fileExtension: '.png' });
    } catch {
      try {
        await allure.attachmentPath(options.title, options.absPath, {
          contentType: ContentType.PNG,
          fileExtension: '.png',
        });
      } catch {
        // Allure runtime may be unavailable outside the reporter context.
      }
    }
  }

  if (options.attachToWorld) {
    try {
      await options.attachToWorld(options.buffer, 'image/png');
    } catch {
      // Cucumber HTML attach is best-effort; Extent/Allure already have the file.
    }
  }

  return options.absPath;
}

export function scenarioScreenshotPath(fileBase: string): string {
  return path.join(SCREENSHOTS_DIR, `${fileBase}.png`);
}

export function stepScreenshotPath(fileBase: string): string {
  return path.join(STEP_SCREENSHOTS_DIR, `${fileBase}.png`);
}

export function actionScreenshotPath(fileBase: string): string {
  return path.join(ACTION_SCREENSHOTS_DIR, `${fileBase}.png`);
}
