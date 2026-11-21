import * as THREE from 'three';
import { DIALOGUES } from '../data/dialogues';
import { MENU, formatMoney } from '../data/menu';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { QUALITY } from '../core/Quality';
import { type AABB, aabbFromCenter } from './Collision';

const DIALOGUE_LABELS = { gangTable: DIALOGUES.gangTableLabel, menu: DIALOGUES.menuLabel };

export interface TableSpot {
  /** Số bàn hiển thị (1-based) */
  number: number;
  center: THREE.Vector3;
  /** Chỗ khách ngồi */
  seat: THREE.Vector3;
  /** Điểm trên lối đi chính ngang hàng với bàn */
  aisle: THREE.Vector3;
}

export type BossStop = 'counter' | 'door' | 'tables' | 'kitchen';

export interface BossWaypoint {
  pos: THREE.Vector3;
  stop?: BossStop;
}

export interface GangSeat {
  seat: THREE.Vector3;
  /** Đường từ cửa trong tới ghế (không gồm cửa) */
  path: readonly THREE.Vector3[];
}

// Bố cục quán (đơn vị mét). Cửa ở cạnh Nam (z dương), lối đi chính chạy dọc x = AISLE_X.
/** Hệ số nới rộng mặt bằng: vị trí nhân lên, kích thước bàn ghế giữ nguyên → lối đi rộng hơn */
const S = 1.3;
/** Điểm trên sàn theo tọa độ bố cục gốc (đã nhân hệ số rộng) */
const at = (x: number, z: number): THREE.Vector3 => new THREE.Vector3(x * S, 0, z * S);
const ROOM = { minX: -10 * S, maxX: 10 * S, minZ: -8 * S, maxZ: 8 * S };
const AISLE_X = -2 * S;
const WALL_T = 0.4;
const WALL_H = 4.2;
const DOOR_HALF = 1.1;
const DOOR_H = 2.7;
/** Độ cao biển treo dưới trần (cao hơn đầu người, không che khách) */
const SIGN_Y = WALL_H - 0.75;

const COLORS = {
  wall: 0xf3e3c3,
  wallTrim: 0xc0392b,
  wood: 0x9c6b3f,
  woodDark: 0x6e4527,
  steel: 0xa7b1b7,
  counter: 0xe67e22,
};

const TABLE_LAYOUT = [
  { number: 1, x: -5.5 * S, z: -3 * S },
  { number: 2, x: 1.5 * S, z: -3 * S },
  { number: 3, x: -5.5 * S, z: 2.5 * S },
  { number: 4, x: 1.5 * S, z: 2.5 * S },
];
const TABLE_SIZE = 1.6;
const SEAT_OFFSET = 1.35;
/** Mặt bàn: đĩa của khách đặt ở y ≈ 0.87 nên mặt trên giữ ở 0.85 */
export const TABLE_TOP_Y = 0.85;
const TABLE_TOP_T = 0.06;
/** Kích thước một viên gạch sàn (mét) */
const FLOOR_TILE = 0.8;
const KITCHEN_TILE = 0.4;
/** Khu bếp lát gạch men riêng (góc Tây Bắc) */
const KITCHEN_ZONE = { minX: ROOM.minX, maxX: -4 * S, minZ: ROOM.minZ, maxZ: -4.75 * S };

/**
 * Quầy thu ngân nằm ngang (dọc trục X). Nhân viên đứng phía Bắc quầy, quay mặt ra cửa (Nam);
 * khách xếp hàng phía Nam, mặt hướng vào quầy.
 */
const COUNTER = { x: 7.2 * S, z: 3.25 * S, w: 3.2, d: 0.8, h: 1.0 };
/** Mặt trên quầy thu ngân */
const COUNTER_TOP = COUNTER.h + 0.06;

/**
 * Bếp: bàn bếp sát tường Bắc + quầy nướng phía trước quay ra quán.
 * Nhân viên đứng giữa hai dãy, mặt nhìn ra cửa.
 */
const KITCHEN = { x: -7.2 * S, w: 4.4, frontZ: ROOM.minZ + 2.8, frontD: 0.9, backZ: ROOM.minZ + 0.35, backD: 0.7, h: 0.95 };
const KITCHEN_TOP = KITCHEN.h + 0.04;
/** Vật nhỏ hơn cỡ này (mét) thì không đổ bóng */
const SMALL_PROP = 0.3;

/** Random cố định theo seed để hoa văn gạch/gỗ lần nào cũng giống nhau */
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function canvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D, rnd: () => number) => void, seed: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Không tạo được canvas 2D');
  draw(ctx, seededRandom(seed));
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Gạch ceramic 2×2 viên, có ron, lốm đốm nhẹ và vát cạnh sáng/tối */
function drawTiles(
  ctx: CanvasRenderingContext2D,
  rnd: () => number,
  size: number,
  perSide: number,
  colors: readonly string[],
  grout: string,
): void {
  const tile = size / perSide;
  const g = Math.max(3, size / 128);
  ctx.fillStyle = grout;
  ctx.fillRect(0, 0, size, size);
  for (let ty = 0; ty < perSide; ty++) {
    for (let tx = 0; tx < perSide; tx++) {
      const x = tx * tile + g / 2;
      const y = ty * tile + g / 2;
      const s = tile - g;
      ctx.fillStyle = colors[(tx + ty) % colors.length];
      ctx.fillRect(x, y, s, s);
      // Lốm đốm kiểu gạch granite
      for (let i = 0; i < s / 2; i++) {
        ctx.fillStyle = `rgba(90, 65, 35, ${rnd() * 0.07})`;
        const d = 1 + rnd() * 3;
        ctx.fillRect(x + rnd() * (s - d), y + rnd() * (s - d), d, d);
      }
      // Vát cạnh: trên/trái sáng, dưới/phải tối
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(x, y, s, 2);
      ctx.fillRect(x, y, 2, s);
      ctx.fillStyle = 'rgba(0,0,0,0.10)';
      ctx.fillRect(x, y + s - 2, s, 2);
      ctx.fillRect(x + s - 2, y, 2, s);
    }
  }
}

function kitchenTileTexture(): THREE.CanvasTexture {
  return canvasTexture(512, (ctx, rnd) => drawTiles(ctx, rnd, 512, 4, ['#f4f6f6', '#dfe4e6'], '#9aa3a8'), 5);
}

