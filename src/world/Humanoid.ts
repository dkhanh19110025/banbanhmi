import * as THREE from 'three';

export type HairStyle =
  | 'short'
  | 'spiky'
  | 'bun'
  | 'long'
  | 'combover'
  | 'ponytail'
  | 'anime'
  | 'buzz'
  | 'curly'
  | 'mohawk'
  | 'bob'
  | 'sidepart';
export type SleeveStyle = 'none' | 'short' | 'long';
export type EyeStyle = 'round' | 'anime' | 'sleepy' | 'happy';
export type BrowStyle = 'normal' | 'thin' | 'thick' | 'angry';
export type MouthStyle = 'line' | 'smile' | 'open';

/** Áo khoác khóa kéo có mũ trùm, mặc ngoài áo (shirt) */
export interface JacketLook {
  color: number;
  /** Màu mũ trùm + cổ áo lót + dây rút */
  hood: number;
  /** Màu viền khóa kéo, mảng tay áo */
  trim: number;
  /** Mở khóa: lộ áo trong ở giữa ngực */
  open: boolean;
}

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
  jacket?: JacketLook;
  /** Quần túi hộp bó gấu (jogger) */
  cargo?: boolean;
  /** Quần đùi: ống chân lộ da */
  shorts?: boolean;
  /** Giày hai màu: màu đế + mũi + vạch hông */
  soles?: number;
  eyes?: EyeStyle;
  eyeColor?: number;
  brows?: BrowStyle;
  mouth?: MouthStyle;
  /** Màu gọng kính cận (tròn) */
  glasses?: number;
  beard?: number;
  blush?: boolean;
}

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
/** Nâng thân khi ngã ngửa để lưng nằm trên sàn */
const FALL_LIFT = 0.22;

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

