import * as THREE from 'three';

/**
 * Palette and Material definitions for NIGHT//VECTOR Cyberpunk Interceptor
 */
export interface ShipMaterials {
  hullDark: THREE.MeshStandardMaterial;
  hullGunmetal: THREE.MeshStandardMaterial;
  hullArmorAccent: THREE.MeshStandardMaterial;
  hullChassis: THREE.MeshStandardMaterial;
  cockpitGlass: THREE.MeshPhysicalMaterial;
  cockpitFrame: THREE.MeshStandardMaterial;
  cockpitHud: THREE.MeshBasicMaterial;
  neonCyan: THREE.MeshStandardMaterial;
  neonMagenta: THREE.MeshStandardMaterial;
  neonOrange: THREE.MeshStandardMaterial;
  neonWhite: THREE.MeshBasicMaterial;
  engineGlowCore: THREE.MeshBasicMaterial;
  enginePlumeOuter: THREE.MeshBasicMaterial;
  enginePlumeInner: THREE.MeshBasicMaterial;
  weaponSteel: THREE.MeshStandardMaterial;
  weaponCoil: THREE.MeshStandardMaterial;
  edgeGlowCyan: THREE.LineBasicMaterial;
  edgeGlowMagenta: THREE.LineBasicMaterial;
  panelLineDark: THREE.LineBasicMaterial;
  wireframeDebug: THREE.MeshBasicMaterial;
}

export function createShipMaterials(): ShipMaterials {
  // Dark stealth composite armor
  const hullDark = new THREE.MeshStandardMaterial({
    color: 0x18212d,
    roughness: 0.45,
    metalness: 0.85,
    flatShading: true,
  });

  // Gunmetal metallic plating
  const hullGunmetal = new THREE.MeshStandardMaterial({
    color: 0x242a35,
    roughness: 0.35,
    metalness: 0.9,
    flatShading: true,
  });

  // Matte reinforced carbon accent
  const hullArmorAccent = new THREE.MeshStandardMaterial({
    color: 0x111924,
    roughness: 0.65,
    metalness: 0.5,
    flatShading: true,
  });

  // Internal mechanical chassis
  const hullChassis = new THREE.MeshStandardMaterial({
    color: 0x1a1d24,
    roughness: 0.7,
    metalness: 0.95,
  });

  // Cockpit tinted stealth canopy
  const cockpitGlass = new THREE.MeshPhysicalMaterial({
    color: 0x021018,
    emissive: 0x003344,
    emissiveIntensity: 0.35,
    roughness: 0.1,
    metalness: 0.9,
    transparent: true,
    opacity: 0.82,
    transmission: 0.3,
    ior: 1.5,
    flatShading: true,
  });

  const cockpitFrame = new THREE.MeshStandardMaterial({
    color: 0x161920,
    roughness: 0.3,
    metalness: 0.95,
  });

  // Holographic pilot HUD plate
  const cockpitHud = new THREE.MeshBasicMaterial({
    color: 0x00f0ff,
    transparent: true,
    opacity: 0.65,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });

  // Neon light strips
  const neonCyan = new THREE.MeshStandardMaterial({
    color: 0x00f0ff,
    emissive: 0x00d2ff,
    emissiveIntensity: 2.2,
    roughness: 0.2,
    metalness: 0.1,
  });

  const neonMagenta = new THREE.MeshStandardMaterial({
    color: 0xff0055,
    emissive: 0xff0055,
    emissiveIntensity: 2.2,
    roughness: 0.2,
    metalness: 0.1,
  });

  const neonOrange = new THREE.MeshStandardMaterial({
    color: 0xff6600,
    emissive: 0xff6600,
    emissiveIntensity: 2.4,
    roughness: 0.2,
    metalness: 0.1,
  });

  const neonWhite = new THREE.MeshBasicMaterial({
    color: 0xffffff,
  });

  // Engine exhaust plumes
  const engineGlowCore = new THREE.MeshBasicMaterial({
    color: 0x88ffff,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
  });

  const enginePlumeOuter = new THREE.MeshBasicMaterial({
    color: 0xff4400,
    transparent: true,
    opacity: 0.65,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const enginePlumeInner = new THREE.MeshBasicMaterial({
    color: 0x00e5ff,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  // Weapon materials
  const weaponSteel = new THREE.MeshStandardMaterial({
    color: 0x1f232b,
    roughness: 0.25,
    metalness: 0.95,
  });

  const weaponCoil = new THREE.MeshStandardMaterial({
    color: 0x00f0ff,
    emissive: 0x00f0ff,
    emissiveIntensity: 1.8,
    roughness: 0.1,
    metalness: 0.2,
  });

  // Edge and panel lines
  const edgeGlowCyan = new THREE.LineBasicMaterial({
    color: 0x00f0ff,
    transparent: true,
    opacity: 0.85,
  });

  const edgeGlowMagenta = new THREE.LineBasicMaterial({
    color: 0xff0066,
    transparent: true,
    opacity: 0.85,
  });

  const panelLineDark = new THREE.LineBasicMaterial({
    color: 0x05070a,
    transparent: true,
    opacity: 0.5,
  });

  const wireframeDebug = new THREE.MeshBasicMaterial({
    color: 0x00f0ff,
    wireframe: true,
    transparent: true,
    opacity: 0.4,
  });

  return {
    hullDark,
    hullGunmetal,
    hullArmorAccent,
    hullChassis,
    cockpitGlass,
    cockpitFrame,
    cockpitHud,
    neonCyan,
    neonMagenta,
    neonOrange,
    neonWhite,
    engineGlowCore,
    enginePlumeOuter,
    enginePlumeInner,
    weaponSteel,
    weaponCoil,
    edgeGlowCyan,
    edgeGlowMagenta,
    panelLineDark,
    wireframeDebug,
  };
}
