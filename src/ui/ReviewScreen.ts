import type { EndingId } from '../core/EventBus';
import { pick } from '../core/Random';
import { endingCount, type SaveData } from '../core/Storage';
import { DIALOGUES, endingComment, fillLine } from '../data/dialogues';
import { formatMoney } from '../data/menu';

export interface ShiftSummary {
  day: number;
  baseSalary: number;
  /** Giây đã làm trong ca (để biết "chết đúng lúc sắp hết ca") */
  elapsed: number;
  total: number;
  salary: number;
  rating: number;
  served: number;
  angry: number;
  ranAway: number;
  slaps: number;
  mistakes: readonly string[];
}

export interface ReviewActions {
  onNext: () => void;
  onRetry: () => void;
}

/** "Chết" trong bấy nhiêu giây cuối ca thì có câu riêng */
const LAST_SECONDS_WINDOW = 20;
/** Từ lần toang thứ mấy thì nhắc "bạn có thấy quen không" */
const MANY_DEATHS = 10;
const MAX_STAT_REVIEWS = 3;
const MANY_SERVED = 8;

/** Điểm 0..100 = lương còn lại × rating */
export function shiftScore(s: ShiftSummary): number {
  return Math.round((s.salary / s.baseSalary) * (s.rating / 5) * 100);
}

function gradeOf(score: number): (typeof DIALOGUES.grades)[number] {
  return DIALOGUES.grades.find((g) => score >= g.min) ?? DIALOGUES.grades[DIALOGUES.grades.length - 1];
}

/** Review khách theo đúng chuyện đã xảy ra trong ca */
function statReviews(s: ShiftSummary): string[] {
  const r = DIALOGUES.statReviews;
  const out: string[] = [];
  if (s.ranAway > 0) out.push(pick(r.ranAway));
  if (s.slaps > 0) out.push(pick(r.slaps));
  if (s.angry > 0) out.push(pick(r.angry));
  if (s.served >= MANY_SERVED) out.push(pick(r.served));
  if (s.mistakes.length === 0) out.push(pick(r.perfect));
  if (out.length === 0) {
    const pool = s.rating >= 4 ? DIALOGUES.reviewsGood : s.rating >= 2.5 ? DIALOGUES.reviewsMid : DIALOGUES.reviewsBad;
    out.push(pick(pool));
  }
  return out.slice(0, MAX_STAT_REVIEWS);
}

/** Câu riêng cho "chết đúng chỗ khó" (mục 8) */
function deathContextLine(s: ShiftSummary, totalDeaths: number): string | null {
  const c = DIALOGUES.deathContext;
  const left = Math.ceil(s.total - s.elapsed);
  if (left <= LAST_SECONDS_WINDOW) return fillLine(c.lastSeconds, { sec: left });
  if (totalDeaths === 1) return c.firstEver;
  if (s.day === 1) return c.firstDay;
  if (totalDeaths >= MANY_DEATHS && totalDeaths % 5 === 0) return fillLine(c.manyTimes, { times: totalDeaths });
  return null;
}

