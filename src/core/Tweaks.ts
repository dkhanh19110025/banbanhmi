import type { ShiftConfig, ShiftPlan } from '../data/difficulty';

/** Chỉnh riêng cho một lượt thử: chồng lên cấu hình ca, chỉ dùng khi chạy chế độ thử nghiệm */
export interface ShiftTweaks {
  cfg: Partial<Omit<ShiftConfig, 'features'>>;
  features: Partial<ShiftConfig['features']>;
  /** Hậu quả nặng không kết thúc ca (hiệu ứng vẫn diễn ra) */
  immortal: boolean;
  /** Hệ số tua nhanh: 1, 2 hoặc 4 */
  speed: number;
}

/** Những gì công cụ thử nghiệm được phép nhờ game làm */
export interface LabHost {
  readonly tweaks: ShiftTweaks;
  inShift(): boolean;
  /** Vào thẳng ca theo kế hoạch này (tweaks đã chỉnh trước đó) */
  start(plan: ShiftPlan): void;
  endShiftNow(): void;
  /** Giữ/thả game khi bảng đang mở giữa ca. Trả về true nếu thật sự đổi trạng thái. */
  hold(on: boolean): boolean;
  /** Về màn chính */
  quit(): void;
}
