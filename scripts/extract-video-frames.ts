import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { basename, join, parse, resolve } from 'node:path';

const VIDEO_EXT = /\.(mp4|webm|mov|mkv)$/i;
const RECORDED_EXECUTIONS_DIR = resolve(process.cwd(), 'recordings', 'recorded executions');

interface Options {
  video: string;
  outDir: string;
  interval: number;
  scene: number;
}

function argValue(flag: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index >= 0 && process.argv[index + 1]) {
    return process.argv[index + 1];
  }
  return fallback;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function positionalVideo(): string | undefined {
  return process.argv.slice(2).find((value) => !value.startsWith('-') && VIDEO_EXT.test(value));
}

function listRecordedExecutions(): string[] {
  if (!existsSync(RECORDED_EXECUTIONS_DIR)) {
    return [];
  }
  return readdirSync(RECORDED_EXECUTIONS_DIR)
    .filter((name) => VIDEO_EXT.test(name))
    .map((name) => join(RECORDED_EXECUTIONS_DIR, name))
    .filter((file) => statSync(file).isFile())
    .sort((a, b) => basename(a).localeCompare(basename(b)));
}

function printRecordedExecutions(): void {
  const videos = listRecordedExecutions();
  if (!videos.length) {
    console.log(`No videos found in ${RECORDED_EXECUTIONS_DIR}`);
    console.log('Drop .mp4 / .webm / .mov / .mkv files there, then re-run.');
    return;
  }
  console.log(`Recorded executions (${videos.length}):`);
  for (const file of videos) {
    console.log(`  ${toPosix(file)}`);
  }
}

function toPosix(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

function resolveFfmpeg(): string {
  const fromEnv = process.env.FFMPEG_PATH;
  if (fromEnv && existsSync(fromEnv)) {
    return fromEnv;
  }

  const finder = process.platform === 'win32' ? 'where' : 'which';
  const names = process.platform === 'win32' ? ['ffmpeg', 'ffmpeg.exe'] : ['ffmpeg'];
  for (const name of names) {
    const located = spawnSync(finder, [name], { encoding: 'utf8' });
    if (located.status === 0) {
      const first = (located.stdout || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean);
      if (first) {
        return first;
      }
    }
    const probe = spawnSync(name, ['-version'], { encoding: 'utf8' });
    if (probe.status === 0) {
      return name;
    }
  }

  throw new Error(
    'ffmpeg was not found on PATH (Windows, macOS, or Linux). Install ffmpeg, or set FFMPEG_PATH, then re-run. The agent can still Read the video file directly if frames cannot be extracted.',
  );
}

function runFfmpeg(ffmpeg: string, args: string[]): void {
  const result = spawnSync(ffmpeg, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw new Error(`ffmpeg failed (${result.status}): ${detail.slice(0, 2000)}`);
  }
}

function slugFromVideo(videoPath: string): string {
  return parse(videoPath)
    .name.replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'recording';
}

function resolveVideoPath(input?: string): string {
  if (!input) {
    const videos = listRecordedExecutions();
    if (videos.length === 1) {
      return videos[0];
    }
    if (!videos.length) {
      throw new Error(
        `No videos found in ${RECORDED_EXECUTIONS_DIR}. Drop a recording there, or pass --video <path>.`,
      );
    }
    throw new Error(
      `Multiple recordings found. Pass --video <filename>:\n${videos.map((file) => `  ${basename(file)}`).join('\n')}`,
    );
  }

  if (existsSync(input) && statSync(input).isFile()) {
    return resolve(input);
  }

  const fromExecutions = join(RECORDED_EXECUTIONS_DIR, input);
  if (existsSync(fromExecutions) && statSync(fromExecutions).isFile()) {
    return fromExecutions;
  }

  const resolved = resolve(input);
  if (existsSync(resolved) && statSync(resolved).isFile()) {
    return resolved;
  }

  throw new Error(`Video not found: ${input} (looked in ${RECORDED_EXECUTIONS_DIR})`);
}

function parseOptions(): Options {
  const video = resolveVideoPath(argValue('--video') || positionalVideo());
  const interval = Number(argValue('--interval', '2'));
  const scene = Number(argValue('--scene', '0.25'));
  const outDir = resolve(argValue('--out') || join(RECORDED_EXECUTIONS_DIR, slugFromVideo(video)));
  return { video, outDir, interval, scene };
}

function listPngs(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((name) => name.toLowerCase().endsWith('.png'))
    .sort()
    .map((name) => join(dir, name));
}

function extractFrames(): void {
  const options = parseOptions();
  const ffmpeg = resolveFfmpeg();
  const framesDir = join(options.outDir, 'frames');
  mkdirSync(framesDir, { recursive: true });

  runFfmpeg(ffmpeg, [
    '-y',
    '-i',
    options.video,
    '-vf',
    `select='gt(scene,${options.scene})'`,
    '-vsync',
    'vfr',
    join(framesDir, 'scene_%03d.png'),
  ]);

  const sceneFrames = listPngs(framesDir).filter((file) => basename(file).startsWith('scene_'));
  if (sceneFrames.length < 3) {
    runFfmpeg(ffmpeg, [
      '-y',
      '-i',
      options.video,
      '-vf',
      `fps=1/${Math.max(options.interval, 1)}`,
      join(framesDir, 'interval_%03d.png'),
    ]);
  }

  const frames = listPngs(framesDir);
  const manifest = {
    video: toPosix(options.video),
    createdAt: new Date().toISOString(),
    intervalSeconds: options.interval,
    sceneThreshold: options.scene,
    frameCount: frames.length,
    frames: frames.map((file) => toPosix(file)),
  };
  writeFileSync(join(options.outDir, 'frames-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Source: ${options.video}`);
  console.log(`Extracted ${frames.length} frame(s) to ${framesDir}`);
  console.log(`Manifest: ${join(options.outDir, 'frames-manifest.json')}`);
}

try {
  mkdirSync(RECORDED_EXECUTIONS_DIR, { recursive: true });
  if (hasFlag('--list')) {
    printRecordedExecutions();
  } else {
    extractFrames();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
