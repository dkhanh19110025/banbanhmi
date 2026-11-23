import type { LabHost, ShiftTweaks } from '../core/Tweaks';
import { BOSS_MOODS, DAY_EVENTS, planShift, type ShiftPlan } from '../data/difficulty';

// Công cụ thử nghiệm cho người làm game. File này được tải riêng, chỉ sau khi nhập đúng mã.

interface Incident {
  id: string;
  label: string;
  /** Ca đầu tiên mà tình huống này xuất hiện tự nhiên */
  from: number;
  patch: Pick<ShiftTweaks, 'cfg' | 'features'>;
}

/** Ép tình huống xảy ra sớm và chắc chắn. Bật luôn cả tính năng dù ca chọn chưa tới ca đó. */
const INCIDENTS: readonly Incident[] = [
  { id: 'boss', label: '👔 Chủ quán đi tuần', from: 2, patch: { features: { boss: true }, cfg: { bossStartDelaySec: 2 } } },
  { id: 'runaway', label: '🏃 Khách quỵt', from: 3, patch: { features: { runaway: true }, cfg: { runawayChance: 1 } } },
  {
    id: 'cat',
    label: '🐱 Mèo + khách trộm mèo',
    from: 4,
    patch: { features: { cat: true }, cfg: { catThiefChance: 1, catSleepDecayPerSec: 6 } },
  },
  {
    id: 'gang',
    label: '😈 Giang hồ (ghé sau ~6s)',
    from: 5,
    patch: { features: { gang: true }, cfg: { gangChance: 1, gangArriveTimeSec: [6, 6] } },
  },
  {
    id: 'fire',
    label: '🔥 Cháy chảo (mỗi lần nướng)',
    from: 6,
    patch: {
      features: { fire: true },
      cfg: { fireChancePerCook: 1, fireSmokeAfterSec: [2, 2], fireCooldownSec: 8 },
    },
  },
  { id: 'shipper', label: '🛵 Shipper (sau ~8s)', from: 7, patch: { features: { shipper: true }, cfg: { shipperFirstSec: [8, 8] } } },
  {
    id: 'supply',
    label: '🥫 Sắp hết nguyên liệu',
    from: 8,
    patch: { features: { supply: true }, cfg: { supplyStart: { pate: 1, dua: 1, gas: 2 } } },
  },
  {
    id: 'blackout',
    label: '💡 Mất điện (sau ~10s)',
    from: 9,
    patch: { features: { blackout: true }, cfg: { powerChance: 1, powerFirstSec: [10, 10] } },
  },
  {
    id: 'inspector',
    label: '🧽 Thanh tra (sau ~8s)',
    from: 10,
    patch: { features: { inspector: true }, cfg: { inspectorChance: 1, inspectorArriveSec: [8, 8] } },
  },
];

const DAY_HINTS: Readonly<Record<number, string>> = {
  1: 'khách thường + thanh toán + ghi sổ',
  2: '+ chủ quán đi tuần',
  3: '+ khách quỵt, chủ quán hỏi sổ bất ngờ',
  4: '+ mèo',
  5: '+ giang hồ',
  6: '+ cháy chảo, bắt đầu sự kiện ngày',
  7: '+ shipper',
  8: '+ hết nguyên liệu',
  9: '+ mất điện',
  10: '+ thanh tra, đủ bộ',
};
const MAX_DAY = 99;
const SPEEDS = [1, 2, 4] as const;

interface State {
  day: number;
  mood: string;
  event: string;
  forced: Set<string>;
}

