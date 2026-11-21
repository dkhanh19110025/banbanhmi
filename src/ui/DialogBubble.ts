import * as THREE from 'three';

type Anchor = THREE.Object3D | THREE.Vector3;

/** Một phần tử HTML bám theo một điểm trong thế giới 3D */
export class WorldLabel {
  readonly el: HTMLDivElement;
  readonly anchor: Anchor;
  readonly offsetY: number;
  visible = true;

  constructor(anchor: Anchor, offsetY: number, className: string) {
    this.anchor = anchor;
    this.offsetY = offsetY;
    this.el = document.createElement('div');
    this.el.className = `world-label ${className}`;
  }

  setVisible(v: boolean): void {
    this.visible = v;
  }
}

/** Quản lý toàn bộ nhãn nổi: chiếu từ 3D ra màn hình mỗi khung hình */
export class WorldLabels {
  private readonly root: HTMLElement;
  private readonly labels = new Set<WorldLabel>();
  private readonly tmp = new THREE.Vector3();

  constructor(root: HTMLElement) {
    this.root = root;
  }

  create(anchor: Anchor, offsetY: number, className: string): WorldLabel {
    const label = new WorldLabel(anchor, offsetY, className);
    this.root.appendChild(label.el);
    this.labels.add(label);
    return label;
  }

  remove(label: WorldLabel): void {
    label.el.remove();
    this.labels.delete(label);
  }

  update(camera: THREE.Camera, width: number, height: number): void {
    for (const label of this.labels) {
      if (!label.visible) {
        label.el.style.display = 'none';
        continue;
      }
      if (label.anchor instanceof THREE.Object3D) label.anchor.getWorldPosition(this.tmp);
      else this.tmp.copy(label.anchor);
      this.tmp.y += label.offsetY;
      this.tmp.project(camera);
      if (this.tmp.z > 1) {
        label.el.style.display = 'none';
        continue;
      }
      const x = (this.tmp.x * 0.5 + 0.5) * width;
      const y = (-this.tmp.y * 0.5 + 0.5) * height;
      label.el.style.display = '';
      label.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
    }
  }
}

/** Biểu tượng trạng thái trên đầu (kèm thanh tiến trình tùy chọn) */
export class StatusIcon {
  private readonly label: WorldLabel;
  private readonly labels: WorldLabels;
  private readonly iconEl: HTMLDivElement;
  private readonly barWrap: HTMLDivElement;
  private readonly barFill: HTMLDivElement;
  private lastText = '';
  private lastTone = '';

  constructor(labels: WorldLabels, anchor: Anchor, offsetY: number) {
    this.labels = labels;
    this.label = labels.create(anchor, offsetY, 'status-icon');
    this.iconEl = document.createElement('div');
    this.iconEl.className = 'status-text';
    this.barWrap = document.createElement('div');
    this.barWrap.className = 'status-bar';
    this.barFill = document.createElement('div');
    this.barWrap.appendChild(this.barFill);
    this.label.el.append(this.iconEl, this.barWrap);
    this.hide();
  }

  /**
   * @param ratio 0..1 cho thanh tiến trình, null để ẩn thanh
   * @param tone lớp CSS màu: 'ok' | 'warn' | 'bad' | 'blink' ...
   */
  show(text: string, ratio: number | null = null, tone = ''): void {
    this.label.setVisible(true);
    if (text !== this.lastText) {
      this.iconEl.textContent = text;
      this.lastText = text;
    }
    if (tone !== this.lastTone) {
      this.label.el.className = `world-label status-icon ${tone}`;
      this.lastTone = tone;
    }
    if (ratio === null) {
      this.barWrap.style.display = 'none';
    } else {
      this.barWrap.style.display = '';
      const r = Math.max(0, Math.min(1, ratio));
      this.barFill.style.width = `${(r * 100).toFixed(1)}%`;
      this.barFill.style.background = r > 0.5 ? '#2ecc71' : r > 0.25 ? '#f1c40f' : '#e74c3c';
    }
  }

  hide(): void {
    this.label.setVisible(false);
  }

  dispose(): void {
    this.labels.remove(this.label);
  }
}

/** Bong bóng thoại hiện vài giây rồi tắt */
export class SpeechBubble {
  private readonly label: WorldLabel;
  private readonly labels: WorldLabels;
  private remaining = 0;

  constructor(labels: WorldLabels, anchor: Anchor, offsetY: number, className = 'speech') {
    this.labels = labels;
    this.label = labels.create(anchor, offsetY, className);
    this.label.setVisible(false);
  }

  say(text: string, seconds = 2.5): void {
    this.label.el.textContent = text;
    this.label.setVisible(true);
    this.remaining = seconds;
  }

  update(dt: number): void {
    if (this.remaining <= 0) return;
    this.remaining -= dt;
    if (this.remaining <= 0) this.label.setVisible(false);
  }

  dispose(): void {
    this.labels.remove(this.label);
  }
}
