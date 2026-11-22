import * as THREE from 'three';
import type { EventBus } from '../core/EventBus';
import { randomIn } from '../core/Random';
import type { ShiftConfig } from '../data/difficulty';
import { DIALOGUES } from '../data/dialogues';
import { StatusIcon, type WorldLabels } from '../ui/DialogBubble';
import { distanceXZ } from '../world/Collision';
import type { Player } from '../world/Player';
import type { Restaurant } from '../world/Restaurant';
import type { InteractionSystem } from './InteractionSystem';

type PowerState = 'idle' | 'warning' | 'out' | 'done';

/** Độ tối lúc đèn chớp (tắt một nhịp) */
const FLICKER_DARKNESS = 0.55;
const SPUTTER_EVERY_SEC = 0.5;

export interface PowerDeps {
  bus: EventBus;
  cfg: ShiftConfig;
  labels: WorldLabels;
  restaurant: Restaurant;
  scene: THREE.Object3D;
  interaction: InteractionSystem;
  player: Player;
}

/**
 * Sự cố — Mất điện (từ ca 9; ngày mưa thì chắc chắn có).
 * Kích hoạt: một lần trong ca, đèn đột ngột tắt.
 * Dấu hiệu: đèn chớp chớp + tiếng "rè" vài giây trước khi tắt hẳn.
 * Khắc phục: GIỮ E ở máy phát điện (tường Đông) để nổ máy → có điện ngay. Hoặc thắp nến ở quầy cho đỡ tối
 *            (nến chỉ giúp nhìn rõ, bếp vẫn không chạy). Không làm gì thì tự có điện lại sau một lúc.
 * Hậu quả: mất điện thì bếp tắt, không nướng được món nào; màn hình tối om, khách chờ cáu bỏ về.
 */
export class PowerSystem {
  private readonly deps: PowerDeps;
  private readonly offs: Array<() => void> = [];
  private readonly genIcon: StatusIcon;
  private readonly candleIcon: StatusIcon;
  private readonly flames: THREE.Mesh[] = [];
  private state: PowerState = 'idle';
  private outageAt: number | null;
  private elapsed = 0;
  private warnLeft = 0;
  private outLeft = 0;
  private flickerTimer = 0;
  private lightOn = true;
  private candles = false;
  /** Tiến độ giật dây nổ máy 0..1 */
  private hold = 0;
  private sputterTimer = 0;
  /** Không chồng sự cố nặng */
  private gangPresent = false;
  private fireTrouble = false;

