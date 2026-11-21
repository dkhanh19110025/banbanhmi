import * as THREE from 'three';
import type { EndingId, EventBus } from '../core/EventBus';
import { pick, randomIn } from '../core/Random';
import { type StateHandlers, StateMachine } from '../core/StateMachine';
import type { BossMood, ShiftConfig } from '../data/difficulty';
import { DIALOGUES, fillLine } from '../data/dialogues';
import { formatMoney } from '../data/menu';
import { SpeechBubble, StatusIcon, type WorldLabels } from '../ui/DialogBubble';
import { distanceXZ } from '../world/Collision';
import { Humanoid, stepToward } from '../world/Humanoid';
import type { Player } from '../world/Player';
import type { Restaurant } from '../world/Restaurant';

// Tình huống 5 — Chủ quán đi tuần (docs/GAME_DESIGN.md mục 4, 3.1).
// ENTERING → RETURNING → PATROLLING ⇄ STOPPED / CHECKING_BOOK
// Bất kỳ lúc nào có "món nợ" (sổ sai, khách quỵt, thanh bực đầy) → CHARGING → SLAPPING → RETURNING
export type BossState = 'ENTERING' | 'PATROLLING' | 'STOPPED' | 'CHECKING_BOOK' | 'CHARGING' | 'SLAPPING' | 'RETURNING';

/** Trạng thái chủ quán đang thong thả (có thể đi tuần, bắt quả tang, nghe tiếng dép) */
const CALM_STATES: ReadonlySet<BossState> = new Set(['PATROLLING', 'STOPPED', 'CHECKING_BOOK', 'RETURNING']);
const WALKING_STATES: ReadonlySet<BossState> = new Set(['PATROLLING', 'RETURNING', 'CHARGING']);

const SLAP_REACH = 1.0;
const SLAP_SWING_SEC = 0.3;
const AUDIT_EXTRA_WAIT_SEC = 3;
const AUDIT_MIN_STAY_SEC = 1;
const MURMUR_CHANCE = 0.4;
const ANGER_ICON_RATIO = 0.7;
const CHARGE_HOP = 0.3;

interface PendingHit {
  amount: number;
  reason: string;
  /** Tát vì thanh bực đầy → tát xong hạ thanh bực */
  resetsAnger: boolean;
  /** Hậu quả nặng: đánh xong đuổi việc luôn (mất mèo) */
  ending?: EndingId;
}

export interface BossDeps {
  bus: EventBus;
  cfg: ShiftConfig;
  labels: WorldLabels;
  restaurant: Restaurant;
  player: Player;
  mood: BossMood;
}

export class Boss {
  readonly body: Humanoid;
  anger = 0;
  private readonly deps: BossDeps;
  private readonly fsm: StateMachine<BossState, Boss>;
  private readonly icon: StatusIcon;
  private readonly speech: SpeechBubble;
  private readonly footstep: SpeechBubble;
  private readonly offs: Array<() => void> = [];
  private routeIndex = 0;
  private target: THREE.Vector3 | null = null;
  private stopDuration = 0;
  private baseAngle = 0;
  private pending: PendingHit[] = [];
  private angerSlapQueued = false;
  private auditActive = false;
  private idleCooldown = 0;
  private footstepTimer = 0;

