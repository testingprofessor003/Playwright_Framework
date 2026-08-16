import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { basename, dirname, join, parse, resolve } from 'node:path';

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

function positionalVideo(): string | undefined {
  const candidate = process.argv.slice(2).find((value) => !value.startsWith('-') && /\.(mp4|webm|mov|mkv)$/i.test(value));
  return candidate;
}

function resolveFfmpeg(): string {
  const fromEnv = process.env.FFMPEG_PATH;
  if (fromEnv && existsSync(fromEnv)) {
    return fromEnv;
  }
  const probe = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
  if (probe.status === 0) {
    return 'ffmpeg';
  }
  throw new Error(
    'ffmpeg was not found on PATH. Install ffmpeg, or set FFMPEG_PATH, then re-run. The agent can still Read the video file directly if frames cannot be extracted.',
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

function parseOptions(): Options {
  const video = argValue('--video') || positionalVideo();
  if (!video) {
    throw new Error('Usage: npx tsx scripts/extract-video-frames.ts --video recordings/flow.mp4 [--interval 2] [--scene 0.25] [--out recordings/flow]');
  }
  const resolvedVideo = resolve(video);
  if (!existsSync(resolvedVideo)) {
    throw new Error(`Video not found: ${resolvedVideo}`);
  }
  const interval = Number(argValue('--interval', '2'));
  const scene = Number(argValue('--scene', '0.25'));
  const outDir = resolve(argValue('--out') || join(dirname(resolvedVideo), slugFromVideo(resolvedVideo)));
  return { video: resolvedVideo, outDir, interval, scene };
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

function main(): void {
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
    video: options.video,
    createdAt: new Date().toISOString(),
    intervalSeconds: options.interval,
    sceneThreshold: options.scene,
    frameCount: frames.length,
    frames: frames.map((file) => file.replace(/\\/g, '/')),
  };
  writeFileSync(join(options.outDir, 'frames-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Extracted ${frames.length} frame(s) to ${framesDir}`);
  console.log(`Manifest: ${join(options.outDir, 'frames-manifest.json')}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
