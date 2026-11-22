import type { EventBus, MusicLevel, SoundId } from '../core/EventBus';
import { loadSettings, type Settings, writeSettings } from '../core/Storage';

const MASTER_VOLUME = 0.5;
const MUSIC_BASE_VOLUME = 0.35;
/** Lên lịch nốt nhạc trước bấy nhiêu giây (chống giật khi tab bận) */
const SCHEDULE_AHEAD_SEC = 0.15;
const SCHEDULER_INTERVAL_MS = 40;
const STEPS_PER_BAR = 16;

interface MusicStyle {
  bpm: number;
  /** Mỗi ô nhịp một hợp âm: [nốt bass, ...nốt hợp âm] theo số MIDI */
  progression: readonly (readonly number[])[];
  /** Thang nốt cho giai điệu ngẫu nhiên (rỗng = không có giai điệu) */
  lead: readonly number[];
  leadChance: number;
  kickSteps: readonly number[];
  hatEvery: number;
  bassSteps: readonly number[];
  pad: boolean;
  stabSteps: readonly number[];
}

// Nhạc nền đổi theo mức nguy hiểm (mục 8)
const STYLES: Record<Exclude<MusicLevel, 'off'>, MusicStyle> = {
  // Lo-fi quán xá: C – Am – F – G
  calm: {
    bpm: 92,
    progression: [
      [48, 60, 64, 67],
      [45, 57, 60, 64],
      [41, 57, 60, 65],
      [43, 55, 59, 62],
    ],
    lead: [72, 74, 76, 79, 81],
    leadChance: 0.18,
    kickSteps: [0, 10],
    hatEvery: 4,
    bassSteps: [0, 6, 8],
    pad: true,
    stabSteps: [],
  },
  // Có chuyện: nhanh hơn, giọng thứ
  alert: {
    bpm: 112,
    progression: [
      [45, 57, 60, 64],
      [41, 57, 60, 65],
      [48, 60, 64, 67],
      [43, 55, 59, 62],
    ],
    lead: [69, 72, 74, 76, 79],
    leadChance: 0.3,
    kickSteps: [0, 4, 8, 12],
    hatEvery: 2,
    bassSteps: [0, 2, 4, 6, 8, 10, 12, 14],
    pad: true,
    stabSteps: [],
  },
  // Giang hồ / mất mèo: trống dồn, hợp âm giật
  danger: {
    bpm: 132,
    progression: [
      [38, 50, 53, 57],
      [38, 50, 53, 57],
      [46, 50, 53, 58],
      [45, 49, 52, 57],
    ],
    lead: [],
    leadChance: 0,
    kickSteps: [0, 4, 8, 12, 14],
    hatEvery: 1,
    bassSteps: [0, 2, 4, 6, 8, 10, 12, 14],
    pad: false,
    stabSteps: [0, 3, 10],
  },
};

