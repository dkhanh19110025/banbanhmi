import type * as THREE from 'three';
import { getShiftConfig, type ShiftConfig, type ShiftPlan } from '../data/difficulty';
import { DIALOGUES, fillLine } from '../data/dialogues';
import { formatMoney } from '../data/menu';
import { Boss } from '../entities/Boss';
import { CatSystem } from '../systems/CatSystem';
import { ConsequenceSystem } from '../systems/ConsequenceSystem';
import { GangSystem } from '../systems/GangSystem';
import { InteractionSystem } from '../systems/InteractionSystem';
import { MusicDirector } from '../systems/MusicDirector';
import { PlayerVoice } from '../systems/PlayerVoice';
import { OrderSystem } from '../systems/OrderSystem';
import { PaymentSystem } from '../systems/PaymentSystem';
import { SalarySystem } from '../systems/SalarySystem';
import type { SoundSystem } from '../systems/SoundSystem';
import { SpawnSystem } from '../systems/SpawnSystem';
import type { WorldLabels } from '../ui/DialogBubble';
import type { Hud } from '../ui/Hud';
import type { Notebook } from '../ui/Notebook';
import type { ShiftSummary } from '../ui/ReviewScreen';
import type { ScreenFx } from '../ui/ScreenFx';
import type { Player } from '../world/Player';
import type { Restaurant } from '../world/Restaurant';
import { type EndingId, EventBus } from './EventBus';

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
  onFinish: (result: ShiftResult) => void;
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
    this.cfg = getShiftConfig(deps.plan.day, deps.plan.event);
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
    this.payment = new PaymentSystem({
      bus,
      cfg,
      labels,
      restaurant,
      now: () => this.elapsed,
      auditMode: cfg.features.boss ? 'boss' : 'shout',
    });

    if (cfg.features.boss) {
      const mood = deps.plan.mood;
      this.boss = new Boss({ bus, cfg, labels, restaurant, player, mood });
      scene.add(this.boss.body.group);
      bus.emit('toast', { text: fillLine(DIALOGUES.toastMood, { mood: DIALOGUES.moodNames[mood.id] }), kind: 'info' });
    } else {
      // Không có chủ quán đi lại: mất mèo vẫn là bị đuổi (phòng khi bật mèo mà tắt boss)
      bus.on('cat:stolen', () => bus.emit('game:over', { ending: 'catLost' }));
      // Không có chủ quán đi lại thì khách quỵt bị trừ lương thẳng (phòng khi bật quỵt mà tắt boss)
      bus.on('customer:ranAway', (p) =>
        bus.emit('salary:penalty', {
          amount: Math.round(p.amount * cfg.runawayPenaltyMultiplier),
          reason: fillLine(DIALOGUES.penaltyReasonRunaway, { table: p.table, amount: formatMoney(p.amount) }),
        }),
      );
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
    bus.on('game:over', (p) => this.finish(p.ending));

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
    this.boss?.update(dt);
    this.voice.update(dt);
    hud.setHeld(player.held);
    this.bus.emit('shift:tick', { elapsed: this.elapsed, total: this.cfg.shiftDurationSec });

    if (this.elapsed >= this.cfg.shiftDurationSec) this.endOfShift();
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
