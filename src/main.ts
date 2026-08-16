import * as THREE from 'three';
import RAPIER, { Collider, RigidBody, World } from '@dimforge/rapier3d-compat';
import { createCyberpunkInterceptor, InterceptorController } from './ship';
import { createShipMaterials } from './materials';
import { SolarInterceptor } from './solarInterceptor';

const query = new URLSearchParams(window.location.search);
const captureMode = query.get('capture') === '1';
const offlineCaptureMode = query.get('offline') === '1';

declare global {
  interface Window {
    __combatCapture?: { renderAt: (time: number) => void };
    __combatCaptureReady?: boolean;
    __combatDiagnostics?: { snapshot: () => unknown };
  }
}

type FighterId = 'night' | 'aethel';
type CombatPhase =
  | 'SEARCH'
  | 'TRACK'
  | 'IDENTIFY'
  | 'COMMIT'
  | 'BVR SHOT'
  | 'DEFENSIVE BREAK'
  | 'MERGE'
  | 'WVR DOGFIGHT'
  | 'EXTEND'
  | 'SEPARATE'
  | 'REATTACK'
  | 'MISSION COMPLETE';
type TacticalState = 'SEARCH' | 'TRACK' | 'IDENTIFIED' | 'COMMIT' | 'ENGAGED' | 'DEFENSIVE' | 'EXTEND' | 'SEPARATE' | 'REATTACK' | 'KILLED';
type TrackQuality = 'NONE' | 'CONTACT' | 'TRACK' | 'ID';
type FighterRole = 'ENGAGED' | 'DEFENSIVE' | 'SEPARATE';
type RulesOfEngagement = 'WEAPONS HOLD' | 'PID CONFIRM' | 'WEAPONS FREE' | 'CEASE FIRE';

interface TrackState {
  quality: TrackQuality;
  confidence: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  age: number;
  progress: number;
  rangeWorld: number;
  lastUpdate: number;
}

interface FighterRig {
  id: FighterId;
  label: string;
  frame: THREE.Group;
  model: THREE.Group;
  updateVisuals: (time: number, delta: number) => void;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  forward: THREE.Vector3;
  initialForward: THREE.Vector3;
  speed: number;
  accel: number;
  turnRate: number;
  sideBias: number;
  bank: number;
  trail: THREE.Vector3[];
  trailLine: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  health: number;
  hitFlash: number;
  incoming: number;
  evasiveUntil: number;
  missilesRemaining: number;
  missilesFired: number;
  missilesHit: number;
  missilesEvaded: number;
  missileCooldown: number;
  lockProgress: number;
  lockNotified: boolean;
  debugTargetDirection: THREE.Vector3;
  debugFlightPathTarget: THREE.Vector3;
  debugManeuverAcceleration: number;
  tacticalState: TacticalState;
  role: FighterRole;
  stateSince: number;
  track: TrackState;
  fireReadyAt: number;
  extensionUntil: number;
  evasionSign: number;
  lastShotAt: number;
  previousVelocity: THREE.Vector3;
  specificEnergyM2S2: number;
  mach: number;
  dynamicPressurePa: number;
  angleOfAttackDeg: number;
  loadFactorG: number;
  actualAccelerationMps2: number;
  color: number;
  muzzleLocal: THREE.Vector3;
  body?: RigidBody;
  collider?: Collider;
}

interface Projectile {
  group: THREE.Group;
  line: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  head: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  start: THREE.Vector3;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  body: RigidBody;
  collider: Collider;
  targetPoint: THREE.Vector3;
  seekerLock: number;
  seekerFovRad: number;
  lostTrackAt: number;
  born: number;
  maxLife: number;
  burnoutAt: number;
  guidanceAcceleration: number;
  maxSpeed: number;
  shooter: FighterId;
  target: FighterId;
  color: number;
}

interface Burst {
  group: THREE.Group;
  particles: Array<{ mesh: THREE.Mesh; velocity: THREE.Vector3; scale: number }>;
  ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  flash: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  born: number;
  life: number;
}

interface LockPulse {
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  born: number;
  life: number;
}

const UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(0, 0, 1);
const RIGHT = new THREE.Vector3(1, 0, 0);
// One world unit is 10 metres. Visual meshes and colliders are scaled to this
// same map so the 12 m-class fighters do not accidentally become 100 m craft.
const WORLD_UNIT_METERS = 10;
const GRAVITY_MPS2 = 9.81;
const AIR_DENSITY_KG_M3 = 1.225;
const SEA_LEVEL_SOUND_SPEED_MPS = 340.3;
const FIGHTER_MASS_KG = 12_000;
const WING_AREA_M2 = 52;
const WING_ASPECT_RATIO = 5.5;
const WING_EFFICIENCY = 0.78;
const PARASITE_DRAG_COEFFICIENT = 0.025;
const SIDE_SLIP_DRAG_COEFFICIENT = 0.035;
const CRITICAL_ANGLE_OF_ATTACK_RAD = THREE.MathUtils.degToRad(18);
const MAX_THRUST_N = 175_000;
const MAX_TORQUE_NM = 18_000_000;
const MAX_LOAD_FACTOR_G = 8;
const PHYSICS_DT = 1 / 120;
const MAX_PHYSICS_STEPS_PER_FRAME = 32;
const MAX_OFFLINE_STEPS_PER_SEEK = 5000;
const PROJECTILE_SPEED_MPS = 620;
const STALL_SPEED_MPS = 42;
const MAX_FLIGHT_PATH_PITCH = THREE.MathUtils.degToRad(28);
const TWO_PI = Math.PI * 2;
const CYCLE_DURATION = 36;
const POV_SEGMENTS: Array<{ start: number; end: number; id: FighterId }> = [
  { start: 3.2, end: 6.8, id: 'night' },
  { start: 6.8, end: 10.4, id: 'aethel' },
  { start: 14.8, end: 18.7, id: 'night' },
  { start: 18.7, end: 22.6, id: 'aethel' },
];
const INITIAL_POSITIONS: Record<FighterId, THREE.Vector3> = {
  night: new THREE.Vector3(-280, 90, 26),
  aethel: new THREE.Vector3(280, 92, -26),
};
const ARENA_RADIUS_WORLD = 520;
const RADAR_CONTACT_RANGE_WORLD = 900;
const RADAR_TRACK_RANGE_WORLD = 760;
const RADAR_ID_RANGE_WORLD = 620;
const SENSOR_CONTACT_TIME = 0.35;
const SENSOR_TRACK_TIME = 1.0;
const SENSOR_ID_TIME = 1.8;
const PID_CONFIRM_HOLD_TIME = 0.65;
const BVR_COMMIT_RANGE_WORLD = 500;
const MERGE_RANGE_WORLD = 130;
const WVR_RANGE_WORLD = 78;
const EXTEND_RANGE_WORLD = 235;
const SEPARATE_RANGE_WORLD = 430;
const MISSILES_PER_FIGHTER = 4;
const MISSILE_MIN_RANGE_WORLD = 35;
const MISSILE_MAX_RANGE_WORLD = 520;
const MISSILE_LOCK_TIME = 1.15;
const MISSILE_COOLDOWN = 4.8;
const MISSILE_MASS_KG = 180;
const MISSILE_MAX_ACCEL_MPS2 = 32 * 9.81;
const MISSILE_MAX_SPEED_MPS = 1_150;
const MISSILE_DAMAGE = 100;

let physicsWorld: World | null = null;
let physicsAccumulator = 0;

function worldVector(vector: THREE.Vector3): { x: number; y: number; z: number } {
  return { x: vector.x, y: vector.y, z: vector.z };
}

function rapierRotation(quaternion: THREE.Quaternion): { x: number; y: number; z: number; w: number } {
  return { x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w };
}

function worldVelocityFromMetersPerSecond(metersPerSecond: number): number {
  return metersPerSecond / WORLD_UNIT_METERS;
}

function metersPerSecondFromWorldVelocity(worldUnitsPerSecond: number): number {
  return worldUnitsPerSecond * WORLD_UNIT_METERS;
}

function forceFromNewtons(force: THREE.Vector3): THREE.Vector3 {
  return force.multiplyScalar(1 / WORLD_UNIT_METERS);
}

function torqueFromNewtonMeters(torque: THREE.Vector3): THREE.Vector3 {
  return torque.multiplyScalar(1 / (WORLD_UNIT_METERS * WORLD_UNIT_METERS));
}

function airDensityAtAltitude(altitudeMeters: number): number {
  // ISA troposphere approximation, clamped to the band used by this scene.
  // The visual arena is intentionally low-altitude; this keeps q consistent
  // with the 10 m/world-unit scale instead of silently using sea-level density.
  const altitude = THREE.MathUtils.clamp(altitudeMeters, 0, 11_000);
  return AIR_DENSITY_KG_M3 * Math.pow(1 - 2.25577e-5 * altitude, 4.25588);
}

function speedOfSoundAtAltitude(altitudeMeters: number): number {
  const altitude = THREE.MathUtils.clamp(altitudeMeters, 0, 11_000);
  return SEA_LEVEL_SOUND_SPEED_MPS * Math.sqrt(1 - 0.0000225577 * altitude);
}

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x9bc9d8, 220, 950);

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 900);
camera.position.set(0, 28, 150);
// Keep the chase view on one continuous side of the engagement. Deriving the
// camera side directly from the instantaneous separation vector makes it
// flip when the fighters cross, which can put both aircraft behind the lens
// for a few frames during the merge.
const cameraViewDirection = new THREE.Vector3(0, 0, 1);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.24;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('canvas-container')?.appendChild(renderer.domElement);

const sky = new THREE.Mesh(
  new THREE.SphereGeometry(500, 48, 24),
  new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color(0x5cadd0) },
      horizonColor: { value: new THREE.Color(0xc5e6e8) },
      bottomColor: { value: new THREE.Color(0xf0d6b0) },
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      uniform vec3 bottomColor;
      varying vec3 vWorldPosition;
      void main() {
        float height = normalize(vWorldPosition).y;
        float horizon = smoothstep(-0.32, 0.18, height);
        vec3 color = mix(bottomColor, horizonColor, horizon);
        color = mix(color, topColor, smoothstep(0.12, 0.78, height));
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  }),
);
sky.renderOrder = -1000;
// The CSS shell owns the stable bright sky gradient. Keeping the 3D sphere out
// of the render path avoids transient sphere-face gaps when the camera resets.
sky.visible = false;
scene.add(sky);

scene.add(new THREE.HemisphereLight(0xe5f8ff, 0x6c8491, 2.35));

const sun = new THREE.DirectionalLight(0xfff2d0, 4.4);
sun.position.set(-80, 120, 90);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -260;
sun.shadow.camera.right = 260;
sun.shadow.camera.top = 260;
sun.shadow.camera.bottom = -260;
scene.add(sun);

const cyanFill = new THREE.PointLight(0x22c9ff, 180, 190, 2);
cyanFill.position.set(-100, 55, 160);
scene.add(cyanFill);
const warmFill = new THREE.PointLight(0xffa34a, 150, 170, 2);
warmFill.position.set(130, 10, -150);
scene.add(warmFill);

