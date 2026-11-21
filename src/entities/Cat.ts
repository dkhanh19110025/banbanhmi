import * as THREE from 'three';
import type { CatStatus, EventBus } from '../core/EventBus';
import { pick, randomIn } from '../core/Random';
import { type StateHandlers, StateMachine } from '../core/StateMachine';
import type { ShiftConfig } from '../data/difficulty';
import { DIALOGUES } from '../data/dialogues';
import { SpeechBubble, StatusIcon, type WorldLabels } from '../ui/DialogBubble';
import type { Restaurant } from '../world/Restaurant';

// Tình huống 2 — Con mèo (docs/GAME_DESIGN.md mục 4).
// SLEEPING → (catSleep thấp) WAKING_UP → WANDERING → (khách bế) GRABBED → STOLEN
//    ↑            │ vuốt ngay          │ người chơi bế              │ giật lại → WANDERING
//    └── IN_BED ←─┴────────── CARRIED ←┘
// IN_BED: đặt vào ổ, giữ E vuốt ve tới khi đầy thanh ngủ → SLEEPING.
export type CatState = 'SLEEPING' | 'WAKING_UP' | 'WANDERING' | 'CARRIED' | 'IN_BED' | 'GRABBED' | 'STOLEN';

/** Các trạng thái mèo đang nằm trong ổ (vuốt được) */
const IN_BED_STATES: ReadonlySet<CatState> = new Set(['SLEEPING', 'WAKING_UP', 'IN_BED']);
const SLEEPY_RATIO = 0.5;
const GRABBED_MEOW_SEC = 1.2;
const STAND_Y = 0.22;
const LIE_Y = 0.12;

export interface CatDeps {
  bus: EventBus;
  cfg: ShiftConfig;
  labels: WorldLabels;
  restaurant: Restaurant;
  scene: THREE.Object3D;
}

function box(w: number, h: number, d: number, color: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color }));
  m.castShadow = true;
  return m;
}

const CAT_SCALE = 1.35;

export class Cat {
  readonly group = new THREE.Group();
  /** catSleep 0..100 (mục 3.1) */
  sleep = 100;
  private readonly deps: CatDeps;
  private readonly fsm: StateMachine<CatState, Cat>;
  private readonly bodyPivot = new THREE.Group();
  private readonly legs: THREE.Mesh[] = [];
  private readonly tail: THREE.Mesh;
  private readonly head: THREE.Mesh;
  private readonly icon: StatusIcon;
  private readonly speech: SpeechBubble;
  private readonly worldPos = new THREE.Vector3();
  /** Vuốt chưa đầy mà bỏ → lần ngủ sau tụt nhanh hơn */
  private restless = false;
  private petting = false;
  private wasPetting = false;
  private overPet = 0;
  private petIdle = 0;
  private target: THREE.Vector3 | null = null;
  private pause = 0;
  private walkPhase = 0;
  private meowTimer = 0;

  constructor(deps: CatDeps) {
    this.deps = deps;
    // Mèo Mập: cam sọc, khối hộp
    const fur = 0xe67e22;
    const body = box(0.32, 0.26, 0.6, fur);
    const stripe = box(0.33, 0.06, 0.12, 0xb9561b);
    stripe.position.set(0, 0.1, 0);
    this.head = box(0.3, 0.26, 0.26, fur);
    this.head.position.set(0, 0.14, 0.38);
    for (const side of [-1, 1]) {
      const ear = box(0.07, 0.1, 0.05, 0xb9561b);
      ear.position.set(side * 0.09, 0.17, 0);
      this.head.add(ear);
      const eye = box(0.05, 0.05, 0.02, 0x111111);
      eye.position.set(side * 0.07, 0.03, 0.14);
      eye.castShadow = false;
      this.head.add(eye);
    }
    this.tail = box(0.07, 0.07, 0.45, fur);
    this.tail.geometry.translate(0, 0, -0.22);
    this.tail.position.set(0, 0.1, -0.3);
    this.tail.rotation.x = -0.6;
    this.bodyPivot.add(body, stripe, this.head, this.tail);
    for (const [x, z] of [
      [-0.1, 0.2],
      [0.1, 0.2],
      [-0.1, -0.2],
      [0.1, -0.2],
    ] as const) {
      const leg = box(0.08, 0.2, 0.08, fur);
      leg.position.set(x, -0.15, z);
      this.legs.push(leg);
      this.bodyPivot.add(leg);
    }
    this.group.add(this.bodyPivot);
    // Quán rộng hơn nên cho mèo to lên chút cho dễ thấy
    this.group.scale.setScalar(CAT_SCALE);
    this.group.position.copy(deps.restaurant.catBed);
    deps.scene.add(this.group);

    this.icon = new StatusIcon(deps.labels, this.group, 0.85);
    this.speech = new SpeechBubble(deps.labels, this.group, 1.35);
    this.fsm = new StateMachine<CatState, Cat>(this, this.buildStates(), 'SLEEPING');
  }

