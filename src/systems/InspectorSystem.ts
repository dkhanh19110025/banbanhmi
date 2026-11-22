import * as THREE from 'three';
import type { EventBus } from '../core/EventBus';
import { pick, randomIn } from '../core/Random';
import { Countdown } from '../core/Timer';
import type { ShiftConfig } from '../data/difficulty';
import { DIALOGUES, fillLine } from '../data/dialogues';
import { SpeechBubble, StatusIcon, type WorldLabels } from '../ui/DialogBubble';
import { Humanoid, stepToward } from '../world/Humanoid';
import type { Restaurant } from '../world/Restaurant';
import type { InteractionSystem } from './InteractionSystem';

type InspectorState = 'idle' | 'cleaning' | 'entering' | 'inspecting' | 'leaving' | 'done';

/** Khi dọn xong hết sớm thì thanh tra vào luôn sau chừng này giây (khỏi bắt chờ) */
const FAST_FORWARD_SEC = 6;

interface DirtSpot {
  mesh: THREE.Group;
  icon: StatusIcon;
  off: () => void;
}

export interface InspectorDeps {
  bus: EventBus;
  cfg: ShiftConfig;
  labels: WorldLabels;
  restaurant: Restaurant;
  scene: THREE.Object3D;
  interaction: InteractionSystem;
}

function disposeTree(root: THREE.Object3D): void {
  root.removeFromParent();
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
  });
}

/** Xe van trắng của thanh tra vệ sinh */
function buildCar(): THREE.Group {
  const g = new THREE.Group();
  const add = (w: number, h: number, d: number, color: number, x: number, y: number, z: number): THREE.Mesh => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color }));
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  add(3.6, 1.3, 1.7, 0xf4f6f7, 0, 1.05, 0);
  add(1.1, 0.9, 1.6, 0xf4f6f7, 1.7, 0.85, 0);
  add(0.02, 0.5, 1.5, 0x74b9ff, 2.27, 1.0, 0);
  add(3.62, 0.25, 1.72, 0x2980b9, 0, 0.75, 0);
  add(0.4, 0.14, 0.4, 0xe74c3c, -0.3, 1.75, 0);
  add(0.4, 0.14, 0.4, 0x3498db, 0.3, 1.75, 0);
  for (const [x, z] of [
    [-1.2, -0.9],
    [-1.2, 0.9],
    [1.3, -0.9],
    [1.3, 0.9],
  ] as const) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.26, 12), new THREE.MeshStandardMaterial({ color: 0x1c1c1c }));
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(x, 0.34, z);
    g.add(wheel);
  }
  return g;
}

/**
 * Sự cố — Thanh tra vệ sinh (từ ca 10).
 * Kích hoạt: một lần trong ca, một chiếc xe lạ đỗ trước quán.
 * Dấu hiệu: thông báo + đồng hồ đếm ngược trên xe, vài chỗ bẩn 🧽 hiện ra trong bếp và lối đi.
 * Khắc phục: chạy tới từng chỗ bẩn bấm E lau dọn cho hết trước khi thanh tra bước vào.
 * Hậu quả: còn chỗ bẩn khi thanh tra kiểm tra → phạt tiền (nặng theo số chỗ bẩn), mất rating, chủ quán bực.
 */
export class InspectorSystem {
  private readonly deps: InspectorDeps;
  private readonly offs: Array<() => void> = [];
  private state: InspectorState = 'idle';
  private readonly arriveAt: number | null;
  private elapsed = 0;
  private readonly countdown: Countdown;
  private car: THREE.Group | null = null;
  private carIcon: StatusIcon | null = null;
  private spots: DirtSpot[] = [];
  private body: Humanoid | null = null;
  private speech: SpeechBubble | null = null;
  private path: THREE.Vector3[] = [];
  private pathIndex = 0;
  private lookLeft = 0;
  private sped = false;
  private gangPresent = false;
  private fireTrouble = false;
  private powerOut = false;

