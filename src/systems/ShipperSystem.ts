import * as THREE from 'three';
import type { EventBus } from '../core/EventBus';
import { pick, randomIn } from '../core/Random';
import { Countdown } from '../core/Timer';
import type { ShiftConfig } from '../data/difficulty';
import { DIALOGUES, fillLine } from '../data/dialogues';
import { type DishId, MENU } from '../data/menu';
import { SpeechBubble, StatusIcon, type WorldLabels } from '../ui/DialogBubble';
import { Humanoid, stepToward } from '../world/Humanoid';
import type { Player } from '../world/Player';
import type { Restaurant } from '../world/Restaurant';
import type { InteractionSystem } from './InteractionSystem';

/** Id riêng của shipper trên phiếu order (không trùng khách thường / giang hồ) */
const SHIPPER_ID = 200000;

type ShipperState = 'AWAY' | 'ARRIVING' | 'WAITING' | 'LEAVING';

export interface ShipperDeps {
  bus: EventBus;
  cfg: ShiftConfig;
  labels: WorldLabels;
  restaurant: Restaurant;
  scene: THREE.Object3D;
  interaction: InteractionSystem;
  player: Player;
}

/**
 * Sự cố — Shipper giục đơn (từ ca 7).
 * Kích hoạt: định kỳ có shipper chạy xe tới lấy một đơn "giao gấp", phiếu ƯU TIÊN chen lên đầu hàng.
 * Dấu hiệu: còi xe bấm bíp bíp liên tục, shipper đứng ngay cạnh cửa, có thanh đếm ngược trên đầu.
 * Khắc phục: làm đúng món ưu tiên rồi mang tới đưa tận tay shipper trước khi hết giờ.
 * Hậu quả: quá giờ → shipper hủy đơn, chửi quán trên app: trừ rating, trừ lương nhẹ, chủ quán bực.
 */
export class ShipperSystem {
  private readonly deps: ShipperDeps;
  private readonly offs: Array<() => void> = [];
  private state: ShipperState = 'AWAY';
  private body: Humanoid | null = null;
  private icon: StatusIcon | null = null;
  private speech: SpeechBubble | null = null;
  private dish: DishId = 'thit';
  private countdown: Countdown;
  private honkTimer = 0;
  private elapsed = 0;
  private nextAt: number;
  private path: THREE.Vector3[] = [];
  private pathIndex = 0;
  /** Không chồng sự cố nặng: hoãn khi giang hồ ở trong quán hoặc chảo đang cháy */
  private gangPresent = false;
  private fireTrouble = false;
  private powerOut = false;

  constructor(deps: ShipperDeps) {
    this.deps = deps;
    const { bus, cfg, restaurant, interaction, player } = deps;
    this.nextAt = randomIn(cfg.shipperFirstSec);
    this.countdown = new Countdown(cfg.shipperWaitSec);

    this.offs.push(
      bus.on('gang:arrived', () => (this.gangPresent = true)),
      bus.on('gang:left', () => (this.gangPresent = false)),
      bus.on('fire:warning', () => (this.fireTrouble = true)),
      bus.on('fire:out', () => (this.fireTrouble = false)),
      bus.on('power:out', () => (this.powerOut = true)),
      bus.on('power:restored', () => (this.powerOut = false)),
      interaction.register({
        position: () => restaurant.shipperSpot,
        range: cfg.interactRange + 0.4,
        action: () => (this.state === 'WAITING' && player.held === this.dish ? DIALOGUES.actionGiveShipper : null),
        perform: () => this.deliver(),
      }),
    );
  }

  update(dt: number): void {
    const { cfg, bus } = this.deps;
    this.elapsed += dt;
    this.speech?.update(dt);

    if (this.state === 'AWAY') {
      if (this.elapsed >= this.nextAt && !this.gangPresent && !this.fireTrouble && !this.powerOut) this.arrive();
      return;
    }
    const body = this.body;
    if (!body) return;

    if (this.state === 'ARRIVING') {
      if (this.followPath(dt, cfg.shipperWalkSpeed)) {
        this.state = 'WAITING';
        body.faceDirection(0, -1);
        this.speech?.say(pick(DIALOGUES.shipperSay), 2);
      }
    } else if (this.state === 'WAITING') {
      body.animate(dt, false);
      this.honkTimer -= dt;
      if (this.honkTimer <= 0) {
        this.honkTimer = cfg.shipperHonkSec;
        bus.emit('sfx', { sound: 'honk' });
        if (Math.random() < 0.5) this.speech?.say(pick(DIALOGUES.shipperSay), 2);
      }
      this.icon?.show(DIALOGUES.shipperIcon, this.countdown.ratio, this.countdown.ratio < 0.3 ? 'bad blink' : 'warn');
      if (this.countdown.tick(dt)) this.fail();
    } else if (this.state === 'LEAVING') {
      if (this.followPath(dt, cfg.shipperWalkSpeed)) {
        this.removeBody();
        this.state = 'AWAY';
        this.nextAt = this.elapsed + randomIn(cfg.shipperIntervalSec);
      }
    }
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.removeBody();
  }

