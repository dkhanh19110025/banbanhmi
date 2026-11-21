import * as THREE from 'three';

export type HairStyle = 'short' | 'spiky' | 'bun' | 'long' | 'combover' | 'ponytail';
export type SleeveStyle = 'none' | 'short' | 'long';

export interface HumanoidLook {
  shirt: number;
  pants: number;
  skin: number;
  hat?: number;
  apron?: boolean;
  /** Màu da tay riêng (ví dụ hình xăm kín tay); mặc định cùng màu da */
  arms?: number;
  hair?: { style: HairStyle; color: number };
  shoes?: number;
  /** Áo ba lỗ / tay ngắn / tay dài — mặc định tay ngắn */
  sleeves?: SleeveStyle;
  /** Độ to ngang người: 1 = bình thường, >1 = to con */
  build?: number;
  belly?: boolean;
  mustache?: number;
  sunglasses?: boolean;
  goldChain?: boolean;
}

export const HAIR_STYLES: readonly HairStyle[] = ['short', 'spiky', 'bun', 'long', 'ponytail'];
export const HAIR_COLORS: readonly number[] = [0x1b1b1b, 0x3b2314, 0x6b3e1e, 0xc9a227, 0xb03a2e, 0x7f8c8d];
export const PANTS_COLORS: readonly number[] = [0x34495e, 0x2c3e50, 0x1e3799, 0x6d4c41, 0x4a4a4a, 0x8e7c5a];
export const SLEEVE_STYLES: readonly SleeveStyle[] = ['short', 'short', 'long', 'none'];

// Tỉ lệ cơ thể (mét). Tâm đầu giữ ở 1.6 để các bong bóng thoại / đồ cầm tay không lệch.
const HIP_Y = 0.9;
const HIP_X = 0.1;
const THIGH = 0.42;
const SHIN = 0.4;
const SHOULDER_Y = 1.36;
const SHOULDER_X = 0.235;
const UPPER_ARM = 0.29;
const HEAD_Y = 1.6;
/** Độ cao hông khi ngồi ghế (mặt ghế ~0.49) */
const SEATED_HIP_Y = 0.57;

const WALK_FREQ = 11;
const LEG_SWING = 0.55;
const KNEE_BEND = 0.75;
const ARM_SWING = 0.45;
const ELBOW_REST = -0.18;

function mat(color: number, roughness = 0.8): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness });
}

function mesh(geo: THREE.BufferGeometry, color: number, roughness?: number): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat(color, roughness));
  m.castShadow = true;
  return m;
}

/** Khối thuôn tròn dọc trục Y, tâm ở giữa */
function capsule(radius: number, length: number, color: number): THREE.Mesh {
  return mesh(new THREE.CapsuleGeometry(radius, length, 6, 12), color);
}

function sphere(radius: number, color: number, sx = 1, sy = 1, sz = 1): THREE.Mesh {
  const geo = new THREE.SphereGeometry(radius, 16, 12);
  geo.scale(sx, sy, sz);
  return mesh(geo, color);
}

/** Làm tối màu một chút (bóng mũi, môi…) */
function shade(color: number, k: number): number {
  return new THREE.Color(color).multiplyScalar(k).getHex();
}

/** Nhân vật low-poly bo tròn. Mặt hướng về +Z. */
export class Humanoid {
  readonly group = new THREE.Group();
  /** Phần thân trên (để nhún, cúi) — chân đứng riêng */
  readonly upper = new THREE.Group();
  /** Đầu (xoay được: lắc, gật, lườm). Tóc, mắt, mũ đều gắn vào đây */
  readonly head: THREE.Mesh;
  /** Đầu + mũ: ẩn đi khi nhìn bằng mắt nhân vật */
  readonly headParts: THREE.Object3D[] = [];
  /** [trái, phải] — trục xoay ở vai */
  readonly arms: THREE.Object3D[] = [];
  /** Khi cầm đồ hoặc đang tát thì không vung tay theo bước chân */
  armsLocked = false;
  /** Gốc toàn thân: hạ xuống khi ngồi */
  private readonly rig = new THREE.Group();
  private readonly hips: THREE.Object3D[] = [];
  private readonly knees: THREE.Object3D[] = [];
  private readonly elbows: THREE.Object3D[] = [];
  private walkPhase = 0;
  private idlePhase = Math.random() * 10;
  private sitting = false;

