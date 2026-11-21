import * as THREE from 'three';

export type ViewMode = 'third' | 'first';

/** Camera sau lưng: khoảng cách, độ lệch vai, độ cao điểm nhìn */
const THIRD = { distance: 3.2, shoulder: 0.55, pivotY: 1.7, minPitch: -0.35, maxPitch: 1.05, defaultPitch: 0.32 };
/** Camera mắt nhân vật */
const FIRST = { eyeY: 1.66, forwardOffset: 0.18, minPitch: -1.3, maxPitch: 1.3 };
const MOUSE_SENSITIVITY = 0.004;
/** Cách tường một chút để camera không chui vào tường */
const WALL_PADDING = 0.25;
const MIN_DISTANCE = 0.6;
/** Tốc độ camera lùi ra lại sau khi hết bị tường chắn */
const ZOOM_OUT_SPEED = 6;
const FOLLOW_SPEED = 18;
/** Camera khi nhân vật ngã ngửa */
const FALL_EYE_DROP = 1.3;
const FALL_LOOK_UP = 1.0;
const FALL_PIVOT_DROP = 0.9;

/**
 * Camera bám theo nhân viên: xoay bằng chuột, có 2 chế độ (sau lưng / mắt nhân vật).
 * Hướng quy ước giống Player: góc yaw = 0 là nhìn về +z, forward = (sin yaw, cos yaw).
 */
export class FollowCamera {
  yaw = Math.PI;
  pitch = THIRD.defaultPitch;
  mode: ViewMode = 'third';
  /** Nhân vật ngã: 0 = đứng, 1 = nằm. Camera hạ thấp và ngước lên trần */
  fall = 0;
  private distance = THIRD.distance;
  private readonly pivot = new THREE.Vector3();
  private readonly ray = new THREE.Raycaster();
  private readonly tmpDir = new THREE.Vector3();
  private readonly tmpPos = new THREE.Vector3();
  private readonly tmpLook = new THREE.Vector3();

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    /** Các khối chắn tầm nhìn (tường) — camera sẽ kéo lại gần khi bị chắn */
    private readonly blockers: THREE.Object3D[],
  ) {}

  /** Hướng đi tới trên mặt sàn */
  get forward(): { x: number; z: number } {
    return { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
  }

  /** Hướng sang phải trên mặt sàn */
  get right(): { x: number; z: number } {
    return { x: -Math.cos(this.yaw), z: Math.sin(this.yaw) };
  }

  /** Đổi trục input (tới/phải) thành hướng đi trên thế giới */
  toWorld(forward: number, right: number): { x: number; z: number } {
    const f = this.forward;
    const r = this.right;
    return { x: f.x * forward + r.x * right, z: f.z * forward + r.z * right };
  }

  rotate(dx: number, dy: number): void {
    this.yaw -= dx * MOUSE_SENSITIVITY;
    this.pitch += dy * MOUSE_SENSITIVITY;
    this.clampPitch();
  }

  toggleMode(): ViewMode {
    this.mode = this.mode === 'third' ? 'first' : 'third';
    if (this.mode === 'third') this.pitch = Math.max(this.pitch, 0);
    this.clampPitch();
    return this.mode;
  }

  /** Đặt camera ngay sau lưng nhân vật (đầu ca, chơi lại) */
  reset(yaw: number): void {
    this.yaw = yaw;
    this.pitch = this.mode === 'third' ? THIRD.defaultPitch : 0;
    this.distance = THIRD.distance;
  }

  update(dt: number, target: THREE.Vector3, shake: THREE.Vector3, snap = false): void {
    const t = snap ? 1 : 1 - Math.exp(-FOLLOW_SPEED * dt);
    const f = this.forward;
    // Ngã ngửa: mắt hạ sát sàn và ngước nhìn trần
    const pitch = this.mode === 'first' ? this.pitch * (1 - this.fall) - FALL_LOOK_UP * this.fall : this.pitch;
    const cosP = Math.cos(pitch);
    const sinP = Math.sin(pitch);

    if (this.mode === 'first') {
      this.pivot.set(
        target.x + f.x * FIRST.forwardOffset,
        FIRST.eyeY - FALL_EYE_DROP * this.fall,
        target.z + f.z * FIRST.forwardOffset,
      );
      this.camera.position.copy(this.pivot).add(shake);
      this.tmpLook.set(f.x * cosP, -sinP, f.z * cosP).add(this.camera.position);
      this.camera.lookAt(this.tmpLook);
      return;
    }

    // Điểm xoay trên vai phải nhân vật, bám mượt theo vị trí
    const r = this.right;
    this.tmpPos.set(target.x + r.x * THIRD.shoulder, THIRD.pivotY - FALL_PIVOT_DROP * this.fall, target.z + r.z * THIRD.shoulder);
    if (snap) this.pivot.copy(this.tmpPos);
    else this.pivot.lerp(this.tmpPos, t);

    // Hướng từ điểm xoay lùi về sau camera
    this.tmpDir.set(-f.x * cosP, sinP, -f.z * cosP).normalize();
    const wanted = this.blockedDistance(THIRD.distance);
    if (snap || wanted < this.distance) this.distance = wanted;
    else this.distance = Math.min(wanted, this.distance + ZOOM_OUT_SPEED * dt);

    this.camera.position.copy(this.pivot).addScaledVector(this.tmpDir, this.distance).add(shake);
    this.tmpLook.copy(this.pivot).addScaledVector(this.tmpDir, -4);
    this.camera.lookAt(this.tmpLook);
  }

  /** Tia từ vai ra sau: chạm tường thì rút ngắn khoảng cách camera */
  private blockedDistance(max: number): number {
    this.ray.set(this.pivot, this.tmpDir);
    this.ray.far = max + WALL_PADDING;
    const hit = this.ray.intersectObjects(this.blockers, false)[0];
    if (!hit) return max;
    return Math.max(MIN_DISTANCE, hit.distance - WALL_PADDING);
  }

  private clampPitch(): void {
    const lim = this.mode === 'third' ? THIRD : FIRST;
    this.pitch = Math.min(lim.maxPitch, Math.max(lim.minPitch, this.pitch));
  }
}