  get state(): CatState {
    return this.fsm.state;
  }

  /** Vị trí thật trong thế giới (kể cả khi đang được bế) */
  get position(): THREE.Vector3 {
    return this.group.getWorldPosition(this.worldPos);
  }

  get isInBed(): boolean {
    return IN_BED_STATES.has(this.fsm.state);
  }

  get canBePickedUp(): boolean {
    return this.fsm.state === 'WANDERING';
  }

  /** Còn vuốt thêm được không (trong ổ và chưa ngủ đầy giấc) */
  get wantsPetting(): boolean {
    return this.isInBed && (this.fsm.state !== 'SLEEPING' || this.sleep < 100);
  }

  /** Khách trộm chỉ bế được mèo đang thức ngoài ổ hoặc đang vươn vai (mục 4: "đang thức/lang thang") */
  isStealable(): boolean {
    return this.fsm.state === 'WANDERING' || this.fsm.state === 'WAKING_UP';
  }

  get status(): CatStatus {
    switch (this.fsm.state) {
      case 'SLEEPING':
        return this.sleep / 100 < SLEEPY_RATIO ? 'sleepy' : 'sleeping';
      case 'WAKING_UP':
        return 'waking';
      case 'WANDERING':
        return 'wandering';
      case 'CARRIED':
        return 'carried';
      case 'IN_BED':
        return 'inBed';
      case 'GRABBED':
        return 'grabbed';
      case 'STOLEN':
        return 'stolen';
    }
  }

  /** CatSystem gọi mỗi khung hình: người chơi có đang giữ E vuốt ở ổ không */
  setPetting(active: boolean): void {
    this.petting = active;
  }

  pickUp(anchor: THREE.Object3D): boolean {
    if (!this.canBePickedUp) return false;
    this.attachTo(anchor);
    this.fsm.go('CARRIED');
    return true;
  }

  putInBed(): void {
    if (this.fsm.state !== 'CARRIED') return;
    this.dropAt(this.deps.restaurant.catBed);
    this.fsm.go('IN_BED');
  }

  /** Khách trộm ôm mèo */
  grabBy(anchor: THREE.Object3D, customerId: number): boolean {
    if (!this.isStealable()) return false;
    this.attachTo(anchor);
    this.fsm.go('GRABBED');
    this.deps.bus.emit('cat:grabbed', { customerId });
    return true;
  }

  /** Người chơi giật lại: mèo nhảy xuống đất chỗ đó */
  releaseFromThief(at: THREE.Vector3, customerId: number): void {
    if (this.fsm.state !== 'GRABBED') return;
    this.dropAt(at);
    this.fsm.go('WANDERING');
    this.deps.bus.emit('cat:rescued', { customerId });
  }

  /** Khách ôm mèo ra khỏi cửa */
  markStolen(customerId: number): void {
    if (this.fsm.state !== 'GRABBED') return;
    this.fsm.go('STOLEN');
    this.deps.bus.emit('cat:stolen', { customerId });
  }

  update(dt: number): void {
    this.fsm.update(dt);
    this.wasPetting = this.petting;
    this.speech.update(dt);
    this.updateIcon();
  }

