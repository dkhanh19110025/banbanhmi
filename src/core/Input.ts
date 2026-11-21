const BLOCK_DEFAULT = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

export class Input {
  private readonly down = new Set<string>();
  private readonly pressed = new Set<string>();
  /** Chuột di chuyển bao nhiêu pixel trong khung hình này (để xoay camera) */
  private mouseDX = 0;
  private mouseDY = 0;
  /** Đang giữ chuột trên màn chơi để kéo xoay */
  private dragging = false;
  /** Cần điều hướng ảo trên màn cảm ứng (-1..1) */
  private virtualForward = 0;
  private virtualRight = 0;

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (BLOCK_DEFAULT.has(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => {
      this.down.clear();
      this.dragging = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.dragging) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    window.addEventListener('mouseup', () => (this.dragging = false));
  }

  /** Giữ chuột trái/phải trên màn chơi rồi kéo để xoay hướng nhìn */
  attachDragLook(target: HTMLElement): void {
    target.addEventListener('contextmenu', (e) => e.preventDefault());
    target.addEventListener('mousedown', (e) => {
      if (e.button === 0 || e.button === 2) {
        this.dragging = true;
        e.preventDefault();
      }
    });
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  /** true đúng một khung hình khi vừa bấm */
  wasPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  // ---------- Điều khiển cảm ứng (TouchControls gọi vào đây) ----------

  setVirtualAxis(forward: number, right: number): void {
    this.virtualForward = forward;
    this.virtualRight = right;
  }

  /** Nút ảo bấm xuống: hành xử y như nhấn phím thật */
  pressVirtual(code: string): void {
    if (!this.down.has(code)) this.pressed.add(code);
    this.down.add(code);
  }

  releaseVirtual(code: string): void {
    this.down.delete(code);
  }

  /** Vuốt màn để xoay góc nhìn (tính như chuột kéo) */
  addLook(dx: number, dy: number): void {
    this.mouseDX += dx;
    this.mouseDY += dy;
  }

  /**
   * Hướng di chuyển theo nhân vật: forward (+ là đi tới), right (+ là sang phải).
   * Cần ảo cho giá trị lẻ (đẩy nhẹ = đi chậm); bàn phím luôn đi hết tốc.
   */
  moveAxis(): { forward: number; right: number } {
    let forward = this.virtualForward;
    let right = this.virtualRight;
    if (this.isDown('KeyW') || this.isDown('ArrowUp')) forward += 1;
    if (this.isDown('KeyS') || this.isDown('ArrowDown')) forward -= 1;
    if (this.isDown('KeyD') || this.isDown('ArrowRight')) right += 1;
    if (this.isDown('KeyA') || this.isDown('ArrowLeft')) right -= 1;
    return { forward, right };
  }

  /** Lấy độ dời chuột tích lũy rồi xóa */
  consumeMouse(): { dx: number; dy: number } {
    const d = { dx: this.mouseDX, dy: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return d;
  }

  endFrame(): void {
    this.pressed.clear();
  }
}
