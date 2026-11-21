import { BOSS_FROM_DAY, type ShiftPlan } from '../data/difficulty';
import { DIALOGUES, fillLine } from '../data/dialogues';

type NewTodayDay = keyof typeof DIALOGUES.newToday;

function newTodayLine(day: number): string {
  const key = day as NewTodayDay;
  return DIALOGUES.newToday[key] ?? DIALOGUES.briefing.mixed;
}

/**
 * Thẻ ngắn trước mỗi ca: ca số mấy, tâm trạng chủ quán, sự kiện ngày, tình huống mới.
 * Không hiện khi bấm chơi lại (chơi lại phải dưới 2 giây).
 */
export class ShiftBriefing {
  private readonly root: HTMLDivElement;
  private onStart: (() => void) | null = null;
  /** Chỉ nhận phím sau khi đã nhả phím (Enter ở màn trước không được "xuyên" qua thẻ này) */
  private armed = false;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'briefing';
    parent.appendChild(this.root);
    window.addEventListener('keyup', () => (this.armed = true));
    window.addEventListener('keydown', (e) => {
      if (!this.onStart || !this.armed) return;
      if (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter') {
        e.preventDefault();
        this.start();
      }
    });
  }

  get visible(): boolean {
    return this.onStart !== null;
  }

  show(plan: ShiftPlan, onStart: () => void): void {
    const t = DIALOGUES.briefing;
    const mood = plan.day >= BOSS_FROM_DAY ? DIALOGUES.moodNames[plan.mood.id] : t.noBoss;
    const event = plan.event ? DIALOGUES.dayEvents[plan.event.id] : null;
    this.root.innerHTML = `
      <div class="bf-card">
        <h1>${fillLine(t.title, { day: plan.day })}</h1>
        <div class="bf-rows">
          <div class="bf-row"><span>😤 ${t.moodLabel}</span><b>${mood}</b></div>
          <div class="bf-row ${event ? 'bf-event' : ''}">
            <span>📅 ${t.eventLabel}</span>
            <b>${event ? `${event.name}<small>${event.desc}</small>` : t.noEvent}</b>
          </div>
        </div>
        <div class="bf-new"><div class="bf-new-title">${t.newLabel}</div>${newTodayLine(plan.day)}</div>
        <button class="bf-start">${t.start} <small>${t.startHint}</small></button>
      </div>`;
    this.root.querySelector('.bf-start')?.addEventListener('click', () => this.start());
    this.root.classList.add('show');
    this.onStart = onStart;
    this.armed = false;
  }

  hide(): void {
    this.onStart = null;
    this.root.classList.remove('show');
  }

  private start(): void {
    const cb = this.onStart;
    if (!cb) return;
    this.hide();
    cb();
  }
}