const arena = new THREE.Group();
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(700, 700),
  new THREE.MeshBasicMaterial({ color: 0x9bd3dc, transparent: true, opacity: 0.15, side: THREE.DoubleSide }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -22;
arena.add(floor);

const grid = new THREE.GridHelper(640, 64, 0x3eabc1, 0x83c9d3);
grid.position.y = -21.8;
(grid.material as THREE.LineBasicMaterial).transparent = true;
(grid.material as THREE.LineBasicMaterial).opacity = 0.22;
arena.add(grid);

const arenaRing = new THREE.Mesh(
  new THREE.RingGeometry(115, 115.35, 128),
  new THREE.MeshBasicMaterial({ color: 0x24b4cd, transparent: true, opacity: 0.38, side: THREE.DoubleSide }),
);
arenaRing.rotation.x = -Math.PI / 2;
arenaRing.position.y = -21.6;
arena.add(arenaRing);
scene.add(arena);

const sunDisc = new THREE.Mesh(
  new THREE.CircleGeometry(12, 48),
  new THREE.MeshBasicMaterial({ color: 0xfff4cf, transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
);
sunDisc.position.set(-175, 125, -280);
sunDisc.lookAt(camera.position);
scene.add(sunDisc);

const atmosphericStreaks: THREE.Line[] = [];
for (let i = 0; i < 62; i += 1) {
  const x = ((i * 71) % 480) - 240;
  const y = ((i * 31) % 120) - 18;
  const z = ((i * 113) % 560) - 280;
  const length = 2.2 + (i % 5) * 0.8;
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(x, y, z),
    new THREE.Vector3(x, y, z - length),
  ]);
  const material = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18 });
  const line = new THREE.Line(geometry, material);
  line.userData.speed = 7 + (i % 6) * 1.6;
  atmosphericStreaks.push(line);
  scene.add(line);
}

function makeTrail(color: number): THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial> {
  const points = Array.from({ length: 90 }, () => new THREE.Vector3());
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.24, depthWrite: false });
  const line = new THREE.Line(geometry, material);
  line.frustumCulled = false;
  return line;
}

function createNightRig(): FighterRig {
  const frame = new THREE.Group();
  frame.name = 'NIGHT_VECTOR_FRAME';
  const controller: InterceptorController = createCyberpunkInterceptor(createShipMaterials());
  controller.root.scale.setScalar(0.18);
  frame.add(controller.root);
  scene.add(frame);

  let rig: FighterRig;
  rig = {
    id: 'night',
    label: 'NIGHT//VECTOR',
    frame,
    model: controller.root,
    updateVisuals: (time, delta) => controller.update(time, delta, {
      mode: rig.speed > 20 ? 'boost' : 'cruise',
      wireframe: false,
      weaponsArmed: true,
      overdrive: rig.incoming > 0,
    }),
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    forward: new THREE.Vector3(),
    initialForward: new THREE.Vector3(),
    speed: 31,
    accel: 8.5,
    turnRate: 0.62,
    sideBias: 1,
    bank: 0,
    trail: Array.from({ length: 90 }, () => new THREE.Vector3()),
    trailLine: makeTrail(0xff2d8d),
    health: 100,
    hitFlash: 0,
    incoming: 0,
    evasiveUntil: 0,
    missilesRemaining: MISSILES_PER_FIGHTER,
    missilesFired: 0,
    missilesHit: 0,
    missilesEvaded: 0,
    missileCooldown: 0,
    lockProgress: 0,
    lockNotified: false,
    debugTargetDirection: new THREE.Vector3(),
    debugFlightPathTarget: new THREE.Vector3(),
    debugManeuverAcceleration: 0,
    tacticalState: 'SEARCH',
    role: 'ENGAGED',
    stateSince: 0,
    track: {
      quality: 'NONE',
      confidence: 0,
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      age: Infinity,
      progress: 0,
      rangeWorld: Infinity,
      lastUpdate: 0,
    },
    fireReadyAt: 0,
    extensionUntil: 0,
    evasionSign: 1,
    lastShotAt: -Infinity,
    previousVelocity: new THREE.Vector3(),
    specificEnergyM2S2: 0,
    mach: 0,
    dynamicPressurePa: 0,
    angleOfAttackDeg: 0,
    loadFactorG: 1,
    actualAccelerationMps2: 0,
    color: 0xff2d8d,
    muzzleLocal: new THREE.Vector3(0, -0.08, 7.25),
  };
  return rig;
}

function createAethelRig(): FighterRig {
  const frame = new THREE.Group();
  frame.name = 'AETHEL_01_FRAME';
  const interceptor = new SolarInterceptor();
  interceptor.group.scale.setScalar(0.18);
  frame.add(interceptor.group);
  scene.add(frame);

  let rig: FighterRig;
  rig = {
    id: 'aethel',
    label: 'AETHEL-01',
    frame,
    model: interceptor.group,
    updateVisuals: (time, _delta) => interceptor.update(time, THREE.MathUtils.clamp(rig.speed / 20, 0.8, 1.45), rig.speed > 20, rig.incoming > 0),
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    forward: new THREE.Vector3(),
    initialForward: new THREE.Vector3(),
    speed: 32,
    accel: 8.2,
    turnRate: 0.58,
    sideBias: -1,
    bank: 0,
    trail: Array.from({ length: 90 }, () => new THREE.Vector3()),
    trailLine: makeTrail(0x00b8d4),
    health: 100,
    hitFlash: 0,
    incoming: 0,
    evasiveUntil: 0,
    missilesRemaining: MISSILES_PER_FIGHTER,
    missilesFired: 0,
    missilesHit: 0,
    missilesEvaded: 0,
    missileCooldown: 0,
    lockProgress: 0,
    lockNotified: false,
    debugTargetDirection: new THREE.Vector3(),
    debugFlightPathTarget: new THREE.Vector3(),
    debugManeuverAcceleration: 0,
    tacticalState: 'SEARCH',
    role: 'DEFENSIVE',
    stateSince: 0,
    track: {
      quality: 'NONE',
      confidence: 0,
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      age: Infinity,
      progress: 0,
      rangeWorld: Infinity,
      lastUpdate: 0,
    },
    fireReadyAt: Infinity,
    extensionUntil: 0,
    evasionSign: -1,
    lastShotAt: -Infinity,
    previousVelocity: new THREE.Vector3(),
    specificEnergyM2S2: 0,
    mach: 0,
    dynamicPressurePa: 0,
    angleOfAttackDeg: 0,
    loadFactorG: 1,
    actualAccelerationMps2: 0,
    color: 0x00b8d4,
    muzzleLocal: new THREE.Vector3(0, 0.05, 9.4),
  };
  return rig;
}

const night = createNightRig();
const aethel = createAethelRig();
scene.add(night.trailLine, aethel.trailLine);
const rigs: Record<FighterId, FighterRig> = { night, aethel };

function attachPhysicsBody(rig: FighterRig) {
  if (!physicsWorld) throw new Error('Rapier world is not initialized');
  const start = INITIAL_POSITIONS[rig.id];
  const otherId: FighterId = rig.id === 'night' ? 'aethel' : 'night';
  const initialForward = INITIAL_POSITIONS[otherId].clone().sub(start);
  // Start with a shallow intercept attitude. The subsequent heading is
  // produced by the controller and Rapier forces, not by a route transform.
  initialForward.y *= 0.18;
  initialForward.normalize();
  const orientation = new THREE.Quaternion().setFromUnitVectors(FORWARD, initialForward);
  const initialVelocity = initialForward.multiplyScalar(worldVelocityFromMetersPerSecond(220));
  const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(start.x, start.y, start.z)
    .setRotation(rapierRotation(orientation))
    .setLinvel(initialVelocity.x, initialVelocity.y, initialVelocity.z)
    .setGravityScale(1)
    .setCcdEnabled(true)
    .setCanSleep(false)
    .setLinearDamping(0.002)
    .setAngularDamping(0.08);
  const body = physicsWorld.createRigidBody(bodyDesc);
  const colliderDesc = RAPIER.ColliderDesc.cuboid(0.38, 0.055, 0.63)
    .setMass(FIGHTER_MASS_KG)
    .setFriction(0.05)
    .setRestitution(0)
    .setSensor(true)
    .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
  const collider = physicsWorld.createCollider(colliderDesc, body);
  rig.body = body;
  rig.collider = collider;
}

async function initializePhysics() {
  await RAPIER.init();
  physicsWorld = new RAPIER.World({ x: 0, y: -GRAVITY_MPS2 / WORLD_UNIT_METERS, z: 0 });
  physicsWorld.timestep = PHYSICS_DT;
  physicsWorld.lengthUnit = 1 / WORLD_UNIT_METERS;
  physicsWorld.numSolverIterations = 8;
  physicsWorld.integrationParameters.maxCcdSubsteps = 4;
  attachPhysicsBody(night);
  attachPhysicsBody(aethel);
}

const fxLayer = new THREE.Group();
fxLayer.name = 'COMBAT_FX';
scene.add(fxLayer);

const rangeLine = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
  new THREE.LineBasicMaterial({ color: 0xffe5ac, transparent: true, opacity: 0.3, depthWrite: false, depthTest: false }),
);
rangeLine.frustumCulled = false;
rangeLine.renderOrder = 10;
scene.add(rangeLine);

const projectiles: Projectile[] = [];
const bursts: Burst[] = [];
const locks: LockPulse[] = [];
let burstSerial = 0;

function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

function addEvent(message: string, accent = false) {
  const feed = document.getElementById('event-feed');
  if (!feed) return;
  const row = document.createElement('div');
  row.className = accent ? 'event-row event-row--accent' : 'event-row';
  row.innerHTML = `<span>${formatTime(simTime)}</span><b>${message}</b>`;
  feed.prepend(row);
  while (feed.children.length > 5) feed.lastElementChild?.remove();
}

function trackQualityRank(quality: TrackQuality): number {
  return quality === 'ID' ? 3 : quality === 'TRACK' ? 2 : quality === 'CONTACT' ? 1 : 0;
}

function trackQualityLabel(quality: TrackQuality): string {
  return quality === 'ID' ? 'PID' : quality;
}

function setTacticalState(rig: FighterRig, next: TacticalState, reason?: string) {
  if (rig.tacticalState === next) return;
  rig.tacticalState = next;
  rig.stateSince = simTime;
  if (reason) addEvent(`${rig.label} // ${reason}`, true);
}

function phaseAt(rangeWorld: number, closingWorld: number, incoming: number): CombatPhase {
  if (missionOutcome === 'KILL') return 'MISSION COMPLETE';
  if (incoming > 0) return 'DEFENSIVE BREAK';
  if (missionOutcome === 'SEPARATED') return 'SEPARATE';
  if (!firstShotFired) {
    if (night.track.quality === 'ID' && aethel.track.quality === 'ID') {
      return rangeWorld <= BVR_COMMIT_RANGE_WORLD && roeStatus === 'WEAPONS FREE' ? 'COMMIT' : 'IDENTIFY';
    }
    if (trackQualityRank(night.track.quality) > 0 || trackQualityRank(aethel.track.quality) > 0) return 'TRACK';
    return 'SEARCH';
  }
  if (mergeOnly && rangeWorld > WVR_RANGE_WORLD) return 'MERGE';
  if (rigs[fireAuthority]?.tacticalState === 'REATTACK') return 'REATTACK';
  if (rangeWorld > SEPARATE_RANGE_WORLD && closingWorld < 0) return 'SEPARATE';
  if (projectiles.length > 0) return 'BVR SHOT';
  if (rangeWorld <= WVR_RANGE_WORLD) return 'WVR DOGFIGHT';
  if (rangeWorld <= MERGE_RANGE_WORLD) return 'MERGE';
  if (rangeWorld > EXTEND_RANGE_WORLD && closingWorld < 0) return 'EXTEND';
  return 'REATTACK';
}