const CSS = `
.lab-root{position:fixed;inset:0;z-index:60;display:none;align-items:center;justify-content:center;padding:12px;background:rgba(0,0,0,.72);pointer-events:auto;font-family:system-ui,sans-serif}
.lab-root.on{display:flex}
.lab-card{width:min(720px,100%);max-height:100%;overflow:auto;touch-action:pan-y;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;background:#10151c;color:#d7e3f0;border:2px solid #3b82f6;border-radius:12px;padding:14px 16px;box-shadow:0 8px 30px #000}
.lab-card h2{margin:0 0 4px;font-size:18px;color:#7db4ff}
.lab-card h3{margin:12px 0 6px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#8aa0b8}
.lab-sub{font-size:12px;color:#8aa0b8;margin-bottom:6px}
.lab-row{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.lab-btn{font:inherit;font-size:13px;color:#d7e3f0;background:#1b2531;border:1px solid #2f4056;border-radius:6px;padding:5px 10px;cursor:pointer}
.lab-btn:hover{background:#243245}
.lab-btn.sel{background:#2563eb;border-color:#60a5fa;color:#fff}
.lab-btn.dim{opacity:.55}
.lab-btn.go{background:#16a34a;border-color:#4ade80;color:#fff;font-weight:700;padding:8px 16px}
.lab-btn.warn{background:#7f1d1d;border-color:#ef4444}
.lab-num{width:64px;font:inherit;font-size:14px;padding:4px 6px;background:#0b0f14;color:#d7e3f0;border:1px solid #2f4056;border-radius:6px;user-select:text}
.lab-hint{font-size:12px;color:#9fb4c9;margin-top:6px;min-height:16px}
.lab-chk{display:flex;gap:6px;align-items:center;font-size:13px;background:#1b2531;border:1px solid #2f4056;border-radius:6px;padding:5px 10px;cursor:pointer;user-select:none}
.lab-chk input{margin:0}
.lab-foot{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;align-items:center}
.lab-note{font-size:11px;color:#6b8199;margin-top:10px}
`;

export interface Lab {
  open(): void;
  close(): void;
}

