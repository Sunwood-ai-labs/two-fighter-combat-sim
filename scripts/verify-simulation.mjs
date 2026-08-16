import { chromium } from 'playwright';

const sourceUrlArg = process.argv.find((argument) => argument.startsWith('--source-url='));
const secondsArg = process.argv.find((argument) => argument.startsWith('--seconds='));
const sourceUrl = sourceUrlArg?.slice('--source-url='.length) ?? 'http://127.0.0.1:4191/';
const seconds = Number(secondsArg?.slice('--seconds='.length) ?? 36);
const width = 1920;
const height = 1080;

if (!Number.isFinite(seconds) || seconds < 5 || seconds > 60) {
  throw new Error('--seconds must be between 5 and 60');
}

const url = new URL(sourceUrl);
url.searchParams.set('capture', '1');
url.searchParams.set('offline', '1');

const browser = await chromium.launch({
  headless: true,
  args: ['--enable-webgl', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'],
});
const context = await browser.newContext({
  viewport: { width, height },
  screen: { width, height },
  deviceScaleFactor: 1,
  ignoreHTTPSErrors: true,
});
const page = await context.newPage();
const diagnostics = [];
page.on('console', (message) => {
  if (['error', 'warning'].includes(message.type())) diagnostics.push({ type: message.type(), text: message.text() });
});
page.on('pageerror', (error) => diagnostics.push({ type: 'pageerror', text: String(error) }));
page.on('requestfailed', (request) => diagnostics.push({ type: 'requestfailed', url: request.url(), text: request.failure()?.errorText ?? 'unknown' }));

const snapshots = [];
try {
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.locator('#app').waitFor({ state: 'visible', timeout: 60_000 });
  await page.waitForFunction(() => window.__combatCaptureReady === true, undefined, { timeout: 60_000 });

  const frameCount = Math.ceil(seconds * 60);
  for (let frame = 0; frame < frameCount; frame += 1) {
    const time = frame / 60;
    await page.evaluate((value) => window.__combatCapture?.renderAt(value), time);
    const snapshot = await page.evaluate(() => window.__combatDiagnostics?.snapshot());
    if (!snapshot) throw new Error(`diagnostics unavailable at ${time.toFixed(3)}s`);
    snapshots.push({ time, snapshot });
  }
} finally {
  await context.close();
  await browser.close();
}

const unique = (values) => [...new Set(values)];
const phases = unique(snapshots.map(({ snapshot }) => snapshot.phase));
const roeStates = unique(snapshots.map(({ snapshot }) => snapshot.roeStatus));
const outcomes = unique(snapshots.map(({ snapshot }) => snapshot.missionOutcome));
const cameraModes = unique(snapshots.map(({ snapshot }) => snapshot.cameraMode));
const introSnapshots = snapshots.filter(({ snapshot }) => String(snapshot.cameraMode).startsWith('INTRO '));
const activeSnapshots = snapshots.filter(({ snapshot }) => snapshot.missionOutcome === 'ACTIVE' && !String(snapshot.cameraMode).startsWith('INTRO '));
const maxActiveNdcRecord = activeSnapshots.reduce((peak, record) => {
  const { time, snapshot } = record;
  const values = [...snapshot.camera.nightNdc, ...snapshot.camera.aethelNdc].map(Math.abs);
  const value = Math.max(...values);
  return value > peak.value ? { value, time, phase: snapshot.phase, rangeMeters: snapshot.rangeMeters } : peak;
}, { value: 0, time: 0, phase: 'SEARCH', rangeMeters: 0 });
const maxActiveNdc = maxActiveNdcRecord.value;
const maxIntroNdc = introSnapshots.reduce((peak, { snapshot }) => {
  const focusedNdc = snapshot.cameraMode === 'INTRO NIGHT' ? snapshot.camera.nightNdc : snapshot.camera.aethelNdc;
  return Math.max(peak, ...focusedNdc.map(Math.abs));
}, 0);
const allFighters = snapshots.flatMap(({ snapshot }) => Object.values(snapshot.fighters));
const finiteNumbers = allFighters.flatMap((fighter) => [
  ...fighter.position,
  ...fighter.velocity,
  fighter.speedMps,
  fighter.mach,
  fighter.dynamicPressurePa,
  fighter.angleOfAttackDeg,
  fighter.loadFactorG,
  fighter.actualAccelerationMps2,
  fighter.specificEnergyM2S2,
]);
const requiredPhases = ['SEARCH', 'TRACK', 'IDENTIFY', 'COMMIT', 'DEFENSIVE BREAK', 'MERGE', 'WVR DOGFIGHT', 'SEPARATE'];
const missingPhases = requiredPhases.filter((phase) => !phases.includes(phase));
const maxLoadFactorG = Math.max(...allFighters.map((fighter) => fighter.loadFactorG));
const missilesFired = Math.max(...allFighters.map((fighter) => fighter.missilesFired));
const missilesEvaded = Math.max(...allFighters.map((fighter) => fighter.missilesEvaded));
const finalSnapshot = snapshots.at(-1)?.snapshot;

const report = {
  sourceUrl: url.toString(),
  durationSeconds: seconds,
  frames: snapshots.length,
  diagnostics,
  physicsEngines: unique(snapshots.map(({ snapshot }) => snapshot.physicsEngine)),
  phases,
  missingPhases,
  roeStates,
  outcomes,
  cameraModes,
  maxActiveNdc,
  peakActiveNdc: maxActiveNdcRecord,
  maxIntroNdc,
  maxLoadFactorG,
  missilesFired,
  missilesEvaded,
  final: finalSnapshot ? {
    phase: finalSnapshot.phase,
    missionOutcome: finalSnapshot.missionOutcome,
    rangeMeters: finalSnapshot.rangeMeters,
  } : null,
};

const failures = [];
if (diagnostics.length > 0) failures.push(`browser diagnostics: ${diagnostics.length}`);
if (!report.physicsEngines.every((engine) => engine === 'rapier3d')) failures.push('physics engine was not rapier3d for every frame');
if (missingPhases.length > 0) failures.push(`missing phases: ${missingPhases.join(', ')}`);
if (!cameraModes.includes('INTRO NIGHT') || !cameraModes.includes('INTRO AETHEL')) failures.push('cinematic intro did not frame both fighters');
if (!roeStates.includes('WEAPONS FREE')) failures.push('ROE never reached WEAPONS FREE');
if (!outcomes.includes('SEPARATED') && !outcomes.includes('KILL')) failures.push('mission did not reach a terminal outcome');
if (maxActiveNdc > 1.05) failures.push(`active fighter left frame: max NDC ${maxActiveNdc.toFixed(3)}`);
if (maxIntroNdc > 1.05) failures.push(`intro fighter left frame: max NDC ${maxIntroNdc.toFixed(3)}`);
if (!Number.isFinite(maxLoadFactorG) || maxLoadFactorG > 10.5) failures.push(`load factor exceeded bound: ${maxLoadFactorG}`);
if (missilesFired < 1 || missilesEvaded < 1) failures.push('BVR shot and defensive outcome were not observed');
if (finiteNumbers.some((value) => !Number.isFinite(value))) failures.push('non-finite physics diagnostic observed');

console.log(JSON.stringify(report, null, 2));
if (failures.length > 0) {
  console.error(JSON.stringify({ failures }, null, 2));
  process.exitCode = 1;
}
