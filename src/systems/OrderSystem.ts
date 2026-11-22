import type { EventBus, KitchenBlock, Ticket } from '../core/EventBus';
import type { ShiftConfig } from '../data/difficulty';
import { DIALOGUES, fillLine } from '../data/dialogues';
import { type DishId, getDish, INGREDIENTS, type IngredientId } from '../data/menu';
import { StatusIcon, type WorldLabels } from '../ui/DialogBubble';
import { distanceXZ } from '../world/Collision';
import type { Player } from '../world/Player';
import type { Restaurant } from '../world/Restaurant';
import type { InteractionSystem } from './InteractionSystem';
import type * as THREE from 'three';
import { Steam } from '../world/Steam';

export interface OrderDeps {
  bus: EventBus;
  cfg: ShiftConfig;
  labels: WorldLabels;
  restaurant: Restaurant;
  interaction: InteractionSystem;
  player: Player;
  scene: THREE.Object3D;
}

/** Phiếu order + bếp: nhận order → làm bánh ở bếp → cầm ra đưa khách */
export class OrderSystem {
  private readonly deps: OrderDeps;
  private tickets: Ticket[] = [];
  private cooking: { dish: DishId; progress: number } | null = null;
  private readonly icon: StatusIcon;
  private readonly offs: Array<() => void> = [];
  private readonly steam: Steam;
  /** Bếp đang không dùng được (cháy / mất điện) */
  private readonly blocks = new Set<KitchenBlock>();
  /** Nguyên liệu đã hết */
  private outOfStock = new Set<IngredientId>();

  constructor(deps: OrderDeps) {
    this.deps = deps;
    const { bus, restaurant, interaction, player, cfg } = deps;
    this.icon = new StatusIcon(deps.labels, restaurant.kitchenLabelAnchor, 0);
    this.steam = new Steam(deps.scene, restaurant.grillPoint);

    this.offs.push(
      bus.on('order:taken', (t) => {
        const ticket: Ticket = { customerId: t.customerId, table: t.table, dish: t.dish, priority: t.priority };
        // Đơn ưu tiên (shipper) chen lên đầu hàng
        if (t.priority) this.tickets.unshift(ticket);
        else this.tickets.push(ticket);
        this.emitChanged();
      }),
      bus.on('order:served', (p) => {
        player.setHeld(null);
        this.removeTicket(p.customerId);
      }),
      bus.on('order:cancelled', (p) => this.removeTicket(p.customerId)),
      bus.on('customer:angryLeave', (p) => this.removeTicket(p.customerId)),
      bus.on('kitchen:block', (b) => {
        if (b.active) this.blocks.add(b.reason);
        else this.blocks.delete(b.reason);
      }),
      bus.on('supply:status', (s) => (this.outOfStock = new Set(s.out))),
      interaction.register({
        position: () => restaurant.kitchenPoint,
        range: cfg.interactRange + cfg.stationRangeBonus,
        action: () => {
          if (this.cooking || player.carrying) return null; // đang ôm mèo / cầm menu thì không nấu được
          if (this.blocks.size > 0) return null; // cháy / mất điện: bếp dùng không được
          if (player.held) return `Bỏ ${getDish(player.held).name} đang cầm`;
          const next = this.nextCookable();
          if (next) return `Làm ${getDish(next.dish).name} (${this.tableName(next)})`;
          const stuck = this.tickets[0];
          if (stuck) return this.missingLine(stuck.dish);
          return null;
        },
        perform: () => {
          if (this.cooking || player.carrying || this.blocks.size > 0) return;
          if (player.held) {
            player.setHeld(null);
            return;
          }
          const next = this.nextCookable();
          if (!next) return;
          this.cooking = { dish: next.dish, progress: 0 };
          bus.emit('kitchen:cookStarted', { dish: next.dish });
          bus.emit('sfx', { sound: 'sizzle' });
        },
      }),
    );
  }

  update(dt: number): void {
    const { player, restaurant, cfg, bus } = this.deps;
    this.steam.update(dt, this.cooking !== null && this.blocks.size === 0);
    if (!this.cooking) {
      if (this.blocks.has('power')) this.icon.show(DIALOGUES.kitchenNoPower, null, 'bad');
      else if (this.blocks.size > 0) this.icon.hide();
      else if (this.tickets.length > 0 && !player.held) this.icon.show('🔔 Có order!', null, 'warn');
      else this.icon.hide();
      return;
    }
    // Bếp bị chặn: bánh dừng nướng cho tới khi xử lý xong
    if (this.blocks.size > 0) {
      this.icon.show(this.blocks.has('power') ? DIALOGUES.kitchenNoPower : '🔥 Chảo có chuyện!', this.cooking.progress, 'bad blink');
      return;
    }
    // Phải đứng ở bếp thì bánh mới chín
    const near = distanceXZ(player.position, restaurant.kitchenPoint) <= cfg.interactRange + cfg.stationRangeBonus;
    if (!near) {
      this.icon.show('🔥 Quay lại bếp!', this.cooking.progress, 'bad blink');
      return;
    }
    this.cooking.progress += dt / cfg.cookTimeSec;
    this.icon.show(`🔥 ${getDish(this.cooking.dish).name}`, this.cooking.progress, 'ok');
    if (this.cooking.progress >= 1) {
      const dish = this.cooking.dish;
      this.cooking = null;
      player.setHeld(dish);
      bus.emit('kitchen:cooked', { dish });
      bus.emit('toast', { text: fillLine(DIALOGUES.toastCooked, { dish: getDish(dish).name }), kind: 'info' });
    }
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.icon.dispose();
    this.steam.dispose();
  }

  private tableName(t: Ticket): string {
    return t.table === 0 ? 'Shipper' : `Bàn ${t.table}`;
  }

  /** Món đầu tiên trong hàng mà đủ nguyên liệu để làm */
  private nextCookable(): Ticket | undefined {
    return this.tickets.find((t) => getDish(t.dish).ingredients.every((i) => !this.outOfStock.has(i)));
  }

  private missingLine(dish: DishId): string {
    const missing = getDish(dish).ingredients.find((i) => this.outOfStock.has(i));
    const item = missing ? INGREDIENTS[missing].name : '';
    return fillLine(DIALOGUES.kitchenOut, { item, dish: getDish(dish).name });
  }

  private removeTicket(customerId: number): void {
    const before = this.tickets.length;
    this.tickets = this.tickets.filter((t) => t.customerId !== customerId);
    if (this.tickets.length !== before) this.emitChanged();
  }

  private emitChanged(): void {
    this.deps.bus.emit('orders:changed', { tickets: [...this.tickets] });
  }
}