export function createLab(parent: HTMLElement, host: LabHost): Lab {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.className = 'lab-root';
  parent.appendChild(root);

  const state: State = { day: 1, mood: 'random', event: 'random', forced: new Set() };
  let held = false;
  let isOpen = false;

  const hintFor = (day: number): string => {
    const key = Math.min(day, 10);
    return `Ca ${day}: ${DAY_HINTS[key] ?? ''}${day > 10 ? ' (sau ca 10 mọi thứ khó dần)' : ''}`;
  };

  function render(): void {
    const dayBtns = Array.from({ length: 10 }, (_, i) => i + 1)
      .map((d) => `<button class="lab-btn ${state.day === d ? 'sel' : ''}" data-day="${d}">${d}</button>`)
      .join('');
    const opt = (kind: 'mood' | 'event', id: string, label: string): string =>
      `<button class="lab-btn ${state[kind] === id ? 'sel' : ''}" data-${kind}="${id}">${label}</button>`;
    const moods = [
      opt('mood', 'random', 'Ngẫu nhiên'),
      ...BOSS_MOODS.map((m) => opt('mood', m.id, { happy: '😄 Vui', normal: '😐 Bình thường', grumpy: '😡 Cáu' }[m.id])),
    ].join('');
    const events = [
      opt('event', 'random', 'Ngẫu nhiên'),
      opt('event', 'none', 'Không có'),
      ...DAY_EVENTS.map((e) => opt('event', e.id, { rain: '🌧️ Mưa', holiday: '🎉 Lễ', football: '⚽ Đội bóng' }[e.id])),
    ].join('');
    const incidents = INCIDENTS.map(
      (i) =>
        `<label class="lab-chk"><input type="checkbox" data-inc="${i.id}" ${state.forced.has(i.id) ? 'checked' : ''}/>${i.label}</label>`,
    ).join('');
    const speeds = SPEEDS.map(
      (s) => `<button class="lab-btn ${host.tweaks.speed === s ? 'sel' : ''}" data-speed="${s}">×${s}</button>`,
    ).join('');
    const inShift = host.inShift();

    root.innerHTML = `
      <div class="lab-card">
        <h2>🧪 Bảng thử nghiệm</h2>
        <div class="lab-sub">Chơi ở đây không ghi vào save. F1 mở/đóng bảng này bất cứ lúc nào.</div>

        <h3>Ca</h3>
        <div class="lab-row">${dayBtns}<input class="lab-num" type="number" min="1" max="${MAX_DAY}" value="${state.day}" data-dayinput /></div>
        <div class="lab-hint">${hintFor(state.day)}</div>

        <h3>Tâm trạng chủ quán</h3>
        <div class="lab-row">${moods}</div>

        <h3>Sự kiện ngày</h3>
        <div class="lab-row">${events}</div>

        <h3>Ép tình huống xảy ra ngay (bật luôn dù ca chưa tới)</h3>
        <div class="lab-row">${incidents}</div>

        <h3>Hỗ trợ</h3>
        <div class="lab-row">
          <label class="lab-chk"><input type="checkbox" data-immortal ${host.tweaks.immortal ? 'checked' : ''}/>🛡️ Bất tử (hậu quả nặng không kết thúc ca)</label>
          <span class="lab-sub" style="margin:0 4px 0 10px">Tua nhanh</span>${speeds}
        </div>

        <div class="lab-foot">
          <button class="lab-btn go" data-act="start">▶ ${inShift ? 'Làm lại ca với thiết lập này' : 'Vào ca'}</button>
          ${inShift ? '<button class="lab-btn" data-act="resume">Tiếp tục ca</button><button class="lab-btn" data-act="end">⏹ Kết thúc ca ngay</button>' : '<button class="lab-btn" data-act="close">Đóng</button>'}
          <button class="lab-btn warn" data-act="quit">Về màn chính</button>
        </div>
        <div class="lab-note">Bất tử chỉ bỏ qua việc kết thúc ca: hiệu ứng (cháy lan, bị đánh...) vẫn diễn ra để bạn xem.</div>
      </div>`;
  }

  function buildPlan(): ShiftPlan {
    const base = planShift(state.day);
    const mood = BOSS_MOODS.find((m) => m.id === state.mood) ?? base.mood;
    const event =
      state.event === 'random' ? base.event : (DAY_EVENTS.find((e) => e.id === state.event) ?? null);
    return { day: state.day, mood, event };
  }

  function applyForced(): void {
    const cfg: ShiftTweaks['cfg'] = {};
    const features: ShiftTweaks['features'] = {};
    for (const inc of INCIDENTS) {
      if (!state.forced.has(inc.id)) continue;
      Object.assign(cfg, inc.patch.cfg);
      Object.assign(features, inc.patch.features);
    }
    host.tweaks.cfg = cfg;
    host.tweaks.features = features;
  }

  function show(): void {
    if (isOpen) return;
    isOpen = true;
    held = host.hold(true);
    render();
    root.classList.add('on');
  }

  function hide(): void {
    isOpen = false;
    root.classList.remove('on');
  }

  function close(): void {
    if (!isOpen) return;
    hide();
    if (held) host.hold(false);
    held = false;
  }

  root.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('button');
    if (!t) return;
    if (t.dataset.day) state.day = Number(t.dataset.day);
    else if (t.dataset.mood) state.mood = t.dataset.mood;
    else if (t.dataset.event) state.event = t.dataset.event;
    else if (t.dataset.speed) host.tweaks.speed = Number(t.dataset.speed);
    else if (t.dataset.act === 'start') {
      applyForced();
      const plan = buildPlan();
      hide();
      held = false;
      host.start(plan);
      return;
    } else if (t.dataset.act === 'resume' || t.dataset.act === 'close') {
      close();
      return;
    } else if (t.dataset.act === 'end') {
      close();
      host.endShiftNow();
      return;
    } else if (t.dataset.act === 'quit') {
      host.quit();
      return;
    } else return;
    render();
  });

  root.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.dataset.inc) {
      if (t.checked) state.forced.add(t.dataset.inc);
      else state.forced.delete(t.dataset.inc);
    } else if (t.dataset.immortal !== undefined) {
      host.tweaks.immortal = t.checked;
    } else if (t.dataset.dayinput !== undefined) {
      state.day = Math.min(MAX_DAY, Math.max(1, Math.floor(Number(t.value)) || 1));
      render();
    }
  });

  // Gõ trong bảng không được kích hoạt phím tắt của game
  for (const type of ['keydown', 'keyup'] as const) root.addEventListener(type, (e) => e.stopPropagation());

  // F1 mở/đóng, Esc đóng. Bắt ở pha capture để game không nhận phím này (Esc sẽ mở menu tạm dừng).
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.code === 'F1') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (isOpen) close();
        else show();
      } else if (e.code === 'Escape' && isOpen) {
        e.preventDefault();
        e.stopImmediatePropagation();
        close();
      }
    },
    true,
  );

  return { open: show, close };
}
