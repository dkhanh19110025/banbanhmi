import type * as THREE from 'three';
import type { EventBus } from '../core/EventBus';
import { randomIn } from '../core/Random';
import type { ShiftConfig } from '../data/difficulty';
import { DIALOGUES } from '../data/dialogues';
import { StatusIcon, type WorldLabels } from '../ui/DialogBubble';
import { FireEffect } from '../world/FireEffect';
import type { Restaurant } from '../world/Restaurant';
import type { Player } from '../world/Player';
import { Steam } from '../world/Steam';
import type { InteractionSystem } from './InteractionSystem';

type FireState = 'idle' | 'smoking' | 'burning' | 'dead';

/** Tiếng dầu xèo nhắc người chơi mỗi bấy nhiêu giây khi chảo có chuyện */
const CRACKLE_EVERY_SEC = 1.1;

export interface FireDeps {
  bus: EventBus;
  cfg: ShiftConfig;
  labels: WorldLabels;
  restaurant: Restaurant;
  scene: THREE.Object3D;
  interaction: InteractionSystem;
  player: Player;
}

/**
 * Sự cố — Chảo bốc cháy (từ ca 6).
 * Kích hoạt: nướng xong bánh, có xác suất người chơi "quên" chảo dầu trên bếp lửa.
 * Dấu hiệu: vài giây sau, chảo bốc KHÓI ĐEN + tiếng dầu xèo + thông báo; rồi bùng lửa.
 * Khắc phục: lấy BÌNH CỨU HỎA ở kệ bếp (E), xịt vào bếp (E), rồi CẤT bình lại (E). Xô nước bên cạnh là BẪY: tạt nước vào dầu thì lửa bùng to.
 * Quên cất bình mà chủ quán thấy → ăn tát (chỉ tát, không mất gì thêm), xem Boss.
 * Hậu quả: lửa lan hết quán trước khi dập → CHÁY QUÁN (kết thúc ca, chơi lại).
 */
export class FireSystem {
  private readonly deps: FireDeps;
  private readonly offs: Array<() => void> = [];
  private readonly smoke: Steam;
  private readonly flames: FireEffect;
  private readonly icon: StatusIcon;
  private readonly extIcon: StatusIcon;
  private state: FireState = 'idle';
  /** Đếm ngược tới lúc chảo bốc khói (sau khi nướng xong) */
  private smokeIn: number | null = null;
  private warnLeft = 0;
  private burn = 0;
  private waterUsed = false;
  /** Bình cứu hỏa đang nằm ở kệ (false = đang được cầm) */
  private stored = true;
  private cooldown = 0;
  private crackleTimer = 0;
  /** Không chồng sự cố nặng: hoãn khi có giang hồ hoặc đang mất điện */
  private gangPresent = false;
  private powerOut = false;

  constructor(deps: FireDeps) {
    this.deps = deps;
    const { bus, cfg, labels, restaurant, scene, interaction, player } = deps;
    this.smoke = new Steam(scene, restaurant.grillPoint);
    this.smoke.setDark(true);
    this.flames = new FireEffect(scene, restaurant.grillPoint);
    this.icon = new StatusIcon(labels, restaurant.kitchenLabelAnchor, 0.7);
    this.extIcon = new StatusIcon(labels, restaurant.extinguisherPoint, 1.5);

    this.offs.push(
      bus.on('kitchen:cooked', () => {
        if (this.state !== 'idle' || this.smokeIn !== null || this.cooldown > 0) return;
        if (Math.random() < cfg.fireChancePerCook) this.smokeIn = randomIn(cfg.fireSmokeAfterSec);
      }),
      bus.on('gang:arrived', () => (this.gangPresent = true)),
      bus.on('gang:left', () => (this.gangPresent = false)),
      bus.on('power:out', () => (this.powerOut = true)),
      bus.on('power:restored', () => (this.powerOut = false)),
      // Kệ bình cứu hỏa: lấy bình khi có cháy, cất lại khi xong việc
      interaction.register({
        position: () => restaurant.extinguisherPoint,
        range: cfg.interactRange + 0.4,
        action: () => {
          if (player.carrying === 'extinguisher') return this.isTrouble ? null : DIALOGUES.actionPutExtinguisher;
          if (!this.isTrouble || !this.stored) return null;
          return player.handsFull ? DIALOGUES.actionTakeExtinguisherFull : DIALOGUES.actionTakeExtinguisher;
        },
        perform: () => {
          if (player.carrying === 'extinguisher') {
            if (this.isTrouble) return;
            player.setCarrying(null);
            this.stored = true;
            restaurant.setExtinguisherStored(true);
            bus.emit('toast', { text: DIALOGUES.toastExtinguisherStowed, kind: 'good' });
            return;
          }
          if (player.handsFull || !this.stored || !this.isTrouble) return;
          player.setCarrying('extinguisher');
          this.stored = false;
          restaurant.setExtinguisherStored(false);
          bus.emit('toast', { text: DIALOGUES.toastExtinguisherTaken, kind: 'info' });
        },
      }),
      // Bếp đang cháy: cầm bình rồi bấm E để xịt dập lửa
      interaction.register({
        position: () => restaurant.grillPoint,
        range: cfg.interactRange + cfg.stationRangeBonus + 0.5,
        action: () => (this.isTrouble && player.carrying === 'extinguisher' ? DIALOGUES.actionUseExtinguisher : null),
        perform: () => {
          if (this.isTrouble && player.carrying === 'extinguisher') this.extinguish();
        },
      }),
      // Xô nước: bẫy
      interaction.register({
        position: () => restaurant.bucketPoint,
        range: cfg.interactRange,
        action: () => (this.isTrouble ? (this.waterUsed ? DIALOGUES.actionWaterEmpty : DIALOGUES.actionWater) : null),
        perform: () => this.splashWater(),
      }),
    );
  }

