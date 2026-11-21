import { DIALOGUES } from '../data/dialogues';

export interface PauseActions {
  onResume: () => void;
  onRetry: () => void;
  onToggleSound: () => boolean;
  onHome: () => void;
}

/** Menu tạm dừng (Esc / P). Game đứng yên hoàn toàn khi mở. */
export class PauseMenu {
  private readonly root: HTMLDivElement;
  private actions: PauseActions | null = null;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'pause';
    parent.appendChild(this.root);
    window.addEventListener('keydown', (e) => {
      if (!this.actions) return;
      if (e.code === 'KeyR') this.actions.onRetry();
      else if (e.code === 'KeyH') this.actions.onHome();
    });
  }

  get visible(): boolean {
    return this.actions !== null;
  }

  show(muted: boolean, actions: PauseActions): void {
    const t = DIALOGUES.pause;
    this.actions = actions;
    this.root.innerHTML = `
      <div class="ps-card">
        <h1>${t.title}</h1>
        <div class="ps-sub">${t.subtitle}</div>
        <button data-act="resume" class="primary">▶ ${t.resume} <small>Esc</small></button>
        <button data-act="retry">↻ ${t.retry} <small>R</small></button>
        <button data-act="sound">${this.soundLabel(muted)} <small>M</small></button>
        <button data-act="home">⌂ ${t.home} <small>H</small></button>
      </div>`;
    const on = (act: string, fn: () => void): void =>
      this.root.querySelector(`[data-act="${act}"]`)?.addEventListener('click', fn);
    on('resume', actions.onResume);
    on('retry', actions.onRetry);
    on('home', actions.onHome);
    on('sound', () => this.updateSound(actions.onToggleSound()));
    this.root.classList.add('show');
  }

  /** Cập nhật chữ nút âm thanh khi bấm M lúc đang mở menu */
  updateSound(muted: boolean): void {
    const b = this.root.querySelector('[data-act="sound"]');
    if (b) b.innerHTML = `${this.soundLabel(muted)} <small>M</small>`;
  }

  hide(): void {
    this.actions = null;
    this.root.classList.remove('show');
  }

  private soundLabel(muted: boolean): string {
    const t = DIALOGUES.pause;
    return `${muted ? '🔇' : '🔊'} ${t.sound}: ${muted ? t.off : t.on}`;
  }
}
