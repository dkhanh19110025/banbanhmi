import type { DishId, IngredientId } from '../data/menu';

export type EndingId = 'fired' | 'catLost' | 'hospital' | 'kitchenFire';

export interface Ticket {
  customerId: number;
  /** 0 = đơn của shipper (ưu tiên) */
  table: number;
  dish: DishId;
  priority?: boolean;
}

/** Lý do bếp không dùng được */
export type KitchenBlock = 'fire' | 'power';

export interface NotebookEntryView {
  table: number;
  dish: DishId;
  /** Giây kể từ đầu ca */
  writtenAt: number;
}

export type ToastKind = 'info' | 'good' | 'warn' | 'bad';

export type SoundId =
  | 'flipflop'
  | 'slap'
  | 'giggle'
  | 'ding'
  | 'alarm'
  | 'meow'
  | 'scratch'
  | 'doorKick'
  | 'punch'
  | 'siren'
  | 'sizzle'
  | 'write'
  | 'pop'
  | 'bell'
  | 'honk'
  | 'crackle'
  | 'splash'
  | 'scrub'
  | 'powerDown'
  | 'powerUp'
  | 'generator';

/** Mức nhạc nền theo độ nguy hiểm (mục 8) */
export type MusicLevel = 'off' | 'calm' | 'alert' | 'danger';

export type CatStatus = 'sleeping' | 'sleepy' | 'waking' | 'wandering' | 'carried' | 'inBed' | 'grabbed' | 'stolen';

/** Danh sách mọi sự kiện trong game và dữ liệu đi kèm */
export interface GameEvents {
  'order:taken': { customerId: number; table: number; dish: DishId; priority?: boolean };
  /** Đơn bị hủy (shipper bỏ về) */
  'order:cancelled': { customerId: number };
  'order:served': { customerId: number; table: number; dish: DishId };
  'orders:changed': { tickets: readonly Ticket[] };
  'kitchen:cooked': { dish: DishId };
  'kitchen:cookStarted': { dish: DishId };
  /** Bếp tạm dùng không được (cháy / mất điện) */
  'kitchen:block': { reason: KitchenBlock; active: boolean };

  // --- Chảo bốc cháy (ca 6+) ---
  'fire:warning': Record<string, never>;
  'fire:burning': Record<string, never>;
  'fire:out': Record<string, never>;

  // --- Shipper giục đơn (ca 7+) ---
  'shipper:arrived': { dish: DishId };
  'shipper:delivered': Record<string, never>;
  'shipper:failed': Record<string, never>;

  // --- Hết nguyên liệu (ca 8+) ---
  'supply:status': { stock: Readonly<Record<IngredientId, number>>; out: readonly IngredientId[] };

  // --- Mất điện (ca 9+) ---
  'power:warning': Record<string, never>;
  'power:out': Record<string, never>;
  'power:restored': Record<string, never>;
  /** Độ tối màn hình 0..1 */
  'power:darkness': { level: number };

  // --- Thanh tra vệ sinh (ca 10+) ---
  'inspector:warning': { seconds: number; spots: number };
  'inspector:result': { ok: boolean; remaining: number };

  'customer:angryLeave': { customerId: number; table: number };
  'customer:paid': { customerId: number; table: number; dish: DishId; amount: number };
  'customer:gone': { customerId: number };
  /** Khách bắt đầu chuồn (hết giai đoạn liếc cửa) */
  'customer:runningAway': { customerId: number; table: number };
  /** Người chơi nhắc kịp, khách quay lại trả tiền */
  'customer:caught': { customerId: number; table: number };
  /** Khách quỵt thoát ra khỏi cửa */
  'customer:ranAway': { customerId: number; table: number; dish: DishId; amount: number };

  'notebook:write': { table: number; dish: DishId };
  'notebook:changed': { entries: readonly NotebookEntryView[] };

  /** Chủ quán đứng ở quầy, đòi kiểm sổ */
  'audit:request': Record<string, never>;
  /** Không có gì để hỏi */
  'audit:none': Record<string, never>;
  'audit:warning': { table: number; seconds: number; question: string; speaker: string };
  'audit:result': { table: number; ok: boolean; line: string; penalty: number; reason: string };

  'boss:anger': { anger: number; max: number; mood: string };
  /** Chủ quán tát trúng người chơi */
  'boss:hit': { amount: number; reason: string };

  sfx: { sound: SoundId; volume?: number };
  /** Đổi nhạc nền theo mức nguy hiểm */
  'music:level': { level: MusicLevel };

  // --- Mèo ---
  'cat:status': { sleep: number; max: number; status: CatStatus };
  'cat:waking': Record<string, never>;
  'cat:wandering': Record<string, never>;
  'cat:asleep': Record<string, never>;
  'cat:scratch': { amount: number };
  /** Khách trộm mèo đã ôm được mèo */
  'cat:grabbed': { customerId: number };
  'cat:rescued': { customerId: number };
  /** Khách ôm mèo ra khỏi cửa — hậu quả nặng */
  'cat:stolen': { customerId: number };

  // --- Giang hồ ---
  'gang:arrived': { size: number };
  'gang:gotMenu': Record<string, never>;
  /** Nhóm giang hồ đánh trúng người chơi — hậu quả nặng */
  'gang:beatUp': Record<string, never>;
  'gang:left': Record<string, never>;

  'salary:penalty': { amount: number; reason: string };
  'rating:change': { delta: number; reason: string };
  'stats:changed': { salary: number; maxSalary: number; rating: number };

  'fx:slap': { text: string };
  toast: { text: string; kind: ToastKind };
  'shift:tick': { elapsed: number; total: number };
  'game:over': { ending: EndingId };
}

type Handler<K extends keyof GameEvents> = (payload: GameEvents[K]) => void;
type HandlerMap = { [K in keyof GameEvents]?: Handler<K>[] };

/** Các hệ thống chỉ nói chuyện với nhau qua đây, không gọi chéo trực tiếp. */
export class EventBus {
  private handlers: HandlerMap = {};

  on<K extends keyof GameEvents>(event: K, handler: Handler<K>): () => void {
    let list = this.handlers[event] as Handler<K>[] | undefined;
    if (!list) {
      list = [];
      (this.handlers as Record<K, Handler<K>[]>)[event] = list;
    }
    const target = list;
    target.push(handler);
    return () => {
      const i = target.indexOf(handler);
      if (i >= 0) target.splice(i, 1);
    };
  }

  emit<K extends keyof GameEvents>(event: K, payload: GameEvents[K]): void {
    const list = this.handlers[event] as Handler<K>[] | undefined;
    if (!list) return;
    for (const handler of [...list]) handler(payload);
  }
}