  constructor(look: HumanoidLook) {
    const build = look.build ?? 1;
    const armSkin = look.arms ?? look.skin;
    const sleeves = look.sleeves ?? 'short';

    this.buildLegs(look);
    this.buildTorso(look, build);
    for (const side of [-1, 1]) this.buildArm(side, look, sleeves, armSkin, build);
    this.head = this.buildHead(look);
    this.headParts.push(this.head);

    this.rig.add(this.upper);
    this.group.add(this.rig);
  }

  // ---------- Dựng hình ----------

  private buildLegs(look: HumanoidLook): void {
    const shoeColor = look.shoes ?? 0x222222;
    for (const side of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(side * HIP_X, HIP_Y, 0);
      const thigh = capsule(0.085, THIGH - 0.12, look.pants);
      thigh.position.y = -THIGH / 2;
      hip.add(thigh);

      const knee = new THREE.Group();
      knee.position.y = -THIGH;
      const shin = capsule(0.068, SHIN - 0.1, look.pants);
      shin.position.y = -SHIN / 2;
      knee.add(shin);

      // Giày: thuôn dài về phía trước
      const shoeGeo = new THREE.CapsuleGeometry(0.062, 0.15, 4, 10);
      shoeGeo.rotateX(Math.PI / 2);
      shoeGeo.scale(1.1, 0.72, 1);
      const shoe = mesh(shoeGeo, shoeColor, 0.6);
      shoe.position.set(0, -SHIN - 0.02, 0.05);
      knee.add(shoe);

      hip.add(knee);
      this.hips.push(hip);
      this.knees.push(knee);
      this.rig.add(hip);
    }
  }

