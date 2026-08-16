import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.resolve(process.argv[2] ?? path.join(projectRoot, '..', 'videos', 'two-frame-combat', 'renders', 'tiled'));
const captureSeconds = Number(process.argv[3] ?? 36);
const width = Number(process.argv[4] ?? 1920);
const height = Number(process.argv[5] ?? 1080);
const sourceUrlArg = process.argv.find((argument) => argument.startsWith('--source-url='));
const sourceUrlValue = sourceUrlArg?.slice('--source-url='.length) ?? 'http://127.0.0.1:4191/';
const views = ['tactical', 'night', 'aethel', 'merge'];
const tileWidth = Math.floor(width / 2);
const tileHeight = Math.floor(height / 2);

if (!Number.isFinite(captureSeconds) || captureSeconds < 5 || !Number.isInteger(width) || !Number.isInteger(height) || width < 960 || height < 540) {
  throw new Error('captureSeconds must be at least 5 seconds and viewport must be an integer >= 960x540');
}

fs.mkdirSync(outputDir, { recursive: true });
const tileDir = path.join(outputDir, 'tiles');
fs.mkdirSync(tileDir, { recursive: true });
const rawPath = path.join(outputDir, 'two-fighter-combat-tiled-60fps.mp4');

function waitForProcess(child, label) {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${label} exited with code ${code ?? 'null'}${signal ? ` (${signal})` : ''}`));
    });
  });
}

async function writePipe(pipe, buffer) {
  if (pipe.destroyed || pipe.writableEnded) throw new Error('tile encoder pipe is not writable');
  if (!pipe.write(buffer)) await new Promise((resolve) => pipe.once('drain', resolve));
}

const browser = await chromium.launch({
  headless: true,
  args: ['--enable-webgl', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--autoplay-policy=no-user-gesture-required'],
});
const context = await browser.newContext({
  viewport: { width: tileWidth, height: tileHeight },
  screen: { width: tileWidth, height: tileHeight },
  deviceScaleFactor: 1,
  ignoreHTTPSErrors: true,
});

const pages = [];
const diagnostics = [];
const encoders = [];
let composition;

try {
  for (const view of views) {
    const url = new URL(sourceUrlValue);
    url.searchParams.set('capture', '1');
    url.searchParams.set('offline', '1');
    url.searchParams.set('tile', '1');
    url.searchParams.set('view', view);
    const page = await context.newPage();
    page.__viewName = view;
    page.on('console', (message) => {
      if (['error', 'warning'].includes(message.type())) diagnostics.push({ view, type: message.type(), text: message.text() });
    });
    page.on('pageerror', (error) => diagnostics.push({ view, type: 'pageerror', text: String(error) }));
    page.on('requestfailed', (request) => diagnostics.push({ view, type: 'requestfailed', url: request.url(), text: request.failure()?.errorText ?? 'unknown' }));
    await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.locator('#app').waitFor({ state: 'visible', timeout: 60_000 });
    await page.waitForFunction(() => window.__combatCaptureReady === true, null, { timeout: 60_000 });
    await page.evaluate(() => document.fonts?.ready);
    pages.push(page);
  }

  for (const view of views) {
    const tilePath = path.join(tileDir, `${view}.mp4`);
    const encoder = spawn('ffmpeg', [
      '-y',
      '-f', 'image2pipe',
      '-vcodec', 'mjpeg',
      '-framerate', '60',
      '-i', 'pipe:0',
      '-an',
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '18',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      tilePath,
    ], { stdio: ['pipe', 'inherit', 'inherit'] });
    encoders.push({ view, tilePath, process: encoder, done: waitForProcess(encoder, `${view} tile encoder`) });
  }

  const frameCount = Math.ceil(captureSeconds * 60);
  for (let frame = 0; frame < frameCount; frame += 1) {
    const time = frame / 60;
    await Promise.all(pages.map((page) => page.evaluate((value) => window.__combatCapture?.renderAt(value), time)));
    const images = await Promise.all(pages.map((page) => page.screenshot({ type: 'jpeg', quality: 94, animations: 'disabled' })));
    await Promise.all(images.map((image, index) => writePipe(encoders[index].process.stdin, image)));
  }

  for (const encoder of encoders) encoder.process.stdin.end();
  await Promise.all(encoders.map((encoder) => encoder.done));

  const tileInputs = encoders.flatMap((encoder) => ['-i', encoder.tilePath]);
  composition = spawn('ffmpeg', [
    '-y',
    ...tileInputs,
    '-filter_complex',
    `[0:v]scale=${tileWidth}:${tileHeight}:flags=lanczos[t0];[1:v]scale=${tileWidth}:${tileHeight}:flags=lanczos[t1];[2:v]scale=${tileWidth}:${tileHeight}:flags=lanczos[t2];[3:v]scale=${tileWidth}:${tileHeight}:flags=lanczos[t3];[t0][t1][t2][t3]xstack=inputs=4:layout=0_0|${tileWidth}_0|0_${tileHeight}|${tileWidth}_${tileHeight}:fill=0x07131a[v]`,
    '-map', '[v]',
    '-an',
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-r', '60',
    '-movflags', '+faststart',
    rawPath,
  ], { stdio: ['ignore', 'inherit', 'inherit'] });
  await waitForProcess(composition, 'tiled composition');
} finally {
  for (const encoder of encoders) {
    if (!encoder.process.killed && encoder.process.exitCode === null) encoder.process.kill('SIGTERM');
  }
  if (composition && !composition.killed && composition.exitCode === null) composition.kill('SIGTERM');
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}

const report = {
  sourceUrl: sourceUrlValue,
  views,
  captureSeconds,
  layout: { width, height, columns: 2, rows: 2, tileWidth, tileHeight },
  mode: 'offline-four-view-individual-encoders-xstack',
  diagnostics,
  rawPath,
  tilePaths: encoders.map((encoder) => encoder.tilePath),
};
fs.writeFileSync(path.join(outputDir, 'capture-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report));
if (diagnostics.length > 0) process.exitCode = 1;