  constructor(deps: InspectorDeps) {
    this.deps = deps;
    const { bus, cfg } = deps;
    this.arriveAt = Math.random() < cfg.inspectorChance ? randomIn(cfg.inspectorArriveSec) : null;
    this.countdown = new Countdown(cfg.inspectorWarnSec);
    this.offs.push(
      bus.on('gang:arrived', () => (this.gangPresent = true)),
      bus.on('gang:left', () => (this.gangPresent = false)),
      bus.on('fire:warning', () => (this.fireTrouble = true)),
      bus.on('fire:out', () => (this.fireTrouble = false)),
      bus.on('power:out', () => (this.powerOut = true)),
      bus.on('power:restored', () => (this.powerOut = false)),
    );
  }

  update(dt: number): void {
    const { cfg } = this.deps;
    this.elapsed += dt;
    this.speech?.update(dt);

    switch (this.state) {
      case 'idle':
        if (this.arriveAt !== null && this.elapsed >= this.arriveAt && !this.gangPresent && !this.fireTrouble && !this.powerOut) {
          this.startWarning();
        }
        break;
      case 'cleaning': {
        const left = this.countdown.remaining;
        this.carIcon?.show(`${DIALOGUES.inspectorCarLabel} ${Math.ceil(left)}s`, this.countdown.ratio, this.countdown.ratio < 0.3 ? 'bad blink' : 'warn');
        // Dọn sạch rồi thì khỏi chờ lâu
        if (this.spots.length === 0 && !this.sped && left > FAST_FORWARD_SEC) {
          this.sped = true;
          this.countdown.remaining = FAST_FORWARD_SEC;
        }
        if (this.countdown.tick(dt)) this.startEntering();
        break;
      }
      case 'entering':
        if (this.followPath(dt, cfg.inspectorWalkSpeed)) {
          this.state = 'inspecting';
          this.lookLeft = cfg.inspectorLookSec;
          this.body?.faceDirection(0, -1);
          this.speech?.say(pick(DIALOGUES.inspectorSay), cfg.inspectorLookSec);
        }
        break;
      case 'inspecting':
        this.body?.animate(dt, false);
        this.lookLeft -= dt;
        if (this.lookLeft <= 0) this.resolve();
        break;
      case 'leaving':
        if (this.followPath(dt, cfg.inspectorWalkSpeed)) {
          this.removeInspector();
          this.removeCar();
          this.state = 'done';
        }
        break;
      case 'done':
        break;
    }
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.clearSpots();
    this.removeInspector();
    this.removeCar();
  }

  private startWarning(): void {
    const { bus, cfg, labels, restaurant, scene } = this.deps;
    this.state = 'cleaning';
    this.countdown.reset(cfg.inspectorWarnSec);

    this.car = buildCar();
    this.car.position.copy(restaurant.inspectorCarPoint);
    scene.add(this.car);
    this.carIcon = new StatusIcon(labels, this.car, 2.4);

    // Rải vài chỗ bẩn ở các vị trí ngẫu nhiên
    const pool = [...restaurant.dirtSpots].sort(() => Math.random() - 0.5).slice(0, cfg.inspectorDirtSpots);
    for (const pos of pool) this.spots.push(this.makeSpot(pos));

    bus.emit('inspector:warning', { seconds: cfg.inspectorWarnSec, spots: this.spots.length });
    bus.emit('sfx', { sound: 'alarm' });
    bus.emit('toast', {
      text: fillLine(DIALOGUES.toastInspectorWarning, { sec: Math.round(cfg.inspectorWarnSec), n: this.spots.length }),
      kind: 'warn',
    });
  }