function resetTrack(track: TrackState) {
  track.quality = 'NONE';
  track.confidence = 0;
  track.position.set(0, 0, 0);
  track.velocity.set(0, 0, 0);
  track.age = Infinity;
  track.progress = 0;
  track.rangeWorld = Infinity;
  track.lastUpdate = 0;
}

function updateSensors(delta: number) {
  for (const rig of [night, aethel]) {
    const other = rig.id === 'night' ? aethel : night;
    const track = rig.track;
    const separation = other.position.clone().sub(rig.position);
    const range = separation.length();
    track.rangeWorld = range;
    track.age += delta;
    const inSensorVolume = range <= RADAR_CONTACT_RANGE_WORLD && other.health > 0;
    if (!inSensorVolume) {
      track.progress = Math.max(0, track.progress - delta * 0.22);
      track.confidence = Math.max(0, track.confidence - delta * 0.12);
      if (track.age > 1.2) track.quality = 'NONE';
      continue;
    }

    const rangeSignal = THREE.MathUtils.clamp(
      (RADAR_CONTACT_RANGE_WORLD - range) / (RADAR_CONTACT_RANGE_WORLD - RADAR_ID_RANGE_WORLD),
      0,
      1,
    );
    const updateRate = 0.28 + rangeSignal * 0.72;
    track.progress = Math.min(SENSOR_ID_TIME + 0.8, track.progress + delta * updateRate);
    track.confidence = THREE.MathUtils.clamp(track.confidence + delta * (0.35 + rangeSignal * 0.5), 0, 1);
    const leadTime = THREE.MathUtils.clamp(
      range / Math.max(rig.speed + other.speed, 0.1) * 0.42,
      0.12,
      1.1,
    );
    const estimateNoise = (1 - rangeSignal) * 1.4;
    const noise = new THREE.Vector3(
      Math.sin(simTime * 1.7 + rig.sideBias) * estimateNoise,
      Math.cos(simTime * 1.2 + rig.sideBias * 0.7) * estimateNoise * 0.55,
      Math.sin(simTime * 1.35 - rig.sideBias) * estimateNoise,
    );
    track.position.copy(other.position).addScaledVector(other.velocity, leadTime).add(noise);
    track.velocity.copy(other.velocity);
    track.age = 0;
    track.lastUpdate = simTime;
    if (track.progress >= SENSOR_ID_TIME && range <= RADAR_ID_RANGE_WORLD) track.quality = 'ID';
    else if (track.progress >= SENSOR_TRACK_TIME && range <= RADAR_TRACK_RANGE_WORLD) track.quality = 'TRACK';
    else if (track.progress >= SENSOR_CONTACT_TIME) track.quality = 'CONTACT';
  }
}

function updateTacticalDoctrine() {
  const range = night.position.distanceTo(aethel.position);
  const line = aethel.position.clone().sub(night.position).normalize();
  const closing = -aethel.velocity.clone().sub(night.velocity).dot(line);
  updateRulesOfEngagement(range);
  if (mergeOnly && !Number.isFinite(mergeStartedAt)) {
    mergeStartedAt = simTime;
    addEvent('TACTICAL // BVR DEFEATED // VISUAL MERGE', true);
  }
  for (const rig of [night, aethel]) {
    const other = rig.id === 'night' ? aethel : night;
    if (rig.health <= 0) {
      rig.role = 'SEPARATE';
      setTacticalState(rig, 'KILLED');
      continue;
    }
    if (missionOutcome === 'SEPARATED') {
      rig.role = 'SEPARATE';
      setTacticalState(rig, 'SEPARATE');
      continue;
    }
    if (rig.incoming > 0) {
      rig.role = 'DEFENSIVE';
      rig.extensionUntil = Math.max(rig.extensionUntil, simTime + 2.6);
      setTacticalState(rig, 'DEFENSIVE', 'DEFENSIVE // BREAK / JINK');
      continue;
    }
    if (mergeOnly) {
      if (range <= WVR_RANGE_WORLD) {
        if (!Number.isFinite(wvrStartedAt)) {
          wvrStartedAt = simTime;
          addEvent('MERGED // VISUAL BFM // ENERGY / NOSE', true);
        }
        if (simTime - wvrStartedAt > 4.5) {
          missionOutcome = 'SEPARATED';
          rig.role = 'SEPARATE';
          setTacticalState(rig, 'SEPARATE', 'KNOCK-IT-OFF // SEPARATE');
          continue;
        }
      }
      rig.role = rig.id === fireAuthority ? 'ENGAGED' : 'DEFENSIVE';
      setTacticalState(rig, 'ENGAGED', range <= WVR_RANGE_WORLD ? 'MERGED // VISUAL BFM' : 'MERGE // WEAPONS HOLD');
      continue;
    }
    if (rig.tacticalState === 'DEFENSIVE' && simTime < rig.extensionUntil) {
      rig.role = 'DEFENSIVE';
      setTacticalState(rig, 'EXTEND');
      continue;
    }
    if (rig.tacticalState === 'EXTEND' && simTime < rig.extensionUntil) {
      rig.role = 'DEFENSIVE';
      continue;
    }
    if (!firstShotFired) {
      if (rig.track.quality === 'ID' && range <= BVR_COMMIT_RANGE_WORLD && rig.id === fireAuthority && roeStatus === 'WEAPONS FREE') {
        rig.role = 'ENGAGED';
        setTacticalState(rig, 'COMMIT', 'COMMIT // WEAPON WINDOW');
      } else if (rig.track.quality === 'ID') {
        rig.role = 'DEFENSIVE';
        setTacticalState(rig, 'IDENTIFIED', 'PID // HOSTILE TRACK');
      } else if (trackQualityRank(rig.track.quality) >= 2) {
        setTacticalState(rig, 'TRACK', 'TRACK // SENSOR SOLUTION');
      } else if (trackQualityRank(rig.track.quality) > 0) {
        setTacticalState(rig, 'TRACK');
      } else {
        setTacticalState(rig, 'SEARCH');
      }
      continue;
    }
    if (range <= WVR_RANGE_WORLD) {
      rig.role = rig.id === fireAuthority ? 'ENGAGED' : 'DEFENSIVE';
      setTacticalState(rig, 'ENGAGED', 'MERGED // BFM FLOW');
    } else if (rig.id === fireAuthority && rig.track.quality === 'ID' && simTime >= rig.fireReadyAt) {
      rig.role = 'ENGAGED';
      setTacticalState(rig, 'REATTACK', 'REATTACK // REACQUIRED');
    } else if (range > EXTEND_RANGE_WORLD && closing < 0) {
      rig.role = 'SEPARATE';
      setTacticalState(rig, 'SEPARATE', 'SEPARATE // REBUILD SA');
    } else if (range > MERGE_RANGE_WORLD && closing < 0) {
      rig.role = 'DEFENSIVE';
      setTacticalState(rig, 'EXTEND', 'EXTEND // ENERGY RECOVERY');
    } else if (rig.track.quality === 'ID') {
      setTacticalState(rig, 'ENGAGED');
    } else {
      setTacticalState(rig, 'TRACK');
    }
    void other;
  }
  missionPhase = phaseAt(range, closing, night.incoming + aethel.incoming);
}

function getMuzzleWorld(rig: FighterRig): THREE.Vector3 {
  return rig.model.localToWorld(rig.muzzleLocal.clone());
}

function resetRig(rig: FighterRig) {
  const start = INITIAL_POSITIONS[rig.id];
  const otherId: FighterId = rig.id === 'night' ? 'aethel' : 'night';
  const initialForward = INITIAL_POSITIONS[otherId].clone().sub(start);
  initialForward.y *= 0.18;
  initialForward.normalize();
  const orientation = new THREE.Quaternion().setFromUnitVectors(FORWARD, initialForward);
  rig.position.copy(start);
  rig.initialForward.copy(initialForward);
  rig.forward.copy(rig.initialForward);
  rig.velocity.copy(rig.forward).multiplyScalar(worldVelocityFromMetersPerSecond(220));
  rig.previousVelocity.copy(rig.velocity);
  rig.speed = rig.velocity.length();
  const resetSpeedMps = metersPerSecondFromWorldVelocity(rig.speed);
  rig.specificEnergyM2S2 = 0.5 * resetSpeedMps * resetSpeedMps + GRAVITY_MPS2 * start.y * WORLD_UNIT_METERS;
  rig.mach = resetSpeedMps / speedOfSoundAtAltitude(start.y * WORLD_UNIT_METERS);
  rig.dynamicPressurePa = 0;
  rig.angleOfAttackDeg = 0;
  rig.loadFactorG = 1;
  rig.actualAccelerationMps2 = 0;
  rig.bank = 0;
  rig.health = 100;
  rig.hitFlash = 0;
  rig.incoming = 0;
  rig.evasiveUntil = 0;
  rig.missilesRemaining = MISSILES_PER_FIGHTER;
  rig.missilesFired = 0;
  rig.missilesHit = 0;
  rig.missilesEvaded = 0;
  rig.missileCooldown = 0;
  rig.lockProgress = 0;
  rig.lockNotified = false;
  rig.tacticalState = rig.id === 'night' ? 'SEARCH' : 'SEARCH';
  rig.role = rig.id === 'night' ? 'ENGAGED' : 'DEFENSIVE';
  rig.stateSince = 0;
  resetTrack(rig.track);
  rig.fireReadyAt = rig.id === 'night' ? 0 : Infinity;
  rig.extensionUntil = 0;
  rig.evasionSign = rig.id === 'night' ? 1 : -1;
  rig.lastShotAt = -Infinity;
  rig.debugTargetDirection.set(0, 0, 1);
  rig.debugFlightPathTarget.set(0, 0, 1);
  rig.debugManeuverAcceleration = 0;
  if (rig.body) {
    rig.body.setTranslation(worldVector(start), true);
    rig.body.setRotation(rapierRotation(orientation), true);
    rig.body.setLinvel(worldVector(rig.velocity), true);
    rig.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    rig.body.resetForces(true);
    rig.body.resetTorques(true);
  }
  rig.frame.position.copy(rig.position);
  if (rig.id === 'night') rig.frame.position.y -= 0.24;
  rig.frame.quaternion.identity();
  rig.trail.forEach((point) => point.copy(rig.position));
  rig.trailLine.geometry.setFromPoints(rig.trail);
}

function resetTransientFx() {
  projectiles.splice(0).forEach((shot) => {
    physicsWorld?.removeRigidBody(shot.body);
    fxLayer.remove(shot.group);
    shot.line.geometry.dispose();
    shot.line.material.dispose();
    shot.head.geometry.dispose();
    shot.head.material.dispose();
  });
  bursts.splice(0).forEach((burst) => {
    fxLayer.remove(burst.group);
    burst.particles.forEach(({ mesh }) => {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    });
    burst.ring.geometry.dispose();
    burst.ring.material.dispose();
    burst.flash.geometry.dispose();
    burst.flash.material.dispose();
  });
  locks.splice(0).forEach((lock) => {
    fxLayer.remove(lock.mesh);
    lock.mesh.geometry.dispose();
    lock.mesh.material.dispose();
  });
}

