import type * as THREE from 'three';
import type { EventBus } from '../core/EventBus';
import { pick, randomIn } from '../core/Random';
import type { ShiftConfig } from '../data/difficulty';
import { DIALOGUES, fillLine } from '../data/dialogues';
import { MENU, formatMoney, getDish } from '../data/menu';
import type { Cat } from '../entities/Cat';
import { Customer } from '../entities/Customer';
import type { WorldLabels } from '../ui/DialogBubble';
import type { Player } from '../world/Player';
import type { Restaurant } from '../world/Restaurant';
import type { InteractionSystem } from './InteractionSystem';

export interface SpawnDeps {
  bus: EventBus;
  cfg: ShiftConfig;
  labels: WorldLabels;
  restaurant: Restaurant;
  scene: THREE.Object3D;
  interaction: InteractionSystem;
  player: Player;
  cat: Cat | null;
}

/** Sinh khách theo nhịp của ca và quản lý hàng chờ ở quầy */
export class SpawnSystem {
  private readonly deps: SpawnDeps;
  private readonly customers: Customer[] = [];
  private readonly unregister = new Map<number, () => void>();
  private readonly unregisterCounter: () => void;
  private nextId = 1;
  private spawnTimer: number;
  /** Đang có giang hồ trong quán → không cho trộm mèo cùng lúc (mục 9 quy tắc 2) */
  private gangPresent = false;
  private readonly offs: Array<() => void> = [];

  constructor(deps: SpawnDeps) {
    this.deps = deps;
    this.spawnTimer = deps.cfg.firstSpawnDelaySec;
    this.offs.push(
      deps.bus.on('gang:arrived', () => (this.gangPresent = true)),
      deps.bus.on('gang:left', () => (this.gangPresent = false)),
    );

    // Quầy thu ngân: thu tiền khách đứng đầu hàng
    this.unregisterCounter = deps.interaction.register({
      position: () => deps.restaurant.counterPoint,
      range: deps.cfg.interactRange + deps.cfg.stationRangeBonus,
      action: () => {
        const front = this.frontOfQueue();
        if (!front) return null;
        return `Thu tiền Bàn ${front.table.number} (${formatMoney(getDish(front.dish).price)})`;
      },
      perform: () => this.frontOfQueue()?.collectPayment(),
    });
  }

  update(dt: number, spawning: boolean): void {
    if (spawning) this.tickSpawn(dt);
    this.updateQueue();
    for (const c of this.customers) c.update(dt);
    this.removeGone();
  }

  dispose(): void {
    for (const c of this.customers) c.dispose();
    this.customers.length = 0;
    for (const off of this.unregister.values()) off();
    this.unregister.clear();
    this.unregisterCounter();
    for (const off of this.offs) off();
  }

  private tickSpawn(dt: number): void {
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = randomIn(this.deps.cfg.spawnIntervalSec);
    if (this.customers.length >= this.deps.cfg.maxCustomers) return;
    const busy = new Set(this.customers.filter((c) => c.occupiesTable).map((c) => c.table.number));
    const free = this.deps.restaurant.tables.filter((t) => !busy.has(t.number));
    if (free.length === 0) return;
    this.spawn(pick(free));
  }

  private spawn(table: Customer['table']): void {
    const { bus, cfg, labels, restaurant, scene, interaction, player, cat } = this.deps;
    const customer = new Customer(this.nextId++, table, pick(MENU).id, {
      bus,
      cfg,
      labels,
      restaurant,
      cat,
      canStealCat: () => !this.gangPresent,
    });
    scene.add(customer.body.group);
    this.customers.push(customer);

    const off = interaction.register({
      position: () => customer.position,
      range: cfg.interactRange,
      action: () => {
        if (customer.isCarryingCat) return DIALOGUES.actionRescueCat;
        if (customer.canBeReminded) return fillLine(DIALOGUES.remindAction, { table: table.number });
        if (customer.state === 'WAITING_ORDER') return `Nhận order Bàn ${table.number}`;
        if (customer.state === 'WAITING_FOOD' && player.held) {
          return `Đưa ${getDish(player.held).name} cho Bàn ${table.number}`;
        }
        return null;
      },
      perform: () => {
        if (customer.isCarryingCat) {
          customer.giveBackCat();
          return;
        }
        if (customer.canBeReminded) {
          customer.remindToPay();
          return;
        }
        if (customer.state === 'WAITING_ORDER') {
          customer.takeOrder();
          return;
        }
        const held = player.held;
        if (held && customer.serve(held)) {
          bus.emit('order:served', { customerId: customer.id, table: table.number, dish: held });
        }
      },
    });
    this.unregister.set(customer.id, off);
  }

  private frontOfQueue(): Customer | null {
    return this.customers.find((c) => c.readyToPay) ?? null;
  }

  /** Xếp thứ tự hàng chờ theo thời điểm vào hàng */
  private updateQueue(): void {
    const queue = this.customers.filter((c) => c.state === 'PAYING').sort((a, b) => a.queuedAt - b.queuedAt);
    queue.forEach((c, i) => (c.queueIndex = i));
  }

  private removeGone(): void {
    for (let i = this.customers.length - 1; i >= 0; i--) {
      const c = this.customers[i];
      if (c.state !== 'GONE') continue;
      this.unregister.get(c.id)?.();
      this.unregister.delete(c.id);
      c.dispose();
      this.customers.splice(i, 1);
    }
  }
}
