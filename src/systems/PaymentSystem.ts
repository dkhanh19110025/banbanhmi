import type { EventBus, NotebookEntryView } from '../core/EventBus';
import { pick, randomIn } from '../core/Random';
import { Countdown } from '../core/Timer';
import type { ShiftConfig } from '../data/difficulty';
import { DIALOGUES, fillLine } from '../data/dialogues';
import { type DishId, formatMoney, getDish } from '../data/menu';
import { StatusIcon, type WorldLabels } from '../ui/DialogBubble';
import type { Restaurant } from '../world/Restaurant';

export interface PaymentDeps {
  bus: EventBus;
  cfg: ShiftConfig;
  labels: WorldLabels;
  restaurant: Restaurant;
  /** Giây kể từ đầu ca */
  now: () => number;
  /**
   * 'shout': ca 1, chủ quán ở nhà trong tự hét hỏi theo giờ, phạt ngay.
   * 'boss': chủ quán đi tuần đứng ở quầy mới hỏi (audit:request), Boss tự chạy tới tát.
   */
  auditMode: 'shout' | 'boss';
}

interface NotebookEntry {
  table: number;
  dish: DishId;
  writtenAt: number;
}

interface PaymentRecord {
  table: number;
  dish: DishId;
  amount: number;
  paidAt: number;
  entry: NotebookEntry | null;
  audited: boolean;
}

type EntryStatus = 'ok' | 'wrong' | 'missing';

export interface EndShiftTally {
  missing: number;
  wrong: number;
  penalty: number;
}

/**
 * Tình huống 4 — Thanh toán & sổ tay.
 * Kích hoạt: khách trả tiền ở quầy.
 * Dấu hiệu: icon bút nhấp nháy trên quầy, quá hạn thì chuyển đỏ.
 * Khắc phục: mở sổ (N), chọn bàn + món, ghi.
 * Hậu quả: chủ quán hỏi bất ngờ (có báo trước vài giây) → thiếu/sai thì trừ lương + tát.
 *          Cuối ca đếm tiền, mỗi lỗi còn lại bị trừ thêm.
 * Ca 1 chủ quán hét hỏi từ nhà trong; từ ca 2 chủ quán đi tuần, đứng ở quầy mới hỏi.
 */
export class PaymentSystem {
  private readonly deps: PaymentDeps;
  private readonly payments: PaymentRecord[] = [];
  private readonly entries: NotebookEntry[] = [];
  /** Ghi trước khi thu tiền: chờ ghép với lần trả tiền kế tiếp của bàn đó */
  private readonly preEntries = new Map<number, NotebookEntry>();
  private readonly penIcon: StatusIcon;
  private readonly offs: Array<() => void> = [];
  private auditTimer: number;
  private audit: { payment: PaymentRecord; countdown: Countdown } | null = null;

  constructor(deps: PaymentDeps) {
    this.deps = deps;
    this.penIcon = new StatusIcon(deps.labels, deps.restaurant.counterLabelAnchor, 0);
    this.auditTimer = randomIn(deps.cfg.auditIntervalSec);

    this.offs.push(
      deps.bus.on('customer:paid', (p) => this.onPaid(p.table, p.dish, p.amount)),
      deps.bus.on('notebook:write', (w) => this.onWrite(w.table, w.dish)),
      deps.bus.on('customer:angryLeave', (p) => this.preEntries.delete(p.table)),
      deps.bus.on('customer:ranAway', (p) => this.preEntries.delete(p.table)),
      deps.bus.on('audit:request', () => {
        if (this.audit || !this.startAudit()) deps.bus.emit('audit:none', {});
      }),
    );
  }

  update(dt: number): void {
    this.updatePenIcon();
    this.updateAudit(dt);
  }

  /** Đếm tiền cuối ca: mỗi lần thanh toán thiếu/sai sổ bị trừ */
  endShiftTally(): EndShiftTally {
    let missing = 0;
    let wrong = 0;
    for (const p of this.payments) {
      const s = this.statusOf(p);
      if (s === 'missing') missing++;
      else if (s === 'wrong') wrong++;
    }
    const count = missing + wrong;
    const penalty = count * this.deps.cfg.penaltyEndShiftPerError;
    if (penalty > 0) {
      this.deps.bus.emit('salary:penalty', {
        amount: penalty,
        reason: fillLine(DIALOGUES.penaltyReasonEndShift, { count }),
      });
    }
    return { missing, wrong, penalty };
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.penIcon.dispose();
  }

  // ---------- Sổ tay ----------

