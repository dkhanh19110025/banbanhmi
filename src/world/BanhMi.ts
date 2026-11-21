import * as THREE from 'three';
import { type DishId, getDish } from '../data/menu';

const CRUST = 0xd99a4e;
const CRUST_DARK = 0xb8732f;
const PAPER = 0xd2b07c;
/** Lớp nhân thêm của bánh mì đặc biệt: chả lụa, thịt nguội */
const SPECIAL_LAYERS = [0xf3d9b1, 0xd98880];

/** Độ dài ổ bánh (dọc trục X), để chỗ gọi tự căn vị trí */
export const BANH_MI_LENGTH = 0.56;

function part(
  geo: THREE.BufferGeometry,
  color: number,
  x: number,
  y: number,
  z: number,
): THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> {
  // Vật liệu riêng từng ổ: đĩa của khách bị dispose cả vật liệu khi dọn
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

/**
 * Ổ bánh mì Việt khối low-poly: vỏ vàng giòn xẻ dọc, nắp hé ra khoe nhân
 * (màu nhân theo món), rau thơm, dưa leo, đồ chua, ớt; một đầu gói giấy.
 * Nằm dọc trục X, tâm ở giữa ổ, đáy ổ ở y ≈ -0.05.
 */
export function createBanhMi(dish: DishId): THREE.Group {
  const g = new THREE.Group();
  const len = 0.4;
  const r = 0.07;

  // Nửa dưới ổ: viên nhộng bẹt
  const bottom = part(new THREE.CapsuleGeometry(r, len, 4, 12), CRUST, 0, 0, 0);
  bottom.rotation.z = Math.PI / 2;
  bottom.scale.set(0.7, 1, 1);
  g.add(bottom);

  // Nhân chính theo món + lớp thêm cho món đặc biệt
  const filling = getDish(dish).color;
  let y = 0.045;
  g.add(part(new THREE.BoxGeometry(len + 0.02, 0.035, 0.1), filling, 0, y, 0));
  if (dish === 'dacbiet') {
    for (const c of SPECIAL_LAYERS) {
      y += 0.025;
      g.add(part(new THREE.BoxGeometry(len - 0.04, 0.02, 0.095), c, 0.01, y, 0));
    }
  }
  if (dish === 'trung') {
    // Lòng trắng viền quanh trứng ốp
    g.add(part(new THREE.BoxGeometry(len + 0.04, 0.012, 0.115), 0xfffbf0, 0, 0.03, 0));
  }

  // Rau thơm, dưa leo, đồ chua, ớt thò ra mép
  const top = y + 0.02;
  for (let i = 0; i < 5; i++) {
    const herb = part(new THREE.BoxGeometry(0.06, 0.012, 0.05), 0x2ecc71, -0.15 + i * 0.075, top, (i % 2 ? 1 : -1) * 0.045);
    herb.rotation.y = i * 0.9;
    herb.rotation.x = (i % 2 ? 1 : -1) * 0.5;
    g.add(herb);
  }
  for (let i = 0; i < 2; i++) g.add(part(new THREE.BoxGeometry(0.16, 0.014, 0.022), 0x9be09b, -0.08 + i * 0.16, top - 0.006, 0.02));
  for (let i = 0; i < 3; i++) g.add(part(new THREE.BoxGeometry(0.09, 0.012, 0.012), 0xf39c12, -0.1 + i * 0.1, top + 0.004, -0.02));
  for (let i = 0; i < 2; i++) g.add(part(new THREE.SphereGeometry(0.014, 6, 4), 0xe74c3c, 0.05 + i * 0.08, top + 0.01, 0.01));

  // Nắp trên hé mở về phía sau, có 3 vết khía
  const lid = new THREE.Group();
  const lidMesh = part(new THREE.CapsuleGeometry(r * 0.92, len, 4, 12), CRUST, 0, 0, 0);
  lidMesh.rotation.z = Math.PI / 2;
  lidMesh.scale.set(0.5, 1, 1);
  lid.add(lidMesh);
  for (let i = 0; i < 3; i++) {
    const cut = part(new THREE.BoxGeometry(0.07, 0.008, 0.02), CRUST_DARK, -0.12 + i * 0.12, 0.036, 0);
    cut.rotation.y = 0.6;
    lid.add(cut);
  }
  lid.position.set(0, top + 0.03, -0.045);
  lid.rotation.x = -0.45;
  g.add(lid);

  // Giấy gói một đầu (đầu cầm)
  const wrap = part(new THREE.CylinderGeometry(0.095, 0.1, 0.2, 10, 1, true), PAPER, -0.19, 0.03, 0);
  wrap.rotation.z = Math.PI / 2;
  wrap.scale.set(1, 1, 0.85);
  (wrap.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  g.add(wrap);

  return g;
}

/** Khay nhựa đỏ kiểu quán vỉa hè (mét) */
const TRAY = { w: 0.62, d: 0.4, t: 0.022, rim: 0.035, color: 0xc0392b, rimColor: 0xa93226 };

export interface ServingTray {
  /** Cả khay + bánh; gốc tọa độ ở đáy khay */
  group: THREE.Group;
  /** Ổ bánh trên khay (khách ăn thì ổ ngắn dần) */
  bread: THREE.Group;
}

/**
 * Khay đỏ lót giấy, ổ bánh mì nằm giữa, kèm chén tương ớt nhỏ.
 * Nhân viên bưng khay trên lòng bàn tay; giao xong khay nằm luôn trên bàn khách.
 */
export function createServingTray(dish: DishId): ServingTray {
  const group = new THREE.Group();
  const { w, d, t, rim } = TRAY;
  group.add(part(new THREE.BoxGeometry(w, t, d), TRAY.color, 0, t / 2, 0));
  // Gờ khay 4 cạnh
  for (const side of [-1, 1]) {
    group.add(part(new THREE.BoxGeometry(w, rim, 0.02), TRAY.rimColor, 0, rim / 2, side * (d / 2 - 0.01)));
    group.add(part(new THREE.BoxGeometry(0.02, rim, d - 0.04), TRAY.rimColor, side * (w / 2 - 0.01), rim / 2, 0));
  }
  // Giấy lót kẻ caro nhẹ (một tấm, hơi xoay cho tự nhiên)
  const liner = part(new THREE.BoxGeometry(w - 0.1, 0.004, d - 0.08), 0xf7ecd2, 0, t + 0.002, 0);
  liner.rotation.y = 0.06;
  group.add(liner);
  // Chén tương ớt góc khay
  group.add(part(new THREE.CylinderGeometry(0.04, 0.032, 0.025, 12), 0xffffff, w / 2 - 0.08, t + 0.0125, d / 2 - 0.08));
  group.add(part(new THREE.CylinderGeometry(0.034, 0.034, 0.004, 12), 0xd63031, w / 2 - 0.08, t + 0.024, d / 2 - 0.08));

  const bread = createBanhMi(dish);
  // Đáy ổ bánh ≈ -0.05 so với tâm → đặt tâm cao hơn mặt khay chừng đó
  bread.position.set(-0.03, t + 0.05, -0.02);
  bread.scale.setScalar(0.95);
  group.add(bread);
  return { group, bread };
}
