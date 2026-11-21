import * as THREE from 'three';
import type { EventBus } from '../core/EventBus';
import { pick, randomIn } from '../core/Random';
import { type StateHandlers, StateMachine } from '../core/StateMachine';
import { Countdown } from '../core/Timer';
import type { ShiftConfig } from '../data/difficulty';
import { DIALOGUES, fillLine } from '../data/dialogues';
import { type DishId, MENU, getDish } from '../data/menu';
import { SpeechBubble, StatusIcon, type WorldLabels } from '../ui/DialogBubble';
import { distanceXZ } from '../world/Collision';
import { Humanoid, stepToward } from '../world/Humanoid';
import type { Player } from '../world/Player';
import type { GangSeat, Restaurant } from '../world/Restaurant';

// Tình huống 3 — Nhóm giang hồ (docs/GAME_DESIGN.md mục 4). Cả nhóm chung một máy trạng thái:
// ENTERING → SITTING → WAITING_MENU → ORDERING → WAITING_FOOD → EATING → LEAVING → GONE
// WAITING_MENU quá 20s / đoán món sai / WAITING_FOOD hết kiên nhẫn → ATTACKING → BEATING (nhập viện)
export type GangState =
  | 'ENTERING'
  | 'SITTING'
  | 'WAITING_MENU'
  | 'ORDERING'
  | 'WAITING_FOOD'
  | 'EATING'
  | 'LEAVING'
  | 'ATTACKING'
  | 'BEATING'
  | 'GONE';

/** Số bàn hiển thị trên phiếu order cho bàn lớn */
export const GANG_TABLE_NUMBER = 5;

const ORDER_SPEAK_SEC = 1.2;
const PUNCH_REACH = 1.0;
const BEAT_KNOCKBACK = 10;
const BEAT_STUN_SEC = 5;
const LOW_RATIO = 0.35;
const LEADER_SCALE = 1.25;

interface Member {
  body: Humanoid;
  seat: GangSeat;
  path: THREE.Vector3[];
  /** Vào cửa lệch nhau một chút */
  delay: number;
  done: boolean;
}

export interface GangDeps {
  bus: EventBus;
  cfg: ShiftConfig;
  labels: WorldLabels;
  restaurant: Restaurant;
  player: Player;
  scene: THREE.Object3D;
}

export class Gang {
  readonly id: number;
  dish: DishId | null = null;
  private readonly deps: GangDeps;
  private readonly members: Member[] = [];
  private readonly fsm: StateMachine<GangState, Gang>;
  private readonly icon: StatusIcon;
  private readonly speech: SpeechBubble;
  private readonly timer = new Countdown(1);
  private nagged = 0;
  private eatPhase = 0;

  constructor(id: number, deps: GangDeps) {
    this.id = id;
    this.deps = deps;
    const { cfg, restaurant, labels, scene } = deps;
    const size = Math.min(restaurant.gangSeats.length, Math.round(randomIn(cfg.gangSize)));
    for (let i = 0; i < size; i++) {
      // Áo đen, tay xăm kín, kính râm, đầu trọc
      const body = new Humanoid({
        shirt: 0x151515,
        pants: 0x2d3436,
        skin: 0xc68642,
        arms: 0x2c5f7c,
        sleeves: 'none',
        build: 1.2,
        sunglasses: true, // kính gắn vào đầu nên quay theo khi lườm
        goldChain: true,
        shoes: 0x111111,
      });
      if (i === 0) body.group.scale.setScalar(LEADER_SCALE);
      body.group.position.copy(restaurant.doorOutside);
      body.group.position.x += (i - size / 2) * 0.5;
      scene.add(body.group);
      const seat = restaurant.gangSeats[i];
      this.members.push({ body, seat, path: [], delay: i * cfg.gangEntryStaggerSec, done: false });
    }
    this.icon = new StatusIcon(labels, restaurant.bigTableLabelAnchor, 0);
    this.speech = new SpeechBubble(labels, this.leader.group, 2.6);
    this.fsm = new StateMachine<GangState, Gang>(this, this.buildStates(), 'ENTERING');
  }

  get state(): GangState {
    return this.fsm.state;
  }

  get size(): number {
    return this.members.length;
  }

  private get leader(): Humanoid {
    return this.members[0].body;
  }

  // ---------- Hành động từ người chơi ----------

  /** Cách khắc phục đúng: mang menu tới */
  giveMenu(): boolean {
    if (this.fsm.state !== 'WAITING_MENU') return false;
    this.speech.say(pick(DIALOGUES.gangGotMenu), 2);
    this.deps.bus.emit('gang:gotMenu', {});
    this.fsm.go('ORDERING');
    return true;
  }

