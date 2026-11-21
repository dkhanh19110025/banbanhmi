import type { EventBus, NotebookEntryView } from '../core/EventBus';
import { type DishId, MENU, formatMoney, getDish } from '../data/menu';

const TABLE_COUNT = 4;

function formatTime(sec: number): string {
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Sổ tay thu ngân: chọn bàn + món bằng click (hoặc phím 1–4 / Z X C V), Enter để ghi.
 * Game vẫn chạy khi đang mở sổ — ghi chậm là bị.
 */
export class Notebook {
  private readonly root: HTMLDivElement;
  private readonly tableButtons: HTMLButtonElement[] = [];
  private readonly dishButtons = new Map<DishId, HTMLButtonElement>();
  private readonly writeButton: HTMLButtonElement;
  private readonly list: HTMLDivElement;
  private bus: EventBus | null = null;
  private table: number | null = null;
  private dish: DishId | null = null;
  private open = false;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'notebook';
    this.root.innerHTML = `
      <div class="nb-title">📒 Sổ tay thu ngân <span class="nb-close">N / Esc để đóng</span></div>
      <div class="nb-section">Bàn <small>(phím 1–4)</small></div>
      <div class="nb-row nb-tables"></div>
      <div class="nb-section">Món <small>(phím Z X C V)</small></div>
      <div class="nb-row nb-dishes"></div>
      <button class="nb-write" disabled>✍️ Ghi vào sổ (Enter)</button>
      <div class="nb-section">Đã ghi</div>
      <div class="nb-list"></div>`;
    parent.appendChild(this.root);

    const tablesRow = this.root.querySelector<HTMLDivElement>('.nb-tables');
    const dishesRow = this.root.querySelector<HTMLDivElement>('.nb-dishes');
    const writeButton = this.root.querySelector<HTMLButtonElement>('.nb-write');
    const list = this.root.querySelector<HTMLDivElement>('.nb-list');
    if (!tablesRow || !dishesRow || !writeButton || !list) throw new Error('Notebook DOM lỗi');
    this.writeButton = writeButton;
    this.list = list;

    for (let n = 1; n <= TABLE_COUNT; n++) {
      const b = document.createElement('button');
      b.textContent = `Bàn ${n}`;
      b.addEventListener('click', () => this.selectTable(n));
      tablesRow.appendChild(b);
      this.tableButtons.push(b);
    }
    for (const d of MENU) {
      const b = document.createElement('button');
      b.innerHTML = `<b>${d.hotkey}</b> ${d.name}<br><small>${formatMoney(d.price)}</small>`;
      b.addEventListener('click', () => this.selectDish(d.id));
      dishesRow.appendChild(b);
      this.dishButtons.set(d.id, b);
    }
    this.writeButton.addEventListener('click', () => this.write());
    this.root.querySelector('.nb-close')?.addEventListener('click', () => this.setOpen(false));

    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  get isOpen(): boolean {
    return this.open;
  }

  attach(bus: EventBus): void {
    this.bus = bus;
    this.setOpen(false);
    this.renderEntries([]);
    bus.on('notebook:changed', (p) => this.renderEntries(p.entries));
  }

  setOpen(open: boolean): void {
    this.open = open;
    this.root.classList.toggle('open', open);
    if (!open) {
      this.table = null;
      this.dish = null;
      this.refresh();
    }
  }

  toggle(): void {
    this.setOpen(!this.open);
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.open) return;
    if (e.code.startsWith('Digit')) {
      const n = Number(e.code.slice(5));
      if (n >= 1 && n <= TABLE_COUNT) this.selectTable(n);
      return;
    }
    const dish = MENU.find((d) => `Key${d.hotkey}` === e.code);
    if (dish) {
      this.selectDish(dish.id);
      return;
    }
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      e.preventDefault();
      this.write();
    }
  }

  private selectTable(n: number): void {
    this.table = n;
    this.refresh();
  }

  private selectDish(d: DishId): void {
    this.dish = d;
    this.refresh();
  }

  private write(): void {
    if (this.table === null || this.dish === null || !this.bus) return;
    this.bus.emit('notebook:write', { table: this.table, dish: this.dish });
    this.setOpen(false);
  }

  private refresh(): void {
    this.tableButtons.forEach((b, i) => b.classList.toggle('selected', this.table === i + 1));
    for (const [id, b] of this.dishButtons) b.classList.toggle('selected', this.dish === id);
    this.writeButton.disabled = this.table === null || this.dish === null;
  }

  private renderEntries(entries: readonly NotebookEntryView[]): void {
    this.list.replaceChildren();
    if (entries.length === 0) {
      this.list.innerHTML = '<div class="nb-empty">Sổ trắng tinh. Chủ quán mà hỏi là toang.</div>';
      return;
    }
    for (const e of [...entries].reverse().slice(0, 8)) {
      const d = getDish(e.dish);
      const row = document.createElement('div');
      row.className = 'nb-entry';
      row.textContent = `${formatTime(e.writtenAt)} — Bàn ${e.table} — ${d.name} — ${formatMoney(d.price)}`;
      this.list.appendChild(row);
    }
  }
}