/** Mã QR giả để dựng bảng "quét mã chuyển khoản" trên quầy */
function qrTexture(): THREE.CanvasTexture {
  const n = 21;
  const px = 8;
  const pad = 16;
  const head = 34;
  const size = n * px + pad * 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size + head;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Không tạo được canvas 2D');
  ctx.fillStyle = '#c0392b';
  ctx.fillRect(0, 0, size, head);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('QUÉT MÃ', size / 2, head / 2);
  ctx.fillRect(0, head, size, size);
  const rnd = seededRandom(19);
  ctx.fillStyle = '#111111';
  const finder = (cx: number, cy: number): boolean => cx < 7 && cy < 7;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const inFinder = finder(x, y) || finder(n - 1 - x, y) || finder(x, n - 1 - y);
      if (inFinder) continue;
      if (rnd() < 0.5) ctx.fillRect(pad + x * px, head + pad + y * px, px, px);
    }
  }
  // 3 ô định vị ở góc
  for (const [fx, fy] of [[0, 0], [n - 7, 0], [0, n - 7]] as const) {
    const ox = pad + fx * px;
    const oy = head + pad + fy * px;
    ctx.fillRect(ox, oy, px * 7, px * 7);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(ox + px, oy + px, px * 5, px * 5);
    ctx.fillStyle = '#111111';
    ctx.fillRect(ox + px * 2, oy + px * 2, px * 3, px * 3);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Mặt gỗ ghép thanh có vân */
function drawWood(ctx: CanvasRenderingContext2D, rnd: () => number, size: number): void {
  const planks = 4;
  const pw = size / planks;
  const tones = ['#a8743f', '#9c6a38', '#b07b45', '#a06f3c'];
  for (let p = 0; p < planks; p++) {
    ctx.fillStyle = tones[p % tones.length];
    ctx.fillRect(p * pw, 0, pw, size);
    // Vân gỗ: các đường lượn dọc thớ
    for (let i = 0; i < 9; i++) {
      const baseX = p * pw + rnd() * pw;
      const amp = 2 + rnd() * 4;
      const freq = 0.01 + rnd() * 0.02;
      ctx.strokeStyle = `rgba(70, 40, 15, ${0.12 + rnd() * 0.15})`;
      ctx.lineWidth = 1 + rnd() * 1.5;
      ctx.beginPath();
      for (let y = 0; y <= size; y += 8) {
        const x = Math.min(p * pw + pw - 2, Math.max(p * pw + 2, baseX + Math.sin(y * freq + i) * amp));
        if (y === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // Khe giữa các thanh
    ctx.fillStyle = 'rgba(50, 28, 12, 0.55)';
    ctx.fillRect(p * pw, 0, 2, size);
  }
}

interface TextSpriteOptions {
  background?: string;
  color?: string;
  fontPx?: number;
  height?: number;
}

export function makeTextSprite(text: string, opts: TextSpriteOptions = {}): THREE.Sprite {
  const fontPx = opts.fontPx ?? 64;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Không tạo được canvas 2D');
  const font = `bold ${fontPx}px "Segoe UI", Arial, sans-serif`;
  ctx.font = font;
  const pad = fontPx * 0.4;
  canvas.width = Math.ceil(ctx.measureText(text).width + pad * 2);
  canvas.height = Math.ceil(fontPx * 1.5);
  ctx.font = font;
  if (opts.background) {
    ctx.fillStyle = opts.background;
    ctx.beginPath();
    ctx.roundRect(0, 0, canvas.width, canvas.height, fontPx * 0.3);
    ctx.fill();
  }
  ctx.fillStyle = opts.color ?? '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
  const h = opts.height ?? 0.5;
  sprite.scale.set((h * canvas.width) / canvas.height, h, 1);
  return sprite;
}

interface TextPlaneOptions {
  bg: string;
  fg: string;
  width: number;
  fontPx: number;
  border?: string;
}

/** Tấm phẳng có chữ (poster, bảng thực đơn) để dán lên tường */
function textPlane(lines: readonly string[], o: TextPlaneOptions): THREE.Mesh {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Không tạo được canvas 2D');
  const font = `bold ${o.fontPx}px "Segoe UI", Arial, sans-serif`;
  ctx.font = font;
  const pad = o.fontPx * 0.6;
  const lineH = o.fontPx * 1.35;
  canvas.width = Math.ceil(Math.max(...lines.map((l) => ctx.measureText(l).width)) + pad * 2);
  canvas.height = Math.ceil(lineH * lines.length + pad * 1.4);
  ctx.fillStyle = o.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (o.border) {
    ctx.strokeStyle = o.border;
    ctx.lineWidth = o.fontPx * 0.35;
    ctx.strokeRect(0, 0, canvas.width, canvas.height);
  }
  ctx.font = font;
  ctx.fillStyle = o.fg;
  ctx.textBaseline = 'middle';
  ctx.textAlign = lines.length > 1 ? 'left' : 'center';
  lines.forEach((l, i) => {
    const x = lines.length > 1 ? pad : canvas.width / 2;
    if (i === 0 && lines.length > 1) {
      ctx.textAlign = 'center';
      ctx.fillText(l, canvas.width / 2, pad * 0.7 + lineH * 0.5);
      ctx.textAlign = 'left';
      return;
    }
    ctx.fillText(l, x, pad * 0.7 + lineH * (i + 0.5));
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const height = (o.width * canvas.height) / canvas.width;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(o.width, height), new THREE.MeshStandardMaterial({ map: tex }));
  return mesh;
}

/** Biển hai mặt (mặt sau không bị ngược chữ) */
function doubleSidedSign(lines: readonly string[], o: TextPlaneOptions): THREE.Group {
  const g = new THREE.Group();
  const front = textPlane(lines, o);
  const back = textPlane(lines, o);
  back.rotation.y = Math.PI;
  front.position.z = 0.01;
  back.position.z = -0.01;
  g.add(front, back);
  return g;
}

/** Dựng quán bằng khối hộp và cung cấp các điểm mốc cho khách / người chơi */
export class Restaurant {
  readonly root = new THREE.Group();
  readonly colliders: AABB[] = [];
  /** Tường: camera bám nhân vật dùng để không xuyên tường */
  readonly cameraBlockers: THREE.Object3D[] = [];
  readonly tables: TableSpot[] = [];
  /** Dùng chung vật liệu theo màu cho đỡ tốn bộ nhớ GPU */
  private readonly materials = new Map<number, THREE.MeshStandardMaterial>();
  private readonly woodMat = new THREE.MeshStandardMaterial({
    map: canvasTexture(256, (ctx, rnd) => drawWood(ctx, rnd, 256), 11),
    roughness: 0.65,
  });
  private readonly steelMat = new THREE.MeshStandardMaterial({ color: 0xc3cbd0, metalness: 0.35, roughness: 0.32 });
  private readonly steelDarkMat = new THREE.MeshStandardMaterial({ color: 0x8a949a, metalness: 0.4, roughness: 0.3 });
  private readonly glassMat = new THREE.MeshStandardMaterial({
    color: 0xd6f1ff,
    transparent: true,
    opacity: 0.22,
    roughness: 0.05,
    depthWrite: false,
  });
  private readonly vertexColorMat = new THREE.MeshStandardMaterial({ vertexColors: true });
  private readonly shadeMat = new THREE.MeshStandardMaterial({ color: 0xc0392b, side: THREE.DoubleSide });
  private readonly bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff3c4, emissive: 0xffd27a, emissiveIntensity: 2 });
  private readonly coalMat = new THREE.MeshStandardMaterial({ color: 0xff7a2a, emissive: 0xff4500, emissiveIntensity: 1.6 });
  private readonly screenMat = new THREE.MeshStandardMaterial({ color: 0x55efc4, emissive: 0x1abc9c, emissiveIntensity: 0.9 });

  readonly doorOutside = new THREE.Vector3(AISLE_X, 0, ROOM.maxZ + 3.5);
  readonly doorInside = new THREE.Vector3(AISLE_X, 0, ROOM.maxZ - 1.5);

  /** Chỗ nhân viên đứng thu tiền: sau quầy (phía Bắc), mặt nhìn ra cửa */
  readonly counterPoint = new THREE.Vector3(COUNTER.x, 0, COUNTER.z - 1.05);
  readonly counterLabelAnchor = new THREE.Vector3(COUNTER.x, 2.4, COUNTER.z);
  /** Hàng chờ trả tiền trước mặt quầy (phía cửa), vị trí 0 là sát quầy */
  readonly queueSpots = [0, 1, 2, 3].map((i) => new THREE.Vector3(COUNTER.x, 0, COUNTER.z + 1.15 + i * 1.1));
  /** Hướng khách nhìn khi đứng xếp hàng (vào quầy) */
  readonly queueFacing = { x: 0, z: -1 } as const;

  /** Chỗ đứng nấu: giữa bàn bếp sau và quầy nướng, mặt nhìn ra cửa */
  readonly kitchenPoint = new THREE.Vector3(KITCHEN.x, 0, ROOM.minZ + 1.55);
  readonly kitchenLabelAnchor = new THREE.Vector3(KITCHEN.x, 2.3, KITCHEN.frontZ);
  /** Lò than trên quầy nướng (khói bốc lên từ đây) */
  readonly grillPoint = new THREE.Vector3(KITCHEN.x - 1.25, 1.2, KITCHEN.frontZ);

  readonly playerSpawn = at(4, 0);

  /**
   * Vòng đi tuần của chủ quán (khép kín), chạy dọc các lối trống để không xuyên bàn.
   * `stop` = điểm dừng lại ngó nghiêng; 'counter' là chỗ kiểm sổ (đứng sau quầy).
   */
  readonly bossRoute: readonly BossWaypoint[] = [
    // Kiểm sổ: đứng đầu quầy phía Đông, ngay cạnh quyển sổ
    { pos: new THREE.Vector3(COUNTER.x + COUNTER.w / 2 + 0.6, 0, COUNTER.z - 1.05), stop: 'counter' },
    { pos: new THREE.Vector3(COUNTER.x + COUNTER.w / 2 + 0.6, 0, ROOM.maxZ - 0.8) },
    { pos: new THREE.Vector3(AISLE_X, 0, ROOM.maxZ - 0.8), stop: 'door' },
    { pos: at(-2, -0.3), stop: 'tables' },
    { pos: at(-2, -5.3) },
    // Đứng trước quầy nướng ngó vào bếp
    { pos: new THREE.Vector3(KITCHEN.x + 1.2, 0, KITCHEN.frontZ + 1.1), stop: 'kitchen' },
    { pos: at(-2, -5.3) },
    { pos: at(5, -5.3) },
    { pos: at(5, -0.3) },
    { pos: at(9, -0.3) },
  ];
  /** Chủ quán bước ra từ "nhà trong" (góc tủ lạnh) */
  readonly bossSpawn = at(-8.6, -4.2);

  // --- Bàn lớn cho nhóm giang hồ ---
  readonly bigTableCenter = at(7, -3.2);
  readonly bigTableLabelAnchor = new THREE.Vector3(7 * S, 2.6, -3.2 * S);
  /** Ghế + lối đi vào từng ghế (từ cửa trong) */
  readonly gangSeats: readonly GangSeat[] = [];

  // --- Kệ menu cạnh cửa ---
  readonly menuShelfPoint = new THREE.Vector3(-5 * S, 0, ROOM.maxZ - 1.2);
  readonly menuShelfAnchor = new THREE.Vector3(-5 * S, 1.25, ROOM.maxZ - 0.4);

  // --- Mèo ---
  readonly catBed = new THREE.Vector3(ROOM.minX + 1, 0, -0.4 * S);
  /** Chỗ mèo hay mò tới khi đi lang thang (mèo chui gầm bàn thoải mái) */
  readonly catWanderPoints: readonly THREE.Vector3[] = [
    [-8, -1.6],
    [-7, 0.8],
    [-3.4, 0],
    [0.5, -0.6],
    [3, 1],
    [4, -1.6],
    [-6, 5.4],
    [-3.2, 4.8],
    [2.5, 6],
  ].map(([x, z]) => at(x, z));
  /** Mèo tò mò ra cửa — chỗ khách ra về dễ bế đi nhất */
  readonly catDoorSpot = new THREE.Vector3(AISLE_X + 0.8, 0, ROOM.maxZ - 0.8);

  constructor() {
    this.buildGround();
    this.buildWalls();
    this.buildCeilingAndRoof();
    this.buildTables();
    this.buildCounter();
    this.buildKitchen();
    this.buildBigTable();
    this.buildMenuShelf();
    this.buildCatBed();
    this.buildDecor();
    this.buildLamps();
    this.buildWallDecor();
    this.buildStreet();
    this.mergeStatic();
  }

  /**
   * Tối ưu cho điện thoại: quán dựng từ ~700 khối nhỏ = ~700 lượt vẽ mỗi khung hình (cộng thêm
   * lượt vẽ bóng). Gộp các khối tĩnh cùng vật liệu thành một mesh → còn vài chục lượt vẽ.
   * Vật nhỏ (chai lọ, nút tủ...) thì bỏ đổ bóng vì không ai để ý mà tốn thêm một lượt vẽ.
   */
  private mergeStatic(): void {
    const keep = new Set<THREE.Object3D>(this.cameraBlockers);
    // Vật liệu trơn chỉ khác màu (từ mat()) → gộp chung, màu ghi vào từng đỉnh
    const plain = new Set<THREE.Material>(this.materials.values());
    const groups = new Map<string, THREE.Mesh[]>();
    const size = new THREE.Vector3();
    for (const child of this.root.children) {
      if (!(child instanceof THREE.Mesh) || keep.has(child) || Array.isArray(child.material)) continue;
      child.updateMatrix();
      if (child.castShadow) {
        if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
        child.geometry.boundingBox?.getSize(size).multiply(child.scale);
        if (Math.max(size.x, size.y, size.z) < SMALL_PROP) child.castShadow = false;
      }
      const matKey = plain.has(child.material) ? 'plain' : child.material.uuid;
      const key = `${matKey}|${child.castShadow ? 1 : 0}`;
      const list = groups.get(key);
      if (list) list.push(child);
      else groups.set(key, [child]);
    }
    for (const meshes of groups.values()) {
      if (meshes.length < 2) continue;
      const first = meshes[0];
      const isPlain = plain.has(first.material as THREE.Material);
      let geos = meshes.map((m) => {
        const g = m.geometry.clone().applyMatrix4(m.matrix);
        if (isPlain) {
          const c = (m.material as THREE.MeshStandardMaterial).color;
          const n = g.attributes.position.count;
          const colors = new Float32Array(n * 3);
          for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3);
          g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        }
        return g;
      });
      // mergeGeometries cần tất cả cùng có (hoặc cùng không có) chỉ mục
      if (!geos.every((g) => g.index)) geos = geos.map((g) => (g.index ? g.toNonIndexed() : g));
      const merged = mergeGeometries(geos);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, isPlain ? this.vertexColorMat : first.material);
      mesh.castShadow = first.castShadow;
      mesh.receiveShadow = true;
      mesh.renderOrder = first.renderOrder;
      this.root.add(mesh);
      for (const m of meshes) {
        m.removeFromParent();
        m.geometry.dispose();
      }
    }
  }

  /** Đèn treo ánh vàng ấm trên mỗi bàn */
  private buildLamps(): void {
    const spots = [
      ...this.tables.map((t) => t.center),
      this.bigTableCenter,
      // Quầy và bếp: 2 đèn hai bên để không vướng biển treo ở giữa
      new THREE.Vector3(COUNTER.x - 1.25, 0, COUNTER.z),
      new THREE.Vector3(COUNTER.x + 1.25, 0, COUNTER.z),
      new THREE.Vector3(KITCHEN.x - 1.5, 0, KITCHEN.frontZ),
      new THREE.Vector3(KITCHEN.x + 1.5, 0, KITCHEN.frontZ),
    ];
    for (const c of spots) {
      const cordLen = WALL_H - 2.9;
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, cordLen), this.mat(0x222222));
      cord.position.set(c.x, WALL_H - cordLen / 2, c.z);
      const shade = new THREE.Mesh(
        new THREE.ConeGeometry(0.35, 0.3, 12, 1, true),
        this.shadeMat,
      );
      shade.position.set(c.x, 2.75, c.z);
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 10, 8),
        this.bulbMat,
      );
      bulb.position.set(c.x, 2.62, c.z);
      this.root.add(cord, shade, bulb);
    }
    // Vài nguồn sáng thật (ít thôi cho nhẹ máy)
    // Điện thoại: bỏ đèn điểm (bóng đèn vẫn tự phát sáng), bù bằng đèn trời
    const lit = [this.tables[0].center, this.tables[3].center, this.bigTableCenter].slice(0, QUALITY.pointLights);
    for (const c of lit) {
      const light = new THREE.PointLight(0xffc878, 7, 9, 2);
      light.position.set(c.x, 2.5, c.z);
      this.root.add(light);
    }
  }

  private buildWallDecor(): void {
    const wallZ = ROOM.minZ + 0.02;
    // Cửa sổ nhìn ra hẻm sau
    for (const x of [-3.6 * S, 8.2 * S]) {
      this.box(2.2, 1.4, 0.06, COLORS.woodDark, x, 1.75, wallZ);
      const glass = new THREE.Mesh(
        new THREE.PlaneGeometry(2, 1.2),
        new THREE.MeshStandardMaterial({ color: 0x9fd3ff, emissive: 0x5aa9e6, emissiveIntensity: 0.6 }),
      );
      glass.position.set(x, 1.75, wallZ + 0.04);
      this.root.add(glass);
      this.box(0.05, 1.2, 0.04, COLORS.woodDark, x, 1.75, wallZ + 0.06);
      this.box(2, 0.05, 0.04, COLORS.woodDark, x, 1.75, wallZ + 0.06);
    }
    // Poster cà khịa trên tường hai bên
    const posters: Array<{ text: string; x: number; z: number; rotY: number; color: string }> = [
      { text: DIALOGUES.posters[0], x: ROOM.maxX - 0.02, z: -4 * S, rotY: -Math.PI / 2, color: '#f1c40f' },
      { text: DIALOGUES.posters[1], x: ROOM.maxX - 0.02, z: 1.4 * S, rotY: -Math.PI / 2, color: '#e74c3c' },
      { text: DIALOGUES.posters[2], x: ROOM.minX + 0.02, z: 2.4 * S, rotY: Math.PI / 2, color: '#9b59b6' },
    ];
    for (const p of posters) {
      const plane = textPlane([p.text], { bg: p.color, fg: '#1b1b1b', width: 2.2, fontPx: 46 });
      plane.position.set(p.x, 1.9, p.z);
      plane.rotation.y = p.rotY;
      this.root.add(plane);
    }
    // Bảng thực đơn trên tường gần bếp
    const lines = [DIALOGUES.menuBoardTitle, ...MENU.map((d) => `${d.name} ...... ${formatMoney(d.price)}`)];
    const board = textPlane(lines, { bg: '#1e3b2b', fg: '#f5f5dc', width: 2.6, fontPx: 40, border: '#6e4527' });
    board.position.set(ROOM.minX + 0.02, 2.1, -3.4 * S);
    board.rotation.y = Math.PI / 2;
    this.root.add(board);
  }

  /** Đường phố trước quán: vỉa hè, lòng đường, xe máy đậu, cây, cột đèn */
  private buildStreet(): void {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(60, 9), new THREE.MeshStandardMaterial({ color: 0x3d3d3d }));
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, -0.01, ROOM.maxZ + 10);
    road.receiveShadow = true;
    this.root.add(road);
    for (let x = -28; x < 30; x += 4) this.box(2, 0.01, 0.2, 0xf5f5f5, x, 0, ROOM.maxZ + 10);
    // Viền vỉa hè
    this.box(60, 0.15, 0.3, 0xbdc3c7, 0, 0.07, ROOM.maxZ + 5.4);
    const bikeZ = ROOM.maxZ + 3.2;
    // Xe máy đậu trước quán
    const bikes: Array<[number, number]> = [
      [2.5, 0xc0392b],
      [4.3, 0x2980b9],
      [6.1, 0x27ae60],
    ];
    for (const [x, color] of bikes) {
      this.box(0.3, 0.5, 1.5, color, x, 0.55, bikeZ);
      this.box(0.32, 0.12, 0.7, 0x111111, x, 0.86, bikeZ + 0.15);
      for (const dz of [-0.6, 0.6]) {
        const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.07, 6, 12), new THREE.MeshStandardMaterial({ color: 0x111111 }));
        wheel.rotation.y = Math.PI / 2;
        wheel.position.set(x, 0.28, bikeZ + dz);
        wheel.castShadow = true;
        this.root.add(wheel);
      }
      this.box(0.6, 0.06, 0.06, 0x888888, x, 1.05, bikeZ - 0.65);
    }
    // Cây xanh
    for (const [x, z] of [
      [-7 * S, ROOM.maxZ + 3],
      [9 * S, ROOM.maxZ + 3.5],
    ] as const) {
      this.box(0.35, 1.8, 0.35, 0x6e4527, x, 0.9, z);
      this.box(1.6, 1.2, 1.6, 0x2e8b57, x, 2.2, z);
      this.box(1.1, 0.8, 1.1, 0x3cb371, x, 3, z);
    }
    // Ghế nhựa đỏ vỉa hè (đặc sản)
    for (const [x, z] of [
      [-5 * S, ROOM.maxZ + 2.2],
      [-5 * S + 0.8, ROOM.maxZ + 2.6],
    ] as const) {
      this.box(0.4, 0.35, 0.4, 0xe74c3c, x, 0.175, z);
    }
  }

  private buildBigTable(): void {
    const c = this.bigTableCenter;
    const w = 2.4;
    const d = 1.6;
    this.buildTableFrame(c.x, c.z, w, d);
    // Chai bia (thân + cổ chai) + gạt tàn cho đúng chất
    for (const [bx, bz] of [[-0.4, 0], [0.15, 0.22], [-0.1, -0.25]] as const) {
      this.cyl(0.06, 0.06, 0.24, 0x1e8449, c.x + bx, TABLE_TOP_Y + 0.12, c.z + bz);
      this.cyl(0.022, 0.05, 0.12, 0x1e8449, c.x + bx, TABLE_TOP_Y + 0.3, c.z + bz);
    }
    this.cyl(0.14, 0.12, 0.05, 0x95a5a6, c.x + 0.6, TABLE_TOP_Y + 0.025, c.z - 0.2);
    this.hangingSign([DIALOGUE_LABELS.gangTable], '#141414', '#f1c40f', 1.6, c.x, c.z, 0);

    // Lối chung: cửa trong → giữa quán → cạnh trái bàn lớn
    const midZ = -0.9 * S;
    const westX = c.x - w / 2 - 0.5;
    const south = c.z + d / 2 + 0.65;
    const north = c.z - d / 2 - 0.65;
    const common = [new THREE.Vector3(AISLE_X, 0, midZ), new THREE.Vector3(westX, 0, midZ)];
    const seats: GangSeat[] = [];
    for (const x of [c.x - 0.6, c.x + 0.6]) {
      const seat = new THREE.Vector3(x, 0, south);
      seats.push({ seat, path: [...common, new THREE.Vector3(x, 0, midZ), seat] });
    }
    for (const x of [c.x - 0.6, c.x + 0.6]) {
      const seat = new THREE.Vector3(x, 0, north);
      seats.push({ seat, path: [...common, new THREE.Vector3(westX, 0, north), seat] });
    }
    // Ghế đẩu tròn bọc da đen, chân thép
    for (const s of seats) {
      this.cyl(0.26, 0.26, 0.08, 0x2c3e50, s.seat.x, 0.46, s.seat.z);
      this.cyl(0.18, 0.2, 0.02, 0x1a252f, s.seat.x, 0.51, s.seat.z);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        this.box(0.04, 0.42, 0.04, 0x7f8c8d, s.seat.x + Math.cos(a) * 0.17, 0.21, s.seat.z + Math.sin(a) * 0.17);
      }
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.015, 6, 16), this.mat(0x7f8c8d));
      ring.rotation.x = Math.PI / 2;
      ring.position.set(s.seat.x, 0.16, s.seat.z);
      this.root.add(ring);
    }
    (this.gangSeats as GangSeat[]).push(...seats);
  }

  /**
   * Kệ menu sát tường cửa: tủ gỗ mở mặt quay vào quán, hai ngăn xếp menu,
   * trên nóc là chỗ đặt tấm menu cho người chơi lấy (GangSystem đặt tấm menu tím lên đây).
   */
  private buildMenuShelf(): void {
    const a = this.menuShelfAnchor;
    const w = 1.2;
    const h = 1.1;
    const d = 0.5;
    const front = a.z - d / 2; // mặt mở quay vào trong quán (về phía Bắc)
    // Khung tủ: lưng, hai hông, đáy, nóc gỗ vân
    this.box(w, h, 0.04, COLORS.woodDark, a.x, h / 2, a.z + d / 2 - 0.02);
    for (const side of [-1, 1]) this.box(0.05, h, d, COLORS.woodDark, a.x + side * (w / 2 - 0.025), h / 2, a.z);
    this.box(w, 0.1, d, 0x3b2516, a.x, 0.05, a.z);
    const topSlab = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, 0.05, d + 0.06), this.woodMat);
    topSlab.position.set(a.x, h + 0.025, a.z);
    topSlab.castShadow = topSlab.receiveShadow = true;
    this.root.add(topSlab);
    this.colliders.push(aabbFromCenter(a.x, a.z, w + 0.08, d + 0.06));
    // Hai ngăn kệ + chồng menu (bìa đỏ, nâu, xanh) trong mỗi ngăn
    const covers = [0xc0392b, 0x8e44ad, 0x6e4527, 0x16a085];
    for (const [i, y] of [0.42, 0.78].entries()) {
      this.box(w - 0.1, 0.03, d - 0.06, COLORS.wood, a.x, y - 0.015, a.z);
      for (let stack = 0; stack < 2; stack++) {
        const sx = a.x + (stack ? 0.25 : -0.25);
        const count = 4 + ((i + stack) % 2) * 2;
        for (let k = 0; k < count; k++) {
          const m = this.box(0.36, 0.022, 0.3, covers[(k + stack + i) % covers.length], sx, y + 0.012 + k * 0.024, a.z + 0.02);
          m.rotation.y = ((k * 7) % 5) * 0.03 - 0.06; // xếp hơi lệch cho có hơi người dùng
        }
      }
    }
    // Viền đỏ trang trí mép trước ngăn trên
    this.box(w - 0.06, 0.04, 0.03, COLORS.wallTrim, a.x, h - 0.06, front);
    // Hộp đựng bút + ống tăm trên nóc, chừa chỗ giữa cho tấm menu
    this.cyl(0.05, 0.05, 0.14, 0x2d3436, a.x + 0.45, h + 0.12, a.z + 0.1);
    for (const dx of [-0.015, 0.015]) this.box(0.01, 0.16, 0.01, dx > 0 ? 0x2980b9 : 0xc0392b, a.x + 0.45 + dx, h + 0.2, a.z + 0.1);
    this.cyl(0.035, 0.035, 0.1, 0xf5deb3, a.x - 0.45, h + 0.1, a.z + 0.1);
    // Bảng "MENU" dán tường phía trên, có khung gỗ
    const label = textPlane([DIALOGUE_LABELS.menu], { bg: '#8e44ad', fg: '#ffffff', width: 1.1, fontPx: 56, border: '#f1c40f' });
    label.position.set(a.x, 1.95, ROOM.maxZ - 0.03);
    label.rotation.y = Math.PI;
    this.root.add(label);
    this.box(1.22, 0.74, 0.03, COLORS.woodDark, a.x, 1.95, ROOM.maxZ - 0.015);
  }

  private buildCatBed(): void {
    const b = this.catBed;
    // Biển dán tường ngay trên ổ cho dễ tìm
    const sign = textPlane(['🐱 Ổ MÈO'], { bg: '#fd79a8', fg: '#ffffff', width: 1.3, fontPx: 60, border: '#e84393' });
    sign.position.set(ROOM.minX + 0.02, 1.7, b.z);
    sign.rotation.y = Math.PI / 2;
    this.root.add(sign);
    // Ổ mèo: đệm tròn + viền
    const bed = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.6, 0.15, 16),
      new THREE.MeshStandardMaterial({ color: 0xe84393 }),
    );
    bed.position.set(b.x, 0.075, b.z);
    bed.receiveShadow = true;
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.55, 0.1, 8, 20),
      new THREE.MeshStandardMaterial({ color: 0xfd79a8 }),
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.set(b.x, 0.17, b.z);
    this.root.add(bed, rim);
    // Chén cơm mèo
    this.box(0.3, 0.1, 0.3, 0x0984e3, b.x + 0.2, 0.05, b.z + 0.9);
  }

  private box(
    w: number,
    h: number,
    d: number,
    color: number | THREE.Material,
    x: number,
    y: number,
    z: number,
    collide = false,
  ): THREE.Mesh {
    const material = typeof color === 'number' ? this.mat(color) : color;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.root.add(mesh);
    if (collide) this.colliders.push(aabbFromCenter(x, z, w, d));
    return mesh;
  }

  private mat(color: number): THREE.MeshStandardMaterial {
    let m = this.materials.get(color);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color });
      this.materials.set(color, m);
    }
    return m;
  }

  /** Khối trụ đặt theo tâm (chai lọ, ghế đẩu...) */
  private cyl(rTop: number, rBot: number, h: number, mat: number | THREE.Material, x: number, y: number, z: number): THREE.Mesh {
    const material = typeof mat === 'number' ? this.mat(mat) : mat;
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, 14), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.root.add(mesh);
    return mesh;
  }

  /**
   * Bàn gỗ: mặt gỗ vân, khung yếm dưới mặt, 4 chân vuông có đế.
   * Chỉ mặt bàn có va chạm (chân nằm trong mặt bàn).
   */
  private buildTableFrame(x: number, z: number, w: number, d: number): THREE.Mesh {
    const topY = TABLE_TOP_Y - TABLE_TOP_T / 2;
    const top = new THREE.Mesh(new THREE.BoxGeometry(w, TABLE_TOP_T, d), this.woodMat);
    top.position.set(x, topY, z);
    top.castShadow = top.receiveShadow = true;
    this.root.add(top);
    this.colliders.push(aabbFromCenter(x, z, w, d));
    // Nẹp cạnh tối màu cho mặt bàn có viền rõ
    const edgeY = topY - TABLE_TOP_T / 2 - 0.015;
    this.box(w + 0.02, 0.03, 0.03, COLORS.woodDark, x, edgeY, z - d / 2);
    this.box(w + 0.02, 0.03, 0.03, COLORS.woodDark, x, edgeY, z + d / 2);
    this.box(0.03, 0.03, d, COLORS.woodDark, x - w / 2, edgeY, z);
    this.box(0.03, 0.03, d, COLORS.woodDark, x + w / 2, edgeY, z);
    // Yếm bàn
    const inset = 0.1;
    const apronY = topY - TABLE_TOP_T / 2 - 0.07;
    this.box(w - inset * 2, 0.1, 0.04, COLORS.woodDark, x, apronY, z - d / 2 + inset);
    this.box(w - inset * 2, 0.1, 0.04, COLORS.woodDark, x, apronY, z + d / 2 - inset);
    this.box(0.04, 0.1, d - inset * 2, COLORS.woodDark, x - w / 2 + inset, apronY, z);
    this.box(0.04, 0.1, d - inset * 2, COLORS.woodDark, x + w / 2 - inset, apronY, z);
    // Chân + đế cao su
    const legH = topY - TABLE_TOP_T / 2;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const lx = x + sx * (w / 2 - inset);
        const lz = z + sz * (d / 2 - inset);
        this.box(0.08, legH, 0.08, COLORS.woodDark, lx, legH / 2, lz);
        this.box(0.1, 0.03, 0.1, 0x222222, lx, 0.015, lz);
      }
    }
    return top;
  }

  /** Ghế gỗ có tựa: `dir` là hướng từ bàn ra lối đi (tựa lưng nằm phía đó) */
  private buildChair(x: number, z: number, dir: number): void {
    const seatY = 0.46;
    this.box(0.5, 0.05, 0.5, COLORS.wood, x, seatY, z);
    // Đệm ngồi đỏ
    this.box(0.44, 0.03, 0.44, 0xc0392b, x, seatY + 0.04, z);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        this.box(0.045, seatY, 0.045, COLORS.woodDark, x + sx * 0.21, seatY / 2, z + sz * 0.21);
      }
    }
    // Thanh giằng chân cho chắc
    this.box(0.04, 0.03, 0.42, COLORS.woodDark, x - 0.21, 0.15, z);
    this.box(0.04, 0.03, 0.42, COLORS.woodDark, x + 0.21, 0.15, z);
    // Tựa lưng: 2 trụ + 2 nan ngang
    const bx = x + dir * 0.22;
    for (const sz of [-1, 1]) this.box(0.05, 0.5, 0.05, COLORS.woodDark, bx, seatY + 0.27, z + sz * 0.21);
    this.box(0.04, 0.1, 0.46, COLORS.wood, bx, seatY + 0.44, z);
    this.box(0.04, 0.06, 0.46, COLORS.wood, bx, seatY + 0.25, z);
  }

  /** Khay gia vị gọn gàng: ống đũa, tương ớt, xì dầu, hộp giấy ăn */
  private buildCondimentTray(x: number, z: number): void {
    const y = TABLE_TOP_Y;
    this.box(0.24, 0.02, 0.5, 0x5d3a1f, x, y + 0.01, z);
    // Ống đũa
    this.cyl(0.05, 0.05, 0.18, 0x8e5a3c, x, y + 0.11, z - 0.16);
    for (const [dx, dz] of [[-0.02, -0.01], [0.015, 0.015], [0.02, -0.02]] as const) {
      this.box(0.012, 0.22, 0.012, 0xf5deb3, x + dx, y + 0.2, z - 0.16 + dz);
    }
    // Tương ớt + xì dầu (thân + nắp)
    this.cyl(0.035, 0.04, 0.16, 0xd63031, x - 0.04, y + 0.1, z + 0.02);
    this.cyl(0.02, 0.02, 0.04, 0x2ecc71, x - 0.04, y + 0.2, z + 0.02);
    this.cyl(0.035, 0.04, 0.16, 0x3d2314, x + 0.05, y + 0.1, z + 0.06);
    this.cyl(0.02, 0.02, 0.04, 0xe74c3c, x + 0.05, y + 0.2, z + 0.06);
    // Hộp giấy ăn
    this.box(0.14, 0.08, 0.12, 0xffffff, x, y + 0.06, z + 0.18);
    this.box(0.06, 0.03, 0.06, 0xf5f6fa, x, y + 0.115, z + 0.18);
  }

  private buildGround(): void {
    // Sàn gạch ceramic 2 tông kem ấm, có ron (mỗi texture = 2×2 viên)
    const w = ROOM.maxX - ROOM.minX;
    const d = ROOM.maxZ - ROOM.minZ;
    const tex = canvasTexture(
      512,
      (ctx, rnd) => drawTiles(ctx, rnd, 512, 2, ['#efe3cb', '#ddc8a2'], '#a8977b'),
      3,
    );
    tex.repeat.set(w / (FLOOR_TILE * 2), d / (FLOOR_TILE * 2));
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.root.add(floor);

    // Khu bếp: gạch men nhỏ trắng xám, viền inox ngăn với khu ăn
    const kw = KITCHEN_ZONE.maxX - KITCHEN_ZONE.minX;
    const kd = KITCHEN_ZONE.maxZ - KITCHEN_ZONE.minZ;
    const kTex = kitchenTileTexture();
    kTex.repeat.set(kw / (KITCHEN_TILE * 4), kd / (KITCHEN_TILE * 4));
    const kFloor = new THREE.Mesh(new THREE.PlaneGeometry(kw, kd), new THREE.MeshStandardMaterial({ map: kTex, roughness: 0.4 }));
    kFloor.rotation.x = -Math.PI / 2;
    kFloor.position.set(KITCHEN_ZONE.minX + kw / 2, 0.004, KITCHEN_ZONE.minZ + kd / 2);
    kFloor.receiveShadow = true;
    this.root.add(kFloor);
    this.box(kw, 0.012, 0.06, COLORS.steel, KITCHEN_ZONE.minX + kw / 2, 0.006, KITCHEN_ZONE.maxZ);
    this.box(0.06, 0.012, kd, COLORS.steel, KITCHEN_ZONE.maxX, 0.006, KITCHEN_ZONE.minZ + kd / 2);

    // Vỉa hè bên ngoài
    const street = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 50),
      new THREE.MeshStandardMaterial({ color: 0x7f8c8d }),
    );
    street.rotation.x = -Math.PI / 2;
    street.position.y = -0.02;
    street.receiveShadow = true;
    this.root.add(street);
  }

  private buildWalls(): void {
    const w = ROOM.maxX - ROOM.minX;
    const d = ROOM.maxZ - ROOM.minZ;
    // Bắc, Tây, Đông
    this.cameraBlockers.push(
      this.box(w + WALL_T * 2, WALL_H, WALL_T, COLORS.wall, 0, WALL_H / 2, ROOM.minZ - WALL_T / 2, true),
      this.box(WALL_T, WALL_H, d, COLORS.wall, ROOM.minX - WALL_T / 2, WALL_H / 2, 0, true),
      this.box(WALL_T, WALL_H, d, COLORS.wall, ROOM.maxX + WALL_T / 2, WALL_H / 2, 0, true),
    );
    // Viền đỏ chân tường
    this.box(w, 0.3, 0.05, COLORS.wallTrim, 0, 0.15, ROOM.minZ + 0.03);

    // Nam: hai đoạn tường cao, chừa cửa ở giữa lối đi
    const southZ = ROOM.maxZ + WALL_T / 2;
    const leftW = AISLE_X - DOOR_HALF - (ROOM.minX - WALL_T);
    const rightW = ROOM.maxX + WALL_T - (AISLE_X + DOOR_HALF);
    this.cameraBlockers.push(
      this.box(leftW, WALL_H, WALL_T, COLORS.wall, ROOM.minX - WALL_T + leftW / 2, WALL_H / 2, southZ, true),
      this.box(rightW, WALL_H, WALL_T, COLORS.wall, AISLE_X + DOOR_HALF + rightW / 2, WALL_H / 2, southZ, true),
    );
    // Khung cửa + mảng tường phía trên cửa
    for (const side of [-1, 1]) {
      this.box(0.2, DOOR_H, WALL_T + 0.05, COLORS.woodDark, AISLE_X + side * DOOR_HALF, DOOR_H / 2, southZ);
    }
    this.box(DOOR_HALF * 2 + 0.2, 0.2, WALL_T + 0.05, COLORS.woodDark, AISLE_X, DOOR_H, southZ);
    const lintelH = WALL_H - DOOR_H - 0.1;
    this.cameraBlockers.push(
      this.box(DOOR_HALF * 2, lintelH, WALL_T, COLORS.wall, AISLE_X, DOOR_H + 0.1 + lintelH / 2, southZ),
    );
    // Viền đỏ chân tường hai bên + đường chỉ gỗ sát trần
    this.box(0.05, 0.3, d, COLORS.wallTrim, ROOM.minX + 0.03, 0.15, 0);
    this.box(0.05, 0.3, d, COLORS.wallTrim, ROOM.maxX - 0.03, 0.15, 0);
    this.box(w, 0.18, 0.06, COLORS.woodDark, 0, WALL_H - 0.09, ROOM.minZ + 0.03);
    this.box(w, 0.18, 0.06, COLORS.woodDark, 0, WALL_H - 0.09, ROOM.maxZ - 0.03);
    this.box(0.06, 0.18, d, COLORS.woodDark, ROOM.minX + 0.03, WALL_H - 0.09, 0);
    this.box(0.06, 0.18, d, COLORS.woodDark, ROOM.maxX - 0.03, WALL_H - 0.09, 0);
    // Chặn vô hình ở cửa: nhân viên không được trốn ca (khách thì đi xuyên)
    this.colliders.push(aabbFromCenter(AISLE_X, southZ, DOOR_HALF * 2, WALL_T));
    // Thảm chùi chân
    this.box(1.8, 0.02, 0.9, 0xb03a2e, AISLE_X, 0.01, ROOM.maxZ - 0.6);
  }

  /** Biển treo dưới trần bằng 2 sợi xích, chữ đọc được cả hai mặt */
  private hangingSign(
    lines: readonly string[],
    bg: string,
    fg: string,
    width: number,
    x: number,
    z: number,
    rotY: number,
  ): void {
    const sign = doubleSidedSign(lines, { bg, fg, width, fontPx: 64, border: '#2b1d14' });
    sign.position.set(x, SIGN_Y, z);
    sign.rotation.y = rotY;
    this.root.add(sign);
    const chainLen = WALL_H - SIGN_Y;
    for (const side of [-1, 1]) {
      const chain = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.012, chainLen, 4),
        new THREE.MeshStandardMaterial({ color: 0x555555 }),
      );
      chain.position.set(side * width * 0.4, chainLen / 2, 0);
      sign.add(chain);
    }
  }

  /** Trần gỗ trong quán + mái ngói bên ngoài. Không đổ bóng để nắng vẫn lọt vào cho sáng. */
  private buildCeilingAndRoof(): void {
    const w = ROOM.maxX - ROOM.minX + WALL_T * 2;
    const d = ROOM.maxZ - ROOM.minZ + WALL_T * 2;

    // Trần: tấm gỗ sáng + các thanh xà ngang
    const ceiling = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.12, d),
      // Trần không được nắng chiếu → tự phát sáng nhẹ cho khỏi tối om
      new THREE.MeshStandardMaterial({ color: 0xe8cfa6, roughness: 0.9, emissive: 0x6b5236, emissiveIntensity: 0.6 }),
    );
    ceiling.position.y = WALL_H + 0.06;
    this.root.add(ceiling);
    this.cameraBlockers.push(ceiling);
    for (let x = ROOM.minX + 1.6; x < ROOM.maxX; x += 3.2) {
      const beam = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.25, d - WALL_T * 2),
        new THREE.MeshStandardMaterial({ color: COLORS.woodDark }),
      );
      beam.position.set(x, WALL_H - 0.125, 0);
      this.root.add(beam);
    }

    // Mái ngói hai mái, sống mái chạy dọc trục X
    const pitch = 0.42;
    const overhang = 0.8;
    const halfD = d / 2 + overhang;
    const slope = halfD / Math.cos(pitch);
    const rise = halfD * Math.tan(pitch);
    const tileMat = new THREE.MeshStandardMaterial({ color: 0xb5452a, roughness: 0.85 });
    const roofBase = WALL_H + 0.12;
    for (const side of [-1, 1]) {
      const roof = new THREE.Mesh(new THREE.BoxGeometry(w + overhang * 2, 0.18, slope), tileMat);
      roof.rotation.x = side * pitch;
      roof.position.set(0, roofBase + rise / 2, (side * halfD) / 2);
      this.root.add(roof);
      // Gờ ngói cho có vân
      for (let i = 1; i < 7; i++) {
        const t = i / 7;
        const ridge = new THREE.Mesh(new THREE.BoxGeometry(w + overhang * 2, 0.07, 0.1), tileMat);
        ridge.rotation.x = side * pitch;
        ridge.position.set(0, roofBase + 0.12 + rise * (1 - t), side * halfD * t);
        this.root.add(ridge);
      }
    }
    // Đầu hồi tam giác hai bên
    const gable = new THREE.Shape();
    gable.moveTo(-d / 2, 0);
    gable.lineTo(d / 2, 0);
    gable.lineTo(0, (d / 2) * Math.tan(pitch));
    gable.closePath();
    const gableGeo = new THREE.ExtrudeGeometry(gable, { depth: WALL_T, bevelEnabled: false });
    for (const x of [ROOM.minX - WALL_T, ROOM.maxX]) {
      const g = new THREE.Mesh(gableGeo, new THREE.MeshStandardMaterial({ color: COLORS.wall }));
      g.rotation.y = Math.PI / 2;
      g.position.set(x, roofBase, 0);
      this.root.add(g);
    }
  }

  private buildTables(): void {
    for (const t of TABLE_LAYOUT) {
      this.buildTableFrame(t.x, t.z, TABLE_SIZE, TABLE_SIZE);
      // Ghế đặt phía lối đi
      const dir = t.x < AISLE_X ? 1 : -1;
      const seat = new THREE.Vector3(t.x + dir * SEAT_OFFSET, 0, t.z);
      this.buildChair(seat.x, seat.z, dir);
      // Tấm lót đĩa trước chỗ khách (đĩa bánh hiện ra đúng chỗ này)
      this.box(0.62, 0.008, 0.42, 0xf5ecd7, t.x + dir * 0.47, TABLE_TOP_Y + 0.004, t.z + 0.15);
      // Khay gia vị dồn về mép xa ghế cho gọn
      const trayX = t.x - dir * 0.5;
      this.buildCondimentTray(trayX, t.z);

      // Số bàn: biển treo dưới trần (quay về lối đi) + thẻ nhỏ dựng cạnh khay
      this.hangingSign([`BÀN ${t.number}`], '#2d3436', '#ffffff', 1.1, t.x, t.z, Math.PI / 2);
      const card = doubleSidedSign([`${t.number}`], { bg: '#ffffff', fg: '#c0392b', width: 0.22, fontPx: 90 });
      card.position.set(trayX, TABLE_TOP_Y + 0.13, t.z - 0.5);
      card.rotation.y = Math.PI / 2;
      this.root.add(card);

      this.tables.push({
        number: t.number,
        center: new THREE.Vector3(t.x, 0, t.z),
        seat,
        aisle: new THREE.Vector3(AISLE_X, 0, t.z),
      });
    }
  }

  /** Ổ bánh mì nằm ngang (dọc trục X) */
  private bread(x: number, y: number, z: number, len = 0.36, color = 0xe1b06b, alongZ = false): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, len, 4, 10), this.mat(color));
    if (alongZ) m.rotation.x = Math.PI / 2;
    else m.rotation.z = Math.PI / 2;
    m.position.set(x, y, z);
    m.castShadow = true;
    this.root.add(m);
    return m;
  }

  /** Hộp kính trong suốt (không đổ bóng để không che đồ bên trong) */
  private glass(w: number, h: number, d: number, x: number, y: number, z: number): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.glassMat);
    m.position.set(x, y, z);
    m.renderOrder = 1;
    this.root.add(m);
    return m;
  }

  /**
   * Quầy thu ngân nằm ngang: mặt trước ốp nan gỗ hướng ra cửa (khách đứng đây),
   * phía sau là chỗ nhân viên + tủ sau quầy. Trên quầy: tủ kính bánh mì, máy tính tiền,
   * sổ tay, chuông, bảng QR, hũ tiền tip.
   */
  private buildCounter(): void {
    const { x, z, w, d, h } = COUNTER;
    const front = z + d / 2;
    const back = z - d / 2;
    const top = COUNTER_TOP;

    // --- Thân quầy ---
    this.box(w, h, d, COLORS.counter, x, h / 2, z);
    this.colliders.push(aabbFromCenter(x, z + 0.05, w + 0.2, d + 0.2));
    // Đế đá tối lùi vào cho quầy trông "nổi"
    this.box(w + 0.02, 0.12, d + 0.02, 0x3b2516, x, 0.06, z);
    // Ốp nan gỗ dọc mặt trước
    const slats = 16;
    const slatH = h - 0.34;
    for (let i = 0; i < slats; i++) {
      const sx = x - w / 2 + (i + 0.5) * (w / slats);
      this.box(w / slats - 0.045, slatH, 0.03, i % 2 ? COLORS.wood : 0xa8743f, sx, 0.14 + slatH / 2, front + 0.015);
    }
    // Hai cột góc + viền đỏ ngay dưới mặt quầy
    for (const side of [-1, 1]) this.box(0.08, h, 0.08, COLORS.woodDark, x + side * (w / 2 - 0.02), h / 2, front);
    this.box(w + 0.04, 0.1, 0.05, COLORS.wallTrim, x, h - 0.12, front + 0.02);
    // Bảng tên trên mặt trước
    const plate = textPlane(['🥖 THU NGÂN • TÍNH TIỀN'], { bg: '#2d3436', fg: '#ffeaa7', width: 1.5, fontPx: 48, border: '#f1c40f' });
    plate.position.set(x + 0.55, h * 0.52, front + 0.035);
    this.root.add(plate);

    // --- Mặt quầy gỗ nhô ra phía khách + nẹp cạnh ---
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.06, d + 0.2), this.woodMat);
    slab.position.set(x, h + 0.03, z + 0.05);
    slab.castShadow = slab.receiveShadow = true;
    this.root.add(slab);
    this.box(w + 0.22, 0.03, 0.03, COLORS.woodDark, x, h + 0.015, front + 0.15);

    // --- Tủ kính bánh mì (đầu Tây, hướng ra khách) ---
    const cx = x - w / 2 + 0.7;
    const cw = 1.1;
    const ch = 0.5;
    const cd = 0.6;
    const cz = z + 0.05;
    this.box(cw + 0.04, 0.05, cd + 0.04, COLORS.wallTrim, cx, top + 0.025, cz);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        this.box(0.035, ch, 0.035, COLORS.wallTrim, cx + sx * cw / 2, top + 0.05 + ch / 2, cz + sz * cd / 2);
      }
    }
    this.box(cw + 0.04, 0.04, cd + 0.04, COLORS.wallTrim, cx, top + 0.07 + ch, cz);
    this.glass(cw, ch, cd, cx, top + 0.05 + ch / 2, cz);
    // Kệ giữa tủ + bánh mì xếp hai tầng
    this.box(cw - 0.04, 0.015, cd - 0.04, this.steelMat, cx, top + 0.3, cz);
    // Bánh xếp dọc theo chiều sâu tủ, khách nhìn vào thấy từng ổ
    for (let i = 0; i < 5; i++) this.bread(cx - 0.4 + i * 0.2, top + 0.11, cz, 0.36, 0xe1b06b, true);
    for (let i = 0; i < 4; i++) this.bread(cx - 0.3 + i * 0.2, top + 0.37, cz, 0.32, 0xd9a35a, true);
    const caseSign = textPlane(['BÁNH MÌ NÓNG GIÒN'], { bg: '#f1c40f', fg: '#c0392b', width: 0.9, fontPx: 44 });
    caseSign.position.set(cx, top + 0.66, cz + cd / 2);
    this.root.add(caseSign);

    // --- Máy tính tiền ở giữa: màn hình quay về nhân viên, màn phụ quay ra khách ---
    const rx = x + 0.15;
    const rz = z - 0.05;
    this.box(0.46, 0.1, 0.42, 0x2d3436, rx, top + 0.05, rz); // ngăn kéo tiền
    this.box(0.4, 0.12, 0.3, 0x3d4648, rx, top + 0.16, rz + 0.03);
    // Bàn phím
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 4; c++) {
        this.box(0.05, 0.015, 0.04, r === 2 && c === 3 ? 0x27ae60 : 0xdfe6e9, rx - 0.11 + c * 0.075, top + 0.225, rz - 0.06 + r * 0.06);
      }
    }
    const screen = new THREE.Group();
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.03), this.mat(0x1e272e));
    const lcd = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.18), this.screenMat);
    lcd.rotation.y = Math.PI;
    lcd.position.z = -0.016;
    screen.add(bezel, lcd);
    screen.position.set(rx, top + 0.36, rz - 0.15);
    screen.rotation.x = 0.35; // ngả về sau cho nhân viên dễ nhìn
    this.root.add(screen);
    this.box(0.03, 0.12, 0.03, 0x1e272e, rx, top + 0.25, rz - 0.13);
    // Màn phụ cho khách
    this.box(0.025, 0.2, 0.025, 0x1e272e, rx + 0.17, top + 0.32, rz + 0.17);
    this.box(0.2, 0.08, 0.03, 0x1e272e, rx + 0.17, top + 0.45, rz + 0.17);
    const cust = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.055), this.screenMat);
    cust.position.set(rx + 0.17, top + 0.45, rz + 0.186);
    this.root.add(cust);

    // --- Sổ tay mở trên quầy, sát chỗ nhân viên (đầu Đông) ---
    const bx = x + w / 2 - 0.55;
    const bz = back + 0.25;
    this.box(0.52, 0.02, 0.36, 0xf39c12, bx, top + 0.01, bz);
    for (const side of [-1, 1]) {
      const page = this.box(0.24, 0.015, 0.33, 0xfffdf3, bx + side * 0.125, top + 0.028, bz);
      page.rotation.z = side * -0.04;
      for (let l = 0; l < 4; l++) this.box(0.18, 0.003, 0.008, 0x34495e, bx + side * 0.125, top + 0.038, bz - 0.11 + l * 0.07);
    }
    const pen = this.cyl(0.008, 0.008, 0.16, 0x2980b9, bx + 0.32, top + 0.015, bz + 0.05);
    pen.rotation.x = Math.PI / 2;
    pen.rotation.z = 0.5;

    // --- Chuông gọi + hũ tip + bảng QR (phía khách) ---
    this.cyl(0.07, 0.07, 0.015, 0x2d3436, x + 0.75, top + 0.008, front - 0.08);
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), this.mat(0xf1c40f));
    bell.position.set(x + 0.75, top + 0.015, front - 0.08);
    this.root.add(bell);
    this.cyl(0.012, 0.012, 0.025, 0xf1c40f, x + 0.75, top + 0.085, front - 0.08);

    const jarX = x + w / 2 - 0.25;
    const jarZ = front - 0.05;
    for (let i = 0; i < 5; i++) this.cyl(0.03, 0.03, 0.01, 0xf1c40f, jarX + (i % 3) * 0.02 - 0.02, top + 0.01 + i * 0.012, jarZ + (i % 2) * 0.02);
    this.box(0.05, 0.06, 0.005, 0x27ae60, jarX, top + 0.07, jarZ); // tiền giấy
    const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.07, 0.18, 14), this.glassMat);
    jar.position.set(jarX, top + 0.09, jarZ);
    jar.renderOrder = 1;
    this.root.add(jar);

    const qr = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.237), new THREE.MeshStandardMaterial({ map: qrTexture() }));
    qr.position.set(x + 1.0 - 0.5, top + 0.13, front - 0.02);
    qr.rotation.x = -0.18;
    this.root.add(qr);
    this.box(0.22, 0.26, 0.015, 0x2d3436, x + 0.5, top + 0.13, front - 0.035).rotation.x = -0.18;

    this.hangingSign(['THU NGÂN'], '#27ae60', '#ffffff', 1.8, x, z, 0);

    // --- Tủ thấp sau lưng nhân viên (thấp để camera vẫn nhìn qua được) ---
    const tz = this.counterPoint.z - 0.95;
    const tw = 2.6;
    const th = 0.95;
    this.box(tw, th, 0.5, COLORS.woodDark, x, th / 2, tz, true);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(tw + 0.08, 0.05, 0.58), this.woodMat);
    cab.position.set(x, th + 0.025, tz);
    cab.castShadow = cab.receiveShadow = true;
    this.root.add(cab);
    // 4 cánh tủ quay về phía nhân viên + núm
    for (let i = 0; i < 4; i++) {
      const dx = x - tw / 2 + (i + 0.5) * (tw / 4);
      this.box(tw / 4 - 0.06, th - 0.2, 0.02, COLORS.wood, dx, th / 2 + 0.03, tz + 0.26);
      this.cyl(0.02, 0.02, 0.03, 0xf1c40f, dx + (i % 2 ? -0.22 : 0.22), th / 2 + 0.1, tz + 0.28).rotation.x = Math.PI / 2;
    }
    const ctop = th + 0.05;
    // Chồng túi giấy gói bánh
    for (let i = 0; i < 5; i++) this.box(0.32, 0.015, 0.22, i % 2 ? 0xd7b98e : 0xc9a97a, x - 1.0, ctop + 0.008 + i * 0.016, tz);
    // Hàng nước ngọt
    const drinks = [0xc0392b, 0x27ae60, 0xe67e22, 0x2980b9, 0xc0392b, 0x8e44ad];
    drinks.forEach((c, i) => {
      this.cyl(0.035, 0.035, 0.2, c, x - 0.5 + i * 0.1, ctop + 0.1, tz - 0.05);
      this.cyl(0.015, 0.025, 0.05, c, x - 0.5 + i * 0.1, ctop + 0.225, tz - 0.05);
    });
    // Mèo thần tài vẫy khách
    this.buildLuckyCat(x + 0.95, ctop, tz);
  }

  /** Mèo thần tài vàng (khối hộp), quay mặt ra cửa */
  private buildLuckyCat(x: number, y: number, z: number): void {
    const gold = 0xf5c518;
    this.box(0.18, 0.04, 0.16, 0xc0392b, x, y + 0.02, z);
    this.box(0.16, 0.16, 0.13, gold, x, y + 0.12, z);
    this.box(0.15, 0.13, 0.12, gold, x, y + 0.27, z);
    for (const side of [-1, 1]) this.box(0.04, 0.05, 0.03, gold, x + side * 0.05, y + 0.355, z);
    this.box(0.1, 0.012, 0.005, 0x2d3436, x, y + 0.28, z + 0.062);
    this.box(0.04, 0.03, 0.005, 0xc0392b, x, y + 0.24, z + 0.062);
    this.box(0.04, 0.12, 0.04, gold, x + 0.1, y + 0.29, z + 0.02);
    this.box(0.12, 0.06, 0.012, 0xffffff, x, y + 0.13, z + 0.068);
  }

  /**
   * Bếp hai dãy: bàn bếp sát tường (bếp gas, thớt, gia vị, máy hút mùi) và quầy nướng
   * phía trước quay mặt ra quán (lò than, khay nhân, rổ bánh mì). Nhân viên đứng giữa,
   * mặt nhìn ra cửa nên vừa nướng vừa canh được khách.
   */
  private buildKitchen(): void {
    const kx = KITCHEN.x;
    const wallZ = ROOM.minZ;

    // --- Tường ốp gạch men ---
    const splashW = KITCHEN.w + 1.6;
    const splashTex = kitchenTileTexture();
    splashTex.repeat.set(splashW / (KITCHEN_TILE * 4), 1.4 / (KITCHEN_TILE * 4));
    const splash = new THREE.Mesh(new THREE.PlaneGeometry(splashW, 1.4), new THREE.MeshStandardMaterial({ map: splashTex, roughness: 0.3 }));
    splash.position.set(kx + 0.4, KITCHEN.h + 0.7, wallZ + 0.012);
    this.root.add(splash);

    // --- Bàn bếp sát tường ---
    const bz = KITCHEN.backZ;
    const bw = KITCHEN.w + 0.4;
    this.box(bw, KITCHEN.h, KITCHEN.backD, this.steelMat, kx + 0.2, KITCHEN.h / 2, bz, true);
    this.box(bw + 0.04, 0.04, KITCHEN.backD + 0.04, this.steelDarkMat, kx + 0.2, KITCHEN.h + 0.02, bz);
    for (let i = 0; i < 4; i++) {
      const dx = kx + 0.2 - bw / 2 + (i + 0.5) * (bw / 4);
      this.box(bw / 4 - 0.05, KITCHEN.h - 0.22, 0.02, this.steelDarkMat, dx, KITCHEN.h / 2 + 0.02, bz + KITCHEN.backD / 2 + 0.01);
      this.box(0.25, 0.025, 0.03, 0x2d3436, dx, KITCHEN.h - 0.18, bz + KITCHEN.backD / 2 + 0.03);
    }
    const top = KITCHEN_TOP;

    // Bếp gas 2 họng + nồi nước lèo + chảo
    const sx = kx - 1.1;
    this.box(0.8, 0.08, 0.5, 0x1e1e1e, sx, top + 0.04, bz);
    for (const off of [-0.2, 0.2]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.015, 6, 16), this.mat(0x555555));
      ring.rotation.x = Math.PI / 2;
      ring.position.set(sx + off, top + 0.09, bz);
      this.root.add(ring);
      this.box(0.04, 0.03, 0.02, 0xbdc3c7, sx + off, top + 0.04, bz + 0.26);
    }
    this.cyl(0.16, 0.15, 0.24, this.steelMat, sx - 0.2, top + 0.21, bz);
    this.cyl(0.165, 0.165, 0.02, this.steelDarkMat, sx - 0.2, top + 0.34, bz);
    this.cyl(0.15, 0.12, 0.05, 0x2d3436, sx + 0.2, top + 0.115, bz);
    this.box(0.25, 0.02, 0.03, 0x2d3436, sx + 0.42, top + 0.13, bz);
    // Máy hút mùi + ống khói lên trần
    this.box(0.95, 0.22, 0.6, this.steelMat, sx, 2.25, wallZ + 0.3);
    this.box(0.95, 0.03, 0.62, this.steelDarkMat, sx, 2.13, wallZ + 0.31);
    this.box(0.32, WALL_H - 2.36, 0.3, this.steelMat, sx, 2.36 + (WALL_H - 2.36) / 2, wallZ + 0.16);

    // Thớt + dao
    const bx = kx + 0.35;
    this.box(0.55, 0.035, 0.35, 0xc49a6c, bx, top + 0.018, bz + 0.05);
    this.box(0.24, 0.006, 0.05, 0xdfe6e9, bx + 0.05, top + 0.04, bz + 0.05);
    this.box(0.1, 0.02, 0.03, 0x2d3436, bx - 0.12, top + 0.045, bz + 0.05);
    this.bread(bx - 0.05, top + 0.09, bz - 0.06, 0.3);
    // Hũ gia vị
    const jars = [0xc0392b, 0xf1c40f, 0x27ae60, 0xecf0f1, 0x8e5a3c];
    jars.forEach((c, i) => {
      this.cyl(0.045, 0.045, 0.12, c, kx + 1.05 + i * 0.11, top + 0.06, bz - 0.15);
      this.cyl(0.048, 0.048, 0.025, 0x2d3436, kx + 1.05 + i * 0.11, top + 0.13, bz - 0.15);
    });
    // Kệ treo tường + thanh treo dụng cụ
    const shelfX = kx + 1.1;
    this.box(1.6, 0.04, 0.3, COLORS.woodDark, shelfX, 2.0, wallZ + 0.15);
    for (const side of [-1, 1]) this.box(0.04, 0.18, 0.25, COLORS.woodDark, shelfX + side * 0.7, 1.9, wallZ + 0.13);
    const shelfItems = [0xe74c3c, 0xf39c12, 0xecf0f1, 0x16a085, 0xd35400, 0xbdc3c7];
    shelfItems.forEach((c, i) => this.cyl(0.06, 0.06, 0.16, c, shelfX - 0.6 + i * 0.24, 2.1, wallZ + 0.15));
    const railX = kx + 0.1;
    this.box(1.0, 0.025, 0.025, this.steelDarkMat, railX, 1.62, wallZ + 0.08);
    for (let i = 0; i < 4; i++) {
      const ux = railX - 0.36 + i * 0.24;
      this.box(0.02, 0.3, 0.015, 0x2d3436, ux, 1.47, wallZ + 0.09);
      if (i % 2) this.cyl(0.05, 0.03, 0.04, this.steelMat, ux, 1.3, wallZ + 0.1);
      else this.box(0.08, 0.1, 0.012, this.steelMat, ux, 1.29, wallZ + 0.09);
    }

    // --- Tủ lạnh góc tường ---
    const fx = ROOM.minX + 0.55;
    const fz = wallZ + 0.5;
    this.box(1.0, 2.2, 0.9, 0xecf0f1, fx, 1.1, fz, true);
    this.box(0.98, 0.02, 0.02, 0xbdc3c7, fx, 1.45, fz + 0.455);
    for (const [hy, hh] of [[1.75, 0.45], [0.95, 0.6]] as const) this.box(0.04, hh, 0.05, 0x95a5a6, fx + 0.38, hy, fz + 0.48);
    // Nam châm dán tủ cho có hơi người
    [0xe74c3c, 0xf1c40f, 0x3498db].forEach((c, i) => this.box(0.08, 0.08, 0.01, c, fx - 0.25 + i * 0.13, 1.75 - (i % 2) * 0.12, fz + 0.455));

    // --- Quầy nướng phía trước, mặt hướng ra quán ---
    const fzc = KITCHEN.frontZ;
    const fd = KITCHEN.frontD;
    const fFront = fzc + fd / 2;
    this.box(KITCHEN.w, KITCHEN.h, fd, this.steelMat, kx, KITCHEN.h / 2, fzc, true);
    this.box(KITCHEN.w + 0.06, 0.04, fd + 0.06, this.steelDarkMat, kx, KITCHEN.h + 0.02, fzc);
    this.box(KITCHEN.w, 0.12, 0.02, 0x2d3436, kx, 0.06, fFront + 0.01);
    // Mặt trước sơn đỏ + bảng chữ
    this.box(KITCHEN.w - 0.1, KITCHEN.h - 0.3, 0.02, COLORS.wallTrim, kx, 0.12 + (KITCHEN.h - 0.3) / 2 + 0.03, fFront + 0.01);
    const banner = textPlane(['🔥 BÁNH MÌ NƯỚNG THAN 🔥'], { bg: '#f1c40f', fg: '#c0392b', width: 2.4, fontPx: 56 });
    banner.position.set(kx, 0.6, fFront + 0.025);
    this.root.add(banner);

    // Lò than + vỉ nướng + bánh đang nướng
    const gx = this.grillPoint.x;
    this.box(1.1, 0.16, 0.62, 0x2b2b2b, gx, top + 0.08, fzc);
    for (let i = 0; i < 14; i++) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.05, 0.11), this.coalMat);
      c.position.set(gx - 0.45 + (i % 7) * 0.15, top + 0.15, fzc - 0.13 + Math.floor(i / 7) * 0.26);
      c.rotation.y = i * 0.7;
      this.root.add(c);
    }
    for (let i = 0; i < 9; i++) this.box(0.012, 0.012, 0.6, 0x3d3d3d, gx - 0.48 + i * 0.12, top + 0.19, fzc);
    for (let i = 0; i < 3; i++) this.bread(gx - 0.3 + i * 0.3, top + 0.25, fzc + (i - 1) * 0.12, 0.34, 0xc8893f);

    // Khay nhân: pate, chả, thịt nguội, đồ chua, dưa leo, rau thơm (+ kính chắn)
    const tx = kx + 0.35;
    this.box(1.24, 0.05, 0.46, this.steelDarkMat, tx, top + 0.025, fzc);
    const fillings = [0x8d5524, 0xf3d9b1, 0xd98880, 0xe67e22, 0x7bc67b, 0x27ae60];
    fillings.forEach((c, i) => {
      const px = tx - 0.5 + i * 0.2;
      this.box(0.18, 0.05, 0.4, this.steelMat, px, top + 0.07, fzc);
      this.box(0.16, 0.02, 0.36, c, px, top + 0.095, fzc);
    });
    for (const side of [-1, 1]) this.box(0.02, 0.4, 0.02, this.steelDarkMat, tx + side * 0.6, top + 0.2, fFront - 0.12);
    const guard = this.glass(1.24, 0.02, 0.4, tx, top + 0.42, fzc + 0.12);
    guard.rotation.x = -0.35;

    // Chai sốt + rổ bánh mì
    [0xd63031, 0xfdcb6e, 0x3d2314].forEach((c, i) => {
      this.cyl(0.04, 0.045, 0.2, c, kx + 1.15 + i * 0.1, top + 0.1, fzc - 0.25);
      this.cyl(0.012, 0.025, 0.05, c, kx + 1.15 + i * 0.1, top + 0.225, fzc - 0.25);
    });
    const basketX = kx + 1.65;
    this.box(0.6, 0.14, 0.42, 0xb7864d, basketX, top + 0.07, fzc + 0.05);
    this.box(0.62, 0.03, 0.44, 0x8e5a3c, basketX, top + 0.14, fzc + 0.05);
    for (let i = 0; i < 6; i++) {
      this.bread(basketX - 0.16 + (i % 3) * 0.16, top + 0.17 + Math.floor(i / 3) * 0.09, fzc + 0.05, 0.3, 0xe1b06b, true);
    }

    this.hangingSign(['🔥 BẾP'], '#d35400', '#ffffff', 1.4, kx, fzc, 0);
  }

  private buildDecor(): void {
    // Bảng hiệu: trong quán dán tường sau (cao trên đầu), ngoài quán trên mặt tiền
    const signOpts = { bg: '#c0392b', fg: '#fff6d5', width: 6, fontPx: 72 };
    const inner = textPlane(['🥖 TIỆM BÁNH MÌ ĐỊA NGỤC 🔥'], signOpts);
    inner.position.set(3 * S, 3.35, ROOM.minZ + 0.02);
    this.root.add(inner);
    const outer = textPlane(['🥖 TIỆM BÁNH MÌ ĐỊA NGỤC 🔥'], { ...signOpts, width: 9 });
    outer.position.set(0, DOOR_H + 0.75, ROOM.maxZ + WALL_T + 0.03);
    this.root.add(outer);

    // Chậu cây
    for (const [x, z] of [
      [ROOM.maxX - 0.6, ROOM.minZ + 0.6],
      [ROOM.minX + 0.6, ROOM.maxZ - 0.6],
    ] as const) {
      this.box(0.6, 0.6, 0.6, 0x8e5a3c, x, 0.3, z, true);
      this.box(0.5, 0.9, 0.5, 0x27ae60, x, 1.05, z);
    }
  }
}