let simTime = 0;
let paused = false;
let lastFrame = performance.now();
let lastPhase: CombatPhase = 'SEARCH';
let missionPhase: CombatPhase = 'SEARCH';
let fireAuthority: FighterId = 'night';
let firstShotFired = false;
let mergeOnly = false;
let mergeStartedAt = Infinity;
let wvrStartedAt = Infinity;
let missionOutcome: 'ACTIVE' | 'SEPARATED' | 'KILL' = 'ACTIVE';
let roeStatus: RulesOfEngagement = 'WEAPONS HOLD';
let lastRoeStatus: RulesOfEngagement = 'WEAPONS HOLD';
let pidConfirmedAt = Infinity;
let cameraMode = 'TACTICAL BOTH';

function updateRulesOfEngagement(rangeWorld: number) {
  const bothIdentified = night.track.quality === 'ID' && aethel.track.quality === 'ID';
  if (!bothIdentified) pidConfirmedAt = Infinity;
  else if (!Number.isFinite(pidConfirmedAt)) {
    pidConfirmedAt = simTime;
    addEvent('SENSOR // PID CONFIRMED // HOSTILE IDENTIFIED', true);
  }

  const nextStatus: RulesOfEngagement = missionOutcome !== 'ACTIVE'
    ? 'CEASE FIRE'
    : mergeOnly
      ? 'WEAPONS HOLD'
    : !bothIdentified
      ? 'WEAPONS HOLD'
      : simTime - pidConfirmedAt < PID_CONFIRM_HOLD_TIME
        ? 'PID CONFIRM'
        : rangeWorld <= BVR_COMMIT_RANGE_WORLD
          ? 'WEAPONS FREE'
          : 'PID CONFIRM';
  if (nextStatus !== roeStatus) {
    roeStatus = nextStatus;
    if (roeStatus !== lastRoeStatus) {
      addEvent(`ROE // ${roeStatus}`, roeStatus === 'WEAPONS FREE');
      lastRoeStatus = roeStatus;
    }
  }
}

function resetSimulation() {
  simTime = 0;
  lastPhase = 'SEARCH';
  missionPhase = 'SEARCH';
  fireAuthority = 'night';
  firstShotFired = false;
  mergeOnly = false;
  mergeStartedAt = Infinity;
  wvrStartedAt = Infinity;
  missionOutcome = 'ACTIVE';
  roeStatus = 'WEAPONS HOLD';
  lastRoeStatus = 'WEAPONS HOLD';
  pidConfirmedAt = Infinity;
  cameraMode = 'TACTICAL BOTH';
  cameraViewDirection.set(0, 0, 1);
  resetTransientFx();
  resetRig(night);
  resetRig(aethel);
  const feed = document.getElementById('event-feed');
  if (feed) feed.innerHTML = '';
  addEvent('SIMULATION // RESET // 1V1 BVR TRAINING', true);
  // Do not interpolate from the previous engagement's camera target. On a
  // manual reset that stale view produced a brief black geometry flash while
  // the fighters had already jumped back to their entry vectors.
  updateCamera(0, 1);
  rangeLine.geometry.setFromPoints([night.position, aethel.position]);
  updateHud();
}

