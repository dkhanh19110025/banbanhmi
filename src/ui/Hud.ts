import type { CatStatus, EventBus, Ticket, ToastKind } from '../core/EventBus';
import { DIALOGUES } from '../data/dialogues';
import { type DishId, formatMoney, getDish } from '../data/menu';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  parent?.appendChild(node);
  return node;
}

function formatClock(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Thanh lương, rating, đồng hồ, phiếu order, gợi ý tương tác, thông báo */
export class Hud {
  private readonly salaryFill: HTMLDivElement;
  private readonly salaryText: HTMLSpanElement;
  private readonly ratingText: HTMLSpanElement;
  private readonly clockText: HTMLSpanElement;
  private readonly dayText: HTMLSpanElement;
  private readonly tickets: HTMLDivElement;
  private readonly prompt: HTMLDivElement;
  private readonly held: HTMLDivElement;
  private readonly toasts: HTMLDivElement;
  private readonly audit: HTMLDivElement;
  private readonly angerBox: HTMLDivElement;
  private readonly angerFill: HTMLDivElement;
  private readonly moodText: HTMLSpanElement;
  private readonly catBox: HTMLDivElement;
  private readonly muteBtn: HTMLDivElement;
  private readonly root: HTMLDivElement;
  private readonly catFill: HTMLDivElement;
  private readonly catText: HTMLSpanElement;
  private auditSpeaker = '';
  private auditRemaining = 0;
  private auditHideIn = 0;
  private auditQuestion = '';

  private readonly help: HTMLDivElement;
  constructor(parent: HTMLElement) {
    // Gom cả HUD vào một khung để ẩn/hiện chung (chỉ hiện khi đang trong ca)
    const root = el('div', 'hud hidden', parent);
    this.root = root;
    const top = el('div', 'hud-top', root);

    const salary = el('div', 'hud-box salary', top);
    el('span', 'hud-label', salary).textContent = '💰 Lương';
    const bar = el('div', 'bar', salary);
    this.salaryFill = el('div', 'bar-fill', bar);
    this.salaryText = el('span', 'hud-value', salary);

    this.angerBox = el('div', 'hud-box anger', top);
    el('span', 'hud-label', this.angerBox).textContent = '😤 Chủ quán';
    const angerBar = el('div', 'bar', this.angerBox);
    this.angerFill = el('div', 'bar-fill', angerBar);
    this.moodText = el('span', 'hud-mood', this.angerBox);

    const rating = el('div', 'hud-box', top);
    this.ratingText = el('span', 'hud-value stars', rating);

    const clock = el('div', 'hud-box', top);
    this.dayText = el('span', 'hud-label', clock);
    this.clockText = el('span', 'hud-value', clock);

    const left = el('div', 'hud-tickets-wrap', root);
    el('div', 'hud-title', left).textContent = '🧾 Order chờ làm';
    this.tickets = el('div', 'hud-tickets', left);

    this.held = el('div', 'hud-held', root);
    this.prompt = el('div', 'hud-prompt', root);
    this.toasts = el('div', 'hud-toasts', root);
    this.audit = el('div', 'hud-audit', root);

    // Góc dưới phải: icon mèo + thanh ngủ (mục 7)
    this.catBox = el('div', 'hud-cat', root);
    el('span', 'hud-cat-icon', this.catBox).textContent = '🐈';
    const catRight = el('div', 'hud-cat-right', this.catBox);
    this.catText = el('span', 'hud-cat-text', catRight);
    const catBar = el('div', 'bar', catRight);
    this.catFill = el('div', 'bar-fill', catBar);

    this.muteBtn = el('div', 'hud-mute', root);

    this.help = el('div', 'hud-help', root);
    this.setViewMode('third');
  }

  /** Cập nhật dòng hướng dẫn theo góc nhìn đang dùng */
  setViewMode(mode: 'third' | 'first'): void {
    const view = mode === 'third' ? 'nhìn sau lưng' : 'mắt nhân viên';
    this.help.innerHTML =
      `<b>WASD</b> đi · <b>Giữ chuột kéo</b> xoay · <b>E</b> tương tác · <b>N</b> sổ tay · <b>V</b> ${view} · <b>Esc</b> tạm dừng`;
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle('hidden', !visible);
  }

  /** Gắn HUD vào bus của ca mới */
  attach(bus: EventBus): void {
    this.reset();
    this.setVisible(true);
    bus.on('stats:changed', (s) => {
      const r = Math.max(0, s.salary / s.maxSalary);
      this.salaryFill.style.width = `${(r * 100).toFixed(0)}%`;
      this.salaryFill.style.background = r > 0.5 ? '#2ecc71' : r > 0.25 ? '#f1c40f' : '#e74c3c';
      this.salaryText.textContent = formatMoney(s.salary);
      const full = Math.round(s.rating * 2) / 2;
      this.ratingText.textContent = `⭐ ${full.toFixed(1)} / 5`;
    });
    bus.on('orders:changed', (p) => this.renderTickets(p.tickets));
    bus.on('shift:tick', (t) => (this.clockText.textContent = `còn ${formatClock(t.total - t.elapsed)}`));
    bus.on('toast', (t) => this.toast(t.text, t.kind));
    bus.on('salary:penalty', (p) => this.toast(`-${formatMoney(p.amount)}: ${p.reason}`, 'bad'));
    bus.on('rating:change', (p) => this.toast(`${p.delta}★ ${p.reason}`, 'warn'));
    bus.on('boss:anger', (a) => {
      const r = Math.min(1, a.anger / a.max);
      this.angerBox.style.display = '';
      this.angerFill.style.width = `${(r * 100).toFixed(1)}%`;
      this.angerFill.style.background = r < 0.5 ? '#f1c40f' : r < 0.8 ? '#e67e22' : '#e74c3c';
      this.angerBox.classList.toggle('danger', r >= 0.8);
      this.moodText.textContent = a.mood;
    });
    bus.on('cat:status', (c) => this.renderCat(c.sleep / c.max, c.status));
    bus.on('audit:warning', (a) => {
      this.auditSpeaker = a.speaker;
      this.auditQuestion = a.question;
      this.auditRemaining = a.seconds;
      this.auditHideIn = 0;
      this.audit.className = 'hud-audit show warn';
      this.renderAudit();
    });
    bus.on('audit:result', (r) => {
      this.auditRemaining = 0;
      this.auditHideIn = 2.5;
      this.audit.className = `hud-audit show ${r.ok ? 'good' : 'bad'}`;
      this.audit.innerHTML = `<div class="who">📢 ${this.auditSpeaker}</div><div class="q">${r.line}</div>`;
    });
  }

  setDay(day: number, eventName: string | null): void {
    this.dayText.textContent = eventName ? `Ca ${day} · ${eventName}` : `Ca ${day}`;
  }

  /** Nút loa góc dưới (M) */
  setMuted(muted: boolean): void {
    this.muteBtn.textContent = muted ? '🔇 M' : '🔊 M';
  }

  setPrompt(text: string | null): void {
    if (text) {
      this.prompt.innerHTML = `<kbd>E</kbd> ${text}`;
      this.prompt.style.display = '';
    } else {
      this.prompt.style.display = 'none';
    }
  }

  setHeld(dish: DishId | null): void {
    if (dish) {
      this.held.textContent = `Đang cầm: 🥖 ${getDish(dish).name}`;
      this.held.style.display = '';
    } else {
      this.held.style.display = 'none';
    }
  }

  update(dt: number): void {
    if (this.auditRemaining > 0) {
      this.auditRemaining = Math.max(0, this.auditRemaining - dt);
      this.renderAudit();
    } else if (this.auditHideIn > 0) {
      this.auditHideIn -= dt;
      if (this.auditHideIn <= 0) this.audit.className = 'hud-audit';
    }
  }

  private reset(): void {
    this.tickets.replaceChildren();
    this.toasts.replaceChildren();
    this.audit.className = 'hud-audit';
    this.auditRemaining = 0;
    this.auditHideIn = 0;
    this.angerBox.style.display = 'none';
    this.catBox.style.display = 'none';
    this.setPrompt(null);
    this.setHeld(null);
    this.renderTickets([]);
  }

  private renderCat(ratio: number, status: CatStatus): void {
    this.catBox.style.display = '';
    // Xanh → vàng → đỏ theo độ an toàn
    const danger: Record<CatStatus, 0 | 1 | 2> = {
      sleeping: 0,
      inBed: 0,
      carried: 0,
      sleepy: 1,
      waking: 2,
      wandering: 2,
      grabbed: 2,
      stolen: 2,
    };
    const level = danger[status];
    this.catBox.className = `hud-cat level-${level}`;
    this.catText.textContent = DIALOGUES.catHud[status];
    this.catFill.style.width = `${(Math.max(0, Math.min(1, ratio)) * 100).toFixed(0)}%`;
    this.catFill.style.background = ['#2ecc71', '#f1c40f', '#e74c3c'][level];
  }

  private renderAudit(): void {
    this.audit.innerHTML =
      `<div class="who">📢 ${this.auditSpeaker}</div>` +
      `<div class="q">"${this.auditQuestion}"</div>` +
      `<div class="t">Kiểm sổ sau ${this.auditRemaining.toFixed(1)}s — mở sổ (N) mà ghi lẹ!</div>`;
  }

  private renderTickets(tickets: readonly Ticket[]): void {
    this.tickets.replaceChildren();
    if (tickets.length === 0) {
      el('div', 'ticket empty', this.tickets).textContent = 'Chưa có order';
      return;
    }
    for (const t of tickets) {
      el('div', 'ticket', this.tickets).textContent = `Bàn ${t.table}: ${getDish(t.dish).name}`;
    }
  }

  private toast(text: string, kind: ToastKind): void {
    const node = el('div', `toast ${kind}`, this.toasts);
    node.textContent = text;
    window.setTimeout(() => node.remove(), 3200);
    while (this.toasts.children.length > 5) this.toasts.firstChild?.remove();
  }
}
