import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.resolve(
  process.argv[2] ?? path.join(projectRoot, "..", "videos", "night-vector-launch", "renders", "two-fighter-combat-capture-20260815"),
);
const captureSeconds = Number(process.argv[3] ?? 32);
const offlineCaptureMode = process.argv.includes("--offline");
const sourceUrlArg = process.argv.find((argument) => argument.startsWith("--source-url="));
const sourceUrlValue = sourceUrlArg
  ? sourceUrlArg.slice("--source-url=".length)
  : "https://madesk.tail8be30.ts.net:9146/two-fighter-combat-dogfight-20260815/";
const sourceUrlObject = new URL(sourceUrlValue);
sourceUrlObject.searchParams.set("capture", "1");
if (offlineCaptureMode) sourceUrlObject.searchParams.set("offline", "1");
const sourceUrl = sourceUrlObject.toString();
const width = Number(process.argv[4] ?? 1920);
const height = Number(process.argv[5] ?? 1080);

if (!Number.isFinite(captureSeconds) || captureSeconds < 5 || !Number.isInteger(width) || !Number.isInteger(height) || width < 640 || height < 360) {
  throw new Error("captureSeconds must be at least 5 seconds and viewport must be an integer >= 640x360");
}

const rawDir = path.join(outputDir, "raw");
fs.mkdirSync(rawDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--enable-webgl", "--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11", "--autoplay-policy=no-user-gesture-required"],
});
const context = await browser.newContext({
  viewport: { width, height },
  screen: { width, height },
  deviceScaleFactor: 1,
  ignoreHTTPSErrors: true,
  ...(offlineCaptureMode ? {} : { recordVideo: { dir: rawDir, size: { width, height } } }),
});
const page = await context.newPage();
const diagnostics = [];
page.on("console", (message) => {
  if (["error", "warning"].includes(message.type())) diagnostics.push({ type: message.type(), text: message.text() });
});
page.on("pageerror", (error) => diagnostics.push({ type: "pageerror", text: String(error) }));
page.on("requestfailed", (request) => diagnostics.push({ type: "requestfailed", url: request.url(), text: request.failure()?.errorText ?? "unknown" }));

const startedAt = new Date().toISOString();
await page.goto(sourceUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.locator("#app").waitFor({ state: "visible", timeout: 60_000 });
await page.waitForTimeout(900);
const readyState = await page.evaluate(() => ({
  title: document.title,
  viewport: { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio },
  canvas: Boolean(document.querySelector("canvas")),
  bodySize: { width: document.body.scrollWidth, height: document.body.scrollHeight },
}));

let rawPath = null;
if (offlineCaptureMode) {
  await page.waitForFunction(() => window.__combatCaptureReady === true, null, { timeout: 60_000 });
  await page.evaluate(() => document.fonts?.ready);
  rawPath = path.join(outputDir, "two-fighter-combat-dogfight-60fps.mp4");
  const ffmpeg = spawn("ffmpeg", [
    "-y",
    "-f", "image2pipe",
    "-vcodec", "mjpeg",
    "-framerate", "60",
    "-i", "-",
    "-an",
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "18",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    rawPath,
  ], { stdio: ["pipe", "inherit", "inherit"] });
  const ffmpegDone = new Promise((resolve, reject) => {
    ffmpeg.once("error", reject);
    ffmpeg.once("close", (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}`)));
  });
  const frameCount = Math.ceil(captureSeconds * 60);
  for (let frame = 0; frame < frameCount; frame += 1) {
    const time = frame / 60;
    await page.evaluate((value) => window.__combatCapture?.renderAt(value), time);
    const image = await page.screenshot({ type: "jpeg", quality: 94, animations: "disabled" });
    if (!ffmpeg.stdin.write(image)) await new Promise((resolve) => ffmpeg.stdin.once("drain", resolve));
  }
  ffmpeg.stdin.end();
  await ffmpegDone;
} else {
  await page.waitForTimeout(captureSeconds * 1000);
  const video = page.video();
  rawPath = video ? await video.path() : null;
}
await context.close();
await browser.close();

const report = {
  sourceUrl,
  startedAt,
  captureSeconds,
  mode: offlineCaptureMode ? "offline-screenshot-pipe" : "playwright-video",
  requested: { width, height },
  readyState,
  diagnostics,
  rawPath,
};
fs.writeFileSync(path.join(outputDir, "capture-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report));