function updateFlight(rig: FighterRig, other: FighterRig, time: number, delta: number) {
  if (!physicsWorld || !rig.body) return;
  // The flight controller is now driven by the pilot's track and tactical
  // state. It may use the true body only for physics/diagnostics; guidance uses
  // the latest sensor estimate whenever a track exists.
  const bodyPosition = rig.body.translation();
  const currentPosition = new THREE.Vector3(bodyPosition.x, bodyPosition.y, bodyPosition.z);
  const range = currentPosition.distanceTo(other.position);
  const lineOfSight = other.position.clone().sub(currentPosition);
  const lineDirection = lineOfSight.lengthSq() > 0.01 ? lineOfSight.normalize() : rig.forward.clone();
  const relativeVelocity = other.velocity.clone().sub(rig.velocity);
  const closingWorld = -lineDirection.dot(relativeVelocity);
  const targetRight = new THREE.Vector3().crossVectors(UP, other.forward);
  if (targetRight.lengthSq() < 0.001) targetRight.set(1, 0, 0);
  targetRight.normalize();

  const hasTrack = trackQualityRank(rig.track.quality) > 0 && rig.track.age < 1.2;
  const trackVelocity = hasTrack ? rig.track.velocity : other.velocity;
  const leadTime = THREE.MathUtils.clamp(
    range / Math.max(rig.speed + other.speed, 0.1) * (rig.tacticalState === 'ENGAGED' ? 0.38 : 0.55),
    0.12,
    1.2,
  );
  const targetPosition = hasTrack
    ? rig.track.position.clone().addScaledVector(trackVelocity, leadTime * 0.35)
    : currentPosition.clone().addScaledVector(rig.initialForward, 220);

  if (rig.tacticalState === 'SEARCH') {
    targetPosition.copy(currentPosition).addScaledVector(rig.initialForward, 240);
    targetPosition.addScaledVector(targetRight, rig.sideBias * 12);
  } else if (rig.tacticalState === 'DEFENSIVE' || rig.tacticalState === 'EXTEND') {
    const awayFromBandit = currentPosition.clone().sub(other.position);
    if (awayFromBandit.lengthSq() < 0.001) awayFromBandit.copy(rig.forward);
    awayFromBandit.normalize();
    const breakPulse = Math.sin(time * 3.6 + rig.sideBias * 1.7);
    targetPosition.copy(currentPosition)
      .addScaledVector(awayFromBandit, 180)
      .addScaledVector(targetRight, rig.evasionSign * (18 + breakPulse * 7));
    targetPosition.y += rig.evasionSign * 15 + Math.sin(time * 2.4) * 7;
  } else if (rig.tacticalState === 'SEPARATE') {
    const awayFromBandit = currentPosition.clone().sub(other.position).normalize();
    targetPosition.copy(currentPosition).addScaledVector(awayFromBandit, 240).addScaledVector(rig.forward, 160);
  } else if (rig.tacticalState === 'ENGAGED' || rig.tacticalState === 'COMMIT' || rig.tacticalState === 'REATTACK') {
    if (closingWorld < -15 && range > MERGE_RANGE_WORLD) {
      targetPosition.copy(rig.track.position).addScaledVector(trackVelocity, 0.18);
    }
    if (range < MERGE_RANGE_WORLD) {
      // A small lateral offset creates a lead/lag problem instead of a
      // symmetric nose-to-nose collision. The offset is intentionally small
      // relative to the aircraft separation so geometry remains readable.
      targetPosition
        .addScaledVector(targetRight, rig.sideBias * (8 + Math.sin(time * 1.1 + rig.sideBias) * 4));
      targetPosition.y += Math.sin(time * 0.9 + rig.sideBias * 0.9) * 5;
    }
  }

  // Keep the engagement inside the arena without teleporting either body.
  const arenaCenter = new THREE.Vector3(0, 90, 0);
  const arenaOffset = arenaCenter.clone().sub(currentPosition);
  const arenaRadius = Math.hypot(currentPosition.x, currentPosition.z);
  if (arenaRadius > ARENA_RADIUS_WORLD) {
    targetPosition.addScaledVector(arenaOffset, THREE.MathUtils.clamp((arenaRadius - ARENA_RADIUS_WORLD) * 0.08, 0, 14));
  }

  const desiredAltitude = 90
    + Math.sin(time * 0.55 + rig.sideBias) * 10
    + ((rig.tacticalState === 'DEFENSIVE' || rig.tacticalState === 'EXTEND') ? rig.evasionSign * 12 : 0);
  const altitudeErrorWorld = desiredAltitude - currentPosition.y;
  rig.missileCooldown = Math.max(0, rig.missileCooldown - delta);
  const localPhase = missionPhase;

  const rotation = rig.body.rotation();
  const orientation = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
  const forward = FORWARD.clone().applyQuaternion(orientation).normalize();
  const up = UP.clone().applyQuaternion(orientation).normalize();
  const right = RIGHT.clone().applyQuaternion(orientation).normalize();
  const rapierVelocity = rig.body.linvel();
  const velocity = new THREE.Vector3(rapierVelocity.x, rapierVelocity.y, rapierVelocity.z);
  const speedWorld = velocity.length();
  const speedMps = metersPerSecondFromWorldVelocity(speedWorld);
  const altitudeMeters = Math.max(0, currentPosition.y * WORLD_UNIT_METERS);
  const airDensity = airDensityAtAltitude(altitudeMeters);
  const speedOfSound = speedOfSoundAtAltitude(altitudeMeters);
  const velocityDirection = speedWorld > 0.01 ? velocity.clone().normalize() : forward.clone();
  const targetDirection = targetPosition.sub(currentPosition);
  if (targetDirection.lengthSq() > 0.01) targetDirection.normalize();
  else targetDirection.copy(forward);
  rig.debugTargetDirection.copy(targetDirection);
  const flightPathTarget = targetDirection.clone();
  if (speedWorld > 0.5) {
    // Limit the commanded flight-path change by an approximate 8.5G turn
    // envelope. The body can still lag or overshoot under the actual torque,
    // but the controller never asks for an instantaneous reversal.
    const requestedAngle = velocityDirection.angleTo(targetDirection);
    const turnAxis = velocityDirection.clone().cross(targetDirection);
    if (closingWorld < -15 && range > 100 && requestedAngle > 2.35) {
      // At a post-merge near-180° reversal, v × target is numerically
      // ambiguous and can select a roll axis. Use a bounded horizontal
      // reversal so the rigid body actually comes back into the merge.
      turnAxis.set(0, -1, 0);
    } else if (turnAxis.lengthSq() < 0.0001) {
      turnAxis.copy(right);
    }
    turnAxis.normalize();
    const loadLimitedTurnRate = (GRAVITY_MPS2 * MAX_LOAD_FACTOR_G) / Math.max(speedMps, 80);
    const controllerTurnRate = rig.turnRate * 1.4;
    const maxTurnRate = THREE.MathUtils.clamp(Math.min(loadLimitedTurnRate, controllerTurnRate), 0.12, 0.68);
    const allowedAngle = Math.min(requestedAngle, maxTurnRate * delta * 1.8);
    flightPathTarget.copy(velocityDirection).applyAxisAngle(turnAxis, allowedAngle).normalize();
  }
  if (forward.dot(velocityDirection) < 0.22) {
    // If attitude has lagged far behind the actual flight path, recover toward
    // the velocity vector before requesting another hard manoeuvre.
    flightPathTarget.copy(velocityDirection);
  }
  // A fighter can pull up or down, but the guidance command must not turn the
  // whole aircraft into a vertical rocket. Keep the commanded flight-path
  // pitch inside the declared aerodynamic envelope.
  flightPathTarget.y = THREE.MathUtils.clamp(
    flightPathTarget.y,
    -Math.sin(MAX_FLIGHT_PATH_PITCH),
    Math.sin(MAX_FLIGHT_PATH_PITCH),
  );
  flightPathTarget.normalize();
  rig.debugFlightPathTarget.copy(flightPathTarget);

  // Aerodynamics: dynamic pressure, angle of attack, lift, drag and thrust.
  // Rapier integrates the resulting forces and the rigid body's inertia.
  rig.body.resetForces(true);
  rig.body.resetTorques(true);
  const localVelocity = velocity.clone().applyQuaternion(orientation.clone().invert());
  const longitudinalSpeed = Math.max(Math.abs(localVelocity.z), 0.1);
  const angleOfAttack = Math.atan2(-localVelocity.y, longitudinalSpeed);
  const sideslip = Math.atan2(localVelocity.x, longitudinalSpeed);
  const dynamicPressure = 0.5 * airDensity * speedMps * speedMps;
  const angleRatio = Math.abs(angleOfAttack) / CRITICAL_ANGLE_OF_ATTACK_RAD;
  const stallDrop = THREE.MathUtils.clamp(1 - Math.max(0, angleRatio - 0.78) * 2.6, 0.2, 1);
  const liftCoefficient = THREE.MathUtils.clamp(0.08 + angleOfAttack * 1.8, -0.35, 0.85) * stallDrop;
  const inducedDragCoefficient = (liftCoefficient * liftCoefficient) / (Math.PI * WING_ASPECT_RATIO * WING_EFFICIENCY);
  const dragCoefficient = PARASITE_DRAG_COEFFICIENT
    + inducedDragCoefficient
    + SIDE_SLIP_DRAG_COEFFICIENT * Math.abs(sideslip);
  rig.dynamicPressurePa = dynamicPressure;
  rig.angleOfAttackDeg = THREE.MathUtils.radToDeg(angleOfAttack);
  rig.mach = speedMps / Math.max(speedOfSound, 1);
  const liftDirection = up.clone().sub(velocityDirection.clone().multiplyScalar(up.dot(velocityDirection)));
  if (liftDirection.lengthSq() > 0.001) liftDirection.normalize();
  else liftDirection.copy(up);
  if (liftCoefficient < 0) liftDirection.negate();
  const lift = liftDirection.multiplyScalar(dynamicPressure * WING_AREA_M2 * Math.abs(liftCoefficient));
  const drag = velocityDirection.clone().multiplyScalar(-dynamicPressure * WING_AREA_M2 * dragCoefficient);
  const phaseSpeed = localPhase === 'DEFENSIVE BREAK'
    ? 276
    : localPhase === 'WVR DOGFIGHT' || localPhase === 'MERGE'
      ? 258
      : localPhase === 'EXTEND' || localPhase === 'SEPARATE'
        ? 286
        : localPhase === 'COMMIT' || localPhase === 'BVR SHOT' || localPhase === 'REATTACK'
          ? 248
          : 226;
  const targetSpeed = phaseSpeed + Math.sin(time * 0.7 + rig.sideBias) * 7;
  const throttle = THREE.MathUtils.clamp(0.52 + (targetSpeed - speedMps) / 120, 0.16, 1);
  const thrust = forward.clone().multiplyScalar(MAX_THRUST_N * throttle);
  const centerForce = forceFromNewtons(thrust.add(drag));
  rig.body.addForce(worldVector(centerForce), true);
  // Control-surface load: a real aircraft changes its velocity vector by
  // generating a bounded aerodynamic load; it does not teleport its heading
  // onto a route. Convert the requested flight-path rate into a lateral force
  // and cap it by dynamic pressure at roughly a high-alpha 8G envelope.
  const maneuverAxis = flightPathTarget.clone()
    .sub(velocityDirection.clone().multiplyScalar(flightPathTarget.dot(velocityDirection)));
  if (maneuverAxis.lengthSq() > 0.000001 && speedMps > 30) {
    maneuverAxis.normalize();
    const maneuverAngle = velocityDirection.angleTo(flightPathTarget);
    const requestedAcceleration = speedMps * maneuverAngle / Math.max(delta, 1 / 240);
    const maxControlAcceleration = THREE.MathUtils.clamp(
      dynamicPressure / 450,
      1.5 * GRAVITY_MPS2,
      MAX_LOAD_FACTOR_G * GRAVITY_MPS2,
    );
    const maneuverAcceleration = Math.min(requestedAcceleration, maxControlAcceleration);
    rig.debugManeuverAcceleration = maneuverAcceleration;
    const maneuverForce = maneuverAxis.multiplyScalar(FIGHTER_MASS_KG * maneuverAcceleration);
    rig.body.addForce(worldVector(forceFromNewtons(maneuverForce)), true);
  } else {
    rig.debugManeuverAcceleration = 0;
  }
  const centerOfLift = currentPosition.clone().add(forward.clone().multiplyScalar(0.45));
  rig.body.addForceAtPoint(worldVector(forceFromNewtons(lift)), worldVector(centerOfLift), true);
  const altitudeCorrection = THREE.MathUtils.clamp(
    altitudeErrorWorld * 0.12 - velocity.y * 1.1,
    -8,
    8,
  );
  // Include a gravity-compensating trim term so the altitude controller is a
  // real lift/throttle command, not a force that forgets the world's gravity.
  const altitudeTrim = UP.clone().multiplyScalar(
    FIGHTER_MASS_KG * (GRAVITY_MPS2 + altitudeCorrection * WORLD_UNIT_METERS),
  );
  rig.body.addForce(worldVector(forceFromNewtons(altitudeTrim)), true);

  // A bounded flight-control torque steers the rigid body's attitude toward a
  // reachable flight path. This is a PD-style control-surface approximation:
  // Rapier still integrates the resulting torque and angular velocity.
  const desiredForward = flightPathTarget.clone().normalize();
  const desiredUp = UP.clone().sub(desiredForward.clone().multiplyScalar(UP.dot(desiredForward)));
  if (desiredUp.lengthSq() < 0.001) {
    desiredUp.copy(up).sub(desiredForward.clone().multiplyScalar(up.dot(desiredForward)));
  }
  desiredUp.normalize();
  const desiredRight = desiredUp.clone().cross(desiredForward).normalize();
  desiredUp.copy(desiredForward).cross(desiredRight).normalize();
  const lateralDemand = right.dot(desiredForward);
  const desiredBank = THREE.MathUtils.clamp(
    -lateralDemand * 1.15 + Math.sin(time * 0.55 + rig.sideBias) * 0.08,
    -0.95,
    0.95,
  );
  desiredRight.applyAxisAngle(desiredForward, desiredBank);
  desiredUp.applyAxisAngle(desiredForward, desiredBank);
  const desiredOrientation = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(desiredRight, desiredUp, desiredForward),
  );
  const attitudeError = desiredOrientation.multiply(orientation.clone().invert());
  if (attitudeError.w < 0) {
    attitudeError.set(-attitudeError.x, -attitudeError.y, -attitudeError.z, -attitudeError.w);
  }
  const errorVector = new THREE.Vector3(attitudeError.x, attitudeError.y, attitudeError.z);
  const errorMagnitude = errorVector.length();
  const errorAngle = 2 * Math.atan2(errorMagnitude, Math.max(attitudeError.w, 0.0001));
  if (errorMagnitude > 0.0001) errorVector.multiplyScalar(1 / errorMagnitude);
  else errorVector.set(0, 0, 0);
  const angularVelocity = rig.body.angvel();
  const angular = new THREE.Vector3(angularVelocity.x, angularVelocity.y, angularVelocity.z);
  const controlEffectiveness = THREE.MathUtils.clamp(dynamicPressure / 10_000, 0.55, 1);
  const steeringTorque = errorVector.multiplyScalar(errorAngle * MAX_TORQUE_NM * controlEffectiveness)
    .add(angular.multiplyScalar(-MAX_TORQUE_NM * (0.26 + controlEffectiveness * 0.16)));
  const velocityAlignment = forward.dot(velocityDirection);
  if (velocityAlignment < 0.32) {
    // Directional recovery is an explicit flight-control input. It keeps a
    // high-alpha rigid body from crossing through the velocity vector and
    // continuing tail-first while the attitude PD loop catches up.
    const recoveryAxis = forward.clone().cross(velocityDirection);
    if (recoveryAxis.lengthSq() < 0.001) recoveryAxis.copy(right);
    recoveryAxis.normalize();
    const recoveryStrength = THREE.MathUtils.clamp((0.32 - velocityAlignment) / 1.32, 0.25, 1);
    const recoveryTorque = recoveryAxis.multiplyScalar(
      MAX_TORQUE_NM * controlEffectiveness * recoveryStrength * 1.8,
    );
    if (velocityAlignment < 0.08) {
      // Once the nose has crossed the velocity vector, remove the competing
      // attitude command for this step and let recovery torque dominate.
      steeringTorque.set(0, 0, 0);
    }
    steeringTorque.add(recoveryTorque);
  }
  steeringTorque.clampLength(0, MAX_TORQUE_NM);
  rig.body.addTorque(worldVector(torqueFromNewtonMeters(steeringTorque)), true);
}

function syncFighterFromPhysics(rig: FighterRig, delta: number) {
  if (!rig.body) return;
  const translation = rig.body.translation();
  const rotation = rig.body.rotation();
  const velocity = rig.body.linvel();
  const previousVelocity = rig.velocity.clone();
  rig.position.set(translation.x, translation.y, translation.z);
  rig.velocity.set(velocity.x, velocity.y, velocity.z);
  rig.speed = rig.velocity.length();
  const speedMps = metersPerSecondFromWorldVelocity(rig.speed);
  const accelerationMps2 = rig.velocity.clone()
    .sub(previousVelocity)
    .multiplyScalar(WORLD_UNIT_METERS / Math.max(delta, PHYSICS_DT));
  const nonGravitationalAcceleration = accelerationMps2.clone().addScaledVector(UP, GRAVITY_MPS2);
  rig.actualAccelerationMps2 = accelerationMps2.length();
  rig.loadFactorG = THREE.MathUtils.clamp(nonGravitationalAcceleration.length() / GRAVITY_MPS2, 0, MAX_LOAD_FACTOR_G + 1.5);
  rig.specificEnergyM2S2 = 0.5 * speedMps * speedMps + GRAVITY_MPS2 * Math.max(0, rig.position.y * WORLD_UNIT_METERS);
  rig.previousVelocity.copy(rig.velocity);
  rig.forward.set(0, 0, 1).applyQuaternion(new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w)).normalize();
  rig.frame.position.copy(rig.position);
  if (rig.id === 'night') rig.frame.position.y -= 0.24;
  rig.frame.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
  const up = UP.clone().applyQuaternion(rig.frame.quaternion);
  const right = RIGHT.clone().applyQuaternion(rig.frame.quaternion);
  rig.bank = Math.atan2(right.dot(UP), up.dot(UP));
  rig.updateVisuals(simTime, delta);
  rig.trail.unshift(rig.position.clone());
  rig.trail.length = 90;
  rig.trailLine.geometry.setFromPoints(rig.trail);
  rig.hitFlash = Math.max(0, rig.hitFlash - delta * 2.8);
}

