import * as THREE from 'three';
import type { DishId } from '../data/menu';
import { createServingTray } from './BanhMi';
import { type AABB, resolveCircleVsBoxes } from './Collision';
import { Humanoid } from './Humanoid';

export type CarryKind = 'menu' | 'cat';

const KNOCKBACK_DECAY = 6;
const STUN_SPIN_SPEED = 18;

export class Player {
  readonly body = new Humanoid({
    shirt: 0x2f6fd6,
    pants: 0x2b2b3a,
    skin: 0xf1c7a1,
    hat: 0xd63031,
    apron: true,
    hair: { style: 'short', color: 0x1b1b1b },
    shoes: 0xecf0f1,
  });
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
  private readonly knockback = new THREE.Vector3();
  private stunTime = 0;
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

  get isStunned(): boolean {
    return this.stunTime > 0;
  }

  reset(spawn: THREE.Vector3): void {
    this.position.copy(spawn);
    this.targetAngle = Math.PI;
    this.group.rotation.y = Math.PI;
    this.knockback.set(0, 0, 0);
    this.stunTime = 0;
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
    this.updateArms();
  }

  private updateArms(): void {
    const full = this.handsFull;
    this.body.armsLocked = full;
    for (const arm of this.body.arms) arm.rotation.x = full ? -1.3 : 0;
  }

  /** Bị tát: văng theo hướng (dx, dz) và choáng */
  hit(dx: number, dz: number, speed: number, stunSec: number): void {
    const len = Math.hypot(dx, dz) || 1;
    this.knockback.set((dx / len) * speed, 0, (dz / len) * speed);
    this.stunTime = stunSec;
  }

  /** Góc nhìn thứ nhất: thân luôn quay theo hướng camera (null = quay theo hướng đi) */
  facingLock: number | null = null;

  markActive(): void {
    this.idleTime = 0;
  }

  update(dt: number, move: { x: number; z: number }, speed: number, colliders: readonly AABB[]): void {
    let moving = false;
    if (this.stunTime > 0) {
      this.stunTime -= dt;
      this.group.rotation.y += dt * STUN_SPIN_SPEED;
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
  }
}
