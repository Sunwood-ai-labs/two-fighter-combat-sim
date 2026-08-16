import * as THREE from 'three';
import { ShipMaterials } from './materials';
import {
  createStealthWedgeGeometry,
  createSweptWingGeometry,
  createEdgesWireframe,
  createEngineNozzleGroup
} from './procedural';

export interface InterceptorFlightState {
  mode: 'hangar' | 'cruise' | 'boost';
  wireframe: boolean;
  weaponsArmed: boolean;
  overdrive: boolean;
}

export interface InterceptorController {
  root: THREE.Group;
  materials: ShipMaterials;
  update: (time: number, delta: number, state: InterceptorFlightState) => void;
  getPartList: () => { id: string; name: string; group: THREE.Object3D; desc: string }[];
  highlightPart: (name: string | null) => void;
}

/**
 * Creates the complete procedural Cyberpunk Interceptor "NIGHT//VECTOR".
 */
export function createCyberpunkInterceptor(materials: ShipMaterials): InterceptorController {
  const root = new THREE.Group();
  root.name = 'CyberpunkInterceptor';

  // Subgroup definitions
  const noseSection = createNoseSection(materials);
  const cockpit = createCockpit(materials);
  const fuselage = createFuselage(materials);
  const canardWings = createCanardWings(materials);
  const mainWings = createMainWings(materials);
  const verticalStabilizers = createVerticalStabilizers(materials);
  const engineNacelles = createEngineNacelles(materials);
  const weaponPods = createWeaponPods(materials);
  const neonLines = createNeonLines(materials);

  root.add(noseSection);
  root.add(cockpit);
  root.add(fuselage);
  root.add(canardWings);
  root.add(mainWings);
  root.add(verticalStabilizers);
  root.add(engineNacelles);
  root.add(weaponPods);
  root.add(neonLines);

  // References for dynamic animation
  const canardL = canardWings.getObjectByName('Canard_L') as THREE.Object3D | undefined;
  const canardR = canardWings.getObjectByName('Canard_R') as THREE.Object3D | undefined;
  const flameL = engineNacelles.getObjectByName('AfterburnerPlume_L') as THREE.Mesh | undefined;
  const flameR = engineNacelles.getObjectByName('AfterburnerPlume_R') as THREE.Mesh | undefined;
  const coreL = engineNacelles.getObjectByName('ShockDiamond_L') as THREE.Mesh | undefined;
  const coreR = engineNacelles.getObjectByName('ShockDiamond_R') as THREE.Mesh | undefined;
  const nozzleL = engineNacelles.getObjectByName('Nozzle_L') as THREE.Group | undefined;
  const nozzleR = engineNacelles.getObjectByName('Nozzle_R') as THREE.Group | undefined;

  // Railgun coil meshes for charge pulsation
  const coilMeshes: THREE.Mesh[] = [];
  weaponPods.traverse((child) => {
    if (child instanceof THREE.Mesh && child.name.includes('RailgunCoil')) {
      coilMeshes.push(child);
    }
  });

  const partList = [
    {
      id: 'NoseSection',
      name: 'Forward Radar & Sensor Nose',
      group: noseSection,
      desc: 'Active AESA Radar Cone, FLIR Optical Targeting Pods & High-Alpha Pitot Tubes'
    },
    {
      id: 'Cockpit',
      name: 'Pilot Cockpit & Cyber HUD',
      group: cockpit,
      desc: 'Reinforced Stealth Composite Canopy with Neural-Link Holographic Projection HUD'
    },
    {
      id: 'Fuselage',
      name: 'Main Stealth Fuselage & Inlets',
      group: fuselage,
      desc: 'Hexagonal Carbon-Chined Hull, Dual Supersonic S-Duct Inlets & Ventral Heat Sinks'
    },
    {
      id: 'CanardWings',
      name: 'All-Moving Foreplane Canards',
      group: canardWings,
      desc: 'High-G Articulated Pitch-Control Diamond Canards with Cyan Aerodynamic Trims'
    },
    {
      id: 'MainWings',
      name: 'Compound Delta Wings & Stabilizers',
      group: mainWings,
      desc: 'Swept-Back Cranked Delta Wings with Negative-Dihedral Stabilizing Winglets'
    },
    {
      id: 'VerticalStabilizers',
      name: 'Canted Twin V-Tail Fins',
      group: verticalStabilizers,
      desc: 'Twin Outward-Tilted Directional Stabilizers with Integrated Directional Rudders'
    },
    {
      id: 'EngineNacelles',
      name: 'Dual Plasma Afterburner Engines',
      group: engineNacelles,
      desc: 'Twin Helion-Core Plasma Turbines with 12-Petal 3D Thrust Vectoring Nozzles'
    },
    {
      id: 'WeaponPods',
      name: 'Heavy Railgun & Plasma Pods',
      group: weaponPods,
      desc: 'Twin Under-Wing Linear Accelerator Railguns & Wingtip High-Energy Particle Disruptors'
    },
    {
      id: 'NeonLines',
      name: 'Cybernetic Energy Conduits & HUD Lines',
      group: neonLines,
      desc: 'Superconducting Optical Bus Channels & High-Contrast Airframe Edge Outlines'
    }
  ];

  let currentHighlightedPart: THREE.Object3D | null = null;
  const originalScales = new Map<THREE.Object3D, THREE.Vector3>();

  const highlightPart = (name: string | null) => {
    if (currentHighlightedPart) {
      const orig = originalScales.get(currentHighlightedPart) || new THREE.Vector3(1, 1, 1);
      currentHighlightedPart.scale.copy(orig);
      currentHighlightedPart = null;
    }
    if (name) {
      const target = root.getObjectByName(name);
      if (target) {
        currentHighlightedPart = target;
        if (!originalScales.has(target)) {
          originalScales.set(target, target.scale.clone());
        }
        target.scale.set(1.04, 1.04, 1.04);
      }
    }
  };

  const update = (time: number, _delta: number, state: InterceptorFlightState) => {
    // 1. Idle / Flight Bobbing
    let bobSpeed = 1.8;
    let bobAmp = 0.08;
    let rollAmp = 0.025;

    if (state.mode === 'cruise') {
      bobSpeed = 3.2;
      bobAmp = 0.15;
      rollAmp = 0.06;
    } else if (state.mode === 'boost') {
      bobSpeed = 6.0;
      bobAmp = 0.05;
      rollAmp = 0.015;
    }

    root.position.y = 2.4 + Math.sin(time * bobSpeed) * bobAmp;
    root.rotation.z = Math.sin(time * (bobSpeed * 0.7)) * rollAmp;
    root.rotation.x = Math.cos(time * (bobSpeed * 0.5)) * (rollAmp * 0.6);

    // 2. Canard Dynamic Micro-Deflection
    if (canardL && canardR) {
      const canardPitch = Math.sin(time * 2.5) * 0.08 + (state.mode === 'boost' ? -0.1 : 0);
      canardL.rotation.x = canardPitch;
      canardR.rotation.x = canardPitch;
    }

    // 3. Engine Plume & Afterburner Simulation
    let thrustScale = 1.0;
    let pulseJitter = Math.sin(time * 45) * 0.05 + Math.cos(time * 78) * 0.03;

    if (state.mode === 'hangar') {
      thrustScale = 0.5 + Math.sin(time * 3) * 0.1;
      materials.enginePlumeOuter.opacity = 0.35 + Math.sin(time * 6) * 0.08;
      materials.enginePlumeInner.opacity = 0.5 + Math.sin(time * 8) * 0.1;
    } else if (state.mode === 'cruise') {
      thrustScale = 1.2 + pulseJitter;
      materials.enginePlumeOuter.opacity = 0.75 + Math.sin(time * 25) * 0.15;
      materials.enginePlumeInner.opacity = 0.9 + Math.cos(time * 30) * 0.1;
    } else if (state.mode === 'boost') {
      thrustScale = 2.4 + pulseJitter * 2.0;
      materials.enginePlumeOuter.opacity = 0.95;
      materials.enginePlumeInner.opacity = 1.0;
    }

    if (flameL && flameR) {
      flameL.scale.set(1.0 + pulseJitter * 0.2, 1.0 + pulseJitter * 0.2, thrustScale);
      flameR.scale.set(1.0 + pulseJitter * 0.2, 1.0 + pulseJitter * 0.2, thrustScale);
    }

    if (coreL && coreR) {
      const coreScale = thrustScale * 0.75;
      coreL.scale.set(1.0 + pulseJitter * 0.3, 1.0 + pulseJitter * 0.3, coreScale);
      coreR.scale.set(1.0 + pulseJitter * 0.3, 1.0 + pulseJitter * 0.3, coreScale);
    }

    // 4. Thrust Vectoring Nozzle subtle contraction
    if (nozzleL && nozzleR) {
      const nozzleSqueeze = 1.0 + (state.mode === 'boost' ? -0.06 : Math.sin(time * 2) * 0.03);
      nozzleL.scale.set(nozzleSqueeze, nozzleSqueeze, 1.0);
      nozzleR.scale.set(nozzleSqueeze, nozzleSqueeze, 1.0);
    }

    // 5. Neon Lighting Pulse & Cyber Glow
    const deterministicFlash = Math.sin(time * 17.0) > 0.985 ? 0.4 : 0;
    const neonPulse = 0.85 + Math.sin(time * 4) * 0.15 + deterministicFlash;
    const overdriveMult = state.overdrive ? 1.8 : 1.0;

    materials.neonCyan.emissiveIntensity = 2.2 * neonPulse * overdriveMult;
    materials.neonMagenta.emissiveIntensity = 2.2 * (0.8 + Math.cos(time * 3.5) * 0.2) * overdriveMult;
    materials.neonOrange.emissiveIntensity = 2.4 * (0.9 + Math.sin(time * 5) * 0.1) * overdriveMult;

    // 6. Weapon Pod Railgun Charging Pulse
    const coilIntensity = state.weaponsArmed
      ? 2.5 + Math.sin(time * 12) * 1.2 + Math.cos(time * 24) * 0.5
      : 0.4 + Math.sin(time * 1.5) * 0.2;
    materials.weaponCoil.emissiveIntensity = coilIntensity;
  };

  return {
    root,
    materials,
    update,
    getPartList: () => partList,
    highlightPart,
  };
}

