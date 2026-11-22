import * as THREE from 'three';

const FLAME_COUNT = 10;

function makeFlameTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(32, 38, 2, 32, 34, 30);
    g.addColorStop(0, 'rgba(255,245,170,1)');
    g.addColorStop(0.4, 'rgba(255,140,30,0.9)');
    g.addColorStop(1, 'rgba(200,30,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  }
  return new THREE.CanvasTexture(c);
}

/** Ngọn lửa trên chảo: vài sprite cộng sáng, bập bùng, to dần theo mức cháy */
export class FireEffect {
  private readonly root = new THREE.Group();
  private readonly flames: THREE.Sprite[] = [];
  private readonly texture = makeFlameTexture();
  private time = 0;

  constructor(parent: THREE.Object3D, origin: THREE.Vector3) {
    this.root.position.copy(origin);
    this.root.visible = false;
    parent.add(this.root);
    for (let i = 0; i < FLAME_COUNT; i++) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.texture,
          color: 0xff8a2a,
          opacity: 0.7,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      this.flames.push(sprite);
      this.root.add(sprite);
    }
  }

  /** @param level 0 = tắt hẳn, 1 = bùng cháy cả bếp */
  update(dt: number, level: number): void {
    this.root.visible = level > 0;
    if (level <= 0) return;
    this.time += dt;
    const shown = 3 + Math.floor(level * (FLAME_COUNT - 3));
    this.flames.forEach((flame, i) => {
      flame.visible = i < shown;
      if (!flame.visible) return;
      const phase = this.time * (6 + i * 0.7) + i * 1.3;
      const spread = (i % 5) - 2;
      const size = (0.45 + level * 1.5) * (0.75 + 0.25 * Math.sin(phase));
      flame.scale.set(size, size * 1.25, 1);
      flame.position.set(spread * 0.16 * (1 + level * 1.6), 0.25 + size * 0.35 + (i / FLAME_COUNT) * level * 0.6, ((i % 3) - 1) * 0.1);
    });
  }

  dispose(): void {
    this.root.removeFromParent();
    for (const f of this.flames) (f.material as THREE.Material).dispose();
    this.texture.dispose();
  }
}
