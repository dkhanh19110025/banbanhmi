import type { Input } from '../core/Input';
import { DIALOGUES } from '../data/dialogues';

/** Bán kính cần điều hướng (px): kéo quá mức này vẫn tính là đẩy hết cỡ */
const STICK_RADIUS = 56;
/** Vùng chết giữa cần để khỏi trôi nhân vật khi chạm nhẹ */
const DEAD_ZONE = 0.12;
/** Vuốt nửa phải: nhân với độ dời ngón tay để ra góc xoay (như chuột) */
const LOOK_SCALE = 1.4;

interface ButtonDef {
  code: string;
  label: string;
  className: string;
}

/**
 * Điều khiển trên màn cảm ứng:
 * - Nửa trái: chạm đâu hiện cần ở đó, kéo để đi.
 * - Nửa phải: vuốt để xoay góc nhìn.
 * - Nút E (giữ được, để vuốt mèo), sổ tay, đổi góc nhìn, tạm dừng.
 * Mọi thứ đổ vào Input như phím/chuột thật nên game không cần biết đang chơi bằng gì.
 */
export class TouchControls {
  private readonly root: HTMLDivElement;
  private readonly base: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private stickId: number | null = null;
  private stickX = 0;
  private stickY = 0;
  private lookId: number | null = null;
  private lookX = 0;
  private lookY = 0;
  /** Nút đang bị giữ: pointerId → mã phím */
  private readonly held = new Map<number, string>();
  private visible = false;

  constructor(
    parent: HTMLElement,
    private readonly input: Input,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'touch hidden';
    // Chèn sau lớp nhãn/hiệu ứng nhưng trước HUD, sổ tay, menu → các bảng đó vẫn bấm được
    parent.insertBefore(this.root, parent.children[2] ?? null);

    const moveZone = this.div('touch-zone touch-move');
    const lookZone = this.div('touch-zone touch-look');
    this.base = this.div('touch-stick');
    this.knob = document.createElement('div');
    this.knob.className = 'touch-knob';
    this.base.appendChild(this.knob);

    moveZone.addEventListener('pointerdown', (e) => this.stickStart(e));
    lookZone.addEventListener('pointerdown', (e) => this.lookStart(e));
    window.addEventListener('pointermove', (e) => this.onMove(e), { passive: true });
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', (e) => this.onUp(e));

    const b = DIALOGUES.touchButtons;
    const buttons: ButtonDef[] = [
      { code: 'KeyE', label: b.interact, className: 'touch-btn touch-e' },
      { code: 'KeyN', label: b.notebook, className: 'touch-btn touch-n' },
      { code: 'KeyV', label: b.view, className: 'touch-btn touch-v' },
      { code: 'Escape', label: b.pause, className: 'touch-btn touch-pause' },
    ];
    for (const def of buttons) {
      const el = this.div(def.className);
      el.textContent = def.label;
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.held.set(e.pointerId, def.code);
        el.classList.add('down');
        this.input.pressVirtual(def.code);
      });
      const release = (e: PointerEvent): void => {
        if (this.held.get(e.pointerId) !== def.code) return;
        this.held.delete(e.pointerId);
        el.classList.remove('down');
        this.input.releaseVirtual(def.code);
      };
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
      el.addEventListener('pointerleave', release);
    }
  }

  /** Chỉ hiện khi đang chơi; ẩn thì nhả hết để nhân vật không tự chạy */
  setVisible(visible: boolean): void {
    if (visible === this.visible) return;
    this.visible = visible;
    this.root.classList.toggle('hidden', !visible);
    if (!visible) this.releaseAll();
  }

  private div(className: string): HTMLDivElement {
    const el = document.createElement('div');
    el.className = className;
    this.root.appendChild(el);
    return el;
  }

  private stickStart(e: PointerEvent): void {
    if (this.stickId !== null) return;
    e.preventDefault();
    this.stickId = e.pointerId;
    this.stickX = e.clientX;
    this.stickY = e.clientY;
    this.base.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    this.base.classList.add('active');
    this.knob.style.transform = 'translate(-50%, -50%)';
  }

  private lookStart(e: PointerEvent): void {
    if (this.lookId !== null) return;
    e.preventDefault();
    this.lookId = e.pointerId;
    this.lookX = e.clientX;
    this.lookY = e.clientY;
  }

  private onMove(e: PointerEvent): void {
    if (e.pointerId === this.stickId) {
      let dx = e.clientX - this.stickX;
      let dy = e.clientY - this.stickY;
      const len = Math.hypot(dx, dy);
      if (len > STICK_RADIUS) {
        dx = (dx / len) * STICK_RADIUS;
        dy = (dy / len) * STICK_RADIUS;
      }
      this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      const strength = Math.min(1, len / STICK_RADIUS);
      if (strength < DEAD_ZONE) {
        this.input.setVirtualAxis(0, 0);
        return;
      }
      this.input.setVirtualAxis(-dy / STICK_RADIUS, dx / STICK_RADIUS);
    } else if (e.pointerId === this.lookId) {
      this.input.addLook((e.clientX - this.lookX) * LOOK_SCALE, (e.clientY - this.lookY) * LOOK_SCALE);
      this.lookX = e.clientX;
      this.lookY = e.clientY;
    }
  }

  private onUp(e: PointerEvent): void {
    if (e.pointerId === this.stickId) {
      this.stickId = null;
      this.base.classList.remove('active');
      this.input.setVirtualAxis(0, 0);
    } else if (e.pointerId === this.lookId) {
      this.lookId = null;
    }
  }

  private releaseAll(): void {
    this.stickId = null;
    this.lookId = null;
    this.base.classList.remove('active');
    this.input.setVirtualAxis(0, 0);
    for (const code of this.held.values()) this.input.releaseVirtual(code);
    this.held.clear();
    for (const el of this.root.querySelectorAll('.down')) el.classList.remove('down');
  }
}
