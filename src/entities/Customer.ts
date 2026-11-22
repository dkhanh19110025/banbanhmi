import * as THREE from 'three';
import type { EventBus } from '../core/EventBus';
import { pick, randomIn } from '../core/Random';
import { type StateHandlers, StateMachine } from '../core/StateMachine';
import { Countdown } from '../core/Timer';
import type { ShiftConfig } from '../data/difficulty';
import { DIALOGUES, fillLine } from '../data/dialogues';
import { type DishId, formatMoney, getDish } from '../data/menu';
import { SpeechBubble, StatusIcon, type WorldLabels } from '../ui/DialogBubble';
import type { Cat } from './Cat';
import { distanceXZ } from '../world/Collision';
import { createServingTray } from '../world/BanhMi';
import { Humanoid, stepToward } from '../world/Humanoid';
import { uniqueCustomerLook } from '../world/Looks';
import { type Restaurant, TABLE_TOP_Y, type TableSpot } from '../world/Restaurant';

// Máy trạng thái khách (docs/GAME_DESIGN.md mục 6):
// ENTERING → SEATED → WAITING_ORDER → ORDERED → WAITING_FOOD → EATING → FINISHED
// FINISHED → GO_TO_COUNTER → PAYING → LEAVING → GONE
// WAITING_ORDER / WAITING_FOOD hết kiên nhẫn → LEAVING_ANGRY → GONE
// Khách quỵt (Tình huống 1): FINISHED → SNEAKING (liếc cửa) → RUNNING_AWAY → GONE
//   bị nhắc kịp lúc SNEAKING / RUNNING_AWAY → GO_TO_COUNTER → PAYING …
// Khách trộm mèo (Tình huống 2): trả tiền xong → STEALING_CAT → LEAVING_WITH_CAT → GONE
//   mèo đang ngủ: tới sát mèo → LURKING_CAT (rình vài giây, người chơi vuốt mèo thì bỏ cuộc → LEAVING) → bế
//   bị giật lại mèo → LEAVING
export type CustomerState =
  | 'ENTERING'
  | 'SEATED'
  | 'WAITING_ORDER'
  | 'ORDERED'
  | 'WAITING_FOOD'
  | 'EATING'
  | 'FINISHED'
  | 'SNEAKING'
  | 'RUNNING_AWAY'
  | 'GO_TO_COUNTER'
  | 'PAYING'
  | 'LEAVING'
  | 'LEAVING_ANGRY'
  | 'STEALING_CAT'
  | 'LURKING_CAT'
  | 'LEAVING_WITH_CAT'
  | 'GONE';

/** Các trạng thái mà khách còn chiếm bàn */
const SEATED_STATES: ReadonlySet<CustomerState> = new Set([
  'ENTERING',
  'SEATED',
  'WAITING_ORDER',
  'ORDERED',
  'WAITING_FOOD',
  'EATING',
  'FINISHED',
  'SNEAKING',
]);

export type PaymentIntent = 'pay' | 'skip';

export interface CustomerDeps {
  bus: EventBus;
  cfg: ShiftConfig;
  labels: WorldLabels;
  restaurant: Restaurant;
  /** Con mèo của quán (null nếu ca này chưa có mèo) */
  cat: Cat | null;
  /** Được phép trộm mèo lúc này không (không chồng lên giang hồ — mục 9 quy tắc 2) */
  canStealCat: () => boolean;
}

const ORDERED_SPEAK_SEC = 1.0;
const FINISHED_PAUSE_SEC = 0.8;

export class Customer {
  readonly id: number;
  readonly table: TableSpot;
  readonly dish: DishId;
  readonly body: Humanoid;
  /** Vị trí trong hàng chờ quầy (0 = đứng đầu), do SpawnSystem gán mỗi khung hình */
  queueIndex = -1;
  /** Thời điểm vào hàng chờ, để xếp thứ tự */
  queuedAt = 0;
  /** Quyết định lúc ăn xong: trả tiền hay chuồn */
  paymentIntent: PaymentIntent = 'pay';
  /** Khách đặc biệt: ra về tiện tay bế mèo (catThief, mục 4 tình huống 2) */
  readonly catThief: boolean;
  private sitting = false;
  private plate: THREE.Group | null = null;
  private bread: THREE.Group | null = null;

