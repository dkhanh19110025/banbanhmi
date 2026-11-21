import type { EventBus } from '../core/EventBus';
import { DIALOGUES } from '../data/dialogues';
import type { ScreenFx } from '../ui/ScreenFx';

/** Biến sự kiện xấu thành hậu quả cường điệu: rung màn hình, chữ to, trừ tiền bay lên */
export class ConsequenceSystem {
  private readonly offs: Array<() => void> = [];

  constructor(bus: EventBus, fx: ScreenFx) {
    this.offs.push(
      bus.on('fx:slap', (p) => {
        fx.shake(0.7);
        fx.bigText(p.text, 'slap');
      }),
      // Chủ quán tát trúng: hậu quả nhẹ = trừ lương + màn hình BỐP
      bus.on('boss:hit', (p) => {
        fx.shake(0.9);
        fx.flash();
        fx.slapHand();
        fx.bigText(DIALOGUES.slap, 'slap');
        if (p.amount > 0) bus.emit('salary:penalty', { amount: p.amount, reason: p.reason });
      }),
      bus.on('cat:scratch', () => fx.shake(0.3)),
      bus.on('customer:ranAway', () => fx.shake(0.25)),
      bus.on('gang:arrived', () => fx.shake(0.6)),
      // Giang hồ đánh: hậu quả nặng = nhập viện, kết thúc ca
      bus.on('gang:beatUp', () => {
        fx.shake(1.5);
        fx.flash();
        bus.emit('sfx', { sound: 'punch' });
        bus.emit('game:over', { ending: 'hospital' });
      }),
      bus.on('salary:penalty', (p) => fx.floatText(`-${p.amount}k`)),
      bus.on('game:over', (p) => {
        fx.shake(1.2);
        fx.bigText(DIALOGUES.endings[p.ending].title, 'fired');
      }),
    );
  }

  dispose(): void {
    for (const off of this.offs) off();
  }
}