function createShot(shooter: FighterRig, target: FighterRig, born: number) {
  if (!physicsWorld) return;
  const range = shooter.position.distanceTo(target.position);
  const start = getMuzzleWorld(shooter);
  const initialAimPoint = trackQualityRank(shooter.track.quality) > 0
    ? shooter.track.position.clone()
    : target.position.clone();
  const initialDirection = initialAimPoint.sub(start).normalize();
  const direction = shooter.forward.clone().lerp(initialDirection, 0.3).normalize();
  const shotVelocity = direction
    .multiplyScalar(worldVelocityFromMetersPerSecond(PROJECTILE_SPEED_MPS))
    .add(shooter.velocity);
  const targetPoint = initialAimPoint.clone().addScaledVector(target.velocity, 0.35);
  const shotBody = physicsWorld.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(start.x, start.y, start.z)
      .setLinvel(shotVelocity.x, shotVelocity.y, shotVelocity.z)
      .setGravityScale(0.08)
      .setCcdEnabled(true)
      .setCanSleep(false)
      .setLinearDamping(0),
  );
  const shotCollider = physicsWorld.createCollider(
    RAPIER.ColliderDesc.ball(0.14)
      .setMass(MISSILE_MASS_KG)
      .setSensor(true)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
    shotBody,
  );
  const group = new THREE.Group();
  const lineMaterial = new THREE.LineBasicMaterial({ color: shooter.color, transparent: true, opacity: 0.95, depthWrite: false, depthTest: false });
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([start, start]), lineMaterial);
  line.frustumCulled = false;
  line.renderOrder = 30;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 10), new THREE.MeshBasicMaterial({ color: shooter.color, depthWrite: false, depthTest: false }));
  head.renderOrder = 31;
  group.add(line, head);
  fxLayer.add(group);
  projectiles.push({
    group,
    line,
    head,
    start,
    position: start.clone(),
    velocity: shotVelocity.clone(),
    body: shotBody,
    collider: shotCollider,
    targetPoint,
    seekerLock: 0,
    seekerFovRad: THREE.MathUtils.degToRad(34),
    lostTrackAt: born,
    born,
    maxLife: 7.2,
    burnoutAt: born + 1.8,
    guidanceAcceleration: MISSILE_MAX_ACCEL_MPS2,
    maxSpeed: MISSILE_MAX_SPEED_MPS,
    shooter: shooter.id,
    target: target.id,
    color: shooter.color,
  });

  target.incoming += 1;
  target.evasiveUntil = Math.max(target.evasiveUntil, born + 3.2);
  target.evasionSign = target.sideBias * (target.incoming % 2 === 0 ? -1 : 1);
  shooter.missilesRemaining -= 1;
  shooter.missilesFired += 1;
  shooter.missileCooldown = MISSILE_COOLDOWN;
  shooter.lastShotAt = born;
  target.fireReadyAt = born + 4.2;
  fireAuthority = target.id;
  firstShotFired = true;
  setTacticalState(shooter, 'ENGAGED', 'BVR SHOT // SUPPORT TRACK');
  setTacticalState(target, 'DEFENSIVE', 'INCOMING // BREAK NOW');
  const lock = new THREE.Mesh(
    new THREE.SphereGeometry(1.2, 16, 8),
    new THREE.MeshBasicMaterial({ color: shooter.color, wireframe: true, transparent: true, opacity: 0.72, depthWrite: false, depthTest: false }),
  );
  lock.position.copy(targetPoint);
  lock.renderOrder = 20;
  fxLayer.add(lock);
  locks.push({ mesh: lock, born, life: 1.0 });
  addEvent(`${shooter.label} // BVR SHOT // ${Math.round(range * WORLD_UNIT_METERS)} M`, true);
}

function createBurst(position: THREE.Vector3, color: number, now: number, hit: boolean, target: FighterId) {
  const group = new THREE.Group();
  group.position.copy(position);
  const particles: Burst['particles'] = [];
  const random = (n: number) => Math.sin(n * 12.9898 + burstSerial * 78.233) * 0.5 + 0.5;
  burstSerial += 1;
  for (let i = 0; i < (hit ? 22 : 10); i += 1) {
    const mesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(hit ? 0.22 : 0.14, 0),
      new THREE.MeshBasicMaterial({ color: i % 3 === 0 ? 0xffffff : color, transparent: true, opacity: 1, depthWrite: false, depthTest: false }),
    );
    const theta = random(i + 1) * TWO_PI;
    const phi = Math.acos(random(i + 12) * 2 - 1);
    const direction = new THREE.Vector3(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
    group.add(mesh);
    particles.push({ mesh, velocity: direction.multiplyScalar((hit ? 8 : 4) + random(i + 24) * (hit ? 10 : 5)), scale: 0.7 + random(i + 40) * 0.8 });
  }
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(hit ? 2.4 : 1.4, hit ? 2.8 : 1.7, 32),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, depthTest: false }),
  );
  ring.rotation.x = Math.PI / 2;
  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(hit ? 1.1 : 0.55, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92, depthWrite: false, depthTest: false }),
  );
  group.add(ring, flash);
  group.renderOrder = 20;
  fxLayer.add(group);
  bursts.push({ group, particles, ring, flash, born: now, life: hit ? 1.0 : 0.65 });
  if (hit) {
    rigs[target].health = Math.max(0, rigs[target].health - MISSILE_DAMAGE);
    rigs[target].hitFlash = 1;
    rigs[target].missilesHit += 1;
    rigs[target].role = 'SEPARATE';
    setTacticalState(rigs[target], 'KILLED', 'MISSILE IMPACT // KILL');
    missionOutcome = 'KILL';
    addEvent(`${rigs[target].label} // MISSILE IMPACT // KILL`, true);
  } else {
    rigs[target].missilesEvaded += 1;
    rigs[target].extensionUntil = Math.max(rigs[target].extensionUntil, now + 2.6);
    // With only two visible aircraft, the first defeated BVR shot hands the
    // scenario over to the visual merge. Holding further missiles here makes
    // the transition readable instead of producing two symmetric FOX calls.
    mergeOnly = true;
    night.fireReadyAt = Infinity;
    aethel.fireReadyAt = Infinity;
    addEvent(`${rigs[target].label} // MISSILE DEFEATED // MERGE`);
  }
}

function resolveProjectile(shot: Projectile, now: number, hit: boolean) {
  const target = rigs[shot.target];
  target.incoming = Math.max(0, target.incoming - 1);
  const impactPosition = hit ? target.position.clone() : shot.position.clone();
  createBurst(impactPosition, shot.color, now, hit, shot.target);
  physicsWorld?.removeRigidBody(shot.body);
  fxLayer.remove(shot.group);
  shot.line.geometry.dispose();
  shot.line.material.dispose();
  shot.head.geometry.dispose();
  shot.head.material.dispose();
}

function guideProjectiles(now: number) {
  for (const shot of projectiles) {
    const target = rigs[shot.target];
    const translation = shot.body.translation();
    const velocityState = shot.body.linvel();
    const position = new THREE.Vector3(translation.x, translation.y, translation.z);
    const velocity = new THREE.Vector3(velocityState.x, velocityState.y, velocityState.z);
    const speedWorld = velocity.length();
    const forward = speedWorld > 0.01 ? velocity.clone().normalize() : target.position.clone().sub(position).normalize();
    const distance = position.distanceTo(target.position);
    const targetDirection = target.position.clone().sub(position);
    const seekerBearing = targetDirection.lengthSq() > 0.001
      ? forward.angleTo(targetDirection.normalize())
      : Math.PI;
    const seekerCanSee = seekerBearing <= shot.seekerFovRad && distance < 720;
    if (seekerCanSee) {
      shot.seekerLock = Math.min(1, shot.seekerLock + PHYSICS_DT * 1.8);
      shot.lostTrackAt = now;
      const timeToGo = THREE.MathUtils.clamp(distance / Math.max(speedWorld, 1), 0.12, 1.8);
      shot.targetPoint.copy(target.position).addScaledVector(target.velocity, timeToGo);
    } else {
      shot.seekerLock = Math.max(0, shot.seekerLock - PHYSICS_DT * 0.9);
    }
    const aimPoint = shot.targetPoint.clone();
    const desired = aimPoint.sub(position).normalize();
    const lateral = desired.sub(forward.clone().multiplyScalar(desired.dot(forward)));
    const lateralMagnitude = lateral.length();
    const lateralDirection = lateralMagnitude > 0.01 ? lateral.normalize() : forward.clone();
    const currentSpeedMps = metersPerSecondFromWorldVelocity(speedWorld);
    const seekerFactor = shot.seekerLock > 0.2 ? 1 : 0.28;
    const lateralDemand = THREE.MathUtils.clamp(lateralMagnitude * 2.6 * seekerFactor, 0, 1);
    const lateralAcceleration = lateralDirection.multiplyScalar(shot.guidanceAcceleration * lateralDemand);
    const burnAcceleration = now < shot.burnoutAt ? forward.multiplyScalar(19 * 9.81) : new THREE.Vector3();
    const speedCorrection = forward.multiplyScalar(
      THREE.MathUtils.clamp((shot.maxSpeed - currentSpeedMps) * 2.2, -18 * 9.81, 10 * 9.81),
    );
    const acceleration = lateralAcceleration.add(burnAcceleration).add(speedCorrection);
    shot.body.addForce(worldVector(forceFromNewtons(acceleration.multiplyScalar(MISSILE_MASS_KG))), true);
  }
}

function updateProjectiles(now: number, delta: number) {
  for (let i = projectiles.length - 1; i >= 0; i -= 1) {
    const shot = projectiles[i];
    const target = rigs[shot.target];
    const translation = shot.body.translation();
    const velocity = shot.body.linvel();
    shot.position.set(translation.x, translation.y, translation.z);
    shot.velocity.set(velocity.x, velocity.y, velocity.z);
    shot.line.geometry.setFromPoints([shot.start, shot.position]);
    shot.head.position.copy(shot.position);
    const age = now - shot.born;
    const closeEnough = physicsWorld && target.collider
      ? physicsWorld.intersectionPair(shot.collider, target.collider)
      : shot.position.distanceTo(target.position) < 6.5;
    const proximityFuse = shot.position.distanceTo(target.position) < 6.5;
    const expired = age >= shot.maxLife || shot.position.distanceTo(shot.start) > 620;
    if (closeEnough || proximityFuse || expired) {
      resolveProjectile(shot, now, closeEnough || proximityFuse);
      projectiles.splice(i, 1);
    }
  }
}

function updateBursts(now: number, delta: number) {
  for (let i = bursts.length - 1; i >= 0; i -= 1) {
    const burst = bursts[i];
    const progress = (now - burst.born) / burst.life;
    if (progress >= 1) {
      fxLayer.remove(burst.group);
      burst.particles.forEach(({ mesh }) => {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      });
      burst.ring.geometry.dispose();
      burst.ring.material.dispose();
      burst.flash.geometry.dispose();
      burst.flash.material.dispose();
      bursts.splice(i, 1);
      continue;
    }
    burst.particles.forEach(({ mesh, velocity, scale }) => {
      mesh.position.addScaledVector(velocity, delta);
      mesh.scale.setScalar(scale * (1 - progress * 0.55));
      (mesh.material as THREE.MeshBasicMaterial).opacity = 1 - progress;
    });
    burst.ring.scale.setScalar(0.5 + progress * 3.4);
    burst.ring.rotation.z += delta * 2.4;
    burst.ring.lookAt(camera.position);
    burst.ring.material.opacity = (1 - progress) * 0.85;
    burst.flash.scale.setScalar(1.6 - progress * 1.25);
    burst.flash.material.opacity = (1 - progress) * 0.78;
  }
}

