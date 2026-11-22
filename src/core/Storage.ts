import type { DayEventId, MoodId } from '../data/difficulty';
import type { EndingId } from './EventBus';

/** Tên nhân vật dài tối đa bấy nhiêu ký tự */
export const MAX_NAME_LENGTH = 18;

/** Làm sạch tên: bỏ ký tự điều khiển và <>, gom khoảng trắng, cắt tối đa 18 ký tự (đếm ký tự thật, không phải đơn vị UTF-16) */
export function cleanName(raw: string): string {
  const s = raw.replace(/\p{Cc}|[<>]/gu, '').replace(/\s+/g, ' ').trim();
  return Array.from(s).slice(0, MAX_NAME_LENGTH).join('');
}

/** Ca đang làm dở: có mặt khi vào ca, xóa khi hết ca / bị đuổi. Mở lại game mà còn → bị mắng vì trốn việc. */
export interface ActiveShift {
  day: number;
  mood: MoodId;
  event: DayEventId | null;
}

export interface SaveData {
  activeShift: ActiveShift | null;
  /** Tên nhân viên do người chơi đặt (rỗng = chưa đặt) */
  playerName: string;
  timesFired: number;
  shiftsCompleted: number;
  bestDay: number;
  bestSalary: number;
  timesSlapped: number;
  timesCatLost: number;
  timesHospital: number;
  timesFire: number;
  /** Ca cao nhất được phép chơi tiếp (hết ca N thì mở ca N+1) */
  unlockedDay: number;
}

const KEY = 'tbmdn.save.v1';
const DEFAULTS: SaveData = {
  activeShift: null,
  playerName: '',
  timesFired: 0,
  shiftsCompleted: 0,
  bestDay: 0,
  bestSalary: 0,
  timesSlapped: 0,
  timesCatLost: 0,
  timesHospital: 0,
  timesFire: 0,
  unlockedDay: 1,
};

/** Số lần đã dính một ending */
export function endingCount(save: SaveData, ending: EndingId): number {
  if (ending === 'catLost') return save.timesCatLost;
  if (ending === 'hospital') return save.timesHospital;
  if (ending === 'kitchenFire') return save.timesFire;
  return save.timesFired;
}

/** Ghi nhận thêm một lần dính ending */
export function recordEnding(save: SaveData, ending: EndingId): void {
  if (ending === 'catLost') save.timesCatLost++;
  else if (ending === 'hospital') save.timesHospital++;
  else if (ending === 'kitchenFire') save.timesFire++;
  else save.timesFired++;
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    const save = { ...DEFAULTS, ...parsed };
    save.playerName = typeof save.playerName === 'string' ? cleanName(save.playerName) : '';
    const a = save.activeShift;
    if (!a || typeof a.day !== 'number' || !Number.isInteger(a.day) || a.day < 1) save.activeShift = null;
    return save;
  } catch {
    return { ...DEFAULTS };
  }
}

export function writeSave(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Trình duyệt chặn lưu trữ: bỏ qua, game vẫn chơi được
  }
}

// ---------- Cài đặt (tách riêng khỏi thành tích) ----------

export interface Settings {
  muted: boolean;
  musicVolume: number;
}

const SETTINGS_KEY = 'tbmdn.settings.v1';
const DEFAULT_SETTINGS: Settings = { muted: false, musicVolume: 0.6 };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) } : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function writeSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Không lưu được thì thôi, lần sau dùng mặc định
  }
}
