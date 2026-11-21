/** Bộ đếm ngược dùng chung (kiên nhẫn của khách, thời gian ăn, ...) */
export class Countdown {
  duration: number;
  remaining: number;

  constructor(duration: number) {
    this.duration = duration;
    this.remaining = duration;
  }

  /** Trả về true khi hết giờ */
  tick(dt: number): boolean {
    this.remaining = Math.max(0, this.remaining - dt);
    return this.remaining <= 0;
  }

  reset(duration: number = this.duration): void {
    this.duration = duration;
    this.remaining = duration;
  }

  get ratio(): number {
    return this.duration > 0 ? this.remaining / this.duration : 0;
  }

  get done(): boolean {
    return this.remaining <= 0;
  }
}
