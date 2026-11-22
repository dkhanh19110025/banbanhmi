import { stretch } from '../core/Hash';

// Chỉ giữ dấu vân tay của mã, không giữ mã gốc. Chia nhỏ ra cho khó tìm bằng Ctrl+F.
const SALT = ['q7#Zr', '!m2vK9'].join('');
const ROUNDS = 4000;
const DIGEST = ['39c3633140ba599cce305b72f5aee16b', '063c574efa65723c181c898bbf129659'].join('');

/**
 * Nút khóa mờ ở góc màn hình chính. Bấm → ô nhập mã. Nhập đúng thì gọi onOpen.
 * Nhập sai: lắc nhẹ, không báo gì. Phần công cụ test nằm ở file tách riêng, chỉ tải về sau khi nhập đúng.
 */
export class CodeGate {
  private readonly btn: HTMLButtonElement;
  private readonly box: HTMLDivElement;
  private readonly input: HTMLInputElement;

  constructor(parent: HTMLElement, onOpen: () => void) {
    this.btn = document.createElement('button');
    this.btn.textContent = '\u{1F512}';
    this.btn.setAttribute('aria-hidden', 'true');
    this.btn.tabIndex = -1;
    Object.assign(this.btn.style, {
      position: 'absolute',
      right: '10px',
      bottom: '10px',
      zIndex: '12',
      display: 'none',
      opacity: '0.12',
      background: 'none',
      border: 'none',
      fontSize: '16px',
      cursor: 'pointer',
      pointerEvents: 'auto',
    });
    this.btn.addEventListener('mouseenter', () => (this.btn.style.opacity = '0.6'));
    this.btn.addEventListener('mouseleave', () => (this.btn.style.opacity = '0.12'));

    this.box = document.createElement('div');
    Object.assign(this.box.style, {
      position: 'absolute',
      right: '10px',
      bottom: '40px',
      zIndex: '12',
      display: 'none',
      pointerEvents: 'auto',
    });
    this.input = document.createElement('input');
    this.input.type = 'password';
    this.input.autocomplete = 'off';
    this.input.spellcheck = false;
    this.input.setAttribute('aria-label', 'code');
    Object.assign(this.input.style, {
      width: '150px',
      padding: '6px 10px',
      font: '16px monospace',
      border: '2px solid #2b1d14',
      borderRadius: '8px',
      background: '#fff8dc',
      color: '#2b1d14',
      userSelect: 'text',
    });
    this.box.appendChild(this.input);
    parent.append(this.btn, this.box);

    this.btn.addEventListener('click', () => {
      const open = this.box.style.display === 'none';
      this.box.style.display = open ? 'block' : 'none';
      if (open) this.input.focus();
    });
    // Gõ mã không được kích hoạt phím tắt của game (Enter / Space vào ca...)
    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.code === 'Escape') {
        this.box.style.display = 'none';
        return;
      }
      if (e.code !== 'Enter' && e.code !== 'NumpadEnter') return;
      e.preventDefault();
      const ok = stretch(this.input.value, SALT, ROUNDS) === DIGEST;
      this.input.value = '';
      if (ok) {
        this.box.style.display = 'none';
        onOpen();
      } else {
        this.input.animate([{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], {
          duration: 180,
        });
      }
    });
    this.input.addEventListener('keyup', (e) => e.stopPropagation());
  }

  /** Chỉ hiện ở màn chính và màn trốn việc */
  setVisible(visible: boolean): void {
    this.btn.style.display = visible ? 'block' : 'none';
    if (!visible) this.box.style.display = 'none';
  }
}
