import type * as THREE from 'three';
import type { EventBus } from '../core/EventBus';
import type { ShiftConfig } from '../data/difficulty';
import { DIALOGUES } from '../data/dialogues';
import { Cat } from '../entities/Cat';
import type { WorldLabels } from '../ui/DialogBubble';
import { distanceXZ } from '../world/Collision';
import type { Player } from '../world/Player';
import type { Restaurant } from '../world/Restaurant';
import type { InteractionSystem } from './InteractionSystem';

export interface CatSystemDeps {
  bus: EventBus;
  cfg: ShiftConfig;
  labels: WorldLabels;
  restaurant: Restaurant;
  scene: THREE.Object3D;
  interaction: InteractionSystem;
  player: Player;
}

/**
 * Tình huống 2 — Con mèo.
 * Kích hoạt: catSleep tụt dần, chạm ngưỡng thì mèo dậy đi lang thang.
 * Dấu hiệu: vươn vai + "meo", icon mèo trên HUD xanh → vàng → đỏ, mèo mò ra cửa.
 * Khắc phục: bế mèo (E) về ổ, đặt vào (E), giữ E vuốt ve tới khi ngủ say.
 * Hậu quả: vuốt chưa đủ → dậy sớm; vuốt quá tay → bị cào; để khách bế mất → bị đuổi (ending "Mất mèo").
 */
export class CatSystem {
  readonly cat: Cat;
  private readonly deps: CatSystemDeps;
  private readonly offs: Array<() => void> = [];

  constructor(deps: CatSystemDeps) {
    this.deps = deps;
    const { bus, cfg, labels, restaurant, scene, interaction, player } = deps;
    this.cat = new Cat({ bus, cfg, labels, restaurant, scene });
    const cat = this.cat;

    this.offs.push(
      // Bế mèo đang đi lang thang
      interaction.register({
        position: () => cat.position,
        range: cfg.interactRange,
        action: () => {
          if (!cat.canBePickedUp) return null;
          return player.handsFull ? `${DIALOGUES.actionPickCat} (${DIALOGUES.cantPickHandsFull})` : DIALOGUES.actionPickCat;
        },
        perform: () => {
          if (player.handsFull) return;
          if (cat.pickUp(player.carryAnchor)) player.setCarrying('cat');
        },
      }),
      // Ổ mèo: đặt mèo vào, hoặc nhắc giữ E để vuốt
      interaction.register({
        position: () => restaurant.catBed,
        range: cfg.interactRange,
        action: () => {
          if (player.carrying === 'cat') return DIALOGUES.actionPutCat;
          if (cat.wantsPetting && !player.handsFull) return DIALOGUES.actionPetCat;
          return null;
        },
        perform: () => {
          if (player.carrying !== 'cat') return; // vuốt ve xử lý bằng giữ phím trong update()
          player.setCarrying(null);
          cat.putInBed();
        },
      }),
      bus.on('cat:scratch', (p) => bus.emit('salary:penalty', { amount: p.amount, reason: DIALOGUES.penaltyReasonScratch })),
      bus.on('cat:waking', () => bus.emit('toast', { text: DIALOGUES.toastCatWaking, kind: 'warn' })),
      bus.on('cat:wandering', () => bus.emit('toast', { text: DIALOGUES.toastCatWandering, kind: 'warn' })),
      bus.on('cat:asleep', () => bus.emit('toast', { text: DIALOGUES.toastCatAsleep, kind: 'good' })),
      bus.on('cat:grabbed', () => {
        bus.emit('toast', { text: DIALOGUES.toastCatGrabbed, kind: 'bad' });
        bus.emit('sfx', { sound: 'alarm' });
      }),
      bus.on('cat:rescued', () => bus.emit('toast', { text: DIALOGUES.toastCatRescued, kind: 'good' })),
    );
  }

  /** @param interactHeld người chơi đang giữ E (đã lọc khi mở sổ / bị choáng) */
  update(dt: number, interactHeld: boolean): void {
    const { player, restaurant, cfg, bus } = this.deps;
    const nearBed = distanceXZ(player.position, restaurant.catBed) <= cfg.interactRange;
    const petting = interactHeld && nearBed && !player.handsFull && this.cat.isInBed;
    this.cat.setPetting(petting);
    if (petting) player.markActive(); // đang vuốt mèo là đang làm việc, chủ quán không bắt
    this.cat.update(dt);
    bus.emit('cat:status', { sleep: this.cat.sleep, max: 100, status: this.cat.status });
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.cat.dispose();
  }
}
