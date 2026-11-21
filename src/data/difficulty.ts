// MỌI con số cân bằng nằm ở đây. Đơn vị thời gian: giây. Tiền: nghìn đồng.
import type { Range } from '../core/Random';

export type MoodId = 'happy' | 'normal' | 'grumpy';

export interface BossMood {
  id: MoodId;
  /** Nhân với mọi lượng "bực" cộng thêm */
  angerMultiplier: number;
  /** Trọng số khi bốc ngẫu nhiên tâm trạng đầu ca */
  weight: number;
}

/** Tâm trạng chủ quán mỗi ngày (mục 3.2) */
export const BOSS_MOODS: readonly BossMood[] = [
  { id: 'happy', angerMultiplier: 0.6, weight: 1 },
  { id: 'normal', angerMultiplier: 1, weight: 2 },
  { id: 'grumpy', angerMultiplier: 1.5, weight: 1 },
];

export interface ShiftConfig {
  /** Tình huống được bật ở ca này (mục 9: mỗi ca giới thiệu thêm một thứ) */
  features: {
    /** Chủ quán đi tuần (ca 2+). Ca 1 chủ quán chỉ hét vọng từ nhà trong. */
    boss: boolean;
    /** Khách quỵt (ca 3+) */
    runaway: boolean;
    /** Con mèo + khách trộm mèo (ca 4+) */
    cat: boolean;
    /** Nhóm giang hồ (ca 5+) */
    gang: boolean;
  };

  /** Độ dài một ca (giây thật) */
  shiftDurationSec: number;
  startSalary: number;
  startRating: number;

  // --- Người chơi ---
  playerSpeed: number;
  interactRange: number;
  /** Tầm cộng thêm cho bếp và quầy (đồ vật dài, đứng chỗ nào dọc theo cũng được) */
  stationRangeBonus: number;

  // --- Sinh khách ---
  firstSpawnDelaySec: number;
  spawnIntervalSec: Range;
  maxCustomers: number;
  customerWalkSpeed: number;

  // --- Kiên nhẫn của khách ---
  seatDelaySec: number;
  patienceOrderSec: number;
  patienceFoodSec: number;
  /** Đứng ở quầy quá lâu không ai thu tiền → càm ràm, trừ rating (vẫn chờ trả) */
  patienceCounterSec: number;
  eatTimeSec: Range;

  // --- Bếp ---
  cookTimeSec: number;

  // --- Thanh toán & sổ tay ---
  /** Sau khi nhận tiền, có bấy nhiêu giây để ghi sổ trước khi icon bút chuyển đỏ */
  recordGraceSec: number;
  /** Ca 1: khoảng thời gian giữa các lần chủ quán hét hỏi sổ từ nhà trong */
  auditIntervalSec: Range;
  /** Dấu hiệu báo trước: chủ quán hỏi xong, đếm ngược bấy nhiêu giây mới kiểm */
  auditWarningSec: number;
  /** Chỉ hỏi về N lần thanh toán gần nhất */
  auditLookback: number;
  /** Khi chưa có gì để hỏi, thử lại sau bấy nhiêu giây */
  auditRetrySec: number;

  // --- Chủ quán đi tuần ---
  bossStartDelaySec: number;
  bossWalkSpeed: number;
  bossChargeSpeed: number;
  /** Thời gian đứng ngó nghiêng ở mỗi điểm dừng */
  bossStopSec: Range;
  /** Xác suất kiểm sổ mỗi lần đi ngang quầy */
  bossAuditChance: number;
  /** Trong bán kính này người chơi nghe tiếng dép lê */
  bossFootstepRange: number;
  bossFootstepIntervalSec: number;
  /** Bắt quả tang đứng không: chủ quán trong tầm nhìn + người chơi đứng yên đủ lâu */
  bossSightRange: number;
  idleCatchSec: number;
  idleCatchCooldownSec: number;
  /** Bị tát: văng ra, ngã ngửa → nằm đó → đứng dậy xong mới đi được */
  slapFallSec: number;
  slapLieSec: number;
  slapGetUpSec: number;
  slapKnockbackSpeed: number;
  /** Tát xong đứng thở bấy nhiêu giây rồi mới đi tiếp */
  slapRecoverSec: number;