  private onPaid(table: number, dish: DishId, amount: number): void {
    const record: PaymentRecord = { table, dish, amount, paidAt: this.deps.now(), entry: null, audited: false };
    const pre = this.preEntries.get(table);
    if (pre) {
      record.entry = pre;
      this.preEntries.delete(table);
    }
    this.payments.push(record);
    this.deps.bus.emit('toast', {
      text: fillLine(DIALOGUES.toastPaid, { amount: formatMoney(amount), table }),
      kind: 'info',
    });
  }

  private onWrite(table: number, dish: DishId): void {
    const entry: NotebookEntry = { table, dish, writtenAt: this.deps.now() };
    this.entries.push(entry);
    // Ghép với lần trả tiền cũ nhất của bàn này còn chưa ghi; chưa có thì giữ lại chờ khách trả
    const target = this.payments.find((p) => p.table === table && p.entry === null);
    if (target) target.entry = entry;
    else this.preEntries.set(table, entry);

    const views: NotebookEntryView[] = this.entries.map((e) => ({ ...e }));
    this.deps.bus.emit('notebook:changed', { entries: views });
    this.deps.bus.emit('toast', {
      text: fillLine(DIALOGUES.toastWritten, { table, dish: getDish(dish).name }),
      kind: 'good',
    });
  }

  private statusOf(p: PaymentRecord): EntryStatus {
    if (!p.entry) return 'missing';
    return p.entry.dish === p.dish ? 'ok' : 'wrong';
  }

  private updatePenIcon(): void {
    const now = this.deps.now();
    const unrecorded = this.payments.filter((p) => !p.entry);
    if (unrecorded.length === 0) {
      this.penIcon.hide();
      return;
    }
    const overdue = unrecorded.some((p) => now - p.paidAt > this.deps.cfg.recordGraceSec);
    if (overdue) this.penIcon.show(`${DIALOGUES.penOverdue} (${unrecorded.length})`, null, 'bad blink');
    else this.penIcon.show(DIALOGUES.penReminder, null, 'warn blink');
  }

  // ---------- Chủ quán hỏi sổ ----------

  private updateAudit(dt: number): void {
    if (this.audit) {
      if (this.audit.countdown.tick(dt)) this.resolveAudit(this.audit.payment);
      return;
    }
    // Chế độ 'boss': chỉ hỏi khi chủ quán đứng ở quầy yêu cầu
    if (this.deps.auditMode !== 'shout') return;
    this.auditTimer -= dt;
    if (this.auditTimer > 0) return;
    this.auditTimer = this.startAudit() ? randomIn(this.deps.cfg.auditIntervalSec) : this.deps.cfg.auditRetrySec;
  }

  /** Chọn một lần trả tiền để hỏi. Trả về false nếu chưa có gì đáng hỏi. */
  private startAudit(): boolean {
    const { cfg, bus, now, auditMode } = this.deps;
    // Chỉ hỏi những lần trả đã quá hạn ghi sổ → người chơi luôn có đủ thời gian
    const candidates = this.payments
      .slice(-cfg.auditLookback)
      .filter((p) => !p.audited && now() - p.paidAt >= cfg.recordGraceSec);
    if (candidates.length === 0) return false;
    const payment = pick(candidates);
    payment.audited = true;
    this.audit = { payment, countdown: new Countdown(cfg.auditWarningSec) };
    bus.emit('audit:warning', {
      table: payment.table,
      seconds: cfg.auditWarningSec,
      question: fillLine(pick(DIALOGUES.auditQuestion), { table: payment.table }),
      speaker: auditMode === 'shout' ? DIALOGUES.auditSpeaker : DIALOGUES.bossSpeaker,
    });
    return true;
  }

  private resolveAudit(payment: PaymentRecord): void {
    const { bus, cfg, auditMode } = this.deps;
    this.audit = null;
    const status = this.statusOf(payment);
    const vars = { table: payment.table };
    if (status === 'ok') {
      bus.emit('audit:result', { table: payment.table, ok: true, line: pick(DIALOGUES.auditPass), penalty: 0, reason: '' });
      return;
    }
    const line = fillLine(pick(status === 'missing' ? DIALOGUES.auditFailMissing : DIALOGUES.auditFailWrong), vars);
    const reason = fillLine(
      status === 'missing' ? DIALOGUES.penaltyReasonAuditMissing : DIALOGUES.penaltyReasonAuditWrong,
      vars,
    );
    bus.emit('audit:result', { table: payment.table, ok: false, line, penalty: cfg.penaltyAuditFail, reason });
    // Ca 1 không có chủ quán đi lại: phạt ngay tại chỗ. Ca 2+ Boss nghe kết quả và tự chạy tới tát.
    if (auditMode === 'shout') {
      bus.emit('fx:slap', { text: DIALOGUES.slap });
      bus.emit('salary:penalty', { amount: cfg.penaltyAuditFail, reason });
    }
  }
}