  dispose(): void {
    this.icon.dispose();
    this.speech.dispose();
    this.group.removeFromParent();
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        (obj.material as THREE.Material).dispose();
      }
    });
  }

  // ---------- Tư thế / di chuyển ----------

  private attachTo(anchor: THREE.Object3D): void {
    anchor.add(this.group);
    this.group.position.set(0, 0, 0);
    this.group.rotation.set(0, Math.PI / 2, 0);
    this.setPose('held');
  }

  private dropAt(pos: THREE.Vector3): void {
    this.deps.scene.add(this.group);
    this.group.position.set(pos.x, 0, pos.z);
    this.group.rotation.set(0, 0, 0);
  }

  private setPose(pose: 'lie' | 'stand' | 'held'): void {
    const lie = pose === 'lie';
    this.bodyPivot.position.y = lie ? LIE_Y : pose === 'held' ? 0 : STAND_Y;
    for (const leg of this.legs) leg.visible = !lie;
    this.head.rotation.x = lie ? 0.5 : 0;
    this.tail.rotation.x = lie ? 0 : -0.6;
    this.tail.rotation.y = lie ? 1.2 : 0;
    this.bodyPivot.scale.set(1, 1, 1);
  }

  private pickWanderTarget(): void {
    const { restaurant, cfg } = this.deps;
    this.target =
      Math.random() < cfg.catDoorBias ? restaurant.catDoorSpot : pick(restaurant.catWanderPoints);
  }

  private walk(dt: number): boolean {
    if (!this.target) return true;
    const pos = this.group.position;
    const dx = this.target.x - pos.x;
    const dz = this.target.z - pos.z;
    const dist = Math.hypot(dx, dz);
    const step = this.deps.cfg.catWalkSpeed * dt;
    this.walkPhase += dt * 14;
    this.legs.forEach((leg, i) => (leg.rotation.x = Math.sin(this.walkPhase + (i % 2) * Math.PI) * 0.6));
    if (dist <= step) {
      pos.x = this.target.x;
      pos.z = this.target.z;
      for (const leg of this.legs) leg.rotation.x = 0;
      return true;
    }
    pos.x += (dx / dist) * step;
    pos.z += (dz / dist) * step;
    this.group.rotation.y = Math.atan2(dx, dz);
    return false;
  }

  private meow(): void {
    this.speech.say(pick(DIALOGUES.catMeow), 1.5);
    this.deps.bus.emit('sfx', { sound: 'meow' });
  }

  private updateIcon(): void {
    const { cfg } = this.deps;
    const ratio = this.sleep / 100;
    switch (this.fsm.state) {
      case 'SLEEPING':
        if (ratio < SLEEPY_RATIO) this.icon.show(DIALOGUES.catZzz, (this.sleep - cfg.catWakeAt) / (100 - cfg.catWakeAt), 'warn');
        else this.icon.show(DIALOGUES.catZzz, null, '');
        break;
      case 'WAKING_UP':
        this.icon.show(DIALOGUES.catStretch, null, 'warn blink');
        break;
      case 'WANDERING':
        this.icon.show('🐈❗', null, 'bad blink');
        break;
      case 'IN_BED':
        this.icon.show(this.petting ? DIALOGUES.catPurr : '🐈', ratio, 'ok');
        break;
      case 'GRABBED':
        this.icon.show('🚨🐈🚨', null, 'bad blink');
        break;
      default:
        this.icon.hide();
    }
  }

  // ---------- Trạng thái ----------

  private buildStates(): Record<CatState, StateHandlers<Cat>> {
    const { cfg, bus } = this.deps;
    const petStep = (dt: number): void => {
      this.sleep = Math.min(100, this.sleep + cfg.catPetRatePerSec * dt);
    };

    return {
      SLEEPING: {
        enter: () => {
          this.setPose('lie');
          this.overPet = 0;
        },
        update: (_c, dt) => {
          // Thở phập phồng
          this.bodyPivot.scale.y = 1 + Math.sin(this.fsm.timeInState * 2.5) * 0.06;
          if (this.petting) {
            petStep(dt);
            if (this.sleep >= 100) {
              this.restless = false;
              // Vuốt quá tay: mèo cáu, cào (Tình huống 2 — tùy chọn nâng cao)
              this.overPet += dt;
              if (this.overPet >= cfg.catOverPetSec) {
                this.overPet = 0;
                this.speech.say(pick(DIALOGUES.catScratch), 1.2);
                bus.emit('sfx', { sound: 'scratch' });
                bus.emit('cat:scratch', { amount: cfg.penaltyCatScratch });
              }
            }
            return;
          }
          // Vừa thôi vuốt mà chưa đầy giấc → lần này dậy nhanh hơn
          if (this.wasPetting && this.sleep < 100) this.restless = true;
          this.overPet = 0;
          const decay = cfg.catSleepDecayPerSec * (this.restless ? cfg.catRestlessMultiplier : 1);
          this.sleep = Math.max(0, this.sleep - decay * dt);
          if (this.sleep <= cfg.catWakeAt) this.fsm.go('WAKING_UP');
        },
        exit: () => this.bodyPivot.scale.set(1, 1, 1),
      },

      // Dấu hiệu báo trước: vươn vai, kêu meo trong ổ
      WAKING_UP: {
        enter: () => {
          this.setPose('stand');
          this.meow();
          bus.emit('cat:waking', {});
        },
        update: () => {
          // Vươn vai: kéo dài thân
          this.bodyPivot.scale.z = 1 + Math.abs(Math.sin(this.fsm.timeInState * 3)) * 0.35;
          if (this.petting) this.fsm.go('IN_BED');
          else if (this.fsm.timeInState >= cfg.catWakeSec) this.fsm.go('WANDERING');
        },
        exit: () => this.bodyPivot.scale.set(1, 1, 1),
      },

      WANDERING: {
        enter: () => {
          this.setPose('stand');
          this.pause = 0;
          this.pickWanderTarget();
          bus.emit('cat:wandering', {});
        },
        update: (_c, dt) => {
          if (this.pause > 0) {
            this.pause -= dt;
            if (this.pause <= 0) this.pickWanderTarget();
            return;
          }
          if (this.walk(dt)) {
            this.pause = randomIn(cfg.catWanderPauseSec);
            if (Math.random() < 0.4) this.meow();
          }
        },
      },

      CARRIED: {
        update: () => {
          this.tail.rotation.y = Math.sin(this.fsm.timeInState * 4) * 0.5;
        },
      },

      // Trong ổ nhưng còn thức: giữ E để vuốt. Bỏ đi lâu quá thì thiu thiu ngủ với chừng đó catSleep.
      IN_BED: {
        enter: () => {
          this.setPose('stand');
          this.petIdle = 0;
        },
        update: (_c, dt) => {
          if (this.petting) {
            this.petIdle = 0;
            petStep(dt);
            this.bodyPivot.position.y = LIE_Y + 0.05;
            if (this.sleep >= 100) {
              this.restless = false;
              this.speech.say(DIALOGUES.catZzz, 1);
              bus.emit('cat:asleep', {});
              this.fsm.go('SLEEPING');
            }
            return;
          }
          this.petIdle += dt;
          if (this.petIdle >= cfg.catBedWaitSec) {
            // Vuốt chưa đủ mà bỏ → dậy nhanh hơn
            this.restless = this.sleep < 100;
            this.fsm.go('SLEEPING');
          }
        },
      },

      GRABBED: {
        enter: () => (this.meowTimer = 0),
        update: (_c, dt) => {
          // Giãy giụa
          this.bodyPivot.rotation.z = Math.sin(this.fsm.timeInState * 18) * 0.4;
          this.meowTimer -= dt;
          if (this.meowTimer <= 0) {
            this.meowTimer = GRABBED_MEOW_SEC;
            this.meow();
          }
        },
        exit: () => (this.bodyPivot.rotation.z = 0),
      },

      STOLEN: {
        enter: () => {
          this.group.visible = false;
          this.icon.hide();
        },
      },
    };
  }
}