/**
 * 1. NOSE SECTION (Radome, Forward Sensors, Pitot spikes)
 */
function createNoseSection(materials: ShipMaterials): THREE.Group {
  const group = new THREE.Group();
  group.name = 'NoseSection';

  // Faceted stealth radome nose cone (Apex at z = 7.2, base at z = 3.6)
  const radomeGeom = createStealthWedgeGeometry(3.6, 1.4, 0.65, 0.08, 0.04, 0.52);
  const radomeMesh = new THREE.Mesh(radomeGeom, materials.hullDark);
  radomeMesh.name = 'RadomeCone';
  radomeMesh.position.set(0, 0, 5.4);
  group.add(radomeMesh);
  group.add(createEdgesWireframe(radomeGeom, materials.edgeGlowCyan, 20).translateX(0).translateY(0).translateZ(5.4));

  // Forward Chine Strake extensions (connecting nose to cockpit)
  const chineGeom = new THREE.BoxGeometry(1.6, 0.08, 2.2);
  const chineMesh = new THREE.Mesh(chineGeom, materials.hullGunmetal);
  chineMesh.name = 'ForwardChineStrake';
  chineMesh.position.set(0, -0.02, 4.4);
  group.add(chineMesh);

  // Pitot sensor array (stealth needle probes)
  const pitotGeom = new THREE.CylinderGeometry(0.015, 0.03, 0.9, 6);
  pitotGeom.rotateX(Math.PI / 2);
  const pitotCenter = new THREE.Mesh(pitotGeom, materials.weaponSteel);
  pitotCenter.name = 'CentralPitotSpike';
  pitotCenter.position.set(0, 0.02, 7.55);
  group.add(pitotCenter);

  // Left & Right micro sensor probes
  [-0.35, 0.35].forEach((x, idx) => {
    const probe = new THREE.Mesh(pitotGeom, materials.weaponSteel);
    probe.name = `SensorProbe_${idx === 0 ? 'L' : 'R'}`;
    probe.position.set(x, -0.05, 6.2);
    probe.scale.set(0.6, 0.6, 0.6);
    group.add(probe);
  });

  // EOTS / FLIR Optical Sensor Facet (under nose)
  const eotsGeom = new THREE.ConeGeometry(0.22, 0.45, 6);
  eotsGeom.rotateX(-Math.PI / 3);
  const eotsMesh = new THREE.Mesh(eotsGeom, materials.neonCyan);
  eotsMesh.name = 'ElectroOpticalSensor_EOTS';
  eotsMesh.position.set(0, -0.22, 5.8);
  group.add(eotsMesh);

  // Nose neon trim strips
  const stripGeom = new THREE.BoxGeometry(0.04, 0.02, 1.8);
  [-0.6, 0.6].forEach((x, idx) => {
    const strip = new THREE.Mesh(stripGeom, idx === 0 ? materials.neonMagenta : materials.neonCyan);
    strip.name = `NoseNeonStrip_${idx === 0 ? 'L' : 'R'}`;
    strip.position.set(x, 0.02, 4.6);
    group.add(strip);
  });

  return group;
}