  constructor(deps: BossDeps) {
    this.deps = deps;
    const { bus, cfg, labels, restaurant } = deps;

    // Ông chủ: áo ba lỗ, bụng bia, ria mép, to con hơn nhân viên
    this.body = new Humanoid({
      shirt: 0xf5f5f5,
      pants: 0x1b2631,
      skin: 0xd9a066,
      hair: { style: 'combover', color: 0x2d2d2d },
      shoes: 0x2980b9, // dép tổ ong xanh
      sleeves: 'none',
      build: 1.15,
      belly: true,
      mustache: 0x111111,
    });
    this.body.group.scale.setScalar(1.1);
    this.body.group.position.copy(restaurant.bossSpawn);

    this.icon = new StatusIcon(labels, this.body.group, 2.7);
    this.speech = new SpeechBubble(labels, this.body.group, 3.3);
    this.footstep = new SpeechBubble(labels, this.body.group, 0.2, 'footstep');

    this.offs.push(
      bus.on('customer:angryLeave', () => this.addAnger(cfg.angerAngryLeave, DIALOGUES.angerReasonAngry)),
      bus.on('order:served', () => this.relieve(cfg.angerServeRelief)),
      bus.on('customer:ranAway', (p) => {
        this.addAnger(cfg.angerRunaway, DIALOGUES.angerReasonRunaway);
        this.queueHit({
          amount: Math.round(p.amount * cfg.runawayPenaltyMultiplier),
          reason: fillLine(DIALOGUES.penaltyReasonRunaway, { table: p.table, amount: formatMoney(p.amount) }),
          resetsAnger: false,
        });
      }),
      bus.on('cat:stolen', () => {
        this.speech.say(DIALOGUES.bossCatStolen, 3);
        this.queueHit({ amount: 0, reason: DIALOGUES.reasonCatStolen, resetsAnger: false, ending: 'catLost' });
      }),
      bus.on('audit:warning', (a) => this.speech.say(a.question, a.seconds)),
      bus.on('audit:none', () => (this.auditActive = false)),
      bus.on('audit:result', (r) => {
        this.auditActive = false;
        this.speech.say(r.line, 2.5);
        if (r.ok) {
          this.relieve(cfg.angerAuditPassRelief);
          return;
        }
        this.addAnger(cfg.angerAuditFail, DIALOGUES.angerReasonAudit);
        this.queueHit({ amount: r.penalty, reason: r.reason, resetsAnger: false });
      }),
    );

    this.fsm = new StateMachine<BossState, Boss>(this, this.buildStates(), 'ENTERING');
    this.emitAnger();
  }

  get state(): BossState {
    return this.fsm.state;
  }

  get position(): THREE.Vector3 {
    return this.body.group.position;
  }

  update(dt: number): void {
    const { cfg, player, bus } = this.deps;
    const state = this.fsm.state;

    // Bực tăng dần theo thời gian
    if (CALM_STATES.has(state)) this.addAnger(cfg.angerPerSec * dt);
    if (this.anger >= cfg.angerMax && !this.angerSlapQueued) {
      this.angerSlapQueued = true;
      this.queueHit({ amount: cfg.penaltyAngerSlap, reason: DIALOGUES.angerReasonFull, resetsAnger: true });
    }
    if (this.pending.length > 0 && CALM_STATES.has(this.fsm.state)) this.fsm.go('CHARGING');

    // Bắt quả tang đứng không
    this.idleCooldown -= dt;
    const dist = distanceXZ(player.position, this.position);
    if (
      CALM_STATES.has(this.fsm.state) &&
      this.idleCooldown <= 0 &&
      player.idleTime >= cfg.idleCatchSec &&
      dist <= cfg.bossSightRange
    ) {
      this.idleCooldown = cfg.idleCatchCooldownSec;
      this.speech.say(pick(DIALOGUES.bossIdle), 2.5);
      this.addAnger(cfg.angerIdle, DIALOGUES.angerReasonIdle);
    }

    // Dấu hiệu báo trước: tiếng dép lê khi lại gần
    if (WALKING_STATES.has(this.fsm.state)) {
      this.footstepTimer -= dt;
      if (this.footstepTimer <= 0) {
        const charging = this.fsm.state === 'CHARGING';
        this.footstepTimer = cfg.bossFootstepIntervalSec * (charging ? 0.5 : 1);
        if (dist < cfg.bossFootstepRange) {
          bus.emit('sfx', { sound: 'flipflop', volume: 1 - dist / cfg.bossFootstepRange });
          this.footstep.say(DIALOGUES.bossFootstep, 0.3);
        }
      }
    }

    this.fsm.update(dt);
    this.speech.update(dt);
    this.footstep.update(dt);
    this.updateIcon();
    this.emitAnger();
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.icon.dispose();
    this.speech.dispose();
    this.footstep.dispose();
    this.body.dispose();
  }