  // --- Chủ quán bực (bossAnger 0..angerMax) ---
  angerMax: number;
  angerPerSec: number;
  /** Đầy thanh → tát xong hạ về mức này */
  angerAfterSlap: number;
  angerAuditFail: number;
  angerAngryLeave: number;
  angerRunaway: number;
  angerIdle: number;
  /** Làm tốt thì chủ quán nguôi bớt — cách để người chơi tự hạ thanh bực */
  angerServeRelief: number;
  angerAuditPassRelief: number;

  // --- Khách quỵt ---
  runawayChance: number;
  /** Dấu hiệu báo trước: ngồi liếc cửa bấy nhiêu giây rồi mới chuồn */
  runawaySneakSec: number;
  runawaySpeed: number;
  /** Trừ lương = giá món × hệ số */
  runawayPenaltyMultiplier: number;

  // --- Mèo (catSleep 0..100) ---
  catSleepDecayPerSec: number;
  /** catSleep tụt tới đây thì mèo bắt đầu thức */
  catWakeAt: number;
  /** Dấu hiệu báo trước: vươn vai trong ổ bấy nhiêu giây rồi mới đi lang thang */
  catWakeSec: number;
  catPetRatePerSec: number;
  /** Đặt vào ổ mà không vuốt quá lâu → mèo thiu thiu ngủ với chừng đó catSleep đang có */
  catBedWaitSec: number;
  /** Vuốt chưa đầy mà bỏ → lần sau tụt nhanh gấp mấy lần */
  catRestlessMultiplier: number;
  /** Ngủ rồi vẫn cố vuốt quá bấy nhiêu giây → bị cào */
  catOverPetSec: number;
  catWalkSpeed: number;
  catWanderPauseSec: Range;
  /** Xác suất mèo lang thang về phía cửa */
  catDoorBias: number;
  /** Xác suất một khách là trộm mèo */
  catThiefChance: number;
  catThiefChaseSpeed: number;
  /** Ôm mèo đi ra cửa — tốc độ này cho người chơi ~5 giây đuổi theo */
  catThiefLeaveSpeed: number;
  catGrabRange: number;

  // --- Giang hồ ---
  /** Xác suất có nhóm giang hồ ghé trong ca */
  gangChance: number;
  /** Ghé vào khoảng giây thứ mấy của ca */
  gangArriveTimeSec: Range;
  gangSize: Range;
  /** Đếm ngược từ lúc ngồi xuống tới lúc có menu */
  gangMenuTimeoutSec: number;
  gangFoodPatienceSec: number;
  /** Mang bánh ra đoán món mà không đưa menu: xác suất trúng */
  gangGuessChance: number;
  gangEatSec: Range;
  gangWalkSpeed: number;
  gangAttackSpeed: number;
  gangEntryStaggerSec: number;
  gangSitDelaySec: number;

  // --- Hình phạt ---
  penaltyCatScratch: number;
  penaltyAuditFail: number;
  penaltyEndShiftPerError: number;
  penaltyAngerSlap: number;
  ratingAngryLeave: number;
  ratingSlowCounter: number;
}

type BaseConfig = Omit<ShiftConfig, 'features'>;

