import * as THREE from 'three';
import { planShift, type ShiftPlan } from '../data/difficulty';
import { SoundSystem } from '../systems/SoundSystem';
import { WorldLabels } from '../ui/DialogBubble';
import { Hud } from '../ui/Hud';
import { IntroScreen } from '../ui/IntroScreen';
import { Notebook } from '../ui/Notebook';
import { PauseMenu } from '../ui/PauseMenu';
import { ReviewScreen } from '../ui/ReviewScreen';
import { ScreenFx } from '../ui/ScreenFx';
import { Orientation } from '../ui/Orientation';
import { ShiftBriefing } from '../ui/ShiftBriefing';
import { TouchControls } from '../ui/TouchControls';
import { FollowCamera } from '../world/FollowCamera';
import { Player } from '../world/Player';
import { Restaurant } from '../world/Restaurant';
import { Input } from './Input';
import { ADAPTIVE, IS_TOUCH, QUALITY } from './Quality';
import { Shift, type ShiftResult } from './Shift';
import { loadSave, recordEnding, type SaveData, writeSave } from './Storage';

const MAX_DT = 0.05;
/** Chờ chút cho hiệu ứng tát/đuổi diễn xong rồi mới hiện màn kết quả */
const FIRED_SCREEN_DELAY = 1.1;
const END_SCREEN_DELAY = 0.3;
/** Nhập viện: chờ xe cứu thương hú một lúc */
const HOSPITAL_SCREEN_DELAY = 2;

type Phase = 'intro' | 'briefing' | 'playing' | 'paused' | 'ending' | 'review';

/** Thử nhanh một ca: http://localhost:5173/?ca=3 (ca 2 có chủ quán, ca 3 có khách quỵt…) */
function startDayFromUrl(): number | null {
  const n = Number(new URLSearchParams(window.location.search).get('ca'));
  return Number.isInteger(n) && n >= 1 ? n : null;
}