  // ---------- Thanh bực ----------

  private addAnger(amount: number, reason?: string): void {
    const { cfg, mood, bus } = this.deps;
    const gain = amount * mood.angerMultiplier;
    this.anger = Math.min(cfg.angerMax, this.anger + gain);
    if (reason) bus.emit('toast', { text: `😤 Chủ quán bực +${Math.round(gain)}: ${reason}`, kind: 'warn' });
  }

  private relieve(amount: number): void {
    this.anger = Math.max(0, this.anger - amount);
  }

  private emitAnger(): void {
    const { cfg, mood, bus } = this.deps;
    bus.emit('boss:anger', { anger: this.anger, max: cfg.angerMax, mood: DIALOGUES.moodNames[mood.id] });
  }

  private queueHit(hit: PendingHit): void {
    this.pending.push(hit);
  }

  private updateIcon(): void {
    const ratio = this.anger / this.deps.cfg.angerMax;
    if (this.fsm.state === 'CHARGING') this.icon.show('💢💢💢', null, 'bad blink');
    else if (this.fsm.state === 'CHECKING_BOOK') this.icon.show('📒 Kiểm sổ', null, 'warn');
    else if (ratio >= ANGER_ICON_RATIO) this.icon.show('💢', ratio, 'bad blink');
    else this.icon.hide();
  }

  // ---------- Di chuyển ----------

  private walkTo(dt: number, speed: number): boolean {
    if (!this.target) return true;
    const arrived = stepToward(this.body, this.target, speed * dt);
    this.body.animate(dt, !arrived, speed / 3);
    return arrived;
  }

  private nearestWaypoint(): number {
    const route = this.deps.restaurant.bossRoute;
    let best = 0;
    let bestDist = Infinity;
    route.forEach((wp, i) => {
      const d = distanceXZ(wp.pos, this.position);
      if (d < bestDist) {
        best = i;
        bestDist = d;
      }
    });
    return best;
  }

  private advanceRoute(): void {
    this.routeIndex = (this.routeIndex + 1) % this.deps.restaurant.bossRoute.length;
    this.target = this.deps.restaurant.bossRoute[this.routeIndex].pos;
  }

  // ---------- Trạng thái ----------

