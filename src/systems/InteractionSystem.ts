import type * as THREE from 'three';
import { distanceXZ } from '../world/Collision';

export interface Interactable {
  position(): THREE.Vector3;
  range: number;
  /** Mô tả hành động hiện có (hiện trên gợi ý), null = không làm gì được lúc này */
  action(): string | null;
  perform(): void;
}

/** Tìm thứ tương tác gần nhất trong tầm, bấm E để thực hiện */
export class InteractionSystem {
  private readonly items = new Set<Interactable>();

  register(item: Interactable): () => void {
    this.items.add(item);
    return () => this.items.delete(item);
  }

  /** Trả về chữ gợi ý cho HUD, hoặc null */
  update(playerPos: THREE.Vector3, interactPressed: boolean): string | null {
    let best: Interactable | null = null;
    let bestLabel: string | null = null;
    let bestDist = Infinity;
    for (const item of this.items) {
      const d = distanceXZ(playerPos, item.position());
      if (d > item.range || d >= bestDist) continue;
      const label = item.action();
      if (label === null) continue;
      best = item;
      bestLabel = label;
      bestDist = d;
    }
    if (best && interactPressed) best.perform();
    return bestLabel;
  }

  clear(): void {
    this.items.clear();
  }
}
