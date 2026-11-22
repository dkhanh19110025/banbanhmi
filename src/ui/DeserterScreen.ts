import { DIALOGUES, fillLine } from '../data/dialogues';

/**
 * Màn "trốn việc": hiện khi mở lại game lúc còn ca dở (hoặc bấm Bỏ ca giữa chừng).
 * Chỉ có MỘT nút — làm lại ca. Không có nút chơi tiếp, cũng không có nút chịu phạt.
 */
export class DeserterScreen {
  private readonly root: HTMLDivElement;
  private onRetry: (() => void) | null = null;
  /** Chỉ nhận phím sau khi đã nhả phím (Enter ở màn trước không được "xuyên" qua) */
  private armed = false;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'briefing deserter';
    parent.appendChild(this.root);
    window.addEventListener('keyup', () => (this.armed = true));
    window.addEventListener('keydown', (e) => {
      if (!this.onRetry || !this.armed) return;
      if (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter') {
        e.preventDefault();
        this.retry();
      }
    });
  }

  get visible(): boolean {
    return this.onRetry !== null;
  }

  show(day: number, onRetry: () => void): void {
    const t = DIALOGUES.deserter;
    this.root.innerHTML = `
      <div class="bf-card ds-card">
        <h1>${t.title}</h1>
        <div class="ds-boss">😤 ${t.boss}</div>
        <p class="ds-line">${t.line}</p>
        <button class="bf-start">${fillLine(t.button, { day })} <small>Enter</small></button>
      </div>`;
    this.root.querySelector('.bf-start')?.addEventListener('click', () => this.retry());
    this.root.classList.add('show');
    this.onRetry = onRetry;
    this.armed = false;
  }

  hide(): void {
    this.onRetry = null;
    this.root.classList.remove('show');
  }

  private retry(): void {
    const cb = this.onRetry;
    if (!cb) return;
    this.hide();
    cb();
  }
}