  private makeSpot(pos: THREE.Vector3): DirtSpot {
    const { cfg, labels, scene, interaction, bus } = this.deps;
    const mesh = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0x4a3426, transparent: true, opacity: 0.9 });
    for (const [dx, dz, r] of [
      [0, 0, 0.5],
      [0.35, 0.2, 0.28],
      [-0.3, -0.25, 0.22],
    ] as const) {
      const blob = new THREE.Mesh(new THREE.CircleGeometry(r, 14), mat);
      blob.rotation.x = -Math.PI / 2;
      blob.position.set(dx, 0.025, dz);
      mesh.add(blob);
    }
    mesh.position.set(pos.x, 0, pos.z);
    scene.add(mesh);
    const icon = new StatusIcon(labels, mesh, 1.1);
    icon.show(DIALOGUES.dirtIcon, null, 'warn');

    const spot: DirtSpot = { mesh, icon, off: () => undefined };
    spot.off = interaction.register({
      position: () => pos,
      range: cfg.interactRange * 0.85,
      action: () => (this.state === 'cleaning' ? DIALOGUES.actionClean : null),
      perform: () => {
        this.removeSpot(spot);
        bus.emit('sfx', { sound: 'scrub' });
        const n = this.spots.length;
        bus.emit('toast', {
          text: n > 0 ? fillLine(DIALOGUES.toastInspectorClean, { n }) : DIALOGUES.toastInspectorAllClean,
          kind: n > 0 ? 'info' : 'good',
        });
      },
    });
    return spot;
  }

  private removeSpot(spot: DirtSpot): void {
    spot.off();
    spot.icon.dispose();
    disposeTree(spot.mesh);
    this.spots = this.spots.filter((s) => s !== spot);
  }

  private clearSpots(): void {
    for (const s of [...this.spots]) this.removeSpot(s);
  }

  /** Hết giờ chuẩn bị: thanh tra bước vào, đi thẳng tới bếp */
  private startEntering(): void {
    const { bus, labels, restaurant, scene } = this.deps;
    this.carIcon?.hide();
    const body = new Humanoid({
      shirt: 0x74b9ff,
      pants: 0x2d3436,
      skin: 0xe8b98a,
      hat: 0x1e272e,
      hair: { style: 'short', color: 0x1b1b1b },
      shoes: 0x111111,
    });
    // Cái bảng kẹp giấy kiểm tra
    const clip = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.34, 0.025), new THREE.MeshStandardMaterial({ color: 0xc9a66b }));
    clip.position.set(0.2, 1.1, 0.42);
    clip.rotation.x = -0.4;
    body.upper.add(clip);
    body.group.position.copy(restaurant.doorOutside);
    scene.add(body.group);
    this.body = body;
    this.speech = new SpeechBubble(labels, body.group, 2.9);

    const route = restaurant.bossRoute;
    const door = route.findIndex((w) => w.stop === 'door');
    const kitchen = route.findIndex((w) => w.stop === 'kitchen');
    this.path = route.slice(door, kitchen + 1).map((w) => w.pos);
    this.pathIndex = 0;
    this.state = 'entering';
    bus.emit('toast', { text: DIALOGUES.toastInspectorArrived, kind: 'warn' });
  }

  /** Kiểm tra xong: còn bẩn thì phạt, sạch thì khen */
  private resolve(): void {
    const { bus, cfg, restaurant } = this.deps;
    const remaining = this.spots.length;
    const ok = remaining === 0;
    bus.emit('inspector:result', { ok, remaining });
    if (ok) {
      bus.emit('rating:change', { delta: cfg.ratingInspectorPass, reason: DIALOGUES.ratingReasonInspectorOk });
      bus.emit('toast', { text: DIALOGUES.toastInspectorPass, kind: 'good' });
      this.speech?.say(pick(DIALOGUES.inspectorPass), 2.5);
    } else {
      const fine = cfg.penaltyInspectorFine + cfg.penaltyInspectorPerSpot * remaining;
      bus.emit('salary:penalty', { amount: fine, reason: fillLine(DIALOGUES.reasonInspectorFine, { n: remaining }) });
      bus.emit('rating:change', { delta: cfg.ratingInspectorFail, reason: DIALOGUES.ratingReasonInspector });
      bus.emit('toast', { text: fillLine(DIALOGUES.toastInspectorFail, { n: remaining }), kind: 'bad' });
      this.speech?.say(pick(DIALOGUES.inspectorFail), 2.5);
    }
    this.clearSpots();
    // Đi ra theo đường cũ
    const route = restaurant.bossRoute;
    const door = route.findIndex((w) => w.stop === 'door');
    const kitchen = route.findIndex((w) => w.stop === 'kitchen');
    this.path = [
      ...route
        .slice(door, kitchen + 1)
        .map((w) => w.pos)
        .reverse(),
      restaurant.doorOutside,
    ];
    this.pathIndex = 0;
    this.state = 'leaving';
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

  private removeInspector(): void {
    this.speech?.dispose();
    this.body?.dispose();
    this.speech = null;
    this.body = null;
  }

  private removeCar(): void {
    this.carIcon?.dispose();
    this.carIcon = null;
    if (this.car) disposeTree(this.car);
    this.car = null;
  }
}