  private get isTrouble(): boolean {
    return this.state === 'smoking' || this.state === 'burning';
  }

  update(dt: number): void {
    const { bus, cfg } = this.deps;
    this.cooldown -= dt;
    this.smoke.update(dt, this.isTrouble);

    if (this.state === 'idle' && this.smokeIn !== null) {
      this.smokeIn -= dt;
      if (this.smokeIn <= 0 && !this.gangPresent && !this.powerOut) this.startSmoking();
    } else if (this.state === 'smoking') {
      this.warnLeft -= dt;
      this.icon.show(DIALOGUES.fireIconWarning, this.warnLeft / cfg.fireWarnSec, 'warn blink');
      if (this.warnLeft <= 0) this.startBurning();
    } else if (this.state === 'burning') {
      this.burn += (dt / cfg.fireSpreadSec) * (this.waterUsed ? cfg.fireWaterSpeedup : 1);
      this.icon.show(DIALOGUES.fireIconBurning, Math.max(0, 1 - this.burn), 'bad blink');
      if (this.burn >= 1) {
        // Lửa lan khắp quán — hậu quả nặng
        this.state = 'dead';
        this.icon.hide();
        this.extIcon.hide();
        bus.emit('game:over', { ending: 'kitchenFire' });
      }
    }

    if (this.isTrouble) {
      // Chỉ nhắc chỗ lấy bình khi bình còn ở kệ
      if (this.stored) this.extIcon.show(DIALOGUES.extinguisherLabel, null, 'ok blink');
      else this.extIcon.hide();
      this.crackleTimer -= dt;
      if (this.crackleTimer <= 0) {
        this.crackleTimer = CRACKLE_EVERY_SEC;
        bus.emit('sfx', { sound: 'crackle', volume: 0.8 });
      }
    }
    this.flames.update(dt, this.state === 'burning' || this.state === 'dead' ? Math.min(1, 0.3 + this.burn * 0.7) : 0);
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.smoke.dispose();
    this.flames.dispose();
    this.icon.dispose();
    this.extIcon.dispose();
    // Trả bình về kệ cho ca sau (quán dựng một lần, dùng cho nhiều ca)
    this.deps.restaurant.setExtinguisherStored(true);
  }

  private startSmoking(): void {
    const { bus, cfg } = this.deps;
    this.state = 'smoking';
    this.smokeIn = null;
    this.warnLeft = cfg.fireWarnSec;
    this.crackleTimer = 0;
    bus.emit('kitchen:block', { reason: 'fire', active: true });
    bus.emit('fire:warning', {});
    bus.emit('toast', { text: DIALOGUES.toastFireWarning, kind: 'warn' });
  }

  private startBurning(): void {
    const { bus } = this.deps;
    this.state = 'burning';
    this.burn = 0;
    bus.emit('fire:burning', {});
    bus.emit('sfx', { sound: 'alarm' });
    bus.emit('toast', { text: DIALOGUES.toastFireBurning, kind: 'bad' });
  }

  private extinguish(): void {
    const { bus, cfg } = this.deps;
    if (!this.isTrouble) return;
    this.state = 'idle';
    this.smokeIn = null;
    this.burn = 0;
    this.waterUsed = false;
    this.cooldown = cfg.fireCooldownSec;
    this.icon.hide();
    this.extIcon.hide();
    bus.emit('kitchen:block', { reason: 'fire', active: false });
    bus.emit('fire:out', {});
    bus.emit('toast', { text: DIALOGUES.toastFireOut, kind: 'good' });
  }

  /** Tạt nước vào chảo dầu: lửa bùng to, lan nhanh gấp mấy lần, còn bị trừ lương */
  private splashWater(): void {
    const { bus, cfg } = this.deps;
    if (!this.isTrouble || this.waterUsed) return;
    this.waterUsed = true;
    bus.emit('sfx', { sound: 'splash' });
    bus.emit('toast', { text: DIALOGUES.toastFireWater, kind: 'bad' });
    bus.emit('salary:penalty', { amount: cfg.penaltyFireWater, reason: DIALOGUES.penaltyReasonFireWater });
    if (this.state === 'smoking') this.startBurning();
  }
}