/**
 * 2. COCKPIT (Canopy, Frame, Pilot HUD, Console)
 */
function createCockpit(materials: ShipMaterials): THREE.Group {
  const group = new THREE.Group();
  group.name = 'Cockpit';

  // Faceted stealth canopy glass (slanted aerodynamic glass)
  const canopyGeom = createStealthWedgeGeometry(2.6, 0.95, 0.75, 0.45, 0.35, 0.85);
  const canopyMesh = new THREE.Mesh(canopyGeom, materials.cockpitGlass);
  canopyMesh.name = 'CockpitCanopy';
  canopyMesh.position.set(0, 0.42, 2.5);
  group.add(canopyMesh);
  group.add(createEdgesWireframe(canopyGeom, materials.edgeGlowCyan, 15).translateX(0).translateY(0.42).translateZ(2.5));

  // Canopy armored titanium frame / arch
  const archGeom = new THREE.TorusGeometry(0.48, 0.04, 4, 8, Math.PI);
  archGeom.rotateY(Math.PI / 2);
  const archMesh = new THREE.Mesh(archGeom, materials.cockpitFrame);
  archMesh.name = 'CockpitFrameArch';
  archMesh.position.set(0, 0.5, 2.4);
  archMesh.scale.set(0.9, 0.8, 1.2);
  group.add(archMesh);

  // Pilot Ejection Seat Headrest Silhouette
  const seatGeom = new THREE.BoxGeometry(0.35, 0.5, 0.3);
  const seatMesh = new THREE.Mesh(seatGeom, materials.hullDark);
  seatMesh.name = 'PilotSeat';
  seatMesh.position.set(0, 0.35, 2.1);
  group.add(seatMesh);

  // Holographic Cyber HUD Projection Screen
  const hudGeom = new THREE.PlaneGeometry(0.32, 0.22);
  const hudMesh = new THREE.Mesh(hudGeom, materials.cockpitHud);
  hudMesh.name = 'PilotHolographicHUD';
  hudMesh.position.set(0, 0.48, 2.95);
  hudMesh.rotation.x = -0.3;
  group.add(hudMesh);

  // Cockpit glow console emitter
  const consoleGeom = new THREE.BoxGeometry(0.4, 0.1, 0.6);
  const consoleMesh = new THREE.Mesh(consoleGeom, materials.neonCyan);
  consoleMesh.name = 'ConsoleDisplayGlow';
  consoleMesh.position.set(0, 0.28, 3.1);
  group.add(consoleMesh);

  return group;
}

