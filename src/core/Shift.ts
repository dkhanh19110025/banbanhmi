import type * as THREE from 'three';
import { pick } from './Random';
import { getShiftConfig, type ShiftConfig, type ShiftPlan } from '../data/difficulty';
import { DIALOGUES, fillLine } from '../data/dialogues';
import { formatMoney } from '../data/menu';
import { Boss } from '../entities/Boss';
import { CatSystem } from '../systems/CatSystem';
import { ConsequenceSystem } from '../systems/ConsequenceSystem';
import { FireSystem } from '../systems/FireSystem';
import { GangSystem } from '../systems/GangSystem';
import { InspectorSystem } from '../systems/InspectorSystem';
import { InteractionSystem } from '../systems/InteractionSystem';
import { MusicDirector } from '../systems/MusicDirector';
import { PlayerVoice } from '../systems/PlayerVoice';
import { PowerSystem } from '../systems/PowerSystem';
import { OrderSystem } from '../systems/OrderSystem';
import { PaymentSystem } from '../systems/PaymentSystem';
import { SalarySystem } from '../systems/SalarySystem';
import { ShipperSystem } from '../systems/ShipperSystem';
import type { SoundSystem } from '../systems/SoundSystem';
import { SpawnSystem } from '../systems/SpawnSystem';
import { SupplySystem } from '../systems/SupplySystem';
import type { WorldLabels } from '../ui/DialogBubble';
import type { Hud } from '../ui/Hud';
import type { Notebook } from '../ui/Notebook';
import type { ShiftSummary } from '../ui/ReviewScreen';
import type { ScreenFx } from '../ui/ScreenFx';
import type { Player } from '../world/Player';
import type { Restaurant } from '../world/Restaurant';
import { type EndingId, EventBus } from './EventBus';
import type { ShiftTweaks } from './Tweaks';

export interface ShiftDeps {
  /** Ca số mấy + tâm trạng chủ quán + sự kiện ngày (bốc trước, chơi lại giữ nguyên) */
  plan: ShiftPlan;
  scene: THREE.Object3D;
  restaurant: Restaurant;
  player: Player;
  labels: WorldLabels;
  hud: Hud;
  notebook: Notebook;
  fx: ScreenFx;
  sound: SoundSystem;
  /** Số lần đã bị đuổi (ông chủ cà khịa theo số lần) */
  timesFired: number;
  onFinish: (result: ShiftResult) => void;
  /** Chỉ có khi chạy chế độ thử nghiệm */
  tweaks?: ShiftTweaks | null;
}

export type ShiftResult =
  | { kind: 'complete'; summary: ShiftSummary }
  | { kind: 'gameover'; ending: EndingId; summary: ShiftSummary };

/**
 * Một ca làm. Mỗi ca có EventBus và bộ hệ thống riêng,
 * chơi lại = vứt ca cũ, tạo ca mới (nhanh, không cần tải lại trang).
 */
export class Shift {
  readonly bus = new EventBus();
  readonly cfg: ShiftConfig;
  private readonly deps: ShiftDeps;
  private readonly interaction = new InteractionSystem();
  private readonly spawn: SpawnSystem;
  private readonly orders: OrderSystem;
  private readonly payment: PaymentSystem;
  private readonly salary: SalarySystem;
  private readonly consequence: ConsequenceSystem;
  private readonly boss: Boss | null = null;
  private readonly catSystem: CatSystem | null = null;
  private readonly gangSystem: GangSystem;
  private readonly fireSystem: FireSystem | null = null;
  private readonly shipperSystem: ShipperSystem | null = null;
  private readonly supplySystem: SupplySystem | null = null;
  private readonly powerSystem: PowerSystem | null = null;
  private readonly inspectorSystem: InspectorSystem | null = null;
  private readonly music: MusicDirector;
  private readonly voice: PlayerVoice;
  private elapsed = 0;
  private finished = false;
  private served = 0;
  private angry = 0;
  private ranAway = 0;
  private slaps = 0;

