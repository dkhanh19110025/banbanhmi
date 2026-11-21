import * as THREE from 'three';

/** Hiệu ứng màn hình: rung camera, chữ to giữa màn hình, số tiền bị trừ bay lên */
export class ScreenFx {
  readonly shakeOffset = new THREE.Vector3();
  private readonly root: HTMLElement;
  private shakeAmount = 0;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  shake(amount: number): void {
    this.shakeAmount = Math.max(this.shakeAmount, amount);
  }

  bigText(text: string, variant: string): void {
    const el = document.createElement('div');
    el.className = `fx-big ${variant}`;
    el.textContent = text;
    this.root.appendChild(el);
    window.setTimeout(() => el.remove(), 1400);
  }

  /** Chớp trắng màn hình (cái tát nổ đom đóm mắt) */
  flash(): void {
    const el = document.createElement('div');
    el.className = 'fx-flash';
    this.root.appendChild(el);
    window.setTimeout(() => el.remove(), 400);
  }

  floatText(text: string): void {
    const el = document.createElement('div');
    el.className = 'fx-float';
    el.textContent = text;
    this.root.appendChild(el);
    window.setTimeout(() => el.remove(), 1500);
  }

  update(dt: number): void {
    if (this.shakeAmount <= 0.001) {
      this.shakeOffset.set(0, 0, 0);
      return;
    }
    const a = this.shakeAmount;
    this.shakeOffset.set((Math.random() - 0.5) * a, (Math.random() - 0.5) * a, (Math.random() - 0.5) * a);
    this.shakeAmount = Math.max(0, this.shakeAmount - dt * 1.6);
  }

  clear(): void {
    this.shakeAmount = 0;
    this.root.replaceChildren();
  }
}