/**
 * 3. FUSELAGE (Main Body, Dorsal Spine, Air Intakes, Turbine Fans, Ventral Bay)
 */
function createFuselage(materials: ShipMaterials): THREE.Group {
  const group = new THREE.Group();
  group.name = 'Fuselage';

  // Central stealth lifting body (z from 3.6 to -3.8)
  const bodyGeom = createStealthWedgeGeometry(7.4, 2.8, 1.1, 1.4, 0.65, 0.5);
  const bodyMesh = new THREE.Mesh(bodyGeom, materials.hullDark);
  bodyMesh.name = 'FuselageMainBody';
  bodyMesh.position.set(0, 0, -0.1);
  group.add(bodyMesh);
  group.add(createEdgesWireframe(bodyGeom, materials.panelLineDark, 20).translateX(0).translateY(0).translateZ(-0.1));

  // Dorsal armored spine with radiator heat sinks
  const spineGeom = new THREE.BoxGeometry(0.65, 0.35, 6.2);
  const spineMesh = new THREE.Mesh(spineGeom, materials.hullGunmetal);
  spineMesh.name = 'DorsalSpine';
  spineMesh.position.set(0, 0.55, -0.5);
  group.add(spineMesh);

  // Dorsal spine heat sink cooling vents (ribbed slats)
  for (let i = 0; i < 6; i++) {
    const ventGeom = new THREE.BoxGeometry(0.55, 0.04, 0.15);
    const ventMesh = new THREE.Mesh(ventGeom, materials.neonOrange);
    ventMesh.name = `DorsalVent_${i}`;
    ventMesh.position.set(0, 0.73, -1.8 + i * 0.5);
    group.add(ventMesh);
  }

  // Left & Right Supersonic Air Intake Scoops (Caret-shaped stealth inlets)
  [-1.25, 1.25].forEach((x, idx) => {
    const isLeft = idx === 0;
    const sideName = isLeft ? 'L' : 'R';

    const intakeGeom = createStealthWedgeGeometry(3.8, 0.9, 0.75, 0.75, 0.6, 0.45);
    const intakeMesh = new THREE.Mesh(intakeGeom, materials.hullGunmetal);
    intakeMesh.name = `AirIntake_${sideName}`;
    intakeMesh.position.set(x, -0.18, 0.5);
    group.add(intakeMesh);

    // Intake Lip Trim (Neon Glow)
    const lipGeom = new THREE.BoxGeometry(0.78, 0.04, 0.08);
    const lipMesh = new THREE.Mesh(lipGeom, isLeft ? materials.neonMagenta : materials.neonCyan);
    lipMesh.name = `IntakeLip_${sideName}`;
    lipMesh.position.set(x, 0.15, 2.35);
    group.add(lipMesh);

    // Internal Turbine Fan Blades (visible in dark intake)
    const fanGeom = new THREE.CylinderGeometry(0.3, 0.3, 0.05, 12);
    fanGeom.rotateX(Math.PI / 2);
    const fanMesh = new THREE.Mesh(fanGeom, materials.hullChassis);
    fanMesh.name = `IntakeTurbine_${sideName}`;
    fanMesh.position.set(x, -0.15, 0.2);
    group.add(fanMesh);
  });

  // Blended Chine Armor plates (Left & Right fuselage shoulders)
  const chineWingGeomL = createSweptWingGeometry(4.5, 1.2, 0.7, 1.2, 0.2, true);
  const chineWingL = new THREE.Mesh(chineWingGeomL, materials.hullArmorAccent);
  chineWingL.name = 'ChineArmor_L';
  chineWingL.position.set(-1.4, 0.05, 0.2);
  group.add(chineWingL);

  const chineWingGeomR = createSweptWingGeometry(4.5, 1.2, 0.7, 1.2, 0.2, false);
  const chineWingR = new THREE.Mesh(chineWingGeomR, materials.hullArmorAccent);
  chineWingR.name = 'ChineArmor_R';
  chineWingR.position.set(1.4, 0.05, 0.2);
  group.add(chineWingR);

  // Ventral Weapons Bay / Stealth conformal fuel belly
  const bellyGeom = new THREE.BoxGeometry(1.6, 0.28, 4.6);
  const bellyMesh = new THREE.Mesh(bellyGeom, materials.hullArmorAccent);
  bellyMesh.name = 'VentralBay';
  bellyMesh.position.set(0, -0.45, -0.3);
  group.add(bellyMesh);

  return group;
}

