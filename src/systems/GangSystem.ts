import * as THREE from 'three';
import type { EventBus } from '../core/EventBus';
import { randomIn } from '../core/Random';
import type { ShiftConfig } from '../data/difficulty';
import { DIALOGUES, fillLine } from '../data/dialogues';
import { getDish } from '../data/menu';
import { Gang } from '../entities/Gang';
import type { WorldLabels } from '../ui/DialogBubble';
import type { Player } from '../world/Player';
import type { Restaurant } from '../world/Restaurant';
import type { InteractionSystem } from './InteractionSystem';

/** Id riêng cho nhóm giang hồ trên phiếu order (không trùng id khách thường) */
const GANG_ID_BASE = 100000;

export interface GangSystemDeps {
  bus: EventBus;
  cfg: ShiftConfig;
  labels: WorldLabels;
  restaurant: Restaurant;
  scene: THREE.Object3D;
  interaction: InteractionSystem;
  player: Player;
}

/**
 * Tình huống 3 — Nhóm giang hồ không gọi món.
 * Kích hoạt: từ ca 5, có xác suất một nhóm 3–4 người ghé một lần trong ca.
 * Dấu hiệu: đạp cửa RẦM + rung màn hình, nhạc căng thẳng, cảnh báo đỏ + đếm ngược trên bàn lớn.
 * Khắc phục: lấy MENU ở kệ cạnh cửa mang tới (hoặc liều đoán món, 20% trúng), rồi làm món nhanh.
 * Hậu quả: quá 20 giây / đoán sai / chờ món quá lâu → bị đánh → nhập viện (Game Over).
 */
export class GangSystem {
  private readonly deps: GangSystemDeps;
  private readonly offs: Array<() => void> = [];
  private readonly menuMesh: THREE.Mesh;
  private gang: Gang | null = null;
  private arriveAt: number | null;
  private elapsed = 0;
  private menuOnShelf = true;
  /** Đang có khách ôm mèo → hoãn giang hồ (không chồng 2 sự cố nặng — mục 9 quy tắc 2) */
  private catTheft = false;
  private nextId = GANG_ID_BASE;

  constructor(deps: GangSystemDeps) {
    this.deps = deps;
    const { bus, cfg, restaurant, scene, interaction, player } = deps;
    const enabled = cfg.features.gang;
    this.arriveAt = enabled && Math.random() < cfg.gangChance ? randomIn(cfg.gangArriveTimeSec) : null;

    // Tấm menu đặt trên kệ
    this.menuMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.65, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x8e44ad }),
    );
    this.menuMesh.position.copy(restaurant.menuShelfAnchor).add(new THREE.Vector3(0, 0.3, 0));
    this.menuMesh.rotation.x = -0.25;
    this.menuMesh.castShadow = true;
    this.menuMesh.visible = enabled;
    scene.add(this.menuMesh);

    if (enabled) {
      this.offs.push(
        interaction.register({
          position: () => restaurant.menuShelfPoint,
          range: cfg.interactRange,
          action: () => {
            if (player.carrying === 'menu') return DIALOGUES.actionReturnMenu;
            if (this.menuOnShelf && !player.handsFull) return DIALOGUES.actionTakeMenu;
            return null;
          },
          perform: () => {
            if (player.carrying === 'menu') {
              player.setCarrying(null);
              this.setMenuOnShelf(true);
            } else if (this.menuOnShelf && !player.handsFull) {
              player.setCarrying('menu');
              this.setMenuOnShelf(false);
            }
          },
        }),
        interaction.register({
          position: () => restaurant.bigTableCenter,
          range: cfg.interactRange + cfg.stationRangeBonus,
          action: () => this.tableAction(),
          perform: () => this.tablePerform(),
        }),
      );
    }

    this.offs.push(
      bus.on('cat:grabbed', () => (this.catTheft = true)),
      bus.on('cat:rescued', () => (this.catTheft = false)),
      bus.on('cat:stolen', () => (this.catTheft = false)),
    );
  }

  update(dt: number): void {
    this.elapsed += dt;
    if (this.arriveAt !== null && this.elapsed >= this.arriveAt && !this.gang && !this.catTheft) {
      this.arriveAt = null;
      this.spawn();
    }
    if (!this.gang) return;
    this.gang.update(dt);
    if (this.gang.state === 'GONE') {
      this.gang.dispose();
      this.gang = null;
      // Menu được trả lại kệ khi nhóm về
      if (this.deps.player.carrying !== 'menu') this.setMenuOnShelf(true);
      this.deps.bus.emit('gang:left', {});
      this.deps.bus.emit('toast', { text: DIALOGUES.toastGangLeft, kind: 'good' });
    }
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.gang?.dispose();
    this.menuMesh.removeFromParent();
    this.menuMesh.geometry.dispose();
    (this.menuMesh.material as THREE.Material).dispose();
  }

  private spawn(): void {
    const { bus, cfg, labels, restaurant, player, scene } = this.deps;
    this.gang = new Gang(this.nextId++, { bus, cfg, labels, restaurant, player, scene });
    bus.emit('gang:arrived', { size: this.gang.size });
    bus.emit('sfx', { sound: 'doorKick' });
    bus.emit('toast', { text: DIALOGUES.toastGangArrived, kind: 'bad' });
  }

  private setMenuOnShelf(on: boolean): void {
    this.menuOnShelf = on;
    this.menuMesh.visible = on;
  }

  private tableAction(): string | null {
    const gang = this.gang;
    const { player } = this.deps;
    if (!gang) return null;
    if (gang.state === 'WAITING_MENU') {
      if (player.carrying === 'menu') return DIALOGUES.actionGiveMenu;
      if (player.held) return fillLine(DIALOGUES.actionGuessDish, { dish: getDish(player.held).name });
      return null;
    }
    if (gang.state === 'WAITING_FOOD' && player.held) return `Đưa ${getDish(player.held).name} cho bàn lớn`;
    return null;
  }

  private tablePerform(): void {
    const gang = this.gang;
    const { player, bus } = this.deps;
    if (!gang) return;
    if (gang.state === 'WAITING_MENU') {
      if (player.carrying === 'menu') {
        if (gang.giveMenu()) {
          player.setCarrying(null); // menu nằm trên bàn tới khi nhóm về
          bus.emit('toast', { text: DIALOGUES.toastGangMenu, kind: 'info' });
        }
      } else if (player.held) {
        gang.guess(player.held);
      }
      return;
    }
    if (gang.state === 'WAITING_FOOD' && player.held) gang.serve(player.held);
  }
}