function updateLocks(now: number) {
  for (let i = locks.length - 1; i >= 0; i -= 1) {
    const lock = locks[i];
    const progress = (now - lock.born) / lock.life;
    if (progress >= 1) {
      fxLayer.remove(lock.mesh);
      lock.mesh.geometry.dispose();
      lock.mesh.material.dispose();
      locks.splice(i, 1);
      continue;
    }
    lock.mesh.scale.setScalar(1 + Math.sin(progress * Math.PI) * 0.28);
    (lock.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - progress) * 0.62;
    lock.mesh.rotation.x += 0.02;
    lock.mesh.rotation.y += 0.035;
  }
}

function updateAtmosphere(delta: number) {
  atmosphericStreaks.forEach((line) => {
    line.position.z += delta * Number(line.userData.speed ?? 8);
    if (line.position.z > 300) line.position.z = -300;
  });
}

function maybeFire(delta: number) {
  if (missionOutcome !== 'ACTIVE' || mergeOnly) return;
  const shooter = rigs[fireAuthority];
  const target = fireAuthority === 'night' ? aethel : night;
  if (
    shooter.missilesRemaining <= 0
    || shooter.missileCooldown > 0
    || simTime < shooter.fireReadyAt
    || trackQualityRank(shooter.track.quality) < 3
    || roeStatus !== 'WEAPONS FREE'
    || !['COMMIT', 'REATTACK', 'ENGAGED'].includes(shooter.tacticalState)
  ) return;

  const toTrack = shooter.track.position.clone().sub(shooter.position);
  const range = toTrack.length();
  if (range < 0.01) return;
  const lineDirection = toTrack.normalize();
  const seekerBearing = shooter.forward.dot(lineDirection);
  const targetAspect = target.forward.dot(lineDirection.clone().negate());
  const closing = -target.velocity.clone().sub(shooter.velocity).dot(lineDirection);
  const withinEnvelope = range >= MISSILE_MIN_RANGE_WORLD && range <= MISSILE_MAX_RANGE_WORLD;
  const cone = seekerBearing > Math.cos(THREE.MathUtils.degToRad(36));
  const targetNotOpeningTooFast = closing > -120;
  const quality = THREE.MathUtils.clamp(
    (seekerBearing - 0.35) * 0.9
      + shooter.track.confidence * 0.35
      + (targetAspect + 1) * 0.08
      + THREE.MathUtils.clamp(closing / 600, -0.1, 0.18),
    0,
    1,
  );
  const validWeaponSolution = withinEnvelope && cone && targetNotOpeningTooFast && quality > 0.58;
  if (validWeaponSolution) {
    shooter.lockProgress = Math.min(MISSILE_LOCK_TIME, shooter.lockProgress + delta * (0.35 + quality * 0.75));
    if (shooter.lockProgress >= MISSILE_LOCK_TIME && !shooter.lockNotified) {
      shooter.lockNotified = true;
      shooter.lockProgress = MISSILE_LOCK_TIME;
      addEvent(`${shooter.label} // WEZ // ${Math.round(range * WORLD_UNIT_METERS)} M`, true);
    }
    if (shooter.lockProgress >= MISSILE_LOCK_TIME) {
      createShot(shooter, target, simTime);
      shooter.lockProgress = 0;
      shooter.lockNotified = false;
    }
  } else {
    shooter.lockProgress = Math.max(0, shooter.lockProgress - delta * 1.4);
    if (shooter.lockProgress < 0.18) shooter.lockNotified = false;
  }
}

function stepPhysics() {
  if (!physicsWorld) return;
  simTime += PHYSICS_DT;
  updateSensors(PHYSICS_DT);
  updateTacticalDoctrine();
  updateFlight(night, aethel, simTime, PHYSICS_DT);
  updateFlight(aethel, night, simTime, PHYSICS_DT);
  maybeFire(PHYSICS_DT);
  guideProjectiles(simTime);
  physicsWorld.step();
  syncFighterFromPhysics(night, PHYSICS_DT);
  syncFighterFromPhysics(aethel, PHYSICS_DT);
  updateProjectiles(simTime, PHYSICS_DT);
  updateBursts(simTime, PHYSICS_DT);
  updateLocks(simTime);
  updatePhaseEvents();
}

function advanceSimulation(realDelta: number) {
  physicsAccumulator += THREE.MathUtils.clamp(realDelta, 0, 0.25);
  let steps = 0;
  while (physicsAccumulator >= PHYSICS_DT && steps < MAX_PHYSICS_STEPS_PER_FRAME) {
    if (simTime >= CYCLE_DURATION - PHYSICS_DT * 0.5) {
      resetSimulation();
      physicsAccumulator = 0;
      break;
    }
    stepPhysics();
    physicsAccumulator -= PHYSICS_DT;
    steps += 1;
  }
}

function updateCamera(time: number, delta: number) {
  const center = night.position.clone().add(aethel.position).multiplyScalar(0.5);
  const range = night.position.distanceTo(aethel.position);
  const separation = aethel.position.clone().sub(night.position);
  const focusRig = rigs[fireAuthority].health > 0 ? rigs[fireAuthority] : (fireAuthority === 'night' ? aethel : night);
  const defensiveRig = night.incoming > 0 ? night : aethel.incoming > 0 ? aethel : focusRig;
  const introRig = simTime < 1.2 ? night : aethel;
  const cinematicIntro = simTime < 2.4 && missionOutcome === 'ACTIVE';
  const povId = !cinematicIntro && missionOutcome === 'ACTIVE'
    ? POV_SEGMENTS.find(({ start, end }) => simTime >= start && simTime < end)?.id ?? null
    : null;
  const povRig = povId ? rigs[povId] : null;
  const portrait = window.innerWidth / Math.max(1, window.innerHeight) < 0.9;
  const closeFight = range <= MERGE_RANGE_WORLD || missionPhase === 'WVR DOGFIGHT';
  const defensiveCinematic = missionPhase === 'DEFENSIVE BREAK' && range <= 110;
  const targetFov = portrait ? 72 : (povRig ? 46 : (cinematicIntro ? 38 : (closeFight || defensiveCinematic ? 44 : 52)));
  night.model.visible = !povRig || povRig.id !== 'night';
  aethel.model.visible = !povRig || povRig.id !== 'aethel';
  if (Math.abs(camera.fov - targetFov) > 0.01) {
    camera.fov = targetFov;
    camera.updateProjectionMatrix();
  }

  // BVR keeps the tactical picture readable. Once the fight reaches the merge,
  // the camera follows the engaged fighter and lets the bandit cross the frame
  // instead of continuously fitting both aircraft and hiding their motion.
  const candidateSide = new THREE.Vector3().crossVectors(separation, UP);
  if (candidateSide.lengthSq() >= 0.01) {
    candidateSide.normalize();
    // The camera may orbit, but it must never choose the opposite hemisphere
    // in one update when the target crosses the sightline.
    if (candidateSide.dot(cameraViewDirection) < 0) candidateSide.negate();
    cameraViewDirection.lerp(candidateSide, Math.min(1, Math.max(delta, 1 / 60) * 2.4)).normalize();
  }
  const viewDirection = cameraViewDirection.clone();
  const aspect = window.innerWidth / Math.max(1, window.innerHeight);
  const horizontalHalfFov = Math.atan(Math.tan(THREE.MathUtils.degToRad(targetFov * 0.5)) * aspect);
  const fitDistance = range / Math.max(0.2, 2 * Math.tan(horizontalHalfFov)) * 1.18 + 20;
  // A defensive break is often still BVR. It needs a tactical wide shot;
  // only the actual merge/WVR phases use the close chase framing. Once the
  // missile is inside the cinematic range, follow the defending aircraft so
  // the break/jink and the seeker path remain visible instead of becoming
  // sub-pixel marks in a kilometer-scale two-ship fit.
  const tacticalBothFrame = !cinematicIntro && !povRig && (closeFight || (missionPhase === 'DEFENSIVE BREAK' && !defensiveCinematic) || missionOutcome !== 'ACTIVE');
  const completedMission = missionOutcome !== 'ACTIVE';
  // During the merge the midpoint is the only stable framing anchor. A
  // fighter-biased focus looks dramatic until the aircraft cross, then the
  // defender can leave the frame even though the range is still WVR.
  const closeFitDistance = range / Math.max(0.2, 2 * Math.tan(horizontalHalfFov)) * 1.25 + 18;
  const defensiveFitDistance = range / Math.max(0.2, 2 * Math.tan(horizontalHalfFov)) * 0.75 + 16;
  const distance = cinematicIntro
    ? (portrait ? 22 : 14)
    : completedMission
      ? (portrait ? 64 : 54)
    : closeFight
      ? THREE.MathUtils.clamp(closeFitDistance, 28, 150)
      : defensiveCinematic
        ? THREE.MathUtils.clamp(defensiveFitDistance, 28, 86)
      : Math.max(portrait ? 155 : 135, fitDistance);
  const focus = tacticalBothFrame
    ? completedMission
      ? focusRig.position
      : center
    : cinematicIntro
      ? introRig.position
    : defensiveCinematic
      ? defensiveRig.position
    : center.clone().lerp(focusRig.position, 0.2);
  const nextCameraMode = povRig
    ? `POV ${povRig.id === 'night' ? 'NIGHT//VECTOR' : 'AETHEL-01'}`
    : cinematicIntro
      ? `INTRO ${introRig.id.toUpperCase()}`
      : completedMission
        ? 'POST SEPARATION'
        : defensiveCinematic
          ? 'DEFENSIVE CINEMATIC'
          : closeFight
            ? 'WVR BOTH'
            : 'TACTICAL BOTH';
  let desired: THREE.Vector3;
  let cameraLookAt: THREE.Vector3;
  if (povRig) {
    const targetRig = povRig.id === 'night' ? aethel : night;
    const rigUp = UP.clone().applyQuaternion(povRig.frame.quaternion).normalize();
    const rigForward = povRig.forward.clone().normalize();
    const targetDirection = targetRig.position.clone().sub(povRig.position).normalize();
    const targetBias = rigForward.dot(targetDirection) > 0.3 ? 0.66 : 0.94;
    const lookDirection = rigForward.clone().lerp(targetDirection, targetBias).normalize();
    // Both visual models are scaled to 0.18 in their fighter frames. Keep the
    // camera inside the actual canopy instead of using unscaled mesh offsets;
    // the latter placed the lens ahead of the nose and let the own airframe
    // occlude the POV during defensive turns.
    const cockpitForwardOffset = povRig.id === 'night' ? 0.38 : 0.18;
    const cockpitHeight = povRig.id === 'night' ? 0.12 : 0.09;
    const vibration = THREE.MathUtils.clamp(
      Math.max(0, povRig.loadFactorG - 1) * 0.012 + (povRig.incoming > 0 ? 0.035 : 0),
      0,
      0.12,
    );
    const cockpitPosition = povRig.position.clone()
      .addScaledVector(rigForward, cockpitForwardOffset)
      .addScaledVector(rigUp, cockpitHeight)
      .addScaledVector(rigUp, Math.sin(time * 34 + povRig.sideBias) * vibration * 0.7);
    desired = cockpitPosition;
    cameraLookAt = targetRig.position.clone().addScaledVector(rigUp, 0.35);
  } else {
    desired = focus.clone()
      .add(viewDirection.multiplyScalar(distance))
      .add(new THREE.Vector3(0, closeFight || cinematicIntro ? distance * 0.18 : distance * 0.1 + Math.sin(time * 0.28) * 2, 0));
    cameraLookAt = focus.clone().add(new THREE.Vector3(0, closeFight || defensiveCinematic || cinematicIntro ? 0.6 : 2.5, 0));
  }
  const cameraModeChanged = cameraMode !== nextCameraMode;
  cameraMode = nextCameraMode;
  if (cameraModeChanged) camera.position.copy(desired);
  else camera.position.lerp(desired, Math.min(1, Math.max(delta, 1 / 60) * 6));
  camera.lookAt(cameraLookAt);
}