/**
 * 4. CANARD WINGS (All-moving forward pitch control planes)
 */
function createCanardWings(materials: ShipMaterials): THREE.Group {
  const group = new THREE.Group();
  group.name = 'CanardWings';

  // Left Canard
  const canardGeomL = createSweptWingGeometry(1.4, 0.35, 1.5, 0.75, 0.08, true);
  const canardL = new THREE.Mesh(canardGeomL, materials.hullGunmetal);
  canardL.name = 'Canard_L';
  canardL.position.set(-0.75, 0.15, 3.2);
  group.add(canardL);
  canardL.add(createEdgesWireframe(canardGeomL, materials.edgeGlowMagenta, 18));

  // Right Canard
  const canardGeomR = createSweptWingGeometry(1.4, 0.35, 1.5, 0.75, 0.08, false);
  const canardR = new THREE.Mesh(canardGeomR, materials.hullGunmetal);
  canardR.name = 'Canard_R';
  canardR.position.set(0.75, 0.15, 3.2);
  group.add(canardR);
  canardR.add(createEdgesWireframe(canardGeomR, materials.edgeGlowCyan, 18));

  // Canard Actuator Rotary Pivot Pods
  const pivotGeom = new THREE.CylinderGeometry(0.1, 0.1, 0.45, 8);
  pivotGeom.rotateZ(Math.PI / 2);

  const pivotL = new THREE.Mesh(pivotGeom, materials.weaponSteel);
  pivotL.name = 'CanardPivot_L';
  pivotL.position.set(-0.75, 0.15, 3.2);
  group.add(pivotL);

  const pivotR = new THREE.Mesh(pivotGeom, materials.weaponSteel);
  pivotR.name = 'CanardPivot_R';
  pivotR.position.set(0.75, 0.15, 3.2);
  group.add(pivotR);

  return group;
}

/**
 * 5. MAIN WINGS (Compound Cranked Delta Wings, Winglets, Elevons, Nav Lights)
 */
