import * as THREE from 'three';

export interface SolarInterceptorMaterials {
  ceramicWhite: THREE.MeshStandardMaterial;
  ceramicSilver: THREE.MeshStandardMaterial;
  titaniumDark: THREE.MeshStandardMaterial;
  solarGold: THREE.MeshStandardMaterial;
  solarGoldTrim: THREE.MeshStandardMaterial;
  cyanCooling: THREE.MeshStandardMaterial;
  canopy: THREE.MeshPhysicalMaterial;
  engineCore: THREE.MeshBasicMaterial;
  enginePlume: THREE.MeshBasicMaterial;
  wireframe: THREE.MeshBasicMaterial;
}

export class SolarInterceptor {
  public group: THREE.Group;
  public materials: SolarInterceptorMaterials;
  
  // Animated parts
  private leftWingSegments: THREE.Group[] = [];
  private rightWingSegments: THREE.Group[] = [];
  private leftEnginePlume!: THREE.Mesh;
  private rightEnginePlume!: THREE.Mesh;
  private leftCanard!: THREE.Mesh;
  private rightCanard!: THREE.Mesh;
  private coolingFins: THREE.Mesh[] = [];
  private solarEdgeStrips: THREE.Mesh[] = [];

  constructor() {
    this.group = new THREE.Group();
    this.materials = this.initMaterials();
    this.buildFighter();
  }