function midiToHz(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

/**
 * Âm thanh + nhạc nền tổng hợp bằng WebAudio (chưa có file âm thanh thật).
 * Khi có file trong public/sounds thì thay phần play() bằng Howler.js.
 */
export class SoundSystem {
  readonly settings: Settings = loadSettings();
  private ctx: AudioContext | null = null;
  private noise: AudioBuffer | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private music: MusicLevel = 'off';
  private schedTimer: number | null = null;
  private nextStepTime = 0;
  private step = 0;

  constructor() {
    // Trình duyệt chỉ cho phát tiếng sau thao tác đầu tiên của người chơi
    const unlock = (): void => {
      this.ensureContext();
      void this.ctx?.resume();
    };
    window.addEventListener('keydown', unlock);
    window.addEventListener('pointerdown', unlock);
  }

  get muted(): boolean {
    return this.settings.muted;
  }

  /** Gắn vào bus của ca mới */
  attach(bus: EventBus): void {
    bus.on('sfx', (s) => this.play(s.sound, s.volume ?? 1));
    bus.on('music:level', (m) => this.setMusic(m.level));
    bus.on('game:over', (g) => {
      // Nhạc tắt rụp (mục 8)
      this.setMusic('off');
      if (g.ending === 'hospital' || g.ending === 'kitchenFire') this.play('siren');
    });
    bus.on('customer:paid', () => this.play('ding'));
    bus.on('boss:hit', () => this.play('slap'));
    bus.on('fx:slap', () => this.play('slap'));
    bus.on('order:taken', () => this.play('pop'));
    bus.on('kitchen:cooked', () => this.play('bell'));
    bus.on('notebook:write', () => this.play('write'));
  }

  toggleMute(): boolean {
    this.settings.muted = !this.settings.muted;
    writeSettings(this.settings);
    this.applyVolume();
    return this.settings.muted;
  }

  /** Tạm dừng game: im hết, chạy tiếp thì phát lại */
  setPaused(paused: boolean): void {
    if (!this.ctx) return;
    void (paused ? this.ctx.suspend() : this.ctx.resume());
  }

  setMusic(level: MusicLevel): void {
    if (level === this.music) return;
    const wasOff = this.music === 'off';
    this.music = level;
    if (level === 'off') {
      this.stopScheduler();
      return;
    }
    if (wasOff) this.startScheduler();
  }

  play(id: SoundId, volume = 1): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || !this.sfxBus) return;
    const out = this.sfxBus;
    const t = ctx.currentTime;
    switch (id) {
      case 'flipflop':
        // "lẹp… xẹp": hai tiếng vỗ ngắn
        this.noiseBurst(out, t, 0.04, 1400, volume * 0.6);
        this.noiseBurst(out, t + 0.09, 0.05, 900, volume * 0.5);
        break;
      case 'slap':
        this.noiseBurst(out, t, 0.12, 2500, volume * 1.2);
        this.tone(out, t, 'sine', 140, 50, 0.18, volume);
        break;
      case 'giggle':
        for (let i = 0; i < 4; i++) this.tone(out, t + i * 0.09, 'square', 700 + i * 90, 900 + i * 90, 0.06, volume * 0.15);
        break;
      case 'ding':
        this.tone(out, t, 'sine', 1320, 1320, 0.12, volume * 0.3);
        this.tone(out, t + 0.1, 'sine', 1760, 1760, 0.2, volume * 0.3);
        break;
      case 'bell':
        this.tone(out, t, 'triangle', 1568, 1560, 0.4, volume * 0.25);
        break;
      case 'pop':
        this.tone(out, t, 'sine', 500, 900, 0.06, volume * 0.25);
        break;
      case 'write':
        // Sột soạt bút chì
        for (let i = 0; i < 3; i++) this.noiseBurst(out, t + i * 0.08, 0.05, 5000, volume * 0.25);
        break;
      case 'sizzle':
        this.noiseBurst(out, t, 1.2, 6000, volume * 0.15);
        break;
      case 'alarm':
        this.tone(out, t, 'sawtooth', 500, 180, 0.35, volume * 0.2);
        break;
      case 'meow':
        this.tone(out, t, 'triangle', 650, 900, 0.12, volume * 0.25);
        this.tone(out, t + 0.12, 'triangle', 900, 520, 0.25, volume * 0.25);
        break;
      case 'scratch':
        for (let i = 0; i < 3; i++) this.noiseBurst(out, t + i * 0.07, 0.06, 4500, volume * 0.7);
        break;
      case 'doorKick':
        this.tone(out, t, 'sine', 90, 35, 0.35, volume * 1.2);
        this.noiseBurst(out, t, 0.2, 600, volume * 1.2);
        break;
      case 'punch':
        for (let i = 0; i < 4; i++) {
          this.tone(out, t + i * 0.12, 'sine', 160, 50, 0.12, volume);
          this.noiseBurst(out, t + i * 0.12, 0.08, 1800, volume * 0.8);
        }
        break;
      case 'honk':
        // Bíp bíp của xe máy shipper
        this.tone(out, t, 'square', 520, 520, 0.12, volume * 0.14);
        this.tone(out, t + 0.17, 'square', 640, 640, 0.16, volume * 0.14);
        break;
      case 'crackle':
        // Dầu xèo xèo, tí tách
        for (let i = 0; i < 6; i++) this.noiseBurst(out, t + i * 0.06 + Math.random() * 0.03, 0.04, 3000 + Math.random() * 3000, volume * 0.5);
        break;
      case 'splash':
        this.noiseBurst(out, t, 0.5, 1200, volume * 0.8);
        this.tone(out, t, 'sine', 220, 70, 0.4, volume * 0.5);
        break;
      case 'scrub':
        for (let i = 0; i < 4; i++) this.noiseBurst(out, t + i * 0.07, 0.06, 2800, volume * 0.3);
        break;
      case 'powerDown':
        this.tone(out, t, 'sawtooth', 320, 50, 0.7, volume * 0.2);
        break;
      case 'powerUp':
        this.tone(out, t, 'square', 180, 820, 0.45, volume * 0.14);
        break;
      case 'generator':
        for (let i = 0; i < 4; i++) this.tone(out, t + i * 0.18, 'sawtooth', 70, 120, 0.15, volume * 0.25);
        break;
      case 'siren':
        // Xe cứu thương: hai nốt luân phiên
        for (let i = 0; i < 6; i++) {
          const f = i % 2 === 0 ? 960 : 770;
          this.tone(out, t + 0.5 + i * 0.35, 'square', f, f, 0.33, volume * 0.12);
        }
        break;
    }
  }

  // ---------- Nhạc nền ----------

  private startScheduler(): void {
    this.stopScheduler();
    this.step = 0;
    this.nextStepTime = this.ctx ? this.ctx.currentTime + 0.05 : 0;
    this.schedTimer = window.setInterval(() => this.schedule(), SCHEDULER_INTERVAL_MS);
  }

  private stopScheduler(): void {
    if (this.schedTimer !== null) window.clearInterval(this.schedTimer);
    this.schedTimer = null;
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || this.music === 'off') return;
    // Tab bị treo lâu thì nhảy tới hiện tại, không phát dồn
    if (this.nextStepTime < ctx.currentTime - 0.2) this.nextStepTime = ctx.currentTime + 0.02;
    while (this.nextStepTime < ctx.currentTime + SCHEDULE_AHEAD_SEC) {
      const style = STYLES[this.music];
      this.playStep(style, this.step, this.nextStepTime);
      this.nextStepTime += 60 / style.bpm / 4;
      this.step++;
    }
  }

  private playStep(style: MusicStyle, step: number, t: number): void {
    const out = this.musicBus;
    if (!out) return;
    const s = step % STEPS_PER_BAR;
    const chord = style.progression[Math.floor(step / STEPS_PER_BAR) % style.progression.length];
    const stepDur = 60 / style.bpm / 4;

    if (style.kickSteps.includes(s)) this.tone(out, t, 'sine', 120, 40, 0.16, 0.7);
    if (s % style.hatEvery === 0) this.noiseBurst(out, t, 0.03, 8000, s % 4 === 2 ? 0.12 : 0.06);
    if (style.bassSteps.includes(s)) this.tone(out, t, 'triangle', midiToHz(chord[0]), midiToHz(chord[0]), stepDur * 1.8, 0.35);
    if (style.pad && s === 0) {
      for (const n of chord.slice(1)) this.tone(out, t, 'sine', midiToHz(n), midiToHz(n), stepDur * STEPS_PER_BAR, 0.05);
    }
    if (style.stabSteps.includes(s)) {
      for (const n of chord.slice(1)) this.tone(out, t, 'square', midiToHz(n), midiToHz(n), stepDur * 1.2, 0.035);
    }
    if (style.lead.length > 0 && s % 2 === 0 && Math.random() < style.leadChance) {
      const n = style.lead[Math.floor(Math.random() * style.lead.length)];
      this.tone(out, t, 'triangle', midiToHz(n), midiToHz(n), stepDur * 2.5, 0.1);
    }
  }

  // ---------- Hạ tầng ----------

  private ensureContext(): void {
    if (this.ctx) return;
    const ctx = new AudioContext();
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.connect(this.master);
    // Bộ đệm tiếng ồn trắng dùng chung
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buffer;
    this.ctx = ctx;
    this.applyVolume();
    if (this.music !== 'off') this.startScheduler();
  }

  private applyVolume(): void {
    if (this.master) this.master.gain.value = this.settings.muted ? 0 : MASTER_VOLUME;
    if (this.musicBus) this.musicBus.gain.value = this.settings.musicVolume * MUSIC_BASE_VOLUME;
  }

  private noiseBurst(out: AudioNode, start: number, duration: number, freq: number, volume: number): void {
    if (!this.ctx || !this.noise) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    src.connect(filter).connect(gain).connect(out);
    src.start(start);
    src.stop(start + duration);
  }

  private tone(
    out: AudioNode,
    start: number,
    type: OscillatorType,
    from: number,
    to: number,
    duration: number,
    volume: number,
  ): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, start);
    osc.frequency.exponentialRampToValueAtTime(to, start + duration);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    osc.connect(gain).connect(out);
    osc.start(start);
    osc.stop(start + duration);
  }
}