function createMainWings(materials: ShipMaterials): THREE.Group {
  const group = new THREE.Group();
  group.name = 'MainWings';

  const wingSpan = 4.4;
  const rootChord = 4.8;
  const tipChord = 1.1;
  const sweepBack = 3.2;

  // Left Main Wing Slab
  const wingGeomL = createSweptWingGeometry(rootChord, tipChord, wingSpan, sweepBack, 0.22, true);
  const wingL = new THREE.Mesh(wingGeomL, materials.hullDark);
  wingL.name = 'MainWing_L';
  wingL.position.set(-1.4, 0.05, -0.6);
  group.add(wingL);
  wingL.add(createEdgesWireframe(wingGeomL, materials.edgeGlowMagenta, 18));

  // Right Main Wing Slab
  const wingGeomR = createSweptWingGeometry(rootChord, tipChord, wingSpan, sweepBack, 0.22, false);
  const wingR = new THREE.Mesh(wingGeomR, materials.hullDark);
  wingR.name = 'MainWing_R';
  wingR.position.set(1.4, 0.05, -0.6);
  group.add(wingR);
  wingR.add(createEdgesWireframe(wingGeomR, materials.edgeGlowCyan, 18));

  // Left Wing Down-Cranked Winglet (Anhedral tip stabilizer)
  const wingletGeomL = createSweptWingGeometry(1.2, 0.45, 1.1, 0.7, 0.12, true);
  const wingletL = new THREE.Mesh(wingletGeomL, materials.hullGunmetal);
  wingletL.name = 'Winglet_L';
  wingletL.position.set(-1.4 - wingSpan, 0.02, -0.6 - sweepBack + tipChord * 0.4);
  wingletL.rotation.z = 0.55; // Downward tilt
  group.add(wingletL);

  // Right Wing Down-Cranked Winglet
  const wingletGeomR = createSweptWingGeometry(1.2, 0.45, 1.1, 0.7, 0.12, false);
  const wingletR = new THREE.Mesh(wingletGeomR, materials.hullGunmetal);
  wingletR.name = 'Winglet_R';
  wingletR.position.set(1.4 + wingSpan, 0.02, -0.6 - sweepBack + tipChord * 0.4);
  wingletR.rotation.z = -0.55; // Downward tilt
  group.add(wingletR);

  // Left & Right Leading Edge Slat Neon Accents
  const slatGeomL = new THREE.BoxGeometry(0.06, 0.06, 4.2);
  const slatMeshL = new THREE.Mesh(slatGeomL, materials.neonMagenta);
  slatMeshL.name = 'WingSlat_L';
  slatMeshL.position.set(-3.6, 0.08, -0.5);
  slatMeshL.rotation.y = 0.65;
  group.add(slatMeshL);

  const slatMeshR = new THREE.Mesh(slatGeomL, materials.neonCyan);
  slatMeshR.name = 'WingSlat_R';
  slatMeshR.position.set(3.6, 0.08, -0.5);
  slatMeshR.rotation.y = -0.65;
  group.add(slatMeshR);

  // Trailing-Edge Elevons / Flaperons
  [-3.2, 3.2].forEach((x, idx) => {
    const isLeft = idx === 0;
    const elevonGeom = new THREE.BoxGeometry(2.4, 0.08, 0.45);
    const elevonMesh = new THREE.Mesh(elevonGeom, materials.hullArmorAccent);
    elevonMesh.name = `Elevon_${isLeft ? 'L' : 'R'}`;
    elevonMesh.position.set(x, 0.02, -2.6);
    group.add(elevonMesh);
  });

  // Wingtip Navigation / Strobe Lights
  const navLightGeom = new THREE.SphereGeometry(0.08, 8, 8);

  const navLightPort = new THREE.Mesh(navLightGeom, materials.neonMagenta);
  navLightPort.name = 'NavLight_Port_Magenta';
  navLightPort.position.set(-1.4 - wingSpan - 0.9, -0.45, -3.2);
  group.add(navLightPort);

  const navLightStbd = new THREE.Mesh(navLightGeom, materials.neonCyan);
  navLightStbd.name = 'NavLight_Starboard_Cyan';
  navLightStbd.position.set(1.4 + wingSpan + 0.9, -0.45, -3.2);
  group.add(navLightStbd);

  return group;
}

/**
 * 6. VERTICAL STABILIZERS (Twin Outward-Canted V-Tails, Rudders, Antennae)
 */
function createVerticalStabilizers(materials: ShipMaterials): THREE.Group {
  const group = new THREE.Group();
  group.name = 'VerticalStabilizers';

  const finHeight = 2.4;
  const rootChord = 2.6;
  const tipChord = 0.7;
  const sweepBack = 1.6;

  // Left Canted Fin (angled outward 28 deg)
  const finGeomL = createSweptWingGeometry(rootChord, tipChord, finHeight, sweepBack, 0.14, false);
  const finL = new THREE.Mesh(finGeomL, materials.hullGunmetal);
  finL.name = 'VerticalFin_L';
  finL.rotation.z = Math.PI / 2 + 0.48; // Angled outward
  finL.position.set(-1.25, 0.35, -2.2);
  group.add(finL);
  finL.add(createEdgesWireframe(finGeomL, materials.edgeGlowMagenta, 18));

  // Right Canted Fin
  const finGeomR = createSweptWingGeometry(rootChord, tipChord, finHeight, sweepBack, 0.14, true);
  const finR = new THREE.Mesh(finGeomR, materials.hullGunmetal);
  finR.name = 'VerticalFin_R';
  finR.rotation.z = -Math.PI / 2 - 0.48; // Angled outward
  finR.position.set(1.25, 0.35, -2.2);
  group.add(finR);
  finR.add(createEdgesWireframe(finGeomR, materials.edgeGlowCyan, 18));

  // Canted Rudder Trim Lines (Neon strips on trailing edges)
  const finStripGeom = new THREE.BoxGeometry(0.04, 0.04, 1.8);

  const finStripL = new THREE.Mesh(finStripGeom, materials.neonMagenta);
  finStripL.name = 'FinNeonStrip_L';
  finStripL.position.set(-1.95, 1.45, -3.2);
  finStripL.rotation.z = 0.48;
  finStripL.rotation.x = -0.4;
  group.add(finStripL);

  const finStripR = new THREE.Mesh(finStripGeom, materials.neonCyan);
  finStripR.name = 'FinNeonStrip_R';
  finStripR.position.set(1.95, 1.45, -3.2);
  finStripR.rotation.z = -0.48;
  finStripR.rotation.x = -0.4;
  group.add(finStripR);

  // Dorsal High-Band Comms Antenna Array (between twin tails)
  const antennaGeom = new THREE.CylinderGeometry(0.02, 0.04, 1.2, 6);
  antennaGeom.rotateX(0.35);

  const antenna = new THREE.Mesh(antennaGeom, materials.weaponSteel);
  antenna.name = 'AntennaArray';
  antenna.position.set(0, 1.15, -2.6);
  group.add(antenna);

  return group;
}