  constructor(deps: PowerDeps) {
    this.deps = deps;
    const { bus, cfg, labels, restaurant, scene, interaction } = deps;
    this.outageAt = Math.random() < cfg.powerChance ? randomIn(cfg.powerFirstSec) : null;
    this.genIcon = new StatusIcon(labels, restaurant.generatorLabelAnchor, 0);
    this.candleIcon = new StatusIcon(labels, restaurant.candleBox, 0.55);

    // Ngọn nến (chỉ hiện sau khi thắp)
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xffb347 });
    for (let i = 0; i < 3; i++) {
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), flameMat);
      flame.position.set(restaurant.candleBox.x - 0.09 + i * 0.09, restaurant.candleBox.y + 0.26, restaurant.candleBox.z);
      flame.visible = false;
      scene.add(flame);
      this.flames.push(flame);
    }

    this.offs.push(
      bus.on('gang:arrived', () => (this.gangPresent = true)),
      bus.on('gang:left', () => (this.gangPresent = false)),
      bus.on('fire:warning', () => (this.fireTrouble = true)),
      bus.on('fire:out', () => (this.fireTrouble = false)),
      interaction.register({
        position: () => restaurant.candlePoint,
        range: cfg.interactRange + 0.4,
        action: () => (this.state === 'out' && !this.candles ? DIALOGUES.actionCandle : null),
        perform: () => this.lightCandles(),
      }),
      interaction.register({
        position: () => restaurant.generatorPoint,
        range: cfg.interactRange + 0.4,
        action: () => (this.state === 'out' ? DIALOGUES.actionGenerator : null),
        // Bấm E chỉ nghe tiếng giật dây; nổ máy phải GIỮ E (xử lý trong update)
        perform: () => bus.emit('sfx', { sound: 'generator', volume: 0.6 }),
      }),
    );
  }

  /** @param interactHeld người chơi đang giữ E */
  update(dt: number, interactHeld: boolean): void {
    const { bus, cfg, restaurant, player } = this.deps;
    this.elapsed += dt;

    if (this.state === 'idle') {
      if (this.outageAt !== null && this.elapsed >= this.outageAt && !this.gangPresent && !this.fireTrouble) this.startWarning();
    } else if (this.state === 'warning') {
      this.warnLeft -= dt;
      this.flickerTimer -= dt;
      if (this.flickerTimer <= 0) {
        this.flickerTimer = 0.07 + Math.random() * 0.18;
        this.lightOn = !this.lightOn;
        restaurant.setPower(this.lightOn);
        bus.emit('power:darkness', { level: this.lightOn ? 0 : FLICKER_DARKNESS });
      }
      if (this.warnLeft <= 0) this.startOutage();
    } else if (this.state === 'out') {
      this.outLeft -= dt;
      const near = distanceXZ(player.position, restaurant.generatorPoint) <= cfg.interactRange + 0.4;
      if (near && interactHeld) {
        this.hold += dt / cfg.generatorHoldSec;
        this.sputterTimer -= dt;
        if (this.sputterTimer <= 0) {
          this.sputterTimer = SPUTTER_EVERY_SEC;
          bus.emit('sfx', { sound: 'generator', volume: 0.7 });
        }
      } else {
        this.hold = Math.max(0, this.hold - dt * 0.8);
      }
      this.genIcon.show(DIALOGUES.generatorLabel, this.hold > 0 ? this.hold : null, near ? 'ok blink' : 'warn');
      if (!this.candles) this.candleIcon.show(DIALOGUES.candleLabel, null, 'warn');
      else this.candleIcon.hide();
      if (this.hold >= 1) this.restore(true);
      else if (this.outLeft <= 0) this.restore(false);
    }
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.genIcon.dispose();
    this.candleIcon.dispose();
    for (const f of this.flames) {
      f.removeFromParent();
      f.geometry.dispose();
    }
    (this.flames[0]?.material as THREE.Material | undefined)?.dispose();
    this.deps.restaurant.setPower(true);
  }

  private startWarning(): void {
    const { bus } = this.deps;
    this.state = 'warning';
    this.warnLeft = this.deps.cfg.powerWarnSec;
    this.flickerTimer = 0;
    bus.emit('power:warning', {});
    bus.emit('sfx', { sound: 'powerDown' });
    bus.emit('toast', { text: DIALOGUES.toastPowerWarning, kind: 'warn' });
  }

  private startOutage(): void {
    const { bus, cfg, restaurant } = this.deps;
    this.state = 'out';
    this.outLeft = cfg.powerOutageSec;
    this.candles = false;
    this.hold = 0;
    this.lightOn = false;
    restaurant.setPower(false);
    bus.emit('power:darkness', { level: cfg.powerDarkness });
    bus.emit('kitchen:block', { reason: 'power', active: true });
    bus.emit('power:out', {});
    bus.emit('sfx', { sound: 'powerDown' });
    bus.emit('toast', { text: DIALOGUES.toastPowerOut, kind: 'bad' });
  }

  private lightCandles(): void {
    const { bus, cfg } = this.deps;
    if (this.state !== 'out' || this.candles) return;
    this.candles = true;
    for (const f of this.flames) f.visible = true;
    bus.emit('power:darkness', { level: cfg.powerCandleDarkness });
    bus.emit('sfx', { sound: 'pop' });
    bus.emit('toast', { text: DIALOGUES.toastCandle, kind: 'info' });
  }

  private restore(byGenerator: boolean): void {
    const { bus, restaurant } = this.deps;
    this.state = 'done';
    this.lightOn = true;
    this.hold = 0;
    restaurant.setPower(true);
    for (const f of this.flames) f.visible = false;
    this.genIcon.hide();
    this.candleIcon.hide();
    bus.emit('power:darkness', { level: 0 });
    bus.emit('kitchen:block', { reason: 'power', active: false });
    bus.emit('power:restored', {});
    bus.emit('sfx', { sound: byGenerator ? 'generator' : 'powerUp' });
    bus.emit('sfx', { sound: 'powerUp' });
    bus.emit('toast', { text: byGenerator ? DIALOGUES.toastPowerGen : DIALOGUES.toastPowerBack, kind: 'good' });
  }
}