const BASE: BaseConfig = {
  shiftDurationSec: 300,
  startSalary: 100,
  startRating: 5,

  playerSpeed: 6,
  interactRange: 1.9,
  stationRangeBonus: 1,

  firstSpawnDelaySec: 2,
  spawnIntervalSec: [12, 20],
  maxCustomers: 4,
  customerWalkSpeed: 2.8,

  seatDelaySec: 1.2,
  patienceOrderSec: 30,
  patienceFoodSec: 45,
  patienceCounterSec: 20,
  eatTimeSec: [7, 11],

  cookTimeSec: 3,

  recordGraceSec: 8,
  auditIntervalSec: [35, 55],
  auditWarningSec: 6,
  auditLookback: 5,
  auditRetrySec: 6,

  bossStartDelaySec: 4,
  bossWalkSpeed: 2.2,
  bossChargeSpeed: 9,
  bossStopSec: [2, 4],
  bossAuditChance: 0.75,
  bossFootstepRange: 7,
  bossFootstepIntervalSec: 0.4,
  bossSightRange: 5,
  idleCatchSec: 5,
  idleCatchCooldownSec: 15,
  slapFallSec: 0.35,
  slapLieSec: 1.6,
  slapGetUpSec: 0.9,
  slapKnockbackSpeed: 7,
  slapRecoverSec: 1.2,

  angerMax: 100,
  angerPerSec: 0.3,
  angerAfterSlap: 25,
  angerAuditFail: 25,
  angerAngryLeave: 10,
  angerRunaway: 30,
  angerIdle: 15,
  angerServeRelief: 4,
  angerAuditPassRelief: 10,

  runawayChance: 0.3,
  runawaySneakSec: 2.5,
  runawaySpeed: 3.2,
  runawayPenaltyMultiplier: 1,

  catSleepDecayPerSec: 1.6,
  catWakeAt: 20,
  catWakeSec: 3,
  catPetRatePerSec: 35,
  catBedWaitSec: 2.5,
  catRestlessMultiplier: 2,
  catOverPetSec: 1.5,
  catWalkSpeed: 1.3,
  catWanderPauseSec: [1, 2.5],
  catDoorBias: 0.35,
  catThiefChance: 0.3,
  catThiefChaseSpeed: 3.2,
  catThiefLeaveSpeed: 2.6,
  catGrabRange: 0.7,

  gangChance: 0.85,
  gangArriveTimeSec: [40, 120],
  gangSize: [3, 4],
  gangMenuTimeoutSec: 20,
  gangFoodPatienceSec: 40,
  gangGuessChance: 0.2,
  gangEatSec: [8, 12],
  gangWalkSpeed: 2.4,
  gangAttackSpeed: 8,
  gangEntryStaggerSec: 0.5,
  gangSitDelaySec: 0.8,

  penaltyCatScratch: 3,
  penaltyAuditFail: 15,
  penaltyEndShiftPerError: 5,
  penaltyAngerSlap: 10,
  ratingAngryLeave: 0.5,
  ratingSlowCounter: 0.25,
};

/** Mỗi ca sau khách tới dày hơn chút */
const SPAWN_SPEEDUP_PER_DAY = 0.9;
const MIN_SPAWN_INTERVAL: Range = [7, 12];
/** Ca bắt đầu có từng tình huống (mục 9: mỗi ca giới thiệu riêng một thứ) */
export const BOSS_FROM_DAY = 2;
export const RUNAWAY_FROM_DAY = 3;
export const CAT_FROM_DAY = 4;
export const GANG_FROM_DAY = 5;
/** Từ ca này mọi thứ đã có đủ: bắt đầu tăng độ khó chung + sự kiện ngày */
export const MIXED_FROM_DAY = 6;
const RUNAWAY_CHANCE_PER_DAY = 0.05;
const RUNAWAY_CHANCE_MAX = 0.5;
/** Ca 6+: kiên nhẫn của khách giảm dần mỗi ca, tối thiểu còn 60% */
const PATIENCE_DROP_PER_DAY = 0.05;
const PATIENCE_MIN_FACTOR = 0.6;
/** Ca 5+: mèo tỉnh nhanh hơn mỗi ca, tối đa gấp đôi */
const CAT_DECAY_GROWTH_PER_DAY = 0.1;
const CAT_DECAY_MAX_FACTOR = 2;
const CAT_THIEF_CHANCE_PER_DAY = 0.03;
const CAT_THIEF_CHANCE_MAX = 0.45;
const GANG_CHANCE_PER_DAY = 0.05;
/** Chủ quán bực nhanh hơn chút mỗi ca sau ca 6 */
const ANGER_GROWTH_PER_DAY = 0.05;
const ANGER_MAX_FACTOR = 1.6;

// ---------- Sự kiện đặc biệt theo ngày (mục 3.2) ----------

export type DayEventId = 'rain' | 'holiday' | 'football';

export interface DayEvent {
  id: DayEventId;
  /** Nhân với khoảng thời gian giữa 2 khách (nhỏ hơn = đông hơn) */
  spawnMultiplier: number;
  /** Nhân với mọi loại kiên nhẫn của khách */
  patienceMultiplier: number;
  /** Nhân với xác suất khách quỵt */
  runawayMultiplier: number;
  weight: number;
}