function updateHud() {
  const range = night.position.distanceTo(aethel.position);
  const line = aethel.position.clone().sub(night.position).normalize();
  const relativeVelocity = aethel.velocity.clone().sub(night.velocity);
  const closing = -relativeVelocity.dot(line);
  const phase = phaseAt(range, closing, night.incoming + aethel.incoming);
  const phaseReadout = document.getElementById('phase-readout');
  const cameraReadout = document.getElementById('camera-readout');
  const povOverlay = document.getElementById('pov-overlay');
  const povLockLabel = document.getElementById('pov-lock-label');
  const rangeReadout = document.getElementById('range-readout');
  const closingReadout = document.getElementById('closing-readout');
  const missionTime = document.getElementById('mission-time');
  const missionState = document.getElementById('mission-state');
  const telemetry = document.getElementById('telemetry');
  const fireReadout = document.getElementById('fire-readout');
  const roeReadout = document.getElementById('roe-readout');
  const nightHealth = document.getElementById('night-health');
  const aethelHealth = document.getElementById('aethel-health');
  const nightState = document.getElementById('night-state');
  const aethelState = document.getElementById('aethel-state');
  const nightBar = document.getElementById('night-health-bar') as HTMLElement | null;
  const aethelBar = document.getElementById('aethel-health-bar') as HTMLElement | null;
  if (phaseReadout) phaseReadout.textContent = phase;
  if (cameraReadout) cameraReadout.textContent = cameraMode;
  const isPov = cameraMode.startsWith('POV ');
  povOverlay?.classList.toggle('is-active', isPov);
  if (povLockLabel) {
    povLockLabel.textContent = isPov
      ? `TARGET // ${cameraMode === 'POV NIGHT//VECTOR' ? 'AETHEL-01' : 'NIGHT//VECTOR'}`
      : 'TARGET // --';
  }
  if (rangeReadout) rangeReadout.textContent = `${(range / 100).toFixed(2)} KM`;
  if (closingReadout) closingReadout.textContent = `${closing >= 0 ? 'CLOSING' : 'OPENING'} ${Math.abs(closing * WORLD_UNIT_METERS).toFixed(0)} M/S`;
  if (missionTime) missionTime.textContent = formatTime(simTime);
  if (missionState) {
    missionState.textContent = paused
      ? 'SIMULATION PAUSED'
      : missionOutcome === 'KILL'
        ? 'KILL CONFIRMED // SEPARATE'
        : missionOutcome === 'SEPARATED'
          ? 'SEPARATED // REBUILD SA'
          : 'ENGAGEMENT ACTIVE';
  }
  const averageSpeedMps = metersPerSecondFromWorldVelocity((night.speed + aethel.speed) * 0.5);
  const averageMach = (night.mach + aethel.mach) * 0.5;
  const averageLoadFactor = Math.max(night.loadFactorG, aethel.loadFactorG);
  if (telemetry) {
    telemetry.textContent = `RANGE ${(range * WORLD_UNIT_METERS / 1000).toFixed(2)} KM // ${closing >= 0 ? 'CLOSING' : 'OPENING'} ${Math.abs(closing * WORLD_UNIT_METERS).toFixed(0)} M/S // SPEED ${Math.round(averageSpeedMps)} M/S // MACH ${averageMach.toFixed(2)} // LOAD ${averageLoadFactor.toFixed(1)}G`;
  }
  if (fireReadout) fireReadout.textContent = fireAuthority === 'night' ? 'NIGHT//VECTOR' : 'AETHEL-01';
  if (roeReadout) roeReadout.textContent = roeStatus;
  if (nightHealth) nightHealth.textContent = `${night.health}%`;
  if (aethelHealth) aethelHealth.textContent = `${aethel.health}%`;
  if (nightBar) nightBar.style.width = `${night.health}%`;
  if (aethelBar) aethelBar.style.width = `${aethel.health}%`;
  if (nightState) nightState.textContent = `${night.tacticalState} // ${trackQualityLabel(night.track.quality)}`;
  if (aethelState) aethelState.textContent = `${aethel.tacticalState} // ${trackQualityLabel(aethel.track.quality)}`;
  document.getElementById('night-card')?.classList.toggle('is-hit', night.hitFlash > 0.2);
  document.getElementById('aethel-card')?.classList.toggle('is-hit', aethel.hitFlash > 0.2);
}

function updatePhaseEvents() {
  const range = night.position.distanceTo(aethel.position);
  const line = aethel.position.clone().sub(night.position).normalize();
  const closing = -aethel.velocity.clone().sub(night.velocity).dot(line);
  const phase = phaseAt(range, closing, night.incoming + aethel.incoming);
  missionPhase = phase;
  if (phase !== lastPhase) {
    addEvent(`TACTICAL // ${phase}`, true);
    lastPhase = phase;
  }
}

function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
}

function renderScene(delta: number) {
  if (!paused) {
    advanceSimulation(delta);
    updateAtmosphere(delta);
  }

  rangeLine.geometry.setFromPoints([night.position, aethel.position]);
  updateCamera(simTime, Math.max(delta, 1 / 60));
  updateHud();
  renderer.render(scene, camera);
}

function animate(now: number) {
  requestAnimationFrame(animate);
  // Headless video capture can deliver fewer RAF callbacks than an interactive
  // browser. Keep the normal live view conservative, but let the capture-only
  // route preserve wall-clock combat pacing instead of stretching one pass.
  const rawDelta = Math.min((now - lastFrame) / 1000, captureMode ? 0.2 : 0.05);
  lastFrame = now;
  const delta = paused ? 0 : rawDelta;
  renderScene(delta);
}

function renderOfflineFrame(time: number) {
  const nextTime = THREE.MathUtils.clamp(time, 0, CYCLE_DURATION - 1 / 60);
  if (nextTime < simTime) resetSimulation();
  physicsAccumulator = 0;
  const requestedSteps = Math.max(0, Math.floor((nextTime - simTime) / PHYSICS_DT + 1e-6));
  const steps = Math.min(requestedSteps, MAX_OFFLINE_STEPS_PER_SEEK);
  for (let i = 0; i < steps; i += 1) stepPhysics();
  renderScene(0);
}

document.getElementById('pause-btn')?.addEventListener('click', () => {
  paused = !paused;
  const button = document.getElementById('pause-btn');
  if (button) button.textContent = paused ? '▶ RESUME' : 'Ⅱ PAUSE';
});

document.getElementById('reset-btn')?.addEventListener('click', () => {
  paused = false;
  const button = document.getElementById('pause-btn');
  if (button) button.textContent = 'Ⅱ PAUSE';
  resetSimulation();
});

window.addEventListener('keydown', (event) => {
  if (event.code === 'Space' || event.key.toLowerCase() === 'p') {
    event.preventDefault();
    paused = !paused;
    const button = document.getElementById('pause-btn');
    if (button) button.textContent = paused ? '▶ RESUME' : 'Ⅱ PAUSE';
  }
  if (event.key.toLowerCase() === 'r') resetSimulation();
});

window.addEventListener('resize', resize);

async function boot() {
  await initializePhysics();
  resetSimulation();
  resize();
  if (captureMode && offlineCaptureMode) {
    window.__combatCapture = { renderAt: renderOfflineFrame };
    renderOfflineFrame(0);
    window.__combatCaptureReady = true;
  } else {
    lastFrame = performance.now();
    requestAnimationFrame(animate);
  }
}

window.__combatDiagnostics = {
  snapshot: () => {
    const range = night.position.distanceTo(aethel.position);
    const line = aethel.position.clone().sub(night.position).normalize();
    const closing = -aethel.velocity.clone().sub(night.velocity).dot(line);
    camera.updateMatrixWorld();
    const projectToNdc = (position: THREE.Vector3) => position.clone().project(camera).toArray();
    const actualCameraDirection = camera.getWorldDirection(new THREE.Vector3());
    return {
      physicsEngine: physicsWorld ? 'rapier3d' : 'uninitialized',
      fixedStep: PHYSICS_DT,
      simTime,
      phase: phaseAt(range, closing, night.incoming + aethel.incoming),
      missionPhase,
      missionOutcome,
      fireAuthority,
      roeStatus,
      pidConfirmedAt,
      cameraMode,
      rangeMeters: range * WORLD_UNIT_METERS,
      closingMps: closing * WORLD_UNIT_METERS,
      camera: {
        position: camera.position.toArray(),
        viewDirection: cameraViewDirection.toArray(),
        actualDirection: actualCameraDirection.toArray(),
        nightNdc: projectToNdc(night.position),
        aethelNdc: projectToNdc(aethel.position),
      },
      fighters: Object.fromEntries(Object.values(rigs).map((rig) => [rig.id, {
        position: rig.position.toArray(),
        velocity: rig.velocity.toArray(),
        forward: rig.forward.toArray(),
        forwardAlignment: rig.velocity.lengthSq() > 0.01 ? rig.forward.dot(rig.velocity.clone().normalize()) : 0,
        altitudeMeters: rig.position.y * WORLD_UNIT_METERS,
        speedMps: metersPerSecondFromWorldVelocity(rig.speed),
        health: rig.health,
        incoming: rig.incoming,
        missilesRemaining: rig.missilesRemaining,
        missilesFired: rig.missilesFired,
        missilesHit: rig.missilesHit,
        missilesEvaded: rig.missilesEvaded,
        lockProgress: rig.lockProgress,
        tacticalState: rig.tacticalState,
        role: rig.role,
        stateSince: rig.stateSince,
        trackQuality: rig.track.quality,
        trackConfidence: rig.track.confidence,
        trackAge: rig.track.age,
        fireReadyAt: rig.fireReadyAt,
        specificEnergyM2S2: rig.specificEnergyM2S2,
        mach: rig.mach,
        dynamicPressurePa: rig.dynamicPressurePa,
        angleOfAttackDeg: rig.angleOfAttackDeg,
        loadFactorG: rig.loadFactorG,
        actualAccelerationMps2: rig.actualAccelerationMps2,
        targetDirection: rig.debugTargetDirection.toArray(),
        flightPathTarget: rig.debugFlightPathTarget.toArray(),
        maneuverAccelerationMps2: rig.debugManeuverAcceleration,
        bodyHandle: rig.body?.handle ?? null,
      }])),
      projectileCount: projectiles.length,
    };
  },
};

void boot().catch((error: unknown) => {
  console.error('Rapier initialization failed', error);
  document.getElementById('mission-state')?.replaceChildren(document.createTextNode('PHYSICS INIT FAILED'));
});