  private readonly deps: CustomerDeps;
  private readonly fsm: StateMachine<CustomerState, Customer>;
  private readonly icon: StatusIcon;
  private readonly speech: SpeechBubble;
  private readonly patience = new Countdown(1);
  private readonly eatTimer = new Countdown(1);
  private path: THREE.Vector3[] = [];
  private nagged = false;
  private atQueueSpot = false;
  private eatPhase = 0;

  constructor(id: number, table: TableSpot, dish: DishId, deps: CustomerDeps) {
    this.id = id;
    this.table = table;
    this.dish = dish;
    this.deps = deps;
    this.catThief = deps.cfg.features.cat && Math.random() < deps.cfg.catThiefChance;
    this.body = new Humanoid(uniqueCustomerLook());
    // Người cao người thấp cho đỡ giống nhau
    this.body.group.scale.setScalar(0.92 + Math.random() * 0.12);
    this.body.group.position.copy(deps.restaurant.doorOutside);
    this.icon = new StatusIcon(deps.labels, this.body.group, 2.35);
    this.speech = new SpeechBubble(deps.labels, this.body.group, 2.9);
    this.fsm = new StateMachine<CustomerState, Customer>(this, this.buildStates(), 'ENTERING');
  }

  get state(): CustomerState {
    return this.fsm.state;
  }

  get position(): THREE.Vector3 {
    return this.body.group.position;
  }

  get occupiesTable(): boolean {
    return SEATED_STATES.has(this.fsm.state);
  }

  /** Khách đứng đầu hàng, sẵn sàng đưa tiền */
  get readyToPay(): boolean {
    return this.fsm.state === 'PAYING' && this.queueIndex === 0 && this.atQueueSpot;
  }

  // ---------- Hành động từ người chơi ----------

  takeOrder(): void {
    if (this.fsm.state === 'WAITING_ORDER') this.fsm.go('ORDERED');
  }

  /** Trả về true nếu đưa đúng món */
  serve(dish: DishId): boolean {
    if (this.fsm.state !== 'WAITING_FOOD') return false;
    if (dish !== this.dish) {
      this.speech.say(pick(DIALOGUES.customerWrongDish));
      return false;
    }
    this.fsm.go('EATING');
    return true;
  }

  /** Đang chuồn hoặc sắp chuồn — người chơi còn nhắc được */
  get canBeReminded(): boolean {
    return this.fsm.state === 'SNEAKING' || this.fsm.state === 'RUNNING_AWAY';
  }

  /** Người chơi chạy tới nhắc trả tiền: khách quê độ, quay lại quầy */
  remindToPay(): void {
    if (!this.canBeReminded) return;
    this.paymentIntent = 'pay';
    this.speech.say(pick(DIALOGUES.customerCaught), 2.5);
    this.deps.bus.emit('customer:caught', { customerId: this.id, table: this.table.number });
    this.fsm.go('GO_TO_COUNTER');
  }

  collectPayment(): void {
    if (!this.readyToPay) return;
    const amount = getDish(this.dish).price;
    this.deps.bus.emit('customer:paid', { customerId: this.id, table: this.table.number, dish: this.dish, amount });
    this.fsm.go(this.wantsToStealCat() ? 'STEALING_CAT' : 'LEAVING');
  }

  get isCarryingCat(): boolean {
    return this.fsm.state === 'LEAVING_WITH_CAT';
  }

  /** Người chơi đuổi kịp, giật lại mèo */
  giveBackCat(): void {
    if (this.fsm.state !== 'LEAVING_WITH_CAT') return;
    this.deps.cat?.releaseFromThief(this.position, this.id);
    this.speech.say(pick(DIALOGUES.thiefCaught), 2.5);
    this.fsm.go('LEAVING');
  }

  private wantsToStealCat(): boolean {
    const cat = this.deps.cat;
    return this.catThief && cat !== null && cat.isStealable() && this.deps.canStealCat();
  }

  update(dt: number): void {
    this.fsm.update(dt);
    this.speech.update(dt);
  }

  dispose(): void {
    this.hidePlate();
    this.icon.dispose();
    this.speech.dispose();
    this.body.dispose();
  }

  // ---------- Di chuyển ----------

  private followPath(dt: number, speed = this.deps.cfg.customerWalkSpeed): boolean {
    const target = this.path[0];
    if (!target) {
      this.body.animate(dt, false);
      return true;
    }
    if (stepToward(this.body, target, speed * dt)) this.path.shift();
    this.body.animate(dt, true, speed / this.deps.cfg.customerWalkSpeed);
    return this.path.length === 0;
  }

