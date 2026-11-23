import { IS_TOUCH } from '../core/Quality';
import { DIALOGUES } from '../data/dialogues';

/** Các bảng có thanh cuộn: vẫn cho vuốt dọc bên trong */
const SCROLLABLE = '.in-card, .rv-card, .bf-card, .ps-card, .notebook, .lab-card';

type LockableOrientation = ScreenOrientation & { lock?: (o: 'landscape') => Promise<void> };

/**
 * Điện thoại: bắt chơi màn ngang và chặn các cử chỉ làm lệch/trượt trang.
 * - Bấm nút bất kỳ (Vào ca, Tiếp tục…) → vào toàn màn hình + khóa ngang (Android/Chrome hỗ trợ).
 * - iPhone không cho khóa xoay từ web → màn dọc thì hiện bảng "xoay ngang" và game tự tạm dừng.
 */
export class Orientation {
  private readonly portraitQuery = window.matchMedia('(orientation: portrait)');

  constructor(parent: HTMLElement, onPortrait: () => void) {
    if (!IS_TOUCH) return;
    document.documentElement.classList.add('is-touch');

    const overlay = document.createElement('div');
    overlay.className = 'rotate-hint';
    overlay.innerHTML = `
      <div class="rotate-phone">📱</div>
      <h2>${DIALOGUES.rotateTitle}</h2>
      <p>${DIALOGUES.rotateText}</p>`;
    parent.appendChild(overlay);

    this.portraitQuery.addEventListener('change', () => {
      if (this.portraitQuery.matches) onPortrait();
    });

    // Chạm vào nút nào cũng là lúc trình duyệt cho phép xin toàn màn hình
    document.addEventListener(
      'click',
      (e) => {
        if (e.target instanceof Element && e.target.closest('button')) this.enterLandscape();
      },
      { capture: true },
    );

    // iOS Safari: chặn chụm 2 ngón phóng to và vuốt kéo trang (ngoài các bảng cuộn được)
    const block = (e: Event): void => e.preventDefault();
    document.addEventListener('gesturestart', block, { passive: false });
    document.addEventListener(
      'touchmove',
      (e) => {
        if (e.touches.length > 1 || !(e.target instanceof Element && e.target.closest(SCROLLABLE))) e.preventDefault();
      },
      { passive: false },
    );
    document.addEventListener('contextmenu', block);
  }

  get isPortrait(): boolean {
    return IS_TOUCH && this.portraitQuery.matches;
  }

  private enterLandscape(): void {
    const lock = (): void => {
      (screen.orientation as LockableOrientation | undefined)?.lock?.('landscape').catch(() => undefined);
    };
    if (document.fullscreenElement || !document.documentElement.requestFullscreen) {
      lock();
      return;
    }
    document.documentElement
      .requestFullscreen({ navigationUI: 'hide' })
      .then(lock)
      .catch(() => undefined);
  }
}
