import * as THREE from 'three';

const PUFF_COUNT = 12;
const PUFF_LIFE_SEC = 1.4;
const RISE_SPEED = 0.9;

function makePuffTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  }
  return new THREE.CanvasTexture(c);
}

interface Puff {
  sprite: THREE.Sprite;
  age: number;
  drift: number;
}

/** Khói bốc lên từ vỉ nướng khi đang làm bánh */
export class Steam {
  private readonly root = new THREE.Group();
  private readonly puffs: Puff[] = [];
  private readonly texture = makePuffTexture();
  private spawnTimer = 0;

  constructor(parent: THREE.Object3D, origin: THREE.Vector3) {
    this.root.position.copy(origin);
    parent.add(this.root);
    for (let i = 0; i < PUFF_COUNT; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.texture, transparent: true, depthWrite: false }));
      sprite.visible = false;
      this.root.add(sprite);
      this.puffs.push({ sprite, age: PUFF_LIFE_SEC, drift: 0 });
    }
  }

  /** @param active đang nướng thì bốc khói đều, tắt thì khói tan dần */
  update(dt: number, active: boolean): void {
    if (active) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = PUFF_LIFE_SEC / PUFF_COUNT;
        const free = this.puffs.find((p) => p.age >= PUFF_LIFE_SEC);
        if (free) {
          free.age = 0;
          free.drift = (Math.random() - 0.5) * 0.4;
          free.sprite.position.set((Math.random() - 0.5) * 0.5, 0, (Math.random() - 0.5) * 0.3);
          free.sprite.visible = true;
        }
      }
    }
    for (const p of this.puffs) {
      if (p.age >= PUFF_LIFE_SEC) continue;
      p.age += dt;
      const k = p.age / PUFF_LIFE_SEC;
      p.sprite.position.y += RISE_SPEED * dt;
      p.sprite.position.x += p.drift * dt;
      p.sprite.scale.setScalar(0.3 + k * 0.6);
      (p.sprite.material as THREE.SpriteMaterial).opacity = 0.7 * (1 - k);
      if (p.age >= PUFF_LIFE_SEC) p.sprite.visible = false;
    }
  }

  dispose(): void {
    this.root.removeFromParent();
    for (const p of this.puffs) (p.sprite.material as THREE.Material).dispose();
    this.texture.dispose();
  }
}