  private buildStates(): Record<BossState, StateHandlers<Boss>> {
    const { cfg, bus, player, restaurant } = this.deps;
    const route = restaurant.bossRoute;

    return {
      ENTERING: {
        update: () => {
          if (this.fsm.timeInState >= cfg.bossStartDelaySec) this.fsm.go('RETURNING');
        },
      },

      RETURNING: {
        enter: () => {
          this.routeIndex = this.nearestWaypoint();
          this.target = route[this.routeIndex].pos;
        },
        update: (_b, dt) => {
          if (this.walkTo(dt, cfg.bossWalkSpeed)) this.fsm.go('PATROLLING');
        },
      },

      PATROLLING: {
        enter: () => (this.target = route[this.routeIndex].pos),
        update: (_b, dt) => {
          if (!this.walkTo(dt, cfg.bossWalkSpeed)) return;
          const stop = route[this.routeIndex].stop;
          if (stop === 'counter' && Math.random() < cfg.bossAuditChance) this.fsm.go('CHECKING_BOOK');
          else if (stop) this.fsm.go('STOPPED');
          else this.advanceRoute();
        },
      },

      STOPPED: {
        enter: () => {
          this.stopDuration = randomIn(cfg.bossStopSec);
          this.baseAngle = this.body.group.rotation.y;
          if (Math.random() < MURMUR_CHANCE) this.speech.say(pick(DIALOGUES.bossMurmur), 2);
        },
        update: () => {
          // Ngó nghiêng
          this.body.group.rotation.y = this.baseAngle + Math.sin(this.fsm.timeInState * 2) * 0.9;
          if (this.fsm.timeInState >= this.stopDuration) {
            this.advanceRoute();
            this.fsm.go('PATROLLING');
          }
        },
      },

      // Kiểm sổ ở quầy. PaymentSystem chọn bàn để hỏi, đếm ngược, rồi báo kết quả.
      CHECKING_BOOK: {
        enter: () => {
          // Quay về chỗ nhân viên đứng thu tiền (cạnh quyển sổ)
          this.body.faceDirection(restaurant.counterPoint.x - this.position.x, restaurant.counterPoint.z - this.position.z);
          this.speech.say(pick(DIALOGUES.bossAuditStart), 1.5);
          this.auditActive = true;
          bus.emit('audit:request', {});
        },
        update: () => {
          const t = this.fsm.timeInState;
          const done = !this.auditActive && t >= AUDIT_MIN_STAY_SEC;
          if (done || t >= cfg.auditWarningSec + AUDIT_EXTRA_WAIT_SEC) {
            this.advanceRoute();
            this.fsm.go('PATROLLING');
          }
        },
      },

      // Lao tới người chơi (nhảy cẫng qua cả bàn ghế cho bựa)
      CHARGING: {
        enter: () => {
          this.speech.say(pick(DIALOGUES.bossCharge), 1.5);
          bus.emit('sfx', { sound: 'alarm' });
        },
        update: (_b, dt) => {
          // Kiểm tra tầm trước khi bước để không đè lên người chơi (cần hướng để hất văng)
          if (distanceXZ(player.position, this.position) <= SLAP_REACH) {
            this.fsm.go('SLAPPING');
            return;
          }
          this.target = player.position;
          this.walkTo(dt, cfg.bossChargeSpeed);
          this.body.group.position.y = Math.abs(Math.sin(this.fsm.timeInState * 14)) * CHARGE_HOP;
        },
        exit: () => {
          this.body.group.position.y = 0;
          this.target = null;
        },
      },

      SLAPPING: {
        enter: () => {
          const hits = this.pending;
          this.pending = [];
          const amount = hits.reduce((s, h) => s + h.amount, 0);
          const reason = hits.map((h) => h.reason).join(' + ');
          if (hits.some((h) => h.resetsAnger)) {
            this.anger = Math.min(this.anger, cfg.angerAfterSlap);
            this.angerSlapQueued = false;
          }
          const dx = player.position.x - this.position.x;
          const dz = player.position.z - this.position.z;
          this.body.faceDirection(dx, dz);
          player.hit(dx, dz, cfg.slapKnockbackSpeed, cfg.slapStunSec);
          bus.emit('boss:hit', { amount, reason });
          this.body.armsLocked = true;
          // Mất mèo: đánh xong đuổi việc (hậu quả nặng, kết thúc ca)
          const fatal = hits.find((h) => h.ending);
          if (fatal?.ending) bus.emit('game:over', { ending: fatal.ending });
        },
        update: () => {
          // Vung tay phải từ trên xuống
          const t = this.fsm.timeInState;
          const arm = this.body.arms[1];
          arm.rotation.x = t < SLAP_SWING_SEC ? -2.8 + (t / SLAP_SWING_SEC) * 2.4 : -0.4;
          arm.rotation.z = t < SLAP_SWING_SEC ? 0.6 : 0;
          if (t >= cfg.slapRecoverSec) this.fsm.go(this.pending.length > 0 ? 'CHARGING' : 'RETURNING');
        },
        exit: () => {
          this.body.armsLocked = false;
          this.body.arms[1].rotation.set(0, 0, 0);
          this.speech.say(pick(DIALOGUES.bossAfterSlap), 1.5);
        },
      },
    };
  }
}
