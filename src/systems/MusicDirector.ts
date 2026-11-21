import type { EventBus, MusicLevel } from '../core/EventBus';

/** Thanh bực từ mức này trở lên → nhạc căng */
const ANGER_ALERT_RATIO = 0.8;

/**
 * Chọn nhạc nền theo độ nguy hiểm (mục 8: "nhạc nền đổi theo mức độ nguy hiểm"):
 * - danger: giang hồ trong quán, khách đang ôm mèo
 * - alert : có khách đang chuồn, chủ quán đang hỏi sổ, chủ quán sắp nổ, mèo sắp dậy / đi lang thang
 * - calm  : còn lại
 */
export class MusicDirector {
  private readonly bus: EventBus;
  private readonly offs: Array<() => void> = [];
  private level: MusicLevel = 'off';
  private gang = false;
  private catGrabbed = false;
  private catAlert = false;
  private runners = new Set<number>();
  private audit = false;
  private angerHigh = false;
  private over = false;

  constructor(bus: EventBus) {
    this.bus = bus;
    const recompute = (): void => this.recompute();
    this.offs.push(
      bus.on('gang:arrived', () => ((this.gang = true), recompute())),
      bus.on('gang:left', () => ((this.gang = false), recompute())),
      bus.on('cat:status', (c) => {
        const grabbed = c.status === 'grabbed';
        const alert = c.status === 'waking' || c.status === 'wandering';
        if (grabbed !== this.catGrabbed || alert !== this.catAlert) {
          this.catGrabbed = grabbed;
          this.catAlert = alert;
          recompute();
        }
      }),
      bus.on('customer:runningAway', (p) => (this.runners.add(p.customerId), recompute())),
      bus.on('customer:caught', (p) => (this.runners.delete(p.customerId), recompute())),
      bus.on('customer:ranAway', (p) => (this.runners.delete(p.customerId), recompute())),
      bus.on('audit:warning', () => ((this.audit = true), recompute())),
      bus.on('audit:result', () => ((this.audit = false), recompute())),
      bus.on('boss:anger', (a) => {
        const high = a.anger / a.max >= ANGER_ALERT_RATIO;
        if (high !== this.angerHigh) {
          this.angerHigh = high;
          recompute();
        }
      }),
      bus.on('game:over', () => {
        this.over = true;
        this.level = 'off';
      }),
    );
    this.recompute();
  }

  dispose(): void {
    for (const off of this.offs) off();
  }

  private recompute(): void {
    if (this.over) return;
    let next: MusicLevel = 'calm';
    if (this.gang || this.catGrabbed) next = 'danger';
    else if (this.runners.size > 0 || this.audit || this.angerHigh || this.catAlert) next = 'alert';
    if (next === this.level) return;
    this.level = next;
    this.bus.emit('music:level', { level: next });
  }
}
