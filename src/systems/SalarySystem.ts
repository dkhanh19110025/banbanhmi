import type { EventBus } from '../core/EventBus';
import type { ShiftConfig } from '../data/difficulty';

/** Lương và rating của ca. Lương về 0 → bị đuổi việc. */
export class SalarySystem {
  salary: number;
  rating: number;
  readonly mistakes: string[] = [];
  private readonly bus: EventBus;
  private readonly cfg: ShiftConfig;
  private fired = false;
  private readonly offs: Array<() => void> = [];

  constructor(bus: EventBus, cfg: ShiftConfig) {
    this.bus = bus;
    this.cfg = cfg;
    this.salary = cfg.startSalary;
    this.rating = cfg.startRating;

    this.offs.push(
      bus.on('salary:penalty', (p) => {
        this.salary = Math.max(0, this.salary - p.amount);
        this.mistakes.push(`-${p.amount}k · ${p.reason}`);
        this.emitStats();
        if (this.salary <= 0 && !this.fired) {
          this.fired = true;
          bus.emit('game:over', { ending: 'fired' });
        }
      }),
      bus.on('rating:change', (p) => {
        this.rating = Math.max(1, Math.min(5, this.rating + p.delta));
        this.mistakes.push(`${p.delta > 0 ? '+' : ''}${p.delta}★ · ${p.reason}`);
        this.emitStats();
      }),
    );
  }

  emitStats(): void {
    this.bus.emit('stats:changed', { salary: this.salary, maxSalary: this.cfg.startSalary, rating: this.rating });
  }

  dispose(): void {
    for (const off of this.offs) off();
  }
}
