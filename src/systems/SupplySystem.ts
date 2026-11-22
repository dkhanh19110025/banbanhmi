import type { EventBus } from '../core/EventBus';
import type { ShiftConfig } from '../data/difficulty';
import { DIALOGUES, fillLine } from '../data/dialogues';
import { getDish, INGREDIENTS, type IngredientId } from '../data/menu';
import { StatusIcon, type WorldLabels } from '../ui/DialogBubble';
import type { Player } from '../world/Player';
import type { Restaurant } from '../world/Restaurant';
import type { InteractionSystem } from './InteractionSystem';

const IDS = Object.keys(INGREDIENTS) as IngredientId[];

export interface SupplyDeps {
  bus: EventBus;
  cfg: ShiftConfig;
  labels: WorldLabels;
  restaurant: Restaurant;
  interaction: InteractionSystem;
  player: Player;
}

/**
 * Sự cố — Hết nguyên liệu (từ ca 8).
 * Kích hoạt: mỗi lần nướng tốn nguyên liệu (pate, dưa leo, gas); kho có hạn nên dùng riết sẽ cạn.
 * Dấu hiệu: thông báo "sắp hết" khi còn ít, nhãn cảnh báo trên kệ bếp, nhãn 🛍️ Chợ ngoài vỉa hè.
 * Khắc phục: chạy ra chợ ngoài vỉa hè mua (E), ôm túi về cất lên kệ bếp (E). Món khác vẫn làm được trong lúc chờ.
 * Hậu quả: hết mà không mua → món cần nguyên liệu đó không làm được, khách chờ cáu rồi bỏ về, chủ quán bực.
 */
export class SupplySystem {
  private readonly deps: SupplyDeps;
  private readonly offs: Array<() => void> = [];
  private readonly stock: Record<IngredientId, number>;
  private readonly shelfIcon: StatusIcon;
  private readonly marketIcon: StatusIcon;
  /** Nguyên liệu đang ôm trong túi (mua ở chợ, chưa cất) */
  private carried: IngredientId | null = null;

  constructor(deps: SupplyDeps) {
    this.deps = deps;
    const { bus, cfg, labels, restaurant, interaction, player } = deps;
    this.stock = { ...cfg.supplyStart };
    this.shelfIcon = new StatusIcon(labels, restaurant.supplyShelfLabelAnchor, 0);
    this.marketIcon = new StatusIcon(labels, restaurant.marketLabelAnchor, 0);

    this.offs.push(
      bus.on('kitchen:cookStarted', (c) => this.consume(c.dish)),
      // Chợ ngoài vỉa hè: mua thứ đang thiếu nhất
      interaction.register({
        position: () => restaurant.marketPoint,
        range: cfg.interactRange + 0.5,
        action: () => {
          if (player.handsFull) return null;
          const item = this.neediest();
          return item ? fillLine(DIALOGUES.actionBuy, { item: INGREDIENTS[item].name }) : null;
        },
        perform: () => {
          if (player.handsFull) return;
          const item = this.neediest();
          if (!item) return;
          this.carried = item;
          player.setCarrying('supply');
          bus.emit('toast', { text: fillLine(DIALOGUES.toastSupplyBought, { item: INGREDIENTS[item].name }), kind: 'info' });
        },
      }),
      // Kệ bếp: cất nguyên liệu mới mua
      interaction.register({
        position: () => restaurant.supplyShelfPoint,
        range: cfg.interactRange,
        action: () =>
          player.carrying === 'supply' && this.carried
            ? fillLine(DIALOGUES.actionStock, { item: INGREDIENTS[this.carried].name })
            : null,
        perform: () => this.stockShelf(),
      }),
    );
  }

  update(): void {
    const { player } = this.deps;
    const out = this.outItems();
    const low = this.lowItems();
    if (player.carrying === 'supply' && this.carried) {
      this.shelfIcon.show(fillLine(DIALOGUES.actionStock, { item: INGREDIENTS[this.carried].name }), null, 'ok');
      this.marketIcon.hide();
      return;
    }
    if (out.length > 0) this.shelfIcon.show(fillLine(DIALOGUES.shelfOut, { list: this.names(out) }), null, 'bad blink');
    else if (low.length > 0) this.shelfIcon.show(fillLine(DIALOGUES.shelfLow, { list: this.names(low) }), null, 'warn');
    else this.shelfIcon.hide();
    if (low.length > 0) this.marketIcon.show(DIALOGUES.marketIcon, null, out.length > 0 ? 'bad blink' : 'warn');
    else this.marketIcon.hide();
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.shelfIcon.dispose();
    this.marketIcon.dispose();
  }

  private names(ids: readonly IngredientId[]): string {
    return ids.map((i) => `${INGREDIENTS[i].icon} ${INGREDIENTS[i].name}`).join(', ');
  }

  private lowItems(): IngredientId[] {
    return IDS.filter((i) => this.stock[i] <= this.deps.cfg.supplyLowAt);
  }

  private outItems(): IngredientId[] {
    return IDS.filter((i) => this.stock[i] <= 0);
  }

  /** Thứ đang cạn nhất trong số những thứ sắp hết */
  private neediest(): IngredientId | null {
    const low = this.lowItems();
    if (low.length === 0) return null;
    return low.reduce((a, b) => (this.stock[b] < this.stock[a] ? b : a));
  }

  private consume(dish: Parameters<typeof getDish>[0]): void {
    const { bus, cfg } = this.deps;
    for (const id of getDish(dish).ingredients) {
      const before = this.stock[id];
      this.stock[id] = Math.max(0, before - 1);
      const name = INGREDIENTS[id].name;
      if (this.stock[id] <= 0 && before > 0) {
        bus.emit('toast', { text: fillLine(DIALOGUES.toastSupplyOut, { item: name.toUpperCase() }), kind: 'bad' });
      } else if (this.stock[id] <= cfg.supplyLowAt && before > cfg.supplyLowAt) {
        bus.emit('toast', { text: fillLine(DIALOGUES.toastSupplyLow, { item: name, n: this.stock[id] }), kind: 'warn' });
      }
    }
    this.emitStatus();
  }

  private stockShelf(): void {
    const { bus, cfg, player } = this.deps;
    if (player.carrying !== 'supply' || !this.carried) return;
    const item = this.carried;
    this.stock[item] += cfg.supplyRefill;
    this.carried = null;
    player.setCarrying(null);
    bus.emit('toast', { text: fillLine(DIALOGUES.toastSupplyStocked, { item: INGREDIENTS[item].name }), kind: 'good' });
    this.emitStatus();
  }

  private emitStatus(): void {
    this.deps.bus.emit('supply:status', { stock: { ...this.stock }, out: this.outItems() });
  }
}
