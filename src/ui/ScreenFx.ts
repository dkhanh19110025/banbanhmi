import * as THREE from 'three';

/** Hiệu ứng màn hình: rung camera, chữ to giữa màn hình, số tiền bị trừ bay lên */
export class ScreenFx {
  readonly shakeOffset = new THREE.Vector3();
  private readonly root: HTMLElement;
  private shakeAmount = 0;
  private darkEl: HTMLElement | null = null;

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

  /** Mất điện: phủ tối quanh màn hình (0 = sáng, 1 = đen kịt), giữa màn hình sáng hơn một chút */
  setDarkness(level: number): void {
    if (!this.darkEl) {
      if (level <= 0) return;
      this.darkEl = document.createElement('div');
      this.darkEl.className = 'fx-dark';
      this.root.appendChild(this.darkEl);
    }
    // Độ tối nằm trong màu gradient (biến --d) chứ không dùng opacity của phần tử
    this.darkEl.style.setProperty('--d', String(Math.max(0, Math.min(1, level))));
  }

  /** Chớp trắng màn hình (cái tát nổ đom đóm mắt) */
  flash(): void {
    const el = document.createElement('div');
    el.className = 'fx-flash';
    this.root.appendChild(el);
    window.setTimeout(() => el.remove(), 400);
  }

  /** Bàn tay to đùng từ bên phải táp vào mặt người chơi, để lại vệt đỏ hằn trên màn hình */
  slapHand(): void {
    const mark = document.createElement('div');
    mark.className = 'fx-handprint';
    const hand = document.createElement('div');
    hand.className = 'fx-hand';
    hand.textContent = '🖐️';
    this.root.append(mark, hand);
    window.setTimeout(() => {
      mark.remove();
      hand.remove();
    }, 1800);
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
    this.darkEl = null;
    this.root.replaceChildren();
  }
}