/** Chi tiết nhỏ trên mặt: không đổ bóng cho nhẹ */
function face(m: THREE.Mesh): THREE.Mesh {
  m.castShadow = false;
  return m;
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
  private fallPosed = false;

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
      const shin = capsule(0.068, SHIN - 0.1, look.shorts ? look.skin : look.pants);
      shin.position.y = -SHIN / 2;
      knee.add(shin);
      if (look.cargo) {
        // Túi hộp bên hông đùi + nắp túi
        const pocket = mesh(new THREE.BoxGeometry(0.03, 0.15, 0.12), shade(look.pants, 0.9));
        pocket.position.set(side * 0.085, -THIGH * 0.6, 0);
        hip.add(pocket);
        const flap = mesh(new THREE.BoxGeometry(0.035, 0.03, 0.125), shade(look.pants, 0.8));
        flap.position.set(side * 0.087, -THIGH * 0.6 + 0.075, 0);
        hip.add(flap);
        // Gấu bó ở cổ chân
        const cuff = mesh(new THREE.CylinderGeometry(0.064, 0.064, 0.05, 12), shade(look.pants, 0.85));
        cuff.position.y = -SHIN + 0.05;
        knee.add(cuff);
      }

      // Giày: thuôn dài về phía trước
      const shoeGeo = new THREE.CapsuleGeometry(0.062, 0.15, 4, 10);
      shoeGeo.rotateX(Math.PI / 2);
      shoeGeo.scale(1.1, 0.72, 1);
      const shoe = mesh(shoeGeo, shoeColor, 0.6);
      shoe.position.set(0, -SHIN - 0.02, 0.05);
      knee.add(shoe);
      if (look.soles !== undefined) {
        // Giày thể thao hai màu: đế dày, mũi giày, vạch hông
        const soleGeo = new THREE.CapsuleGeometry(0.064, 0.16, 4, 10);
        soleGeo.rotateX(Math.PI / 2);
        soleGeo.scale(1.12, 0.3, 1.02);
        const sole = mesh(soleGeo, look.soles, 0.7);
        sole.position.set(0, -SHIN - 0.055, 0.05);
        knee.add(sole);
        const toe = sphere(0.05, look.soles, 1.15, 0.6, 0.9);
        toe.position.set(0, -SHIN - 0.03, 0.15);
        knee.add(toe);
        const stripe = mesh(new THREE.BoxGeometry(0.01, 0.025, 0.11), look.soles);
        stripe.position.set(side * 0.069, -SHIN - 0.02, 0.04);
        stripe.rotation.x = -0.25;
        knee.add(stripe);
      }

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

    if (look.jacket) this.buildJacket(look.jacket, build);
    if (look.apron) this.buildApron(build);
    if (look.goldChain) {
      const chain = mesh(new THREE.TorusGeometry(0.09, 0.012, 6, 18), 0xf1c40f, 0.25);
      chain.rotation.x = Math.PI / 2 - 0.5;
      chain.position.set(0, 1.39, 0.05);
      this.upper.add(chain);
    }
  }

  /** Áo khoác khóa kéo có mũ trùm sau gáy, mặc ngoài áo thun (giống mẫu của ông chủ dkhanh) */
  private buildJacket(j: JacketLook, build: number): void {
    // Nửa góc khoảng hở phía trước khi mở khóa (0 = kéo kín)
    const gap = j.open ? 0.42 : 0;
    const arc = Math.PI * 2 - gap * 2;
    const open = (m: THREE.Mesh): THREE.Mesh => {
      (m.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
      this.upper.add(m);
      return m;
    };
    const bodyGeo = new THREE.CylinderGeometry(0.218, 0.182, 0.47, 18, 1, true, gap, arc);
    bodyGeo.scale(build, 1, 0.66);
    open(mesh(bodyGeo, j.color)).position.y = 1.145;
    // Vai áo khoác (mặt trước của SphereGeometry nằm ở phi = π/2)
    const shoulderGeo = new THREE.SphereGeometry(0.218, 18, 8, Math.PI / 2 + gap, arc, 0, Math.PI / 2);
    shoulderGeo.scale(build * 1.02, 0.42, 0.68);
    open(mesh(shoulderGeo, j.color)).position.y = 1.385;
    // Gấu áo bo
    const hemGeo = new THREE.CylinderGeometry(0.186, 0.186, 0.05, 18, 1, true, gap, arc);
    hemGeo.scale(build, 1, 0.67);
    open(mesh(hemGeo, shade(j.color, 0.75))).position.y = 0.93;
    // Mép khóa kéo
    const edgeX = Math.sin(gap) * 0.2 * build;
    const edgeZ = Math.cos(gap) * 0.2 * 0.66 + 0.006;
    for (const s of gap > 0 ? [-1, 1] : [0]) {
      const zip = mesh(new THREE.BoxGeometry(0.014, 0.46, 0.01), j.trim);
      zip.position.set(s * edgeX, 1.15, edgeZ);
      this.upper.add(zip);
    }
    // Mũ trùm nằm sau gáy + cổ áo lót quanh cổ
    const hood = sphere(0.12, j.hood, 1.2, 0.62, 0.85);
    hood.position.set(0, 1.44, -0.115);
    this.upper.add(hood);
    const collarGeo = new THREE.TorusGeometry(0.095, 0.03, 6, 16);
    collarGeo.scale(1, 0.82, 1);
    const collar = mesh(collarGeo, j.hood);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 1.425;
    this.upper.add(collar);
    // Dây rút mũ thả trước ngực
    for (const s of [-1, 1]) {
      const cord = face(capsule(0.007, 0.12, j.hood));
      cord.position.set(s * 0.045, 1.33, 0.142);
      this.upper.add(cord);
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

    // Mặc áo khoác thì tay áo là tay áo khoác (dài)
    const top = look.jacket?.color ?? look.shirt;
    if (look.jacket) sleeves = 'long';
    const upperColor = sleeves === 'none' ? armSkin : sleeves === 'long' ? top : armSkin;
    // Khối vai: nối tay liền vào thân
    const deltoid = sphere(0.07, sleeves === 'none' ? armSkin : top, 1, 0.9, 0.9);
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
    const forearm = capsule(0.05, 0.19, sleeves === 'long' ? top : armSkin);
    forearm.position.y = -0.13;
    elbow.add(forearm);
    if (look.jacket) {
      // Mảng màu ở bắp tay + bo tay áo
      const panel = mesh(new THREE.CylinderGeometry(0.061, 0.061, 0.06, 12), look.jacket.trim);
      panel.position.y = -UPPER_ARM * 0.62;
      tilt.add(panel);
      const cuff = mesh(new THREE.CylinderGeometry(0.054, 0.052, 0.04, 12), shade(top, 0.75));
      cuff.position.y = -0.235;
      elbow.add(cuff);
    }
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

    this.buildFace(head, look);

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

  /** Mắt, lông mày, mũi, miệng + kính cận, râu, má hồng: mỗi kiểu một tính cách */
  private buildFace(head: THREE.Mesh, look: HumanoidLook): void {
    const skin = look.skin;
    const add = (m: THREE.Mesh, x: number, y: number, z: number): THREE.Mesh => {
      m.position.set(x, y, z);
      head.add(face(m));
      return m;
    };
    const eyes = look.eyes ?? 'round';
    const iris = look.eyeColor ?? 0x1a1a1a;
    const browColor = look.hair?.color ?? 0x2b1d14;
    const brows = look.brows ?? (eyes === 'anime' ? 'thin' : 'normal');

    for (const side of [-1, 1]) {
      const x = side * 0.05;
      switch (eyes) {
        case 'round':
          add(sphere(0.027, 0xffffff, 1, 1, 0.6), x, 0.02, 0.127);
          add(sphere(0.015, iris), x, 0.018, 0.142);
          break;
        case 'anime': {
          // Mắt to dọc, tròng màu, đồng tử, đốm sáng, viền mi trên
          const ex = side * 0.052;
          add(sphere(0.032, 0xffffff, 1, 1.3, 0.55), ex, 0.012, 0.125);
          add(sphere(0.021, iris, 1, 1.35, 0.5), ex, 0.008, 0.137);
          add(sphere(0.011, 0x050505, 1, 1.3, 0.5), ex, 0.008, 0.143);
          add(sphere(0.006, 0xffffff), ex + 0.007, 0.022, 0.147);
          add(mesh(new THREE.BoxGeometry(0.07, 0.011, 0.012), 0x111111), ex, 0.05, 0.138).rotation.z = -side * 0.16;
          break;
        }
        case 'sleepy':
          // Mí sụp che nửa mắt
          add(sphere(0.027, 0xffffff, 1, 1, 0.6), x, 0.02, 0.127);
          add(sphere(0.015, iris), x, 0.012, 0.142);
          add(mesh(new THREE.BoxGeometry(0.062, 0.022, 0.03), shade(skin, 0.9)), x, 0.033, 0.135);
          break;
        case 'happy':
          // Mắt cười híp ^ ^
          add(mesh(new THREE.TorusGeometry(0.022, 0.006, 4, 10, Math.PI), 0x1a1a1a), x, 0.008, 0.138);
          break;
      }
      const browGeo =
        brows === 'thin'
          ? new THREE.BoxGeometry(0.05, 0.009, 0.012)
          : brows === 'thick'
            ? new THREE.BoxGeometry(0.064, 0.022, 0.016)
            : new THREE.BoxGeometry(0.055, 0.013, 0.014);
      const brow = add(mesh(browGeo, browColor), side * 0.052, eyes === 'anime' ? 0.072 : 0.062, 0.134);
      // Nhíu mày: đầu trong cụp xuống
      brow.rotation.z = brows === 'angry' ? side * 0.4 : -side * 0.12;
    }

    // Mũi: kiểu anime thì nhỏ xíu
    const nose = eyes === 'anime' ? capsule(0.012, 0.012, shade(skin, 0.9)) : capsule(0.02, 0.025, shade(skin, 0.93));
    add(nose, 0, -0.022, 0.146).rotation.x = 0.35;

    switch (look.mouth ?? 'line') {
      case 'line': {
        // Kiểu anime: miệng mảnh, sẫm màu
        const anime = eyes === 'anime';
        const geo = new THREE.CapsuleGeometry(anime ? 0.005 : 0.008, anime ? 0.028 : 0.045, 3, 6);
        geo.rotateZ(Math.PI / 2);
        add(mesh(geo, anime ? 0x5e2b25 : 0x8e3b33), 0, -0.075, 0.13);
        break;
      }
      case 'smile':
        add(mesh(new THREE.TorusGeometry(0.026, 0.006, 4, 10, Math.PI), 0x8e3b33), 0, -0.062, 0.132).rotation.z = Math.PI;
        break;
      case 'open':
        add(sphere(0.02, 0x5a1f1a, 1.3, 1, 0.5), 0, -0.076, 0.13);
        break;
    }

    if (look.blush) for (const side of [-1, 1]) add(sphere(0.02, 0xf19a9a, 1.2, 0.6, 0.3), side * 0.078, -0.03, 0.122);
    if (look.beard !== undefined) add(sphere(0.1, look.beard, 1.05, 0.62, 0.85), 0, -0.115, 0.045);
    if (look.glasses !== undefined) {
      for (const side of [-1, 1]) add(mesh(new THREE.TorusGeometry(0.032, 0.005, 6, 16), look.glasses), side * 0.052, 0.015, 0.15);
      add(mesh(new THREE.BoxGeometry(0.03, 0.006, 0.006), look.glasses), 0, 0.02, 0.152);
    }
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
    /** Gai tóc: hình nón chĩa theo hướng (dx, dy, dz) */
    const spike = (r: number, len: number, x: number, y: number, z: number, dx: number, dy: number, dz: number): void => {
      const geo = new THREE.ConeGeometry(r, len, 5);
      geo.translate(0, len / 2, 0);
      const m = mesh(geo, color);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, dy, dz).normalize());
      add(m, x, y, z);
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
      case 'buzz':
        cap(1.02);
        break;
      case 'anime': {
        // Tóc rối kiểu anime: mái lởm chởm rủ trước trán + gai tỏa ra sau và hai bên
        cap(1.1);
        // Mái ngắn vừa chạm lông mày, không che mắt
        for (let i = 0; i < 5; i++) {
          const x = -0.08 + i * 0.04;
          spike(0.032, 0.065, x, 0.118, 0.11, x * 1.2, -1, 0.35);
        }
        // Gai tỏa ra sau gáy
        for (let i = 0; i < 6; i++) {
          const a = -1 + (i / 5) * 2;
          spike(0.04, 0.09, Math.sin(a) * 0.09, 0.11, -Math.cos(a) * 0.08, Math.sin(a) * 0.8, 0.35, -Math.cos(a));
        }
        // Tóc mai rủ xuống hai bên + vài cọng vểnh trên đỉnh cho rối
        for (const s of [-1, 1]) {
          spike(0.03, 0.07, s * 0.135, 0.05, 0.04, s * 0.5, -1, 0.1);
          spike(0.035, 0.07, s * 0.035, 0.165, 0, s * 0.3, 1, -0.6);
        }
        break;
      }
      case 'mohawk':
        for (let i = 0; i < 5; i++) spike(0.035, 0.13, 0, 0.15 - Math.abs(i - 2) * 0.015, 0.08 - i * 0.05, 0, 1, -0.25);
        break;
      case 'curly':
        cap(1.04);
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          const r = i % 2 ? 0.1 : 0.06;
          add(sphere(0.045, color), Math.cos(a) * r, 0.13 - (i % 2) * 0.02, Math.sin(a) * r - 0.03);
        }
        break;
      case 'bob': {
        // Tóc ngắn ôm tới cằm, chừa mặt
        const geo = new THREE.SphereGeometry(0.154, 20, 12, Math.PI / 2 + 0.85, Math.PI * 2 - 1.7, 0, 2.1);
        geo.scale(1, 1.15, 1.05);
        const shell = mesh(geo, color);
        (shell.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
        head.add(shell);
        add(sphere(0.1, color, 1.35, 0.32, 0.6), 0, 0.12, 0.09);
        break;
      }
      case 'sidepart':
        cap();
        add(sphere(0.08, color, 1.6, 0.45, 0.9), 0.04, 0.13, 0.06).rotation.z = -0.3;
        break;
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

  /**
   * Tư thế ngã ngửa: amount 0 = đứng, 1 = nằm bẹp. Gọi SAU animate() để đè lên tư thế đi bộ.
   * Thân xoay quanh gót chân, đầu ngả ra sau lưng; tay chân quơ loạn cho bựa.
   */
  setFallPose(amount: number, time: number): void {
    if (amount <= 0) {
      if (this.fallPosed) {
        this.rig.rotation.x = 0;
        this.rig.position.y = 0;
        this.fallPosed = false;
      }
      return;
    }
    this.fallPosed = true;
    this.rig.rotation.x = -(Math.PI / 2) * amount;
    // Nâng lên một chút để lưng nằm trên sàn chứ không lún xuống
    this.rig.position.y = FALL_LIFT * amount;
    const flail = Math.sin(time * 14) * 0.35;
    this.arms[0].rotation.x = (-2.3 + flail) * amount;
    this.arms[1].rotation.x = (-2.3 - flail) * amount;
    for (const hip of this.hips) hip.rotation.x = -0.7 * amount;
    for (const knee of this.knees) knee.rotation.x = 0.9 * amount;
    for (const elbow of this.elbows) elbow.rotation.x = -0.4 * amount;
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