  private buildTorso(look: HumanoidLook, build: number): void {
    // Hông / đáy quần
    const pelvisGeo = new THREE.CylinderGeometry(0.17, 0.155, 0.2, 16);
    pelvisGeo.scale(build, 1, 0.68);
    const pelvis = mesh(pelvisGeo, look.pants);
    pelvis.position.y = HIP_Y + 0.03;
    this.upper.add(pelvis);
    // Thắt lưng
    const beltGeo = new THREE.CylinderGeometry(0.172, 0.172, 0.04, 16);
    beltGeo.scale(build, 1, 0.69);
    const belt = mesh(beltGeo, 0x2b1d14, 0.5);
    belt.position.y = HIP_Y + 0.12;
    this.upper.add(belt);

    // Thân: ngực rộng, eo thon
    const torsoGeo = new THREE.CylinderGeometry(0.205, 0.165, 0.46, 18);
    torsoGeo.scale(build, 1, 0.64);
    const torso = mesh(torsoGeo, look.shirt);
    torso.position.y = 1.15;
    this.upper.add(torso);
    // Vai tròn
    const chestGeo = new THREE.SphereGeometry(0.205, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    chestGeo.scale(build * 1.02, 0.42, 0.66);
    const chest = mesh(chestGeo, look.shirt);
    chest.position.y = 1.38;
    this.upper.add(chest);

    if (look.belly) {
      const belly = sphere(0.2, look.shirt, build, 0.95, 0.8);
      belly.position.set(0, 1.05, 0.08);
      this.upper.add(belly);
    }

    // Cổ áo (tay ngắn/dài) hoặc cổ khoét (ba lỗ)
    if ((look.sleeves ?? 'short') !== 'none') {
      const collar = mesh(new THREE.TorusGeometry(0.07, 0.018, 6, 14), shade(look.shirt, 0.85));
      collar.rotation.x = Math.PI / 2;
      collar.position.y = 1.44;
      this.upper.add(collar);
    }
    // Cổ
    const neck = mesh(new THREE.CylinderGeometry(0.058, 0.065, 0.14, 12), look.skin);
    neck.position.y = 1.47;
    this.upper.add(neck);

    if (look.apron) this.buildApron(build);
    if (look.goldChain) {
      const chain = mesh(new THREE.TorusGeometry(0.09, 0.012, 6, 18), 0xf1c40f, 0.25);
      chain.rotation.x = Math.PI / 2 - 0.5;
      chain.position.set(0, 1.39, 0.05);
      this.upper.add(chain);
    }
  }

  private buildApron(build: number): void {
    const apronColor = 0xf5f5f5;
    // Mảnh tạp dề cong theo bụng
    const apronGeo = new THREE.CylinderGeometry(0.212, 0.2, 0.55, 16, 1, true, -0.85, 1.7);
    apronGeo.scale(build, 1, 0.72);
    const apron = mesh(apronGeo, apronColor);
    (apron.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    apron.position.y = 0.98;
    this.upper.add(apron);
    // Túi trước
    const pocket = mesh(new THREE.BoxGeometry(0.16, 0.08, 0.01), 0xdfe6e9);
    pocket.position.set(0, 0.9, 0.146);
    this.upper.add(pocket);
    // Dây đeo cổ
    for (const side of [-1, 1]) {
      const strap = mesh(new THREE.BoxGeometry(0.025, 0.2, 0.012), apronColor);
      strap.position.set(side * 0.08, 1.35, 0.125);
      strap.rotation.z = side * 0.35;
      strap.rotation.x = -0.35;
      this.upper.add(strap);
    }
  }

  private buildArm(side: number, look: HumanoidLook, sleeves: SleeveStyle, armSkin: number, build: number): void {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * SHOULDER_X * build, SHOULDER_Y, 0);
    // Tay hơi dang ra cho tự nhiên; arms[] vẫn xoay quanh 0 như cũ
    const tilt = new THREE.Group();
    tilt.rotation.z = side * 0.07;
    shoulder.add(tilt);

    const upperColor = sleeves === 'none' ? armSkin : sleeves === 'long' ? look.shirt : armSkin;
    // Khối vai: nối tay liền vào thân
    const deltoid = sphere(0.07, sleeves === 'none' ? armSkin : look.shirt, 1, 0.9, 0.9);
    deltoid.position.set(-side * 0.012, -0.01, 0);
    tilt.add(deltoid);
    const upperArm = capsule(0.058, UPPER_ARM - 0.1, upperColor);
    upperArm.position.y = -UPPER_ARM / 2 + 0.01;
    tilt.add(upperArm);
    if (sleeves === 'short') {
      const sleeve = mesh(new THREE.CylinderGeometry(0.068, 0.064, 0.13, 12), look.shirt);
      sleeve.position.y = -0.055;
      tilt.add(sleeve);
    }

    const elbow = new THREE.Group();
    elbow.position.y = -UPPER_ARM;
    elbow.rotation.x = ELBOW_REST;
    const forearm = capsule(0.05, 0.19, sleeves === 'long' ? look.shirt : armSkin);
    forearm.position.y = -0.13;
    elbow.add(forearm);
    // Bàn tay + ngón cái
    const hand = sphere(0.052, look.skin, 0.75, 1.15, 0.55);
    hand.position.y = -0.3;
    elbow.add(hand);
    const thumb = capsule(0.018, 0.04, look.skin);
    thumb.position.set(-side * 0.035, -0.27, 0.025);
    thumb.rotation.z = -side * 0.5;
    elbow.add(thumb);
    tilt.add(elbow);

    this.elbows.push(elbow);
    this.arms.push(shoulder);
    this.upper.add(shoulder);
  }

  private buildHead(look: HumanoidLook): THREE.Mesh {
    const skin = look.skin;
    // Hộp sọ hơi dài + cằm thon
    const skullGeo = new THREE.SphereGeometry(0.14, 20, 16);
    skullGeo.scale(1, 1.15, 1.05);
    const head = mesh(skullGeo, skin, 0.65);
    head.position.y = HEAD_Y;
    this.upper.add(head);

    const jaw = sphere(0.105, skin, 1, 0.8, 1);
    jaw.position.set(0, -0.07, 0.025);
    head.add(jaw);

    // Tai
    for (const side of [-1, 1]) {
      const ear = sphere(0.036, shade(skin, 0.95), 0.45, 1, 0.75);
      ear.position.set(side * 0.138, 0, -0.005);
      head.add(ear);
    }

    // Mắt: lòng trắng + tròng đen + lông mày
    const browColor = look.hair?.color ?? 0x2b1d14;
    for (const side of [-1, 1]) {
      const white = sphere(0.027, 0xffffff, 1, 1, 0.6);
      white.castShadow = false;
      white.position.set(side * 0.05, 0.02, 0.127);
      head.add(white);
      const pupil = sphere(0.015, 0x1a1a1a);
      pupil.castShadow = false;
      pupil.position.set(side * 0.05, 0.018, 0.142);
      head.add(pupil);
      const brow = mesh(new THREE.BoxGeometry(0.055, 0.013, 0.014), browColor);
      brow.castShadow = false;
      brow.position.set(side * 0.052, 0.062, 0.134);
      brow.rotation.z = -side * 0.12;
      head.add(brow);
    }

    // Mũi
    const nose = capsule(0.02, 0.025, shade(skin, 0.93));
    nose.position.set(0, -0.018, 0.148);
    nose.rotation.x = 0.35;
    head.add(nose);

    // Miệng
    const mouthGeo = new THREE.CapsuleGeometry(0.008, 0.045, 3, 6);
    mouthGeo.rotateZ(Math.PI / 2);
    const mouth = mesh(mouthGeo, 0x8e3b33);
    mouth.castShadow = false;
    mouth.position.set(0, -0.075, 0.13);
    head.add(mouth);

    if (look.mustache !== undefined) {
      for (const side of [-1, 1]) {
        const half = capsule(0.016, 0.05, look.mustache);
        half.rotation.z = side * 1.15;
        half.position.set(side * 0.03, -0.052, 0.14);
        head.add(half);
      }
    }
    if (look.sunglasses) {
      const lensMat = 0x050505;
      for (const side of [-1, 1]) {
        const lens = mesh(new THREE.BoxGeometry(0.075, 0.045, 0.012), lensMat, 0.15);
        lens.position.set(side * 0.052, 0.022, 0.15);
        head.add(lens);
      }
      const bridge = mesh(new THREE.BoxGeometry(0.2, 0.012, 0.012), lensMat, 0.15);
      bridge.position.set(0, 0.04, 0.15);
      head.add(bridge);
      for (const side of [-1, 1]) {
        const temple = mesh(new THREE.BoxGeometry(0.008, 0.01, 0.14), lensMat);
        temple.position.set(side * 0.13, 0.035, 0.08);
        head.add(temple);
      }
    }

    if (look.hat !== undefined) {
      // Đội mũ: chỉ còn viền tóc lòi ra dưới vành mũ, không cho tóc đâm xuyên chóp mũ
      if (look.hair) this.addHairUnderHat(head, look.hair.color);
      this.addCap(head, look.hat);
    } else if (look.hair) {
      this.addHair(head, look.hair.style, look.hair.color);
    }
    return head;
  }

  /** Mũ lưỡi trai */
  private addCap(head: THREE.Mesh, color: number): void {
    const domeGeo = new THREE.SphereGeometry(0.152, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    domeGeo.scale(1, 0.85, 1.08);
    const dome = mesh(domeGeo, color);
    dome.position.y = 0.045;
    head.add(dome);
    const band = mesh(new THREE.CylinderGeometry(0.153, 0.153, 0.035, 20), shade(color, 0.8));
    band.scale.z = 1.08;
    band.position.y = 0.055;
    head.add(band);
    const brimGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.014, 20, 1, false, -Math.PI / 2, Math.PI);
    brimGeo.scale(1, 1, 0.95);
    const brim = mesh(brimGeo, color);
    brim.position.set(0, 0.05, 0.135);
    brim.rotation.x = 0.12;
    head.add(brim);
    const button = sphere(0.018, shade(color, 0.8));
    button.position.y = 0.175;
    head.add(button);
  }

  /** Viền tóc quanh gáy và hai bên thái dương (chừa mặt), nằm dưới vành mũ */
  private addHairUnderHat(head: THREE.Mesh, color: number): void {
    const faceGap = 0.75; // nửa góc chừa trống phía mặt
    const geo = new THREE.SphereGeometry(
      0.147,
      20,
      6,
      Math.PI / 2 + faceGap,
      Math.PI * 2 - faceGap * 2,
      1.2,
      0.75,
    );
    geo.scale(1, 1.15, 1.05);
    const band = mesh(geo, color);
    (band.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    head.add(band);
  }

  private addHair(head: THREE.Mesh, style: HairStyle, color: number): void {
    const add = (m: THREE.Mesh, x: number, y: number, z: number): THREE.Mesh => {
      m.position.set(x, y, z);
      head.add(m);
      return m;
    };
    /** Mảng tóc ôm đỉnh đầu, chừa trán */
    const cap = (scale = 1.06): THREE.Mesh => {
      const geo = new THREE.SphereGeometry(0.14 * scale, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);
      geo.scale(1, 1.15, 1.05);
      const m = mesh(geo, color);
      m.rotation.x = -0.32;
      return add(m, 0, 0.012, -0.008);
    };
    switch (style) {
      case 'short':
        cap();
        break;
      case 'spiky':
        cap();
        for (let i = 0; i < 6; i++) {
          const spike = mesh(new THREE.ConeGeometry(0.035, 0.1, 6), color);
          const a = (i / 6) * Math.PI * 2;
          spike.rotation.set(Math.sin(a) * 0.5 - 0.2, 0, -Math.cos(a) * 0.5);
          add(spike, Math.cos(a) * 0.06, 0.17, Math.sin(a) * 0.06 - 0.02);
        }
        break;
      case 'bun':
        cap();
        add(sphere(0.06, color), 0, 0.15, -0.1);
        break;
      case 'ponytail': {
        cap();
        add(sphere(0.03, shade(color, 0.7)), 0, 0.06, -0.15);
        const tail = add(capsule(0.04, 0.16, color), 0, -0.04, -0.18);
        tail.rotation.x = 0.35;
        break;
      }
      case 'long': {
        cap(1.08);
        const back = mesh(new THREE.CapsuleGeometry(0.11, 0.22, 4, 12), color);
        back.scale.set(1.25, 1, 0.55);
        add(back, 0, -0.1, -0.09);
        for (const side of [-1, 1]) {
          const lock = add(capsule(0.035, 0.2, color), side * 0.135, -0.07, 0.02);
          lock.rotation.z = side * 0.06;
        }
        // Mái
        const fringe = sphere(0.1, color, 1.3, 0.35, 0.6);
        add(fringe, 0.02, 0.12, 0.09);
        break;
      }
      case 'combover':
        // Hói giữa, hai bên còn chút tóc (ông chủ)
        for (const side of [-1, 1]) add(sphere(0.06, color, 0.45, 0.9, 1.4), side * 0.13, 0.03, -0.03);
        add(sphere(0.09, color, 1.4, 0.6, 0.6), 0, 0.02, -0.12);
        for (let i = 0; i < 3; i++) {
          const strand = add(capsule(0.006, 0.17, color), -0.04 + i * 0.035, 0.16, 0.02);
          strand.rotation.z = Math.PI / 2 - 0.15;
        }
        break;
    }
  }

  setHeadVisible(visible: boolean): void {
    for (const p of this.headParts) p.visible = visible;
  }

  // ---------- Hoạt ảnh ----------

  /** Đi: vung chân, co gối, đánh tay. Đứng yên: thở nhẹ, về tư thế đứng */
  animate(dt: number, moving: boolean, speedFactor = 1): void {
    this.idlePhase += dt;
    if (this.sitting) {
      this.upper.position.y = Math.sin(this.idlePhase * 1.6) * 0.004;
      return;
    }
    if (moving) {
      this.walkPhase += dt * WALK_FREQ * speedFactor;
      const s = Math.sin(this.walkPhase);
      const swing = s * LEG_SWING;
      this.hips[0].rotation.x = swing;
      this.hips[1].rotation.x = -swing;
      // Gối co khi chân đưa về sau rồi bước lên
      this.knees[0].rotation.x = Math.max(0, -Math.sin(this.walkPhase - 0.6)) * KNEE_BEND;
      this.knees[1].rotation.x = Math.max(0, Math.sin(this.walkPhase - 0.6)) * KNEE_BEND;
      if (!this.armsLocked) {
        this.arms[0].rotation.x = -s * ARM_SWING;
        this.arms[1].rotation.x = s * ARM_SWING;
        this.elbows[0].rotation.x = ELBOW_REST - Math.max(0, s) * 0.5;
        this.elbows[1].rotation.x = ELBOW_REST - Math.max(0, -s) * 0.5;
      }
      this.upper.position.y = Math.abs(Math.cos(this.walkPhase)) * 0.035;
      this.upper.rotation.y = s * 0.08;
    } else {
      const k = Math.exp(-12 * dt);
      for (const hip of this.hips) hip.rotation.x *= k;
      for (const knee of this.knees) knee.rotation.x *= k;
      if (!this.armsLocked) {
        for (const arm of this.arms) arm.rotation.x *= k;
        for (const elbow of this.elbows) elbow.rotation.x = ELBOW_REST + (elbow.rotation.x - ELBOW_REST) * k;
      }
      this.upper.rotation.y *= k;
      // Thở
      this.upper.position.y = Math.sin(this.idlePhase * 1.6) * 0.004;
    }
    // Cầm đồ: gập khuỷu tay ôm ra trước
    if (this.armsLocked) for (const elbow of this.elbows) elbow.rotation.x = -0.35;
  }

  setSitting(sitting: boolean): void {
    this.sitting = sitting;
    this.rig.position.y = sitting ? SEATED_HIP_Y - HIP_Y : 0;
    for (const hip of this.hips) hip.rotation.x = sitting ? -Math.PI / 2 : 0;
    for (const knee of this.knees) knee.rotation.x = sitting ? Math.PI / 2 : 0;
    this.upper.rotation.y = 0;
  }

  faceDirection(dx: number, dz: number): void {
    if (dx === 0 && dz === 0) return;
    this.group.rotation.y = Math.atan2(dx, dz);
  }

  dispose(): void {
    this.group.removeFromParent();
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        (obj.material as THREE.Material).dispose();
      }
    });
  }
}

/**
 * Bước tới điểm đích với quãng đường tối đa `step`.
 * Trả về true khi đã tới nơi.
 */
export function stepToward(h: Humanoid, target: THREE.Vector3, step: number): boolean {
  const pos = h.group.position;
  const dx = target.x - pos.x;
  const dz = target.z - pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist <= step) {
    pos.x = target.x;
    pos.z = target.z;
    return true;
  }
  pos.x += (dx / dist) * step;
  pos.z += (dz / dist) * step;
  h.faceDirection(dx, dz);
  return false;
}