  /** Cách liều: mang bánh ra đoán món. Trúng thì ăn, trật thì bị đánh ngay. */
  guess(dish: DishId): void {
    if (this.fsm.state !== 'WAITING_MENU') return;
    const { cfg, bus, player } = this.deps;
    if (Math.random() < cfg.gangGuessChance) {
      this.dish = dish;
      this.speech.say(pick(DIALOGUES.gangGuessRight), 2);
      bus.emit('order:served', { customerId: this.id, table: GANG_TABLE_NUMBER, dish });
      this.fsm.go('EATING');
      return;
    }
    player.setHeld(null); // bị hất văng ổ bánh
    this.speech.say(pick(DIALOGUES.gangGuessWrong), 2);
    this.fsm.go('ATTACKING');
  }

  /** Trả về true nếu đưa đúng món đã gọi */
  serve(dish: DishId): boolean {
    if (this.fsm.state !== 'WAITING_FOOD' || dish !== this.dish) return false;
    this.deps.bus.emit('order:served', { customerId: this.id, table: GANG_TABLE_NUMBER, dish });
    this.fsm.go('EATING');
    return true;
  }

  update(dt: number): void {
    this.fsm.update(dt);
    this.speech.update(dt);
  }

  dispose(): void {
    this.icon.dispose();
    this.speech.dispose();
    for (const m of this.members) m.body.dispose();
  }

  // ---------- Di chuyển ----------

  /** Mỗi thành viên đi theo đường riêng; trả về true khi cả nhóm tới nơi */
  private moveAll(dt: number, speed: number): boolean {
    let all = true;
    for (const m of this.members) {
      if (m.done) continue;
      if (this.fsm.timeInState < m.delay) {
        all = false;
        continue;
      }
      const target = m.path[0];
      if (!target) {
        m.done = true;
        m.body.animate(dt, false);
        continue;
      }
      if (stepToward(m.body, target, speed * dt)) m.path.shift();
      m.body.animate(dt, true, speed / 2.5);
      if (m.path.length > 0) all = false;
      else m.done = true;
    }
    return all;
  }

  private sitAll(): void {
    const c = this.deps.restaurant.bigTableCenter;
    for (const m of this.members) {
      m.body.group.position.copy(m.seat.seat);
      m.body.faceDirection(0, c.z - m.seat.seat.z);
      m.body.setSitting(true);
    }
  }

  /** Cả nhóm quay đầu nhìn chằm chằm người chơi */
  private stare(): void {
    const p = this.deps.player.position;
    for (const m of this.members) {
      const g = m.body.group;
      const want = Math.atan2(p.x - g.position.x, p.z - g.position.z);
      let diff = want - g.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      m.body.head.rotation.y = Math.max(-1.2, Math.min(1.2, diff));
    }
  }

  private countdownIcon(label: string): void {
    const r = this.timer.ratio;
    this.icon.show(`${label} ${Math.ceil(this.timer.remaining)}s`, r, r < LOW_RATIO ? 'bad blink' : 'bad');
  }

  // ---------- Trạng thái ----------