  constructor(deps: ShiftDeps) {
    this.deps = deps;
    const baseCfg = getShiftConfig(deps.plan.day, deps.plan.event);
    const tw = deps.tweaks;
    this.cfg = tw ? { ...baseCfg, ...tw.cfg, features: { ...baseCfg.features, ...tw.features } } : baseCfg;
    const { bus, cfg, interaction } = this;
    const { scene, restaurant, player, labels, hud, notebook, fx, sound } = deps;

    hud.attach(bus);
    hud.setDay(deps.plan.day, deps.plan.event ? DIALOGUES.dayEvents[deps.plan.event.id].name : null);
    notebook.attach(bus);
    sound.attach(bus);

    this.salary = new SalarySystem(bus, cfg);
    this.consequence = new ConsequenceSystem(bus, fx);
    this.music = new MusicDirector(bus);
    this.voice = new PlayerVoice(bus, labels, player);
    if (cfg.features.cat) this.catSystem = new CatSystem({ bus, cfg, labels, restaurant, scene, interaction, player });
    const cat = this.catSystem?.cat ?? null;
    this.spawn = new SpawnSystem({ bus, cfg, labels, restaurant, scene, interaction, player, cat });
    this.gangSystem = new GangSystem({ bus, cfg, labels, restaurant, scene, interaction, player });
    this.orders = new OrderSystem({ bus, cfg, labels, restaurant, interaction, player, scene });
    if (cfg.features.fire) this.fireSystem = new FireSystem({ bus, cfg, labels, restaurant, scene, interaction, player });
    if (cfg.features.shipper) this.shipperSystem = new ShipperSystem({ bus, cfg, labels, restaurant, scene, interaction, player });
    if (cfg.features.supply) this.supplySystem = new SupplySystem({ bus, cfg, labels, restaurant, interaction, player });
    if (cfg.features.blackout) this.powerSystem = new PowerSystem({ bus, cfg, labels, restaurant, scene, interaction, player });
    if (cfg.features.inspector) this.inspectorSystem = new InspectorSystem({ bus, cfg, labels, restaurant, scene, interaction });
    this.payment = new PaymentSystem({
      bus,
      cfg,
      labels,
      restaurant,
      now: () => this.elapsed,
      auditMode: 'boss',
    });

    // Ông chủ dkhanh có mặt mọi ca: ca 1 chỉ ghé quầy kiểm sổ rồi đi, từ ca 2 đi tuần thật
    const mood = deps.plan.mood;
    let openingLine: string = pick(DIALOGUES.bossGreeting[mood.id]);
    if (deps.timesFired > 0 && Math.random() < 0.6) {
      openingLine = fillLine(pick(DIALOGUES.bossGreetingFired), { times: deps.timesFired });
    }
    this.boss = new Boss({ bus, cfg, labels, restaurant, player, mood, patrols: cfg.features.boss, openingLine });
    scene.add(this.boss.body.group);
    if (cfg.features.boss) {
      bus.emit('toast', { text: fillLine(DIALOGUES.toastMood, { mood: DIALOGUES.moodNames[mood.id] }), kind: 'info' });
    }

    bus.on('order:served', () => this.served++);
    bus.on('customer:angryLeave', () => this.angry++);
    bus.on('boss:hit', () => this.slaps++);
    bus.on('customer:runningAway', (p) =>
      bus.emit('toast', { text: fillLine(DIALOGUES.toastRunningAway, { table: p.table }), kind: 'bad' }),
    );
    bus.on('customer:caught', (p) =>
      bus.emit('toast', { text: fillLine(DIALOGUES.toastCaught, { table: p.table }), kind: 'good' }),
    );
    bus.on('customer:ranAway', (p) => {
      this.ranAway++;
      bus.emit('toast', {
        text: fillLine(DIALOGUES.toastRanAway, { table: p.table, amount: formatMoney(p.amount) }),
        kind: 'bad',
      });
    });
    bus.on('game:over', (p) => {
      if (this.deps.tweaks?.immortal) return;
      this.finish(p.ending);
    });

    this.salary.emitStats();
    bus.emit('orders:changed', { tickets: [] });
    bus.emit('shift:tick', { elapsed: 0, total: cfg.shiftDurationSec });
  }

  get isFinished(): boolean {
    return this.finished;
  }

  /**
   * @param interactPressed người chơi vừa bấm E (đã lọc khi đang mở sổ / bị choáng)
   * @param interactHeld người chơi đang giữ E (vuốt mèo)
   */
  update(dt: number, interactPressed: boolean, interactHeld: boolean): void {
    if (this.finished) return;
    this.elapsed += dt;
    const { player, hud } = this.deps;

    const prompt = this.interaction.update(player.position, interactPressed);
    if (interactPressed && prompt) player.markActive();
    hud.setPrompt(prompt);

    this.spawn.update(dt, true);
    this.orders.update(dt);
    this.payment.update(dt);
    this.catSystem?.update(dt, interactHeld);
    this.gangSystem.update(dt);
    this.fireSystem?.update(dt);
    this.shipperSystem?.update(dt);
    this.supplySystem?.update();
    this.powerSystem?.update(dt, interactHeld);
    this.inspectorSystem?.update(dt);
    this.boss?.update(dt);
    this.voice.update(dt);
    hud.setHeld(player.held);
    this.bus.emit('shift:tick', { elapsed: this.elapsed, total: this.cfg.shiftDurationSec });

    if (this.elapsed >= this.cfg.shiftDurationSec) this.endOfShift();
  }

  /** Kết thúc ca ngay như hết giờ (dùng khi thử màn tổng kết) */
  endNow(): void {
    if (!this.finished) this.endOfShift();
  }

  dispose(): void {
    this.spawn.dispose();
    this.orders.dispose();
    this.payment.dispose();
    this.salary.dispose();
    this.consequence.dispose();
    this.boss?.dispose();
    this.catSystem?.dispose();
    this.gangSystem.dispose();
    this.fireSystem?.dispose();
    this.shipperSystem?.dispose();
    this.supplySystem?.dispose();
    this.powerSystem?.dispose();
    this.inspectorSystem?.dispose();
    this.music.dispose();
    this.voice.dispose();
    this.interaction.clear();
  }

  private endOfShift(): void {
    // Đếm tiền cuối ca — có thể làm lương về 0 và kích hoạt game:over
    this.payment.endShiftTally();
    this.finish(null);
  }

  /** @param ending null = hết ca bình thường */
  private finish(ending: EndingId | null): void {
    if (this.finished) return;
    this.finished = true;
    this.deps.hud.setPrompt(null);
    this.deps.restaurant.setPower(true);
    this.deps.fx.setDarkness(0);
    this.bus.emit('music:level', { level: 'off' });
    const summary: ShiftSummary = {
      day: this.deps.plan.day,
      baseSalary: this.cfg.startSalary,
      elapsed: this.elapsed,
      total: this.cfg.shiftDurationSec,
      salary: this.salary.salary,
      rating: this.salary.rating,
      served: this.served,
      angry: this.angry,
      ranAway: this.ranAway,
      slaps: this.slaps,
      mistakes: [...this.salary.mistakes],
    };
    this.deps.onFinish(ending ? { kind: 'gameover', ending, summary } : { kind: 'complete', summary });
  }
}
