import * as THREE from 'three';
import type { DishId } from '../data/menu';
import { createServingTray } from './BanhMi';
import { type AABB, resolveCircleVsBoxes } from './Collision';
import { Humanoid } from './Humanoid';
import { STAFF_LOOK } from './Looks';

export type CarryKind = 'menu' | 'cat' | 'supply' | 'extinguisher';

const KNOCKBACK_DECAY = 6;

/** Bị tát: ngã (falling) → nằm (lying) → đứng dậy (gettingUp). Chỉ khi xong hết mới đi được. */
type FallPhase = 'none' | 'falling' | 'lying' | 'gettingUp';

export interface FallTiming {
  fallSec: number;
  lieSec: number;
  getUpSec: number;
}

const easeIn = (t: number): number => t * t;
const easeInOut = (t: number): number => t * t * (3 - 2 * t);

export class Player {
  readonly body = new Humanoid(STAFF_LOOK);
  readonly radius = 0.35;
  held: DishId | null = null;
  /** Đồ không phải món ăn đang cầm: menu (cho giang hồ) hoặc con mèo */
  carrying: CarryKind | null = null;
  /** Chỗ gắn đồ đang ôm trước ngực (mèo gắn vào đây) */
  readonly carryAnchor = new THREE.Object3D();
  /** Số giây đứng không làm gì (chủ quán dùng để bắt quả tang) */
  idleTime = 0;
  /** Chỗ gắn ổ bánh mì đang cầm trước ngực */
  private readonly heldAnchor = new THREE.Group();
  /** Mỗi món dựng sẵn một khay, đổi món chỉ việc bật/tắt */
  private readonly heldBread = new Map<DishId, THREE.Group>();
  private readonly menuMesh: THREE.Mesh;
  private readonly supplyMesh: THREE.Mesh;
  private readonly extinguisherMesh: THREE.Group;
  private readonly knockback = new THREE.Vector3();
  private fallPhase: FallPhase = 'none';
  private fallTimer = 0;
  private fallAmt = 0;
  private fallClock = 0;
  private fallTiming: FallTiming = { fallSec: 0.3, lieSec: 1.5, getUpSec: 0.8 };
  private targetAngle = 0;

