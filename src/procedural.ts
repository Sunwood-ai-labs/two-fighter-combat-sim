import * as THREE from 'three';

/**
 * Procedural geometry creation helpers for complex sci-fi shapes.
 */

/**
 * Create a faceted stealth nose/fuselage wedge geometry.
 */
export function createStealthWedgeGeometry(
  length: number,
  widthRear: number,
  heightRear: number,
  widthFront: number,
  heightFront: number,
  chineFactor: number = 0.5
): THREE.BufferGeometry {
  // Vertices for a chined stealth polygonal wedge
  // Front: 0: top, 1: right-chine, 2: bottom, 3: left-chine
  // Rear:  4: top, 5: right-chine, 6: bottom, 7: left-chine
  const zF = length * 0.5;
  const zR = -length * 0.5;

  const wFrChine = widthFront * 0.5;
  const hFrTop = heightFront * chineFactor;
  const hFrBot = -heightFront * (1 - chineFactor);

  const wRrChine = widthRear * 0.5;
  const hRrTop = heightRear * chineFactor;
  const hRrBot = -heightRear * (1 - chineFactor);

  const vertices = new Float32Array([
    // Front apex / cap vertices
    0, hFrTop, zF,                // 0: Fr Top
    wFrChine, 0, zF,              // 1: Fr Right
    0, hFrBot, zF,                // 2: Fr Bottom
    -wFrChine, 0, zF,             // 3: Fr Left

    // Rear vertices
    0, hRrTop, zR,                // 4: Rr Top
    wRrChine, 0, zR,              // 5: Rr Right
    0, hRrBot, zR,                // 6: Rr Bottom
    -wRrChine, 0, zR,             // 7: Rr Left
  ]);

  const indices = [
    // Top-Right facet
    0, 1, 5,   0, 5, 4,
    // Bottom-Right facet
    1, 2, 6,   1, 6, 5,
    // Bottom-Left facet
    2, 3, 7,   2, 7, 6,
    // Top-Left facet
    3, 0, 4,   3, 4, 7,
    // Front cap (if widthFront > 0)
    0, 3, 2,   0, 2, 1,
    // Rear cap
    4, 5, 6,   4, 6, 7,
  ];

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

/**
 * Creates a faceted swept delta wing slab with chined leading and trailing edges.
 */
export function createSweptWingGeometry(
  rootChord: number,
  tipChord: number,
  span: number,
  sweepBack: number,
  thickness: number,
  isLeft: boolean = false
): THREE.BufferGeometry {
  const s = isLeft ? -1 : 1;
  const halfThick = thickness * 0.5;

  // Root profile (x = 0)
  const rLE_z = rootChord * 0.5;
  const rTE_z = -rootChord * 0.5;

  // Tip profile (x = span * s)
  const tipX = span * s;
  const tLE_z = rLE_z - sweepBack;
  const tTE_z = tLE_z - tipChord;

  // Vertices for a 3D airfoil wedge
  const vertices = new Float32Array([
    // Root upper & lower
    0, 0, rLE_z,               // 0: Root LE
    0, halfThick, 0,           // 1: Root Top
    0, 0, rTE_z,               // 2: Root TE
    0, -halfThick, 0,          // 3: Root Bot

    // Tip upper & lower
    tipX, 0, tLE_z,            // 4: Tip LE
    tipX, halfThick * 0.4, (tLE_z + tTE_z) * 0.5, // 5: Tip Top
    tipX, 0, tTE_z,            // 6: Tip TE
    tipX, -halfThick * 0.4, (tLE_z + tTE_z) * 0.5 // 7: Tip Bot
  ]);

  let indices: number[];
  if (!isLeft) {
    indices = [
      // Top Forward facet
      0, 1, 5,   0, 5, 4,
      // Top Aft facet
      1, 2, 6,   1, 6, 5,
      // Bot Aft facet
      2, 3, 7,   2, 7, 6,
      // Bot Forward facet
      3, 0, 4,   3, 4, 7,
      // Root cap
      0, 3, 2,   0, 2, 1,
      // Tip cap
      4, 5, 6,   4, 6, 7,
    ];
  } else {
    // Reverse winding for left wing
    indices = [
      0, 5, 1,   0, 4, 5,
      1, 6, 2,   1, 5, 6,
      2, 7, 3,   2, 6, 7,
      3, 4, 0,   3, 7, 4,
      0, 2, 3,   0, 1, 2,
      4, 6, 5,   4, 7, 6,
    ];
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

/**
 * Creates an edge highlight wireframe for any geometry.
 */
export function createEdgesWireframe(
  geometry: THREE.BufferGeometry,
  material: THREE.LineBasicMaterial,
  thresholdAngle: number = 24
): THREE.LineSegments {
  const edges = new THREE.EdgesGeometry(geometry, thresholdAngle);
  return new THREE.LineSegments(edges, material);
}

/**
 * Creates articulated engine nozzle petals around a cylinder.
 */
export function createEngineNozzleGroup(
  radius: number,
  length: number,
  petalCount: number,
  petalMat: THREE.Material,
  linerMat: THREE.Material
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'NozzleAssembly';

  // Inner ceramic liner ring
  const innerGeom = new THREE.CylinderGeometry(radius * 0.88, radius * 0.78, length, petalCount, 1, true);
  innerGeom.rotateX(Math.PI / 2);
  const innerMesh = new THREE.Mesh(innerGeom, linerMat);
  innerMesh.name = 'NozzleInnerLiner';
  group.add(innerMesh);

  // Outer convergent-divergent petals
  const petalWidth = (2 * Math.PI * radius) / petalCount * 0.95;
  const petalThick = 0.04;
  const petalGeom = new THREE.BoxGeometry(petalWidth, petalThick, length);

  for (let i = 0; i < petalCount; i++) {
    const angle = (i / petalCount) * Math.PI * 2;
    const petal = new THREE.Mesh(petalGeom, petalMat);
    petal.name = `NozzlePetal_${i}`;

    petal.position.set(
      Math.sin(angle) * (radius * 0.92),
      Math.cos(angle) * (radius * 0.92),
      0
    );
    petal.rotation.z = -angle;
    // Slight inward/outward angle
    petal.rotation.x = 0.08;
    group.add(petal);
  }

  return group;
}

/**
 * Creates a procedural railgun/laser weapon pod.
 */
export function createRailgunPodGeometry(length: number, width: number, height: number): THREE.Group {
  const pod = new THREE.Group();
  pod.name = 'RailgunUnit';

  // Main housing
  const housingGeom = new THREE.BoxGeometry(width, height, length);
  const housingMesh = new THREE.Mesh(housingGeom);
  housingMesh.name = 'Housing';
  pod.add(housingMesh);

  return pod;
}