  /** Khay bánh mì nhân viên vừa bưng ra, đặt trên bàn trong lúc khách ăn */
  private showPlate(): void {
    const tray = createServingTray(this.dish);
    const plate = tray.group;
    this.bread = tray.bread;
    const t = this.table;
    // Đặt lên tấm lót phía ghế khách, khay quay dọc theo cạnh bàn
    plate.position.set(t.center.x + (t.seat.x - t.center.x) * 0.35, TABLE_TOP_Y, t.center.z + 0.15);
    this.deps.restaurant.root.add(plate);
    this.plate = plate;
  }

  private hidePlate(): void {
    if (!this.plate) return;
    this.plate.removeFromParent();
    this.plate.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    this.plate = null;
    this.bread = null;
  }

  private sitDown(): void {
    this.body.group.position.copy(this.table.seat);
    const c = this.table.center;
    this.body.faceDirection(c.x - this.table.seat.x, c.z - this.table.seat.z);
    this.body.setSitting(true);
    this.sitting = true;
  }

  private standUp(): void {
    this.body.setSitting(false);
    this.sitting = false;
  }

  // ---------- Trạng thái ----------

  private buildStates(): Record<CustomerState, StateHandlers<Customer>> {
    const { cfg, bus, restaurant } = this.deps;
    const table = this.table;
    const dishName = getDish(this.dish).name;

    return {
      ENTERING: {
        enter: () => {
          this.path = [restaurant.doorInside.clone(), table.aisle.clone(), table.seat.clone()];
          this.speech.say(pick(DIALOGUES.customerEnter));
        },
        update: (_c, dt) => {
          if (this.followPath(dt)) this.fsm.go('SEATED');
        },
      },

      SEATED: {
        enter: () => this.sitDown(),
        update: () => {
          if (this.fsm.timeInState >= cfg.seatDelaySec) this.fsm.go('WAITING_ORDER');
        },
      },

      // Dấu hiệu: "❗" + thanh kiên nhẫn. Khắc phục: lại gần bấm E. Hậu quả: bỏ về, giảm rating.
      WAITING_ORDER: {
        enter: () => {
          this.patience.reset(cfg.patienceOrderSec);
          this.nagged = false;
        },
        update: (_c, dt) => {
          if (this.patience.tick(dt)) {
            this.fsm.go('LEAVING_ANGRY');
            return;
          }
          if (!this.nagged && this.patience.ratio < 0.35) {
            this.nagged = true;
            this.speech.say(pick(DIALOGUES.customerWaitOrder));
          }
          this.icon.show(`❗ Gọi món`, this.patience.ratio, this.patience.ratio < 0.35 ? 'bad blink' : 'warn');
        },
        exit: () => this.icon.hide(),
      },

      ORDERED: {
        enter: () => {
          this.speech.say(fillLine(pick(DIALOGUES.customerOrder), { dish: dishName }), 3);
          bus.emit('order:taken', { customerId: this.id, table: table.number, dish: this.dish });
        },
        update: () => {
          if (this.fsm.timeInState >= ORDERED_SPEAK_SEC) this.fsm.go('WAITING_FOOD');
        },
      },

      WAITING_FOOD: {
        enter: () => {
          this.patience.reset(cfg.patienceFoodSec);
          this.nagged = false;
        },
        update: (_c, dt) => {
          if (this.patience.tick(dt)) {
            this.fsm.go('LEAVING_ANGRY');
            return;
          }
          if (!this.nagged && this.patience.ratio < 0.35) {
            this.nagged = true;
            this.speech.say(pick(DIALOGUES.customerWaitFood));
          }
          this.icon.show(`🥖 ${dishName}`, this.patience.ratio, this.patience.ratio < 0.35 ? 'bad' : '');
        },
        exit: () => this.icon.hide(),
      },

      EATING: {
        enter: () => {
          this.eatTimer.reset(randomIn(cfg.eatTimeSec));
          this.speech.say(pick(DIALOGUES.customerEating), 1.5);
          this.showPlate();
        },
        update: (_c, dt) => {
          // Gật gù nhai, ổ bánh ngắn dần
          this.eatPhase += dt * 9;
          this.body.head.rotation.x = Math.sin(this.eatPhase) * 0.2;
          this.bread?.scale.set(0.95 * Math.max(0.15, this.eatTimer.ratio), 0.95, 0.95);
          this.icon.show('😋', 1 - this.eatTimer.ratio, 'ok');
          if (this.eatTimer.tick(dt)) this.fsm.go('FINISHED');
        },
        exit: () => {
          this.body.head.rotation.x = 0;
          this.icon.hide();
          this.hidePlate();
        },
      },

      // Kích hoạt khách quỵt: ăn xong quyết định trả hay chuồn
      FINISHED: {
        enter: () => {
          const skip = cfg.features.runaway && Math.random() < cfg.runawayChance;
          this.paymentIntent = skip ? 'skip' : 'pay';
          // Khách sắp quỵt thì không nói "đi trả tiền" — đó cũng là một dấu hiệu
          if (!skip) this.speech.say(pick(DIALOGUES.customerFinished), 1.5);
        },
        update: () => {
          if (this.fsm.timeInState < FINISHED_PAUSE_SEC) return;
          this.fsm.go(this.paymentIntent === 'skip' ? 'SNEAKING' : 'GO_TO_COUNTER');
        },
      },

      // Dấu hiệu báo trước: không đứng dậy, liếc cửa, "?" nhấp nháy, thì thầm.
      SNEAKING: {
        enter: () => this.speech.say(pick(DIALOGUES.customerSneak), cfg.runawaySneakSec),
        update: () => {
          // Đảo mắt về phía cửa
          this.body.head.rotation.y = Math.sin(this.fsm.timeInState * 5) * 0.8;
          this.icon.show('❓', null, 'sneak blink');
          if (this.fsm.timeInState >= cfg.runawaySneakSec) this.fsm.go('RUNNING_AWAY');
        },
        exit: () => {
          this.body.head.rotation.y = 0;
          this.icon.hide();
        },
      },

      // Chạy ra cửa. Khắc phục: đuổi theo bấm E trước khi khuất khỏi cửa.
      RUNNING_AWAY: {
        enter: () => {
          this.standUp();
          this.speech.say(pick(DIALOGUES.customerRunaway), 2.5);
          bus.emit('customer:runningAway', { customerId: this.id, table: table.number });
          bus.emit('sfx', { sound: 'giggle' });
          this.path = [table.aisle.clone(), restaurant.doorInside.clone(), restaurant.doorOutside.clone()];
        },
        update: (_c, dt) => {
          this.icon.show('🏃💨 QUỴT!', null, 'bad blink');
          if (!this.followPath(dt, cfg.runawaySpeed)) return;
          bus.emit('customer:ranAway', {
            customerId: this.id,
            table: table.number,
            dish: this.dish,
            amount: getDish(this.dish).price,
          });
          this.fsm.go('GONE');
        },
        exit: () => this.icon.hide(),
      },

      GO_TO_COUNTER: {
        enter: () => {
          // Bị nhắc giữa đường thì đi thẳng về phía cửa trong rồi vào hàng
          this.path = this.sitting
            ? [table.aisle.clone(), restaurant.doorInside.clone()]
            : [restaurant.doorInside.clone()];
          this.standUp();
        },
        update: (_c, dt) => {
          if (this.followPath(dt)) this.fsm.go('PAYING');
        },
      },

      // Đứng hàng chờ. Dấu hiệu: "💵" trên đầu. Khắc phục: E ở quầy. Hậu quả chờ lâu: càm ràm + trừ rating.
      PAYING: {
        enter: () => {
          this.queuedAt = performance.now();
          this.atQueueSpot = false;
          this.nagged = false;
          this.patience.reset(cfg.patienceCounterSec);
        },
        update: (_c, dt) => {
          const spot = restaurant.queueSpots[Math.max(0, this.queueIndex)] ?? restaurant.queueSpots[0];
          this.atQueueSpot = stepToward(this.body, spot, cfg.customerWalkSpeed * dt);
          this.body.animate(dt, !this.atQueueSpot);
          if (this.atQueueSpot) this.body.faceDirection(restaurant.queueFacing.x, restaurant.queueFacing.z);

          if (this.queueIndex !== 0 || !this.atQueueSpot) {
            this.icon.show('⏳', null, '');
            return;
          }
          if (this.patience.remaining === this.patience.duration) {
            this.speech.say(pick(DIALOGUES.customerPay));
          }
          this.patience.tick(dt);
          if (this.patience.done && !this.nagged) {
            this.nagged = true;
            this.speech.say(pick(DIALOGUES.customerCounterWait), 3);
            bus.emit('rating:change', { delta: -cfg.ratingSlowCounter, reason: DIALOGUES.ratingReasonCounter });
          }
          this.icon.show(`💵 ${formatMoney(getDish(this.dish).price)}`, this.patience.ratio, 'warn blink');
        },
        exit: () => this.icon.hide(),
      },

      LEAVING: {
        enter: () => {
          this.speech.say(pick(DIALOGUES.customerThanks), 1.8);
          this.path = [restaurant.doorInside.clone(), restaurant.doorOutside.clone()];
        },
        update: (_c, dt) => {
          if (this.followPath(dt)) this.fsm.go('GONE');
        },
      },

      // Kích hoạt trộm mèo: ngó nghiêng, đi tới chỗ mèo
      STEALING_CAT: {
        enter: () => this.speech.say(pick(DIALOGUES.thiefSpot), 3),
        update: (_c, dt) => {
          const cat = this.deps.cat;
          if (!cat || !cat.isStealable()) {
            this.speech.say(DIALOGUES.thiefGiveUp, 1.5);
            this.fsm.go('LEAVING');
            return;
          }
          const catPos = cat.position;
          if (distanceXZ(catPos, this.position) <= cfg.catGrabRange) {
            // Mèo đang ngủ: đứng rình trước, mèo thức thì bế luôn
            if (cat.isResting) this.fsm.go('LURKING_CAT');
            else if (cat.grabBy(this.body.upper, this.id)) this.fsm.go('LEAVING_WITH_CAT');
            return;
          }
          stepToward(this.body, catPos, cfg.catThiefChaseSpeed * dt);
          this.body.animate(dt, true);
        },
      },

      // Dấu hiệu báo trước: đứng sát mèo đang ngủ, không đi. Vuốt mèo thì khách bỏ cuộc.
      LURKING_CAT: {
        enter: () => {
          const cat = this.deps.cat;
          if (cat) this.body.faceDirection(cat.position.x - this.position.x, cat.position.z - this.position.z);
        },
        update: (_c, dt) => {
          const cat = this.deps.cat;
          this.icon.show(DIALOGUES.thiefLurkIcon, null, 'warn blink');
          this.body.animate(dt, false);
          if (!cat || !cat.isStealable() || cat.isBeingPetted) {
            this.speech.say(DIALOGUES.thiefGiveUp, 1.5);
            this.fsm.go('LEAVING');
            return;
          }
          if (this.fsm.timeInState >= cfg.catLurkSec && cat.grabBy(this.body.upper, this.id)) {
            this.fsm.go('LEAVING_WITH_CAT');
          }
        },
        exit: () => this.icon.hide(),
      },

      // Ôm mèo ra cửa — cửa sổ ~5 giây để người chơi đuổi theo bấm E
      LEAVING_WITH_CAT: {
        enter: () => {
          this.speech.say(pick(DIALOGUES.thiefGrab), 2.5);
          // Ra lối đi chính trước để khỏi xuyên bàn
          this.path = [
            new THREE.Vector3(restaurant.doorInside.x, 0, this.position.z),
            restaurant.doorInside.clone(),
            restaurant.doorOutside.clone(),
          ];
        },
        update: (_c, dt) => {
          this.icon.show('🐈 Trả mèo đây!', null, 'bad blink');
          if (!this.followPath(dt, cfg.catThiefLeaveSpeed)) return;
          this.deps.cat?.markStolen(this.id);
          this.fsm.go('GONE');
        },
        exit: () => this.icon.hide(),
      },

      LEAVING_ANGRY: {
        enter: () => {
          this.standUp();
          this.speech.say(pick(DIALOGUES.customerAngry), 3);
          bus.emit('customer:angryLeave', { customerId: this.id, table: table.number });
          bus.emit('rating:change', {
            delta: -cfg.ratingAngryLeave,
            reason: fillLine(DIALOGUES.ratingReasonAngry, { table: table.number }),
          });
          this.path = [table.aisle.clone(), restaurant.doorInside.clone(), restaurant.doorOutside.clone()];
        },
        update: (_c, dt) => {
          this.icon.show('😡', null, 'bad');
          if (this.followPath(dt * 1.3)) this.fsm.go('GONE');
        },
        exit: () => this.icon.hide(),
      },

      GONE: {
        enter: () => bus.emit('customer:gone', { customerId: this.id }),
      },
    };
  }
}
