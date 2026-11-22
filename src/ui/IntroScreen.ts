import { cleanName, MAX_NAME_LENGTH, type SaveData, writeSave } from '../core/Storage';
import { IS_TOUCH } from '../core/Quality';
import { DIALOGUES, fillLine } from '../data/dialogues';

/** Bảng giới thiệu hiện trước khi vào ca đầu tiên. Bấm nút / Enter / Space để vào. */
export class IntroScreen {
  private readonly root: HTMLDivElement;
  private onStart: (() => void) | null = null;
  private startFromOne: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'intro';
    parent.appendChild(this.root);
    window.addEventListener('keydown', (e) => {
      if (!this.onStart) return;
      if (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter') {
        e.preventDefault();
        this.start();
      }
    });
  }

  get visible(): boolean {
    return this.onStart !== null;
  }

  /** @param onStart nhận số ca muốn vào (ca đang dở hoặc ca 1) */
  show(day: number, save: SaveData, onStart: (day: number) => void): void {
    const t = DIALOGUES.intro;
    const steps = t.steps
      .map((s, i) => `<li><span class="in-num">${i + 1}</span><span class="in-ico">${s.icon}</span><span>${s.text}</span></li>`)
      .join('');
    const dangers = t.dangers
      .map(
        (d) => `
        <div class="in-danger ${'locked' in d ? 'locked' : ''}">
          <div class="in-danger-head"><span class="in-ico">${d.icon}</span><b>${d.name}</b><small>${d.from}</small></div>
          <div class="in-danger-text">${d.text}</div>
        </div>`,
      )
      .join('');
    const controls = (IS_TOUCH ? t.controlsTouch : t.controls).map(([key, what]) => `<div><kbd>${key}</kbd></div><div>${what}</div>`).join('');
    const played = save.shiftsCompleted + save.timesFired > 0;
    const stats = played
      ? `<div class="in-stats">
           <div>🏆 Ca xa nhất<b>${save.bestDay}</b></div>
           <div>🔥 Bị đuổi<b>${save.timesFired}</b></div>
           <div>🖐️ Bị tát<b>${save.timesSlapped}</b></div>
         </div>`
      : `<div class="in-empty">${t.statsEmpty}</div>`;

    // iPhone Safari không cho trang web tự toàn màn hình: chỉ có cách thêm vào màn hình chính
    const nav = navigator as Navigator & { standalone?: boolean };
    const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const installed = nav.standalone === true || window.matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches;
    const installHint = IS_TOUCH && isIos && !installed ? `<div class="in-install">${DIALOGUES.installHint}</div>` : '';

    this.root.innerHTML = `
      <div class="in-card">
        <div class="in-hero">
          <h1>🥖 ${t.title} 🔥</h1>
        </div>
        <div class="in-welcome">
          <div class="in-welcome-title">${t.welcome}</div>
          <label class="in-name">
            <span>${t.nameLabel}</span>
            <input class="in-name-input" type="text" maxlength="${MAX_NAME_LENGTH}" placeholder="${t.namePlaceholder}" autocomplete="off" spellcheck="false" />
          </label>
        </div>
        <p class="in-story">${t.story}</p>
        <div class="in-grid">
          <section>
            <h2>${t.stepsTitle}</h2>
            <ol class="in-steps">${steps}</ol>
            <h2>${t.controlsTitle}</h2>
            <div class="in-controls">${controls}</div>
          </section>
          <section>
            <h2>${t.dangersTitle}</h2>
            <div class="in-dangers">${dangers}</div>
            <h2>${t.statsTitle}</h2>
            ${stats}
          </section>
        </div>
        <div class="in-footer">
          ${installHint}
          <button class="in-start">${fillLine(t.start, { day })} <small>${t.startHint}</small></button>
          ${day > 1 ? `<button class="in-restart">${t.restartFromOne}</button>` : ''}
        </div>
      </div>`;
    // Ô đặt tên: giá trị gán bằng thuộc tính (không chèn vào HTML nên không dính ký tự lạ)
    const nameInput = this.root.querySelector<HTMLInputElement>('.in-name-input');
    if (nameInput) {
      nameInput.value = save.playerName;
      nameInput.addEventListener('input', () => {
        save.playerName = cleanName(nameInput.value);
        writeSave(save);
      });
      // Gõ chữ không được kích hoạt phím tắt của game (M tắt tiếng, Space vào ca...). Enter thì vào ca.
      nameInput.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.code === 'Enter' || e.code === 'NumpadEnter') {
          e.preventDefault();
          this.start();
        }
      });
    }
    this.root.querySelector('.in-start')?.addEventListener('click', () => this.start());
    this.root.querySelector('.in-restart')?.addEventListener('click', () => {
      this.startFromOne?.();
    });
    this.root.classList.add('show');
    this.onStart = () => onStart(day);
    this.startFromOne = () => {
      this.close();
      onStart(1);
    };
  }

  /** Đóng bảng từ bên ngoài (vào ca bằng đường khác) */
  dismiss(): void {
    this.close();
  }

  private start(): void {
    const cb = this.onStart;
    if (!cb) return;
    this.close();
    cb();
  }

  private close(): void {
    this.onStart = null;
    this.startFromOne = null;
    this.root.classList.remove('show');
  }
}