  private arrive(): void {
    const { bus, cfg, labels, restaurant, scene } = this.deps;
    this.dish = pick(MENU).id;
    this.countdown.reset(cfg.shipperWaitSec);
    this.honkTimer = 0;

    // Shipper áo xanh, nón bảo hiểm xanh, vác thùng giao hàng sau lưng
    const body = new Humanoid({
      shirt: 0x00b14f,
      pants: 0x2d3436,
      skin: 0xdfa774,
      hat: 0x00b14f,
      hair: { style: 'short', color: 0x1b1b1b },
      shoes: 0x222222,
      // Shipper hớt hải: mắt híp, miệng há giục đơn
      eyes: 'happy',
      mouth: 'open',
    });
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.36), new THREE.MeshStandardMaterial({ color: 0x00b14f }));
    bag.position.set(0, 1.1, -0.27);
    body.upper.add(bag);
    body.group.position.copy(restaurant.doorOutside);
    scene.add(body.group);
    this.body = body;
    this.icon = new StatusIcon(labels, body.group, 2.3);
    this.speech = new SpeechBubble(labels, body.group, 2.9);

    this.path = [new THREE.Vector3(restaurant.doorOutside.x, 0, restaurant.shipperSpot.z), restaurant.shipperSpot.clone()];
    this.pathIndex = 0;
    this.state = 'ARRIVING';

    // Phiếu ưu tiên chen lên đầu hàng
    bus.emit('order:taken', { customerId: SHIPPER_ID, table: 0, dish: this.dish, priority: true });
    bus.emit('shipper:arrived', { dish: this.dish });
    bus.emit('sfx', { sound: 'honk' });
    bus.emit('toast', { text: fillLine(DIALOGUES.toastShipperArrived, { sec: Math.round(cfg.shipperWaitSec) }), kind: 'warn' });
  }

  private deliver(): void {
    const { bus, cfg, player } = this.deps;
    if (this.state !== 'WAITING' || player.held !== this.dish) return;
    bus.emit('order:served', { customerId: SHIPPER_ID, table: 0, dish: this.dish });
    bus.emit('shipper:delivered', {});
    bus.emit('rating:change', { delta: cfg.ratingShipperOk, reason: DIALOGUES.ratingReasonShipperOk });
    bus.emit('toast', { text: DIALOGUES.toastShipperDelivered, kind: 'good' });
    this.speech?.say(pick(DIALOGUES.shipperThanks), 2);
    this.leave();
  }

  private fail(): void {
    const { bus, cfg } = this.deps;
    bus.emit('order:cancelled', { customerId: SHIPPER_ID });
    bus.emit('shipper:failed', {});
    bus.emit('rating:change', { delta: cfg.ratingShipperLate, reason: DIALOGUES.ratingReasonShipper });
    bus.emit('salary:penalty', { amount: cfg.penaltyShipperLate, reason: DIALOGUES.reasonShipperLate });
    bus.emit('toast', { text: DIALOGUES.toastShipperFailed, kind: 'bad' });
    this.speech?.say(pick(DIALOGUES.shipperAngry), 2.5);
    this.leave();
  }

  private leave(): void {
    const { restaurant } = this.deps;
    this.icon?.hide();
    this.state = 'LEAVING';
    this.path = [new THREE.Vector3(restaurant.doorOutside.x, 0, restaurant.shipperSpot.z), restaurant.doorOutside.clone()];
    this.pathIndex = 0;
  }

  private followPath(dt: number, speed: number): boolean {
    const body = this.body;
    const target = this.path[this.pathIndex];
    if (!body || !target) return true;
    const arrived = stepToward(body, target, speed * dt);
    body.animate(dt, !arrived, speed / 3);
    if (arrived) this.pathIndex++;
    return this.pathIndex >= this.path.length;
  }

  private removeBody(): void {
    this.icon?.dispose();
    this.speech?.dispose();
    this.body?.dispose();
    this.icon = null;
    this.speech = null;
    this.body = null;
  }
}
