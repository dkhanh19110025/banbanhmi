import type * as THREE from 'three';

/** Hộp va chạm trên mặt sàn (trục X và Z) */
export interface AABB {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export function aabbFromCenter(cx: number, cz: number, width: number, depth: number): AABB {
  return { minX: cx - width / 2, maxX: cx + width / 2, minZ: cz - depth / 2, maxZ: cz + depth / 2 };
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** Đẩy một hình tròn (người chơi) ra khỏi các hộp va chạm */
export function resolveCircleVsBoxes(pos: THREE.Vector3, radius: number, boxes: readonly AABB[]): void {
  for (const b of boxes) {
    const nearestX = clamp(pos.x, b.minX, b.maxX);
    const nearestZ = clamp(pos.z, b.minZ, b.maxZ);
    const dx = pos.x - nearestX;
    const dz = pos.z - nearestZ;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;

    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      pos.x = nearestX + (dx / d) * radius;
      pos.z = nearestZ + (dz / d) * radius;
      continue;
    }
    // Tâm nằm hẳn trong hộp: đẩy ra theo cạnh gần nhất
    const left = pos.x - b.minX;
    const right = b.maxX - pos.x;
    const top = pos.z - b.minZ;
    const bottom = b.maxZ - pos.z;
    const m = Math.min(left, right, top, bottom);
    if (m === left) pos.x = b.minX - radius;
    else if (m === right) pos.x = b.maxX + radius;
    else if (m === top) pos.z = b.minZ - radius;
    else pos.z = b.maxZ + radius;
  }
}

/** Khoảng cách trên mặt sàn, bỏ qua độ cao */
export function distanceXZ(a: THREE.Vector3, b: THREE.Vector3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
