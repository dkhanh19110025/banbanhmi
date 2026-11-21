import type { EventBus } from '../core/EventBus';
import { pick } from '../core/Random';
import { DIALOGUES } from '../data/dialogues';
import { SpeechBubble, type WorldLabels } from '../ui/DialogBubble';
import type { Player } from '../world/Player';

/** Không nói liên tục — tối thiểu bấy nhiêu giây giữa 2 câu (trừ câu ưu tiên) */
const VOICE_COOLDOWN_SEC = 1.6;
/** Xác suất lẩm bẩm khi đưa món (đừng nói mỗi lần cho đỡ phiền) */
const SERVE_CHATTER_CHANCE = 0.35;

/** Nhân vật chính phản ứng cà khịa với chuyện xảy ra (mục 8) */
export class PlayerVoice {
  private readonly speech: SpeechBubble;
  private readonly offs: Array<() => void> = [];
  private cooldown = 0;

  constructor(bus: EventBus, labels: WorldLabels, player: Player) {
    this.speech = new SpeechBubble(labels, player.group, 2.6, 'speech player-speech');
    const lines = DIALOGUES.player;
    this.offs.push(
      bus.on('boss:hit', () => this.say(pick(lines.slapped), true)),
      bus.on('salary:penalty', () => this.say(pick(lines.penalty))),
      bus.on('customer:runningAway', () => this.say(pick(lines.ranAway))),
      bus.on('cat:grabbed', () => this.say(pick(lines.catGrabbed), true)),
      bus.on('cat:scratch', () => this.say(pick(lines.catScratch), true)),
      bus.on('gang:arrived', () => this.say(pick(lines.gangArrived), true)),
      bus.on('audit:warning', () => this.say(pick(lines.auditWarning))),
      bus.on('order:served', () => {
        if (Math.random() < SERVE_CHATTER_CHANCE) this.say(pick(lines.served));
      }),
    );
  }

  update(dt: number): void {
    this.cooldown -= dt;
    this.speech.update(dt);
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.speech.dispose();
  }

  private say(text: string, urgent = false): void {
    if (!urgent && this.cooldown > 0) return;
    this.cooldown = VOICE_COOLDOWN_SEC;
    this.speech.say(text, 2);
  }
}
