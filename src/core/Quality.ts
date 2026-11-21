/**
 * Phát hiện thiết bị và chọn mức đồ họa.
 * Điện thoại/máy tính bảng (màn cảm ứng, không có chuột) dùng mức "low" cho mượt.
 */

/** Thiết bị cảm ứng chính (điện thoại, máy tính bảng) */
export const IS_TOUCH: boolean =
  typeof window !== 'undefined' &&
  (window.matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && !window.matchMedia('(hover: hover)').matches));

export interface QualitySettings {
  /** Khử răng cưa MSAA (rất tốn trên GPU điện thoại) */
  antialias: boolean;
  /** Trần tỉ lệ điểm ảnh; màn 3x của điện thoại mà vẽ đủ thì rất nặng */
  maxPixelRatio: number;
  /** Mức thấp nhất khi tự hạ độ phân giải lúc bị lag */
  minPixelRatio: number;
  shadowMapSize: number;
  softShadows: boolean;
  /** Số đèn điểm thật trong quán (mỗi đèn tốn thêm cho mọi điểm ảnh) */
  pointLights: number;
  /** Bù sáng đèn trời khi bớt đèn điểm */
  hemiBoost: number;
}

const HIGH: QualitySettings = {
  antialias: true,
  maxPixelRatio: 2,
  minPixelRatio: 1,
  shadowMapSize: 2048,
  softShadows: true,
  pointLights: 3,
  hemiBoost: 0,
};

const LOW: QualitySettings = {
  antialias: false,
  maxPixelRatio: 1.5,
  minPixelRatio: 0.75,
  shadowMapSize: 1024,
  softShadows: false,
  pointLights: 0,
  hemiBoost: 0.25,
};

export const QUALITY: QualitySettings = IS_TOUCH ? LOW : HIGH;

/** Tự chỉnh độ phân giải theo FPS: lag thì hạ, mượt lâu thì nâng lại */
export const ADAPTIVE = {
  /** Đo FPS trung bình trong khoảng này (giây) rồi mới quyết */
  windowSec: 2,
  lowFps: 45,
  highFps: 57,
  step: 0.15,
  /** Một khung dài hơn mức này = trình duyệt tạm ngưng, không tính vào FPS */
  stallSec: 0.25,
};
