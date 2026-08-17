import fs from 'fs';
import path from 'path';
import * as allure from 'allure-js-commons';
import { ContentType } from 'allure-js-commons';
import { EXTENT_REPORT_DIR, SCREENSHOTS_DIR, STEP_SCREENSHOTS_DIR, ACTION_SCREENSHOTS_DIR } from '../config/paths';
import { getActivityReporter } from './extent/ActivityReporter';

/**
 * Copy an artifact under reports/extent so file:// HTML can load it.
 * Chrome blocks parent-folder (`..`) URLs for file:// pages, so history HTML
 * (`reports/extent/history/*.html`) needs its own copy under history/<subdir>/.
 * Both latest.html and history/*.html then use the same relative src: `<subdir>/file`.
 */
export function stageExtentArtifact(absPath: string, subdir: 'screenshots' | 'videos' | 'traces'): string | undefined {
  if (!absPath || !fs.existsSync(absPath)) return undefined;
  const fileName = path.basename(absPath);
  for (const destDir of [
    path.join(EXTENT_REPORT_DIR, subdir),
    path.join(EXTENT_REPORT_DIR, 'history', subdir),
  ]) {
    fs.mkdirSync(destDir, { recursive: true });
    const dest = path.join(destDir, fileName);
    if (path.resolve(absPath) !== path.resolve(dest)) {
      fs.copyFileSync(absPath, dest);
    }
  }
  return `${subdir}/${fileName}`.replace(/\\/g, '/');
}

const CUCUMBER_VIDEO_ATTACH_MAX_BYTES = 20 * 1024 * 1024;

/**
 * Publish a scenario video to Extent (playable file:// copy) + Allure + Cucumber HTML.
 * Cucumber embeds attachments as base64, so oversized webms are skipped there.
 */
export async function publishVideo(options: {
  absPath: string;
  title: string;
  attachToWorld?: (data: Buffer, mediaType: string) => Promise<void> | void;
}): Promise<string> {
  const staged = stageExtentArtifact(options.absPath, 'videos');
  getActivityReporter()?.logMessage('info', options.title, staged || options.absPath);

  try {
    await allure.attachmentPath(options.title, options.absPath, {
      contentType: 'video/webm',
      fileExtension: '.webm',
    });
  } catch {
    try {
      await allure.attachment(options.title, fs.readFileSync(options.absPath), {
        contentType: 'video/webm',
        fileExtension: '.webm',
      });
    } catch {
      // Allure runtime may be unavailable outside the reporter context.
    }
  }

  if (options.attachToWorld) {
    try {
      const size = fs.statSync(options.absPath).size;
      if (size > 0 && size <= CUCUMBER_VIDEO_ATTACH_MAX_BYTES) {
        await options.attachToWorld(fs.readFileSync(options.absPath), 'video/webm');
      } else if (size > CUCUMBER_VIDEO_ATTACH_MAX_BYTES) {
        getActivityReporter()?.logMessage(
          'info',
          'Cucumber HTML skipped embedding the video (file too large); play it from this Extent report',
          `${Math.round(size / 1024 / 1024)}MB`,
        );
      }
    } catch {
      // Cucumber HTML attach is best-effort; Extent already has the file.
    }
  }

  return options.absPath;
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