/**
 * 7. ENGINE NACELLES (Twin Heavy Plasma Afterburners, 12-Petal Nozzles, Plumes)
 */
function createEngineNacelles(materials: ShipMaterials): THREE.Group {
  const group = new THREE.Group();
  group.name = 'EngineNacelles';

  // Nacelle Outer Shrouds
  [-1.0, 1.0].forEach((x, idx) => {
    const isLeft = idx === 0;
    const sideName = isLeft ? 'L' : 'R';

    // Nacelle aerodynamic fairing body
    const nacelleGeom = new THREE.CylinderGeometry(0.62, 0.68, 4.2, 8);
    nacelleGeom.rotateX(Math.PI / 2);
    const nacelleMesh = new THREE.Mesh(nacelleGeom, materials.hullGunmetal);
    nacelleMesh.name = `EngineNacelle_${sideName}`;
    nacelleMesh.position.set(x, 0.0, -2.5);
    group.add(nacelleMesh);

    // Afterburner convergent-divergent 12-petal nozzle assembly
    const nozzle = createEngineNozzleGroup(0.62, 0.8, 12, materials.weaponSteel, materials.neonOrange);
    nozzle.name = `Nozzle_${sideName}`;
    nozzle.position.set(x, 0.0, -4.7);
    group.add(nozzle);

    // Internal Turbine Flame Glow Ring
    const flameRingGeom = new THREE.TorusGeometry(0.48, 0.08, 8, 16);
    const flameRingMesh = new THREE.Mesh(flameRingGeom, materials.neonOrange);
    flameRingMesh.name = `FlameRing_${sideName}`;
    flameRingMesh.position.set(x, 0.0, -4.6);
    group.add(flameRingMesh);

    // Vectoring Thrust Paddles (Upper and Lower)
    const paddleGeom = new THREE.BoxGeometry(0.5, 0.08, 0.65);
    const paddleTop = new THREE.Mesh(paddleGeom, materials.hullArmorAccent);
    paddleTop.name = `VectorPaddle_Top_${sideName}`;
    paddleTop.position.set(x, 0.68, -4.9);
    paddleTop.rotation.x = -0.15;
    group.add(paddleTop);

    const paddleBot = new THREE.Mesh(paddleGeom, materials.hullArmorAccent);
    paddleBot.name = `VectorPaddle_Bot_${sideName}`;
    paddleBot.position.set(x, -0.68, -4.9);
    paddleBot.rotation.x = 0.15;
    group.add(paddleBot);

    // Outer Volumetric Plasma Flame Plume (Translucent Cone)
    const plumeGeom = new THREE.ConeGeometry(0.58, 4.8, 12, 1, true);
    plumeGeom.rotateX(-Math.PI / 2);
    plumeGeom.translate(0, 0, -2.4);
    const plumeMesh = new THREE.Mesh(plumeGeom, materials.enginePlumeOuter);
    plumeMesh.name = `AfterburnerPlume_${sideName}`;
    plumeMesh.position.set(x, 0.0, -5.1);
    group.add(plumeMesh);

    // Inner High-Energy Cyan Shock Diamond Core
    const coreGeom = new THREE.ConeGeometry(0.32, 3.2, 10, 1, true);
    coreGeom.rotateX(-Math.PI / 2);
    coreGeom.translate(0, 0, -1.6);
    const coreMesh = new THREE.Mesh(coreGeom, materials.enginePlumeInner);
    coreMesh.name = `ShockDiamond_${sideName}`;
    coreMesh.position.set(x, 0.0, -5.1);
    group.add(coreMesh);
  });

  return group;
}

/**
 * 8. WEAPON PODS (Under-wing Railgun Accelerators, Particle Disruptors)
 */