  private buildStates(): Record<GangState, StateHandlers<Gang>> {
    const { cfg, bus, restaurant, player } = this.deps;

    return {
      // Dấu hiệu: đạp cửa (GangSystem phát âm thanh + rung), nhạc căng thẳng
      ENTERING: {
        enter: () => {
          for (const m of this.members) {
            m.path = [restaurant.doorInside.clone(), ...m.seat.path.map((v) => v.clone())];
            m.done = false;
          }
          this.speech.say(pick(DIALOGUES.gangEnter), 2);
        },
        update: (_g, dt) => {
          this.icon.show('⚠️ GIANG HỒ', null, 'bad blink');
          if (this.moveAll(dt, cfg.gangWalkSpeed)) this.fsm.go('SITTING');
        },
      },

      SITTING: {
        enter: () => this.sitAll(),
        update: () => {
          if (this.fsm.timeInState >= cfg.gangSitDelaySec) this.fsm.go('WAITING_MENU');
        },
      },

      // Không gọi món, chỉ nhìn. Đếm ngược 20 giây trên bàn.
      WAITING_MENU: {
        enter: () => {
          this.timer.reset(cfg.gangMenuTimeoutSec);
          this.nagged = 0;
        },
        update: (_g, dt) => {
          this.stare();
          if (this.timer.tick(dt)) {
            this.fsm.go('ATTACKING');
            return;
          }
          // Lườm + nói nhỏ khi còn một nửa và còn 1/3 thời gian
          if ((this.nagged === 0 && this.timer.ratio < 0.5) || (this.nagged === 1 && this.timer.ratio < LOW_RATIO)) {
            this.nagged++;
            this.speech.say(pick(DIALOGUES.gangStare), 2);
          }
          this.countdownIcon('⚠️ 📜?');
        },
        exit: () => {
          for (const m of this.members) m.body.head.rotation.y = 0;
        },
      },

      ORDERING: {
        enter: () => {
          this.dish = pick(MENU).id;
          this.speech.say(fillLine(pick(DIALOGUES.gangOrder), { dish: getDish(this.dish).name }), 3);
          bus.emit('order:taken', { customerId: this.id, table: GANG_TABLE_NUMBER, dish: this.dish });
        },
        update: () => {
          this.icon.show('📜 …', null, 'warn');
          if (this.fsm.timeInState >= ORDER_SPEAK_SEC) this.fsm.go('WAITING_FOOD');
        },
      },

      // Vẫn phải làm nhanh, họ không kiên nhẫn
      WAITING_FOOD: {
        enter: () => {
          this.timer.reset(cfg.gangFoodPatienceSec);
          this.nagged = 0;
        },
        update: (_g, dt) => {
          if (this.timer.tick(dt)) {
            this.fsm.go('ATTACKING');
            return;
          }
          if (this.nagged === 0 && this.timer.ratio < LOW_RATIO) {
            this.nagged = 1;
            this.speech.say(pick(DIALOGUES.gangWaitFood), 2);
          }
          this.countdownIcon(`🥖 ${this.dish ? getDish(this.dish).name : ''}`);
        },
      },

      EATING: {
        enter: () => {
          this.timer.reset(randomIn(cfg.gangEatSec));
          this.speech.say(pick(DIALOGUES.gangEating), 1.5);
        },
        update: (_g, dt) => {
          this.eatPhase += dt * 9;
          for (const m of this.members) m.body.head.rotation.x = Math.sin(this.eatPhase + m.delay) * 0.2;
          this.icon.show('😋', 1 - this.timer.ratio, 'ok');
          if (this.timer.tick(dt)) this.fsm.go('LEAVING');
        },
        exit: () => {
          for (const m of this.members) m.body.head.rotation.x = 0;
        },
      },

      // Giang hồ ăn xong thì… đi luôn. Ai dám đòi tiền.
      LEAVING: {
        enter: () => {
          this.icon.hide();
          this.speech.say(pick(DIALOGUES.gangLeave), 2.5);
          for (const m of this.members) {
            m.body.setSitting(false);
            m.path = [...m.seat.path].reverse().map((v) => v.clone());
            m.path.push(restaurant.doorInside.clone(), restaurant.doorOutside.clone());
            m.done = false;
            m.delay = 0;
          }
        },
        update: (_g, dt) => {
          if (this.moveAll(dt, cfg.gangWalkSpeed)) this.fsm.go('GONE');
        },
      },

      // Hậu quả: đứng dậy lao vào người chơi
      ATTACKING: {
        enter: () => {
          this.speech.say(pick(DIALOGUES.gangAttack), 2);
          bus.emit('sfx', { sound: 'alarm' });
          for (const m of this.members) {
            m.body.setSitting(false);
            m.body.head.rotation.set(0, 0, 0);
          }
        },
        update: (_g, dt) => {
          this.icon.show('💢💢💢', null, 'bad blink');
          for (const m of this.members) {
            if (distanceXZ(m.body.group.position, player.position) <= PUNCH_REACH) {
              this.fsm.go('BEATING');
              return;
            }
            stepToward(m.body, player.position, cfg.gangAttackSpeed * dt);
            m.body.animate(dt, true, 2);
          }
        },
      },

      BEATING: {
        enter: () => {
          const g = this.leader.group.position;
          player.hit(player.position.x - g.x, player.position.z - g.z, BEAT_KNOCKBACK, {
            fallSec: 0.3,
            lieSec: BEAT_STUN_SEC,
            getUpSec: 1,
          });
          for (const m of this.members) m.body.armsLocked = true;
          bus.emit('gang:beatUp', {});
        },
        update: () => {
          // Đấm loạn xạ
          const t = this.fsm.timeInState;
          this.members.forEach((m, i) => {
            m.body.arms[0].rotation.x = -1.6 + Math.sin(t * 25 + i) * 0.8;
            m.body.arms[1].rotation.x = -1.6 + Math.cos(t * 25 + i) * 0.8;
          });
        },
      },

      GONE: {
        enter: () => {
          this.icon.hide();
          for (const m of this.members) m.body.group.visible = false;
        },
      },
    };
  }
}