/** Quản lý tổng: renderer, cảnh, vòng lặp, chuyển màn, chuyển ca */
export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly follow: FollowCamera;
  private readonly restaurant = new Restaurant();
  private readonly player = new Player();
  private readonly input = new Input();
  private readonly labels: WorldLabels;
  private readonly hud: Hud;
  private readonly notebook: Notebook;
  private readonly review: ReviewScreen;
  private readonly intro: IntroScreen;
  private readonly briefing: ShiftBriefing;
  private readonly pause: PauseMenu;
  private readonly fx: ScreenFx;
  private readonly touch: TouchControls | null;
  private readonly orientation: Orientation;
  private readonly sound = new SoundSystem();
  private readonly save: SaveData = loadSave();
  private shift: Shift | null = null;
  /** Kế hoạch ca đang chơi — chơi lại dùng đúng kế hoạch này */
  private plan: ShiftPlan = planShift(1);
  private phase: Phase = 'intro';
  private pendingScreen: { delay: number; show: () => void } | null = null;
  private lastTime = performance.now();
  private pixelRatio = 1;
  /** Đo FPS để tự hạ/nâng độ phân giải */
  private fpsFrames = 0;
  private fpsTime = 0;
  /** Bóng nhân vật di chuyển: vẽ lại bản đồ bóng cách khung (điện thoại) cho nhẹ */
  private shadowTick = 0;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: QUALITY.antialias, powerPreference: 'high-performance' });
    this.pixelRatio = Math.min(window.devicePixelRatio, QUALITY.maxPixelRatio);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = QUALITY.softShadows ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    // Quán không đổi sau khi dựng: chỉ vẽ lại bản đồ bóng khi cần, xem frame()
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    container.appendChild(this.renderer.domElement);

    const ui = document.createElement('div');
    ui.className = 'ui-root';
    container.appendChild(ui);
    const labelsRoot = document.createElement('div');
    labelsRoot.className = 'labels-root';
    const fxRoot = document.createElement('div');
    fxRoot.className = 'fx-root';
    ui.append(labelsRoot, fxRoot);

    this.labels = new WorldLabels(labelsRoot);
    this.hud = new Hud(ui);
    this.notebook = new Notebook(ui);
    this.review = new ReviewScreen(ui);
    this.briefing = new ShiftBriefing(ui);
    this.pause = new PauseMenu(ui);
    this.intro = new IntroScreen(ui);
    this.fx = new ScreenFx(fxRoot);
    this.touch = IS_TOUCH ? new TouchControls(ui, this.input) : null;
    // Điện thoại bị xoay dọc giữa ca → tạm dừng (bảng "xoay ngang" che màn)
    this.orientation = new Orientation(ui, () => this.setPaused(true));
    this.hud.setMuted(this.sound.muted);

    this.camera = new THREE.PerspectiveCamera(65, 1, 0.05, 200);
    this.follow = new FollowCamera(this.camera, this.restaurant.cameraBlockers);

    // Giữ chuột (trái hoặc phải) rồi kéo để xoay hướng nhìn
    this.input.attachDragLook(this.renderer.domElement);
    this.scene.background = new THREE.Color(0x87b5d9);
    this.setupLights();
    this.scene.add(this.restaurant.root, this.player.group);

    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.showIntro(startDayFromUrl() ?? this.save.unlockedDay);
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private setupLights(): void {
    this.scene.add(new THREE.HemisphereLight(0xfff4e0, 0x6b5a45, 1.2 + QUALITY.hemiBoost));
    const sun = new THREE.DirectionalLight(0xfff1dc, 1.7);
    sun.position.set(8, 18, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(QUALITY.shadowMapSize, QUALITY.shadowMapSize);
    const s = sun.shadow.camera;
    s.left = -16;
    s.right = 16;
    s.top = 16;
    s.bottom = -16;
    s.far = 60;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);
  }

  // ---------- Chuyển màn ----------

  /** Màn chính: quán hiện phía sau, chưa có khách */
  private showIntro(day: number): void {
    this.endCurrentShift();
    this.phase = 'intro';
    this.player.reset(this.restaurant.playerSpawn);
    this.snapCamera();
    this.sound.setMusic('calm');
    this.intro.show(day, this.save, (d) => this.beginDay(d));
  }

  /** Bốc kế hoạch ca mới rồi hiện thẻ giới thiệu ca */
  private beginDay(day: number): void {
    this.endCurrentShift();
    this.review.hide();
    this.plan = planShift(day);
    this.phase = 'briefing';
    this.player.reset(this.restaurant.playerSpawn);
    this.snapCamera();
    this.briefing.show(this.plan, () => this.startShift(this.plan));
  }

  /** Vào ca ngay (dùng cho chơi lại: không qua thẻ giới thiệu, dưới 2 giây) */
  private startShift(plan: ShiftPlan): void {
    this.endCurrentShift();
    this.review.hide();
    this.briefing.hide();
    this.pause.hide();
    this.sound.setPaused(false);
    this.plan = plan;
    this.player.reset(this.restaurant.playerSpawn);
    this.snapCamera();
    this.shift = new Shift({
      plan,
      scene: this.scene,
      restaurant: this.restaurant,
      player: this.player,
      labels: this.labels,
      hud: this.hud,
      notebook: this.notebook,
      fx: this.fx,
      sound: this.sound,
      onFinish: (r) => this.onShiftFinished(r),
    });
    this.phase = 'playing';
  }

  private retry(): void {
    this.startShift(this.plan);
  }

  private endCurrentShift(): void {
    this.hud.setVisible(false);
    this.shift?.dispose();
    this.shift = null;
    this.fx.clear();
    this.pendingScreen = null;
    this.notebook.setOpen(false);
  }

  private setPaused(paused: boolean): void {
    if (paused && this.phase !== 'playing') return;
    if (!paused && this.phase !== 'paused') return;
    this.phase = paused ? 'paused' : 'playing';
    this.sound.setPaused(paused);
    if (!paused) {
      this.pause.hide();
        return;
    }
    this.notebook.setOpen(false);
    this.pause.show(this.sound.muted, {
      onResume: () => this.setPaused(false),
      onRetry: () => this.retry(),
      onToggleSound: () => this.toggleMute(),
      onHome: () => {
        this.pause.hide();
        this.sound.setPaused(false);
        this.showIntro(this.plan.day);
      },
    });
  }

  private toggleMute(): boolean {
    const muted = this.sound.toggleMute();
    this.hud.setMuted(muted);
    this.pause.updateSound(muted);
    return muted;
  }

  private onShiftFinished(result: ShiftResult): void {
    const { summary } = result;
    const day = this.plan.day;
    this.phase = 'ending';
    this.notebook.setOpen(false);
    this.save.timesSlapped += summary.slaps;
    this.save.bestDay = Math.max(this.save.bestDay, day);
    if (result.kind === 'gameover') {
      const ending = result.ending;
      recordEnding(this.save, ending);
      writeSave(this.save);
      this.pendingScreen = {
        delay: ending === 'hospital' ? HOSPITAL_SCREEN_DELAY : FIRED_SCREEN_DELAY,
        show: () => this.review.showGameOver(ending, summary, this.save, () => this.retry()),
      };
      return;
    }
    const isRecord = summary.salary > this.save.bestSalary;
    this.save.shiftsCompleted++;
    this.save.bestSalary = Math.max(this.save.bestSalary, summary.salary);
    this.save.unlockedDay = Math.max(this.save.unlockedDay, day + 1);
    writeSave(this.save);
    this.pendingScreen = {
      delay: END_SCREEN_DELAY,
      show: () =>
        this.review.showShiftEnd(summary, isRecord, {
          onNext: () => this.beginDay(day + 1),
          onRetry: () => this.retry(),
        }),
    };
  }

  // ---------- Vòng lặp ----------

  private frame(): void {
    const now = performance.now();
    const rawDt = (now - this.lastTime) / 1000;
    const dt = Math.min(MAX_DT, rawDt);
    this.lastTime = now;
    this.handleGlobalKeys();
    this.touch?.setVisible(this.phase === 'playing' && !this.orientation.isPortrait);

    if (this.phase !== 'paused') {
      const canAct =
        (this.phase === 'playing' || this.phase === 'ending') && !this.notebook.isOpen && !this.player.isStunned;
      const axis = canAct ? this.input.moveAxis() : { forward: 0, right: 0 };
      const move = this.follow.toWorld(axis.forward, axis.right);
      this.player.facingLock = this.follow.mode === 'first' && canAct ? this.follow.yaw : null;
      this.player.update(dt, move, this.shift?.cfg.playerSpeed ?? 6, this.restaurant.colliders);
      // Đang ghi sổ là đang làm việc, không tính là đứng không
      if (this.notebook.isOpen) this.player.markActive();

      if (this.phase === 'playing') {
        this.shift?.update(dt, canAct && this.input.wasPressed('KeyE'), canAct && this.input.isDown('KeyE'));
      }
      if (this.pendingScreen) {
        this.pendingScreen.delay -= dt;
        if (this.pendingScreen.delay <= 0) {
          this.pendingScreen.show();
          this.pendingScreen = null;
          this.phase = 'review';
        }
      }
      this.hud.update(dt);
      this.fx.update(dt);
    }

    this.updateCamera(dt);
    this.labels.update(this.camera, window.innerWidth, window.innerHeight);
    // Bóng: máy tính vẽ mỗi khung, điện thoại cách 1 khung (người đi chậm nên không thấy giật)
    this.shadowTick = (this.shadowTick + 1) % (IS_TOUCH ? 2 : 1);
    if (this.shadowTick === 0) this.renderer.shadowMap.needsUpdate = true;
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
    this.adaptResolution(rawDt);
  }

  /** Lag thì hạ độ phân giải từng bậc, mượt lâu thì nâng lại (không vượt mức của thiết bị) */
  private adaptResolution(dt: number): void {
    // Khung bị treo (chuyển tab, khóa máy…) không phải do lag: bỏ đợt đo này
    if (this.phase !== 'playing' || dt > ADAPTIVE.stallSec) {
      this.fpsFrames = 0;
      this.fpsTime = 0;
      return;
    }
    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime < ADAPTIVE.windowSec) return;
    const fps = this.fpsFrames / this.fpsTime;
    this.fpsFrames = 0;
    this.fpsTime = 0;
    const max = Math.min(window.devicePixelRatio, QUALITY.maxPixelRatio);
    let next = this.pixelRatio;
    if (fps < ADAPTIVE.lowFps) next = Math.max(QUALITY.minPixelRatio, next - ADAPTIVE.step);
    else if (fps > ADAPTIVE.highFps) next = Math.min(max, next + ADAPTIVE.step / 2);
    if (Math.abs(next - this.pixelRatio) < 0.01) return;
    this.pixelRatio = next;
    this.renderer.setPixelRatio(next);
    this.resize();
  }

  private handleGlobalKeys(): void {
    if (this.input.wasPressed('KeyM')) this.toggleMute();
    const pauseKey = this.input.wasPressed('Escape') || this.input.wasPressed('KeyP');
    if (this.phase === 'paused') {
      if (pauseKey) this.setPaused(false);
      return;
    }
    if (this.phase !== 'playing') return;
    if (this.input.wasPressed('KeyN')) {
      this.notebook.toggle();
    } else if (!this.notebook.isOpen && this.input.wasPressed('KeyV')) {
      this.toggleView();
    } else if (pauseKey) {
      // Esc đóng sổ trước, đóng rồi mới tạm dừng
      if (this.notebook.isOpen) this.notebook.setOpen(false);
      else this.setPaused(true);
    }
  }

  private updateCamera(dt: number): void {
    const { dx, dy } = this.input.consumeMouse();
    if (this.phase === 'playing' && !this.notebook.isOpen) this.follow.rotate(dx, dy);
    this.follow.update(dt, this.player.position, this.fx.shakeOffset);
  }

  /** Đặt camera ngay sau lưng nhân viên, nhìn theo hướng nhân viên đang quay */
  private snapCamera(): void {
    this.follow.reset(this.player.group.rotation.y);
    this.follow.update(0, this.player.position, this.fx.shakeOffset, true);
  }

  private toggleView(): void {
    const mode = this.follow.toggleMode();
    this.player.body.setHeadVisible(mode === 'third');
    this.hud.setViewMode(mode);
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