/** Màn cuối ca và màn Game Over. Chơi lại bằng một phím. */
export class ReviewScreen {
  private readonly root: HTMLDivElement;
  private actions: { primary: () => void; secondary: (() => void) | null } | null = null;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'review';
    parent.appendChild(this.root);
    window.addEventListener('keydown', (e) => {
      if (!this.actions) return;
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        this.actions.primary();
      } else if (e.code === 'KeyR') {
        (this.actions.secondary ?? this.actions.primary)();
      }
    });
  }

  get visible(): boolean {
    return this.actions !== null;
  }

  /** Màn cuối ca (mục 7): bảng lương thực nhận, danh sách lỗi, review khách hài hước */
  showShiftEnd(s: ShiftSummary, isRecord: boolean, actions: ReviewActions): void {
    const t = DIALOGUES.review;
    const score = shiftScore(s);
    const grade = gradeOf(score);
    const deducted = s.baseSalary - s.salary;
    const reviews = statReviews(s)
      .map((r) => `<div class="rv-quote">${r}</div>`)
      .join('');
    this.render(
      'shift-end',
      `<h1>${DIALOGUES.shiftEndTitle}</h1>
       <div class="rv-sub">Ca ${s.day}</div>
       <div class="rv-top">
         <div class="rv-grade grade-${grade.grade}">
           <small>${t.grade}</small><b>${grade.grade}</b><span>${score} điểm</span>
         </div>
         <div class="rv-pay">
           <div><span>${t.base}</span><b>${formatMoney(s.baseSalary)}</b></div>
           <div class="minus"><span>${t.deductions}</span><b>−${formatMoney(deducted)}</b></div>
           <div class="total"><span>${t.takeHome}</span><b>${formatMoney(s.salary)}</b></div>
           ${isRecord ? `<div class="rv-record">${t.newRecord}</div>` : ''}
         </div>
       </div>
       <div class="rv-grade-line">${grade.line}</div>
       <div class="rv-stats six">
         <div>⭐ Rating<b>${s.rating.toFixed(1)}</b></div>
         <div>🥖 Phục vụ<b>${s.served}</b></div>
         <div>😡 Bỏ về<b>${s.angry}</b></div>
         <div>🏃 Bị quỵt<b>${s.ranAway}</b></div>
         <div>🖐️ Bị tát<b>${s.slaps}</b></div>
         <div>📝 Lỗi<b>${s.mistakes.length}</b></div>
       </div>
       ${this.mistakeList(s.mistakes)}
       <div class="rv-reviews"><div class="rv-reviews-title">${t.reviewsTitle}</div>${reviews}</div>
       <div class="rv-buttons">
         <button class="primary" data-act="primary">Ca ${s.day + 1} ▶ <small>(Enter)</small></button>
         <button data-act="secondary">Làm lại ca này <small>(R)</small></button>
       </div>`,
      { primary: actions.onNext, secondary: actions.onRetry },
    );
  }

  /** Game Over: tên ending, số lần dính ending đó, tổng số lần "chết", nút chơi lại lớn (mục 7) */
  showGameOver(ending: EndingId, s: ShiftSummary, save: SaveData, onRetry: () => void): void {
    const info = DIALOGUES.endings[ending];
    const times = endingCount(save, ending);
    const totalDeaths = save.timesFired + save.timesCatLost + save.timesHospital + save.timesFire;
    const context = deathContextLine(s, totalDeaths);
    this.render(
      `fired ending-${ending}`,
      `<h1>${info.title}</h1>
       <div class="rv-sub">Ending: ${info.name} · Ca ${s.day}</div>
       <div class="rv-review">${endingComment(ending, times)}</div>
       ${context ? `<div class="rv-context">${context}</div>` : ''}
       <div class="rv-stats">
         <div>💀 Tổng số lần toang<b>${totalDeaths}</b></div>
         <div>🏆 Ca xa nhất<b>${save.bestDay}</b></div>
         <div>🔥 Bị đuổi / 🐈 Mất mèo / 🚑 Nhập viện / 🧯 Cháy quán<b>${save.timesFired} / ${save.timesCatLost} / ${save.timesHospital} / ${save.timesFire}</b></div>
         <div>🖐️ Bị tát ca này<b>${s.slaps}</b></div>
       </div>
       ${this.mistakeList(s.mistakes)}
       <div class="rv-buttons">
         <button class="primary big" data-act="primary">CHƠI LẠI <small>(Enter / R)</small></button>
       </div>`,
      { primary: onRetry, secondary: null },
    );
  }

  hide(): void {
    this.actions = null;
    this.root.className = 'review';
    this.root.replaceChildren();
  }

  private render(variant: string, html: string, actions: { primary: () => void; secondary: (() => void) | null }): void {
    this.root.innerHTML = `<div class="rv-card">${html}</div>`;
    this.root.className = `review show ${variant}`;
    this.actions = actions;
    this.root.querySelector('[data-act="primary"]')?.addEventListener('click', () => actions.primary());
    this.root.querySelector('[data-act="secondary"]')?.addEventListener('click', () => actions.secondary?.());
  }

  private mistakeList(mistakes: readonly string[]): string {
    if (mistakes.length === 0) return '<div class="rv-mistakes empty">Không có lỗi nào. Đáng ngờ.</div>';
    const items = mistakes.slice(-8).map((m) => `<li>${m}</li>`).join('');
    return `<ul class="rv-mistakes">${items}</ul>`;
  }
}