  constructor() {
    // Khay bánh mì đặt trên hai lòng bàn tay (tay giơ ra trước ngực ở độ cao ~1.31, tâm bàn tay z ~0.58)
    this.heldAnchor.position.set(0, 1.35, 0.56);
    this.body.upper.add(this.heldAnchor);

    // Tấm menu cầm trên tay
    this.menuMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.65, 0.05),
      new THREE.MeshStandardMaterial({ color: 0x8e44ad }),
    );
    this.menuMesh.position.set(0, 1.25, 0.5);
    this.menuMesh.rotation.x = -0.4;
    this.menuMesh.visible = false;
    this.body.upper.add(this.menuMesh);

    // Túi nguyên liệu mua ở chợ
    this.supplyMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.46, 0.26),
      new THREE.MeshStandardMaterial({ color: 0xb7864d }),
    );
    this.supplyMesh.position.set(0, 1.12, 0.46);
    this.supplyMesh.visible = false;
    this.body.upper.add(this.supplyMesh);

    // Bình cứu hỏa ôm trước ngực
    this.extinguisherMesh = new THREE.Group();
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.46, 12), new THREE.MeshStandardMaterial({ color: 0xd62828 }));
    const nozzle = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.04), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    nozzle.position.set(0.07, 0.27, 0);
    this.extinguisherMesh.add(tank, nozzle);
    this.extinguisherMesh.position.set(0, 1.15, 0.46);
    this.extinguisherMesh.visible = false;
    this.body.upper.add(this.extinguisherMesh);

    this.carryAnchor.position.set(0, 1.0, 0.45);
    this.body.upper.add(this.carryAnchor);
  }

  /** Tay đã bận (cầm món, menu hoặc ôm mèo) */
  get handsFull(): boolean {
    return this.held !== null || this.carrying !== null;
  }

  get group(): THREE.Group {
    return this.body.group;
  }

  get position(): THREE.Vector3 {
    return this.body.group.position;
  }

  /** Đang ngã / nằm / đứng dậy: không điều khiển được */
  get isStunned(): boolean {
    return this.fallPhase !== 'none';
  }

  /** 0 = đứng thẳng, 1 = nằm bẹp (camera dùng để hạ tầm nhìn) */
  get fallAmount(): number {
    return this.fallAmt;
  }

  reset(spawn: THREE.Vector3): void {
    this.position.copy(spawn);
    this.targetAngle = Math.PI;
    this.group.rotation.y = Math.PI;
    this.knockback.set(0, 0, 0);
    this.fallPhase = 'none';
    this.fallAmt = 0;
    this.body.setFallPose(0, 0);
    this.idleTime = 0;
    this.setHeld(null);
    this.setCarrying(null);
  }

  setHeld(dish: DishId | null): void {
    this.held = dish;
    for (const bread of this.heldBread.values()) bread.visible = false;
    if (dish) {
      let bread = this.heldBread.get(dish);
      if (!bread) {
        bread = createServingTray(dish).group;
        this.heldBread.set(dish, bread);
        this.heldAnchor.add(bread);
      }
      bread.visible = true;
    }
    this.updateArms();
  }

  setCarrying(kind: CarryKind | null): void {
    this.carrying = kind;
    this.menuMesh.visible = kind === 'menu';
    this.supplyMesh.visible = kind === 'supply';
    this.extinguisherMesh.visible = kind === 'extinguisher';
    this.updateArms();
  }

  private updateArms(): void {
    const full = this.handsFull;
    this.body.armsLocked = full;
    for (const arm of this.body.arms) arm.rotation.x = full ? -1.3 : 0;
  }

  /** Bị tát: quay mặt về phía người tát rồi bị hất văng theo hướng (dx, dz), ngã ngửa */
  hit(dx: number, dz: number, speed: number, timing: FallTiming): void {
    // Bị tát lúc đang nằm thì nằm thêm; đang đứng dậy thì ngã lại
    if (this.fallPhase === 'lying') {
      this.fallTimer = 0;
      return;
    }
    if (this.fallPhase === 'falling') return;
    const len = Math.hypot(dx, dz) || 1;
    this.knockback.set((dx / len) * speed, 0, (dz / len) * speed);
    this.fallTiming = timing;
    if (this.fallPhase === 'gettingUp') {
      // Ngã lại từ độ cao hiện tại
      this.fallTimer = Math.sqrt(this.fallAmt) * timing.fallSec;
    } else {
      this.fallTimer = 0;
      this.targetAngle = Math.atan2(-dx, -dz);
      this.group.rotation.y = this.targetAngle;
    }
    this.fallPhase = 'falling';
  }

  private updateFall(dt: number): void {
    const t = this.fallTiming;
    this.fallTimer += dt;
    this.fallClock += dt;
    if (this.fallPhase === 'falling') {
      const k = Math.min(1, this.fallTimer / t.fallSec);
      this.fallAmt = easeIn(k);
      if (k >= 1) this.enterFallPhase('lying');
    } else if (this.fallPhase === 'lying') {
      this.fallAmt = 1;
      if (this.fallTimer >= t.lieSec) this.enterFallPhase('gettingUp');
    } else if (this.fallPhase === 'gettingUp') {
      const k = Math.min(1, this.fallTimer / t.getUpSec);
      this.fallAmt = 1 - easeInOut(k);
      if (k >= 1) {
        this.fallAmt = 0;
        this.fallPhase = 'none';
        this.updateArms();
      }
    }
  }

  private enterFallPhase(next: FallPhase): void {
    this.fallPhase = next;
    this.fallTimer = 0;
  }

  /** Góc nhìn thứ nhất: thân luôn quay theo hướng camera (null = quay theo hướng đi) */
  facingLock: number | null = null;

  markActive(): void {
    this.idleTime = 0;
  }

  update(dt: number, move: { x: number; z: number }, speed: number, colliders: readonly AABB[]): void {
    let moving = false;
    if (this.fallPhase !== 'none') {
      // Đang ngã/nằm/đứng dậy: không đi được, cũng không bị tính là "đứng không"
      this.updateFall(dt);
      this.markActive();
    } else {
      const len = Math.hypot(move.x, move.z);
      moving = len > 0;
      if (moving) {
        // Đẩy cần ảo nhẹ thì đi chậm; bàn phím (độ dài ≥ 1) vẫn đi hết tốc
        const scale = Math.min(1, len) / len;
        const nx = move.x * scale;
        const nz = move.z * scale;
        this.position.x += nx * speed * dt;
        this.position.z += nz * speed * dt;
        this.targetAngle = Math.atan2(nx, nz);
      }
      if (this.facingLock !== null) this.targetAngle = this.facingLock;
      // Xoay mượt về hướng di chuyển
      let diff = this.targetAngle - this.group.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.group.rotation.y += diff * Math.min(1, dt * 14);
    }

    if (this.knockback.lengthSq() > 0.0001) {
      this.position.addScaledVector(this.knockback, dt);
      this.knockback.multiplyScalar(Math.exp(-KNOCKBACK_DECAY * dt));
    }
    resolveCircleVsBoxes(this.position, this.radius, colliders);

    this.idleTime = moving ? 0 : this.idleTime + dt;
    this.body.animate(dt, moving, speed / 4);
    this.body.setFallPose(this.fallAmt, this.fallClock);
  }
}