export const DAY_EVENTS: readonly DayEvent[] = [
  // Mưa: khách ít mà khó tính
  { id: 'rain', spawnMultiplier: 1.35, patienceMultiplier: 0.75, runawayMultiplier: 1, weight: 1 },
  // Lễ: đông nghẹt, ai cũng vội
  { id: 'holiday', spawnMultiplier: 0.65, patienceMultiplier: 0.9, runawayMultiplier: 1, weight: 1 },
  // Đội bóng: đông, dễ tính nhưng hay "quên" trả tiền
  { id: 'football', spawnMultiplier: 0.6, patienceMultiplier: 1.2, runawayMultiplier: 1.6, weight: 1 },
];
const DAY_EVENT_CHANCE = 0.6;

/** Những thứ được bốc ngẫu nhiên cho một ca. Chơi lại ca giữ nguyên để công bằng. */
export interface ShiftPlan {
  day: number;
  mood: BossMood;
  event: DayEvent | null;
}

export function planShift(day: number): ShiftPlan {
  const event = day >= MIXED_FROM_DAY && Math.random() < DAY_EVENT_CHANCE ? pickWeighted(DAY_EVENTS) : null;
  return { day, mood: pickMood(), event };
}

export function getShiftConfig(day: number, event: DayEvent | null = null): ShiftConfig {
  const factor = Math.pow(SPAWN_SPEEDUP_PER_DAY, Math.max(0, day - 1));
  const mixedDays = Math.max(0, day - MIXED_FROM_DAY + 1);
  const patience =
    Math.max(PATIENCE_MIN_FACTOR, 1 - PATIENCE_DROP_PER_DAY * mixedDays) * (event?.patienceMultiplier ?? 1);
  const spawnMul = event?.spawnMultiplier ?? 1;
  const catDays = Math.max(0, day - CAT_FROM_DAY);
  return {
    ...BASE,
    features: {
      boss: day >= BOSS_FROM_DAY,
      runaway: day >= RUNAWAY_FROM_DAY,
      cat: day >= CAT_FROM_DAY,
      gang: day >= GANG_FROM_DAY,
    },
    spawnIntervalSec: [
      Math.max(MIN_SPAWN_INTERVAL[0], BASE.spawnIntervalSec[0] * factor) * spawnMul,
      Math.max(MIN_SPAWN_INTERVAL[1], BASE.spawnIntervalSec[1] * factor) * spawnMul,
    ],
    patienceOrderSec: BASE.patienceOrderSec * patience,
    patienceFoodSec: BASE.patienceFoodSec * patience,
    patienceCounterSec: BASE.patienceCounterSec * patience,
    runawayChance: Math.min(
      RUNAWAY_CHANCE_MAX,
      (BASE.runawayChance + RUNAWAY_CHANCE_PER_DAY * Math.max(0, day - RUNAWAY_FROM_DAY)) *
        (event?.runawayMultiplier ?? 1),
    ),
    catSleepDecayPerSec:
      BASE.catSleepDecayPerSec * Math.min(CAT_DECAY_MAX_FACTOR, 1 + CAT_DECAY_GROWTH_PER_DAY * catDays),
    catThiefChance: Math.min(CAT_THIEF_CHANCE_MAX, BASE.catThiefChance + CAT_THIEF_CHANCE_PER_DAY * catDays),
    gangChance: Math.min(1, BASE.gangChance + GANG_CHANCE_PER_DAY * Math.max(0, day - GANG_FROM_DAY)),
    angerPerSec: BASE.angerPerSec * Math.min(ANGER_MAX_FACTOR, 1 + ANGER_GROWTH_PER_DAY * mixedDays),
  };
}

function pickWeighted<T extends { weight: number }>(items: readonly T[]): T {
  const total = items.reduce((s, m) => s + m.weight, 0);
  let r = Math.random() * total;
  for (const m of items) {
    r -= m.weight;
    if (r <= 0) return m;
  }
  return items[items.length - 1];
}

export function pickMood(): BossMood {
  return pickWeighted(BOSS_MOODS);
}