function createWeaponPods(materials: ShipMaterials): THREE.Group {
  const group = new THREE.Group();
  group.name = 'WeaponPods';

  // Under-wing Linear Accelerator Railguns
  [-2.6, 2.6].forEach((x, idx) => {
    const isLeft = idx === 0;
    const sideName = isLeft ? 'L' : 'R';

    // Pylon mount
    const pylonGeom = new THREE.BoxGeometry(0.12, 0.35, 2.2);
    const pylonMesh = new THREE.Mesh(pylonGeom, materials.hullDark);
    pylonMesh.name = `WeaponPylon_${sideName}`;
    pylonMesh.position.set(x, -0.15, -0.8);
    group.add(pylonMesh);

    // Main Railgun Body
    const podBodyGeom = new THREE.BoxGeometry(0.35, 0.35, 3.6);
    const podBody = new THREE.Mesh(podBodyGeom, materials.weaponSteel);
    podBody.name = `RailgunPod_${sideName}`;
    podBody.position.set(x, -0.38, -0.8);
    group.add(podBody);

    // Dual Forward Acceleration Muzzle Rails
    const railGeom = new THREE.BoxGeometry(0.06, 0.28, 1.4);

    const railUpper = new THREE.Mesh(railGeom, materials.hullArmorAccent);
    railUpper.name = `RailgunMuzzleTop_${sideName}`;
    railUpper.position.set(x, -0.38, 1.4);
    group.add(railUpper);

    // Capacitor Induction Coils (4 pulsing neon rings per pod)
    for (let c = 0; c < 4; c++) {
      const coilGeom = new THREE.TorusGeometry(0.24, 0.035, 6, 12);
      const coilMesh = new THREE.Mesh(coilGeom, materials.weaponCoil);
      coilMesh.name = `RailgunCoil_${sideName}_${c}`;
      coilMesh.position.set(x, -0.38, -1.6 + c * 0.7);
      group.add(coilMesh);
    }
  });

  // Wingtip High-Energy Particle Disruptors
  [-5.8, 5.8].forEach((x, idx) => {
    const isLeft = idx === 0;
    const sideName = isLeft ? 'L' : 'R';

    const podGeom = new THREE.CylinderGeometry(0.08, 0.12, 1.8, 6);
    podGeom.rotateX(Math.PI / 2);
    const podMesh = new THREE.Mesh(podGeom, materials.weaponSteel);
    podMesh.name = `Disruptor_${sideName}`;
    podMesh.position.set(x, -0.45, -2.8);
    group.add(podMesh);

    // Emitter Lens
    const lensGeom = new THREE.SphereGeometry(0.075, 8, 8);
    const lensMesh = new THREE.Mesh(lensGeom, isLeft ? materials.neonMagenta : materials.neonCyan);
    lensMesh.name = `DisruptorLens_${sideName}`;
    lensMesh.position.set(x, -0.45, -1.9);
    group.add(lensMesh);
  });

  return group;
}

/**
 * 9. NEON LINES & CYBERNETIC DECALS (Procedural glowing circuit lines)
 */
function createNeonLines(materials: ShipMaterials): THREE.Group {
  const group = new THREE.Group();
  group.name = 'NeonLines';

  // Fuselage Dorsal Neon Circuit Tracks (Left: Magenta, Right: Cyan)
  const linePointsL = [
    new THREE.Vector3(-0.4, 0.65, 3.0),
    new THREE.Vector3(-0.7, 0.60, 1.0),
    new THREE.Vector3(-0.6, 0.58, -1.5),
    new THREE.Vector3(-0.35, 0.58, -3.2),
  ];
  const geomL = new THREE.BufferGeometry().setFromPoints(linePointsL);
  const lineL = new THREE.Line(geomL, materials.edgeGlowMagenta);
  lineL.name = 'DorsalCircuit_L';
  group.add(lineL);

  const linePointsR = [
    new THREE.Vector3(0.4, 0.65, 3.0),
    new THREE.Vector3(0.7, 0.60, 1.0),
    new THREE.Vector3(0.6, 0.58, -1.5),
    new THREE.Vector3(0.35, 0.58, -3.2),
  ];
  const geomR = new THREE.BufferGeometry().setFromPoints(linePointsR);
  const lineR = new THREE.Line(geomR, materials.edgeGlowCyan);
  lineR.name = 'DorsalCircuit_R';
  group.add(lineR);

  // Chevron tactical markers on main wings
  [-2.8, 2.8].forEach((x, idx) => {
    const isLeft = idx === 0;
    const chevronGeom = new THREE.BoxGeometry(0.4, 0.02, 0.08);
    for (let c = 0; c < 3; c++) {
      const chevron = new THREE.Mesh(chevronGeom, isLeft ? materials.neonMagenta : materials.neonCyan);
      chevron.name = `WingChevron_${isLeft ? 'L' : 'R'}_${c}`;
      chevron.position.set(x, 0.16, -1.2 - c * 0.4);
      chevron.rotation.y = isLeft ? -0.4 : 0.4;
      group.add(chevron);
    }
  });

  return group;
}