  private initMaterials(): SolarInterceptorMaterials {
    const ceramicWhite = new THREE.MeshStandardMaterial({
      color: 0xf3f6fa,
      roughness: 0.18,
      metalness: 0.12,
      envMapIntensity: 1.2,
      shadowSide: THREE.DoubleSide
    });

    const ceramicSilver = new THREE.MeshStandardMaterial({
      color: 0xc8d2de,
      roughness: 0.28,
      metalness: 0.65,
      envMapIntensity: 1.5
    });

    const titaniumDark = new THREE.MeshStandardMaterial({
      color: 0x222a36,
      roughness: 0.45,
      metalness: 0.8
    });

    const solarGold = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      roughness: 0.15,
      metalness: 0.9,
      emissive: 0x92400e,
      emissiveIntensity: 0.35
    });

    const solarGoldTrim = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.2,
      metalness: 0.95,
      emissive: 0xb45309,
      emissiveIntensity: 0.2
    });

    const cyanCooling = new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      roughness: 0.25,
      metalness: 0.4,
      emissive: 0x0891b2,
      emissiveIntensity: 0.9
    });

    const canopy = new THREE.MeshPhysicalMaterial({
      color: 0xfef08a,
      roughness: 0.08,
      metalness: 0.1,
      transmission: 0.82,
      thickness: 0.6,
      transparent: true,
      opacity: 0.92,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      ior: 1.55
    });

    const engineCore = new THREE.MeshBasicMaterial({
      color: 0x67e8f9
    });

    const enginePlume = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });

    const wireframe = new THREE.MeshBasicMaterial({
      color: 0xeab308,
      wireframe: true,
      transparent: true,
      opacity: 0.6
    });

    return {
      ceramicWhite,
      ceramicSilver,
      titaniumDark,
      solarGold,
      solarGoldTrim,
      cyanCooling,
      canopy,
      engineCore,
      enginePlume,
      wireframe
    };
  }

  private registerMesh(mesh: THREE.Mesh, castShadow: boolean = true) {
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    return mesh;
  }

  private buildFighter() {
    this.buildFuselage();
    this.buildSpearNose();
    this.buildCanopy();
    this.buildSegmentedWings();
    this.buildTwinEngines();
    this.buildCoolingRadiators();
    this.buildStabilizers();
    this.buildPhotonSensors();
  }

  /**
   * 1. 胴体（中央メインボディ）
   */
  private buildFuselage() {
    const fuselageGroup = new THREE.Group();

    // 中央メイン胴体ブロック
    const mainBodyGeo = new THREE.BoxGeometry(1.8, 0.9, 6.2, 3, 2, 6);
    const pos = mainBodyGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i);
      const y = pos.getY(i);
      let x = pos.getX(i);

      const t = (z + 3.1) / 6.2;
      if (t > 0.5) {
        x *= 1.0 - (t - 0.5) * 0.7;
      }
      if (y > 0) {
        pos.setY(i, y * 0.85);
      }
      pos.setX(i, x);
    }
    mainBodyGeo.computeVertexNormals();

    const mainBody = new THREE.Mesh(mainBodyGeo, this.materials.ceramicWhite);
    mainBody.position.set(0, 0, 0);
    this.registerMesh(mainBody);
    fuselageGroup.add(mainBody);

    // 背部スパイン
    const spineGeo = new THREE.BoxGeometry(0.4, 0.35, 4.8);
    const spine = new THREE.Mesh(spineGeo, this.materials.solarGoldTrim);
    spine.position.set(0, 0.48, -0.2);
    this.registerMesh(spine);
    fuselageGroup.add(spine);

    // 胴体サイドインテーク
    for (const side of [-1, 1]) {
      const intakeHousingGeo = new THREE.BoxGeometry(0.65, 0.65, 3.2);
      const intakeHousing = new THREE.Mesh(intakeHousingGeo, this.materials.ceramicSilver);
      intakeHousing.position.set(side * 1.1, -0.05, 0.2);
      intakeHousing.rotation.z = side * 0.1;
      this.registerMesh(intakeHousing);
      fuselageGroup.add(intakeHousing);

      const intakeLipGeo = new THREE.BoxGeometry(0.55, 0.55, 0.4);
      const intakeLip = new THREE.Mesh(intakeLipGeo, this.materials.titaniumDark);
      intakeLip.position.set(side * 1.1, -0.05, 1.8);
      intakeLip.rotation.x = -0.2;
      this.registerMesh(intakeLip);
      fuselageGroup.add(intakeLip);

      const decalGeo = new THREE.BoxGeometry(0.04, 0.12, 3.0);
      const decal = new THREE.Mesh(decalGeo, this.materials.solarGold);
      decal.position.set(side * 1.44, 0.1, 0.2);
      fuselageGroup.add(decal);
    }

    // 胴体下部キール
    const ventralKeelGeo = new THREE.BoxGeometry(0.8, 0.4, 4.5);
    const ventralKeel = new THREE.Mesh(ventralKeelGeo, this.materials.ceramicSilver);
    ventralKeel.position.set(0, -0.45, -0.3);
    this.registerMesh(ventralKeel);
    fuselageGroup.add(ventralKeel);

    this.group.add(fuselageGroup);
  }

  /**
   * 2. 細い槍のようなノーズ（Spearhead Needle Nosecone）
   */
  private buildSpearNose() {
    const noseGroup = new THREE.Group();
    noseGroup.position.set(0, 0, 3.1);

    // メインノーズコーン
    const noseConeGeo = new THREE.ConeGeometry(0.65, 3.8, 6);
    noseConeGeo.rotateX(Math.PI * 0.5);
    const noseCone = new THREE.Mesh(noseConeGeo, this.materials.ceramicWhite);
    noseCone.position.set(0, 0.05, 1.9);
    this.registerMesh(noseCone);
    noseGroup.add(noseCone);

    // 先端ニードルロッド
    const needleGeo = new THREE.CylinderGeometry(0.04, 0.08, 2.2, 8);
    needleGeo.rotateX(Math.PI * 0.5);
    const needle = new THREE.Mesh(needleGeo, this.materials.solarGoldTrim);
    needle.position.set(0, 0.05, 4.2);
    this.registerMesh(needle);
    noseGroup.add(needle);

    // ニードル先端の発光フォトンチップ
    const tipGeo = new THREE.SphereGeometry(0.09, 8, 8);
    const tip = new THREE.Mesh(tipGeo, this.materials.cyanCooling);
    tip.position.set(0, 0.05, 5.3);
    noseGroup.add(tip);

    // ノーズ側面のソーラーコンセントレーターフィン
    for (const side of [-1, 1]) {
      const finGeo = new THREE.BufferGeometry();
      const vertices = new Float32Array([
        0, 0, 0,
        side * 0.5, -0.05, 1.2,
        0, 0, 2.4,
        0, 0, 0,
        0, 0, 2.4,
        side * 0.5, -0.05, 1.2
      ]);
      finGeo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
      finGeo.computeVertexNormals();
      const fin = new THREE.Mesh(finGeo, this.materials.solarGold);
      fin.position.set(side * 0.25, 0.05, 0.5);
      noseGroup.add(fin);
    }

    // 可動前翼カナード（左右）
    const canardGeo = new THREE.BufferGeometry();
    const canardVerts = new Float32Array([
      0, 0, 0.8,
      1.4, -0.05, -0.2,
      0, 0, -0.6,
      0, 0, 0.8,
      0, 0, -0.6,
      1.4, -0.05, -0.2
    ]);
    canardGeo.setAttribute('position', new THREE.BufferAttribute(canardVerts, 3));
    canardGeo.computeVertexNormals();

    this.leftCanard = new THREE.Mesh(canardGeo, this.materials.ceramicWhite);
    this.leftCanard.position.set(0.5, 0.1, 0.4);
    this.registerMesh(this.leftCanard);
    noseGroup.add(this.leftCanard);

    const rightCanardGeo = canardGeo.clone();
    rightCanardGeo.scale(-1, 1, 1);
    rightCanardGeo.computeVertexNormals();
    this.rightCanard = new THREE.Mesh(rightCanardGeo, this.materials.ceramicWhite);
    this.rightCanard.position.set(-0.5, 0.1, 0.4);
    this.registerMesh(this.rightCanard);
    noseGroup.add(this.rightCanard);

    this.group.add(noseGroup);
  }

  /**
   * 3. コクピットキャノピー
   */
  private buildCanopy() {
    const canopyGroup = new THREE.Group();

    // キャノピー外殻ガラス
    const canopyMeshGeo = new THREE.ConeGeometry(0.55, 2.4, 5);
    canopyMeshGeo.rotateX(Math.PI * 0.5);
    canopyMeshGeo.scale(1.0, 0.55, 1.0);
    const canopyMesh = new THREE.Mesh(canopyMeshGeo, this.materials.canopy);
    canopyMesh.position.set(0, 0.48, 1.1);
    canopyGroup.add(canopyMesh);

    // キャノピーフレーム
    const frameGeo = new THREE.TorusGeometry(0.5, 0.03, 6, 8, Math.PI);
    frameGeo.rotateX(-Math.PI * 0.5);
    const frame = new THREE.Mesh(frameGeo, this.materials.solarGoldTrim);
    frame.position.set(0, 0.46, 0.6);
    canopyGroup.add(frame);

    // コクピット内部の量子アビオニクスコア
    const coreGeo = new THREE.BoxGeometry(0.2, 0.15, 0.5);
    const core = new THREE.Mesh(coreGeo, this.materials.cyanCooling);
    core.position.set(0, 0.35, 1.0);
    canopyGroup.add(core);

    this.group.add(canopyGroup);
  }

  /**
   * 4. 分割式ソーラー・ウィング（Segmented Solar Wings）
   */
  private buildSegmentedWings() {
    const buildWingSide = (side: number): THREE.Group[] => {
      const segments: THREE.Group[] = [];

      // 根元セグメント
      const seg1 = new THREE.Group();
      seg1.position.set(side * 0.9, 0.05, 0.2);

      const rootBladeGeo = new THREE.BoxGeometry(2.0, 0.12, 2.6);
      const rootBlade = new THREE.Mesh(rootBladeGeo, this.materials.ceramicWhite);
      rootBlade.position.set(side * 1.0, 0, -0.4);
      rootBlade.rotation.y = -side * 0.18;
      rootBlade.rotation.z = side * 0.03;
      this.registerMesh(rootBlade);
      seg1.add(rootBlade);

      // 上面ソーラーセルパネル
      const rootSolarGeo = new THREE.PlaneGeometry(1.7, 2.2);
      rootSolarGeo.rotateX(-Math.PI * 0.5);
      const rootSolar = new THREE.Mesh(rootSolarGeo, this.materials.solarGold);
      rootSolar.position.set(side * 1.0, 0.065, -0.4);
      rootSolar.rotation.y = -side * 0.18;
      rootSolar.rotation.z = side * 0.03;
      seg1.add(rootSolar);

      // 下面ソーラーセルパネル
      const rootSolarBottom = rootSolar.clone();
      rootSolarBottom.rotation.x = Math.PI * 0.5;
      rootSolarBottom.position.y = -0.065;
      seg1.add(rootSolarBottom);

      // 前縁シアン冷却ストリップ
      const edgeStripGeo = new THREE.BoxGeometry(2.0, 0.05, 0.08);
      const edgeStrip = new THREE.Mesh(edgeStripGeo, this.materials.cyanCooling);
      edgeStrip.position.set(side * 1.0, 0, 0.8);
      edgeStrip.rotation.y = -side * 0.18;
      seg1.add(edgeStrip);
      this.solarEdgeStrips.push(edgeStrip);

      this.group.add(seg1);
      segments.push(seg1);

      // 中間セグメント
      const seg2 = new THREE.Group();
      seg2.position.set(side * 2.8, 0.08, -0.4);

      const midBladeGeo = new THREE.BoxGeometry(2.2, 0.09, 2.0);
      const midBlade = new THREE.Mesh(midBladeGeo, this.materials.ceramicSilver);
      midBlade.position.set(side * 1.0, 0, -0.3);
      midBlade.rotation.y = -side * 0.28;
      midBlade.rotation.z = side * 0.06;
      this.registerMesh(midBlade);
      seg2.add(midBlade);

      // 中間ソーラーパネル
      const midSolarGeo = new THREE.PlaneGeometry(1.9, 1.7);
      midSolarGeo.rotateX(-Math.PI * 0.5);
      const midSolar = new THREE.Mesh(midSolarGeo, this.materials.solarGold);
      midSolar.position.set(side * 1.0, 0.05, -0.3);
      midSolar.rotation.y = -side * 0.28;
      midSolar.rotation.z = side * 0.06;
      seg2.add(midSolar);

      // ヒンジコネクタジョイント
      const jointGeo = new THREE.CylinderGeometry(0.12, 0.12, 1.2, 8);
      jointGeo.rotateZ(Math.PI * 0.5);
      const joint = new THREE.Mesh(jointGeo, this.materials.titaniumDark);
      joint.position.set(0, 0, 0);
      seg2.add(joint);

      this.group.add(seg2);
      segments.push(seg2);

      // 外翼・翼端ブレードセグメント
      const seg3 = new THREE.Group();
      seg3.position.set(side * 4.8, 0.15, -1.0);

      const outerBladeGeo = new THREE.BufferGeometry();
      const outerVerts = new Float32Array([
        0, 0, 0.6,
        side * 1.6, 0.4, -0.8,
        0, 0, -1.4,
        0, 0, 0.6,
        0, 0, -1.4,
        side * 1.6, 0.4, -0.8
      ]);
      outerBladeGeo.setAttribute('position', new THREE.BufferAttribute(outerVerts, 3));
      outerBladeGeo.computeVertexNormals();

      const outerBlade = new THREE.Mesh(outerBladeGeo, this.materials.ceramicWhite);
      this.registerMesh(outerBlade);
      seg3.add(outerBlade);

      // ウィングレット
      const wingletGeo = new THREE.BoxGeometry(0.08, 0.9, 1.2);
      const winglet = new THREE.Mesh(wingletGeo, this.materials.solarGoldTrim);
      winglet.position.set(side * 1.6, 0.45, -0.8);
      winglet.rotation.z = -side * 0.35;
      winglet.rotation.y = -side * 0.2;
      this.registerMesh(winglet);
      seg3.add(winglet);

      // 翼端ソーラービーコン
      const beaconGeo = new THREE.SphereGeometry(0.07, 8, 8);
      const beacon = new THREE.Mesh(beaconGeo, this.materials.cyanCooling);
      beacon.position.set(side * 1.65, 0.9, -0.8);
      seg3.add(beacon);

      this.group.add(seg3);
      segments.push(seg3);

      return segments;
    };

    this.leftWingSegments = buildWingSide(1);
    this.rightWingSegments = buildWingSide(-1);
  }

  /**
   * 5. 双発イオンエンジン & ノズル
   */
  private buildTwinEngines() {
    const engineGroup = new THREE.Group();

    for (const side of [-1, 1]) {
      const podGroup = new THREE.Group();
      podGroup.position.set(side * 1.15, -0.05, -2.4);

      // エンジンメインナセル
      const nacelleGeo = new THREE.CylinderGeometry(0.48, 0.58, 3.4, 12);
      nacelleGeo.rotateX(Math.PI * 0.5);
      const nacelle = new THREE.Mesh(nacelleGeo, this.materials.ceramicWhite);
      nacelle.position.set(0, 0, 0);
      this.registerMesh(nacelle);
      podGroup.add(nacelle);

      // エンジン外装ゴールドストリップ
      const stripGeo = new THREE.TorusGeometry(0.52, 0.03, 6, 16);
      const strip = new THREE.Mesh(stripGeo, this.materials.solarGoldTrim);
      strip.position.set(0, 0, 0.4);
      podGroup.add(strip);

      const strip2 = strip.clone();
      strip2.position.set(0, 0, -0.6);
      podGroup.add(strip2);

      // エンジン排気ノズル
      const nozzleOuterGeo = new THREE.CylinderGeometry(0.55, 0.44, 0.8, 12, 1, true);
      nozzleOuterGeo.rotateX(Math.PI * 0.5);
      const nozzleOuter = new THREE.Mesh(nozzleOuterGeo, this.materials.titaniumDark);
      nozzleOuter.position.set(0, 0, -2.0);
      this.registerMesh(nozzleOuter);
      podGroup.add(nozzleOuter);

      // ノズル内側発光リング
      const nozzleGlowGeo = new THREE.TorusGeometry(0.42, 0.05, 8, 16);
      const nozzleGlow = new THREE.Mesh(nozzleGlowGeo, this.materials.cyanCooling);
      nozzleGlow.position.set(0, 0, -2.35);
      podGroup.add(nozzleGlow);

      // 内部イオンコア
      const ionCoreGeo = new THREE.SphereGeometry(0.3, 12, 12);
      const ionCore = new THREE.Mesh(ionCoreGeo, this.materials.engineCore);
      ionCore.position.set(0, 0, -1.8);
      podGroup.add(ionCore);

      // イオン排気プルーム
      const plumeGeo = new THREE.ConeGeometry(0.45, 3.2, 12, 1, true);
      plumeGeo.rotateX(-Math.PI * 0.5);
      plumeGeo.translate(0, 0, -1.6);
      const plume = new THREE.Mesh(plumeGeo, this.materials.enginePlume.clone());
      plume.position.set(0, 0, -2.4);
      podGroup.add(plume);

      if (side === 1) this.leftEnginePlume = plume;
      else this.rightEnginePlume = plume;

      engineGroup.add(podGroup);
    }

    this.group.add(engineGroup);
  }

  /**
   * 6. 冷却フィン
   */
  private buildCoolingRadiators() {
    const finsGroup = new THREE.Group();

    for (let i = 0; i < 5; i++) {
      const finGeo = new THREE.BoxGeometry(0.04, 0.28, 0.45);
      const fin = new THREE.Mesh(finGeo, this.materials.cyanCooling);
      fin.position.set(0, 0.65, -0.6 - i * 0.45);
      fin.rotation.x = 0.25;
      finsGroup.add(fin);
      this.coolingFins.push(fin);
    }

    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const finGeo = new THREE.BoxGeometry(0.35, 0.08, 0.15);
        const fin = new THREE.Mesh(finGeo, this.materials.cyanCooling);
        fin.position.set(side * 1.15, 0.45, -1.2 - i * 0.4);
        fin.rotation.x = -0.3;
        fin.rotation.z = side * 0.15;
        finsGroup.add(fin);
        this.coolingFins.push(fin);
      }
    }

    this.group.add(finsGroup);
  }

  /**
   * 7. 尾翼（Twin V-Stabilizers）
   */
  private buildStabilizers() {
    const tailGroup = new THREE.Group();

    for (const side of [-1, 1]) {
      const stabGroup = new THREE.Group();
      stabGroup.position.set(side * 0.8, 0.35, -2.2);
      stabGroup.rotation.z = -side * 0.45;
      stabGroup.rotation.y = -side * 0.05;

      const bladeGeo = new THREE.BufferGeometry();
      const verts = new Float32Array([
        0, 0, 1.2,
        0, 2.2, -0.8,
        0, 0, -1.2,
        0, 0, 1.2,
        0, 0, -1.2,
        0, 2.2, -0.8
      ]);
      bladeGeo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
      bladeGeo.computeVertexNormals();

      const blade = new THREE.Mesh(bladeGeo, this.materials.ceramicWhite);
      this.registerMesh(blade);
      stabGroup.add(blade);

      const trimGeo = new THREE.BoxGeometry(0.04, 2.1, 0.15);
      const trim = new THREE.Mesh(trimGeo, this.materials.solarGoldTrim);
      trim.position.set(0, 1.1, -0.7);
      trim.rotation.x = -0.6;
      stabGroup.add(trim);

      const edgeGeo = new THREE.BoxGeometry(0.03, 1.8, 0.08);
      const edge = new THREE.Mesh(edgeGeo, this.materials.cyanCooling);
      edge.position.set(0, 0.9, -1.1);
      edge.rotation.x = 0.3;
      stabGroup.add(edge);

      tailGroup.add(stabGroup);
    }

    this.group.add(tailGroup);
  }

  /**
   * 8. フォトンセンサー＆ピトー管
   */
  private buildPhotonSensors() {
    const sensorGroup = new THREE.Group();

    for (const side of [-1, 1]) {
      const mastGeo = new THREE.CylinderGeometry(0.02, 0.03, 1.2, 6);
      mastGeo.rotateX(Math.PI * 0.5);
      const mast = new THREE.Mesh(mastGeo, this.materials.solarGoldTrim);
      mast.position.set(side * 0.7, 0.0, 3.2);
      sensorGroup.add(mast);

      const probeTipGeo = new THREE.SphereGeometry(0.04, 6, 6);
      const probeTip = new THREE.Mesh(probeTipGeo, this.materials.cyanCooling);
      probeTip.position.set(side * 0.7, 0.0, 3.8);
      sensorGroup.add(probeTip);
    }

    this.group.add(sensorGroup);
  }

  /**
   * ワイヤーフレーム表示のトグル
   */
  public setWireframe(enabled: boolean) {
    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material !== this.materials.canopy && child.material !== this.materials.enginePlume) {
        if (enabled) {
          (child as any).__origMat = child.material;
          child.material = this.materials.wireframe;
        } else if ((child as any).__origMat) {
          child.material = (child as any).__origMat;
        }
      }
    });
  }

  /**
   * 毎フレームのアニメーション更新
   */
  public update(time: number, speedRatio: number, isBoosting: boolean, wingsFlexEnabled: boolean = true) {
    if (wingsFlexEnabled) {
      const wingFlex = Math.sin(time * 2.5) * 0.03 + (isBoosting ? 0.06 : 0.0);
      const midFlex = Math.sin(time * 2.5 - 0.5) * 0.04;
      const tipFlex = Math.sin(time * 2.5 - 1.0) * 0.06;

      if (this.leftWingSegments.length === 3) {
        this.leftWingSegments[0].rotation.z = wingFlex;
        this.leftWingSegments[1].rotation.z = midFlex;
        this.leftWingSegments[2].rotation.z = tipFlex;
      }
      if (this.rightWingSegments.length === 3) {
        this.rightWingSegments[0].rotation.z = -wingFlex;
        this.rightWingSegments[1].rotation.z = -midFlex;
        this.rightWingSegments[2].rotation.z = -tipFlex;
      }
    }

    const canardAngle = Math.sin(time * 3.0) * 0.05;
    if (this.leftCanard) this.leftCanard.rotation.x = canardAngle;
    if (this.rightCanard) this.rightCanard.rotation.x = canardAngle;

    const boostMult = isBoosting ? 1.8 : 1.0;
    const flicker = 1.0 + Math.sin(time * 24.0) * 0.12 + Math.cos(time * 40.0) * 0.08;
    const plumeLength = (speedRatio * 1.1 + 0.3) * boostMult * flicker;
    const plumeWidth = (0.9 + Math.sin(time * 18.0) * 0.08) * (isBoosting ? 1.4 : 1.0);

    if (this.leftEnginePlume) {
      this.leftEnginePlume.scale.set(plumeWidth, plumeWidth, plumeLength);
      (this.leftEnginePlume.material as THREE.MeshBasicMaterial).opacity = Math.min(1.0, 0.75 * boostMult * flicker);
    }
    if (this.rightEnginePlume) {
      this.rightEnginePlume.scale.set(plumeWidth, plumeWidth, plumeLength);
      (this.rightEnginePlume.material as THREE.MeshBasicMaterial).opacity = Math.min(1.0, 0.75 * boostMult * flicker);
    }

    const coolingPulse = 0.7 + Math.sin(time * 3.5) * 0.25 + (isBoosting ? 0.35 : 0.0);
    this.materials.cyanCooling.emissiveIntensity = THREE.MathUtils.clamp(coolingPulse, 0.5, 1.4);

    const solarPulse = 0.3 + Math.sin(time * 2.0 + 1.0) * 0.15 + (isBoosting ? 0.2 : 0.0);
    this.materials.solarGold.emissiveIntensity = THREE.MathUtils.clamp(solarPulse, 0.2, 0.7);

    // 冷却ストリップの微光
    this.solarEdgeStrips.forEach((strip, i) => {
      const edgeGlow = Math.sin(time * 4.0 + i) * 0.2 + 0.8;
      (strip.material as THREE.MeshStandardMaterial).emissiveIntensity = edgeGlow;
    });
  }
}
