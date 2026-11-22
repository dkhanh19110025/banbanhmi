// MỌI con số cân bằng nằm ở đây. Đơn vị thời gian: giây. Tiền: nghìn đồng.
import type { Range } from '../core/Random';
import type { IngredientId } from './menu';

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
    /** Chảo bốc cháy (ca 6+) */
    fire: boolean;
    /** Shipper giục đơn (ca 7+) */
    shipper: boolean;
    /** Hết nguyên liệu (ca 8+) */
    supply: boolean;
    /** Mất điện (ca 9+) */
    blackout: boolean;
    /** Thanh tra vệ sinh (ca 10+) */
    inspector: boolean;
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
  /** Khách trộm đứng sát mèo đang ngủ bấy nhiêu giây rồi mới bế (dấu hiệu báo trước; vuốt mèo là khách bỏ cuộc) */
  catLurkSec: number;

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

  // --- Chủ quán hỏi sổ bất ngờ lúc đang bưng đồ ---
  /** Xác suất mỗi giây (khi chủ quán thấy bạn đang bưng đồ trong tầm) */
  bossAmbushPerSec: number;
  bossAmbushRange: number;
  bossAmbushCooldownSec: number;

  // --- Chảo bốc cháy ---
  /** Xác suất mỗi lần nướng xong mà chảo bị quên → bốc khói */
  fireChancePerCook: number;
  /** Sau khi nướng xong, chảo bốc khói đen sau bấy nhiêu giây (nếu bị bỏ quên) */
  fireSmokeAfterSec: Range;
  /** Khói đen báo trước bấy nhiêu giây thì bùng lửa */
  fireWarnSec: number;
  /** Lửa bùng → cháy lan hết quán sau bấy nhiêu giây nếu chưa dập */
  fireSpreadSec: number;
  /** Tạt nước vào chảo dầu: lửa lan nhanh gấp bấy nhiêu lần */
  fireWaterSpeedup: number;
  fireCooldownSec: number;
  penaltyFireWater: number;
  /** Cầm bình cứu hỏa lang thang trước mặt chủ quán bấy nhiêu giây thì ăn tát (chỉ tát, không trừ lương) */
  extinguisherSlapSec: number;
  extinguisherSlapCooldownSec: number;

  // --- Shipper giục đơn ---
  shipperFirstSec: Range;
  shipperIntervalSec: Range;
  /** Shipper chờ bấy nhiêu giây rồi bỏ đi chửi */
  shipperWaitSec: number;
  shipperHonkSec: number;
  shipperWalkSpeed: number;
  ratingShipperOk: number;
  ratingShipperLate: number;
  penaltyShipperLate: number;
  angerShipper: number;

  // --- Hết nguyên liệu ---
  supplyStart: Record<IngredientId, number>;
  /** Còn ≤ bấy nhiêu phần thì báo sắp hết (và cho phép ra chợ mua) */
  supplyLowAt: number;
  /** Mỗi lần mua về cất kệ được thêm bấy nhiêu phần */
  supplyRefill: number;

  // --- Mất điện ---
  /** Xác suất có mất điện trong ca (ngày mưa: chắc chắn) */
  powerChance: number;
  powerFirstSec: Range;
  /** Đèn chớp báo trước bấy nhiêu giây */
  powerWarnSec: number;
  /** Tự có điện lại sau bấy nhiêu giây nếu không nổ máy phát */
  powerOutageSec: number;
  generatorHoldSec: number;
  powerDarkness: number;
  powerCandleDarkness: number;

  // --- Thanh tra vệ sinh ---
  inspectorChance: number;
  inspectorArriveSec: Range;
  /** Từ lúc xe lạ đỗ tới lúc thanh tra bước vào */
  inspectorWarnSec: number;
  inspectorDirtSpots: number;
  inspectorWalkSpeed: number;
  inspectorLookSec: number;
  penaltyInspectorFine: number;
  penaltyInspectorPerSpot: number;
  ratingInspectorPass: number;
  ratingInspectorFail: number;
  angerInspector: number;

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
  spawnIntervalSec: [15, 20],
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
  catThiefChance: 0.4,
  catThiefChaseSpeed: 3.2,
  catThiefLeaveSpeed: 2.6,
  catGrabRange: 0.7,
  catLurkSec: 4,

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

  bossAmbushPerSec: 0.12,
  bossAmbushRange: 6,
  bossAmbushCooldownSec: 45,

  fireChancePerCook: 0.3,
  fireSmokeAfterSec: [4, 8],
  fireWarnSec: 3.5,
  fireSpreadSec: 9,
  fireWaterSpeedup: 3,
  fireCooldownSec: 25,
  penaltyFireWater: 10,
  extinguisherSlapSec: 2,
  extinguisherSlapCooldownSec: 12,

  shipperFirstSec: [25, 45],
  shipperIntervalSec: [45, 70],
  shipperWaitSec: 35,
  shipperHonkSec: 2.2,
  shipperWalkSpeed: 3.2,
  ratingShipperOk: 0.25,
  ratingShipperLate: -0.5,
  penaltyShipperLate: 8,
  angerShipper: 15,

  supplyStart: { pate: 4, dua: 5, gas: 7 },
  supplyLowAt: 1,
  supplyRefill: 6,

  powerChance: 0.8,
  powerFirstSec: [50, 110],
  powerWarnSec: 3.5,
  powerOutageSec: 40,
  generatorHoldSec: 2.5,
  powerDarkness: 0.82,
  powerCandleDarkness: 0.5,

  inspectorChance: 0.85,
  inspectorArriveSec: [70, 130],
  inspectorWarnSec: 40,
  inspectorDirtSpots: 4,
  inspectorWalkSpeed: 2.4,
  inspectorLookSec: 4,
  penaltyInspectorFine: 20,
  penaltyInspectorPerSpot: 5,
  ratingInspectorPass: 0.25,
  ratingInspectorFail: -1,
  angerInspector: 25,

  penaltyCatScratch: 3,
  penaltyAuditFail: 15,
  penaltyEndShiftPerError: 5,
  penaltyAngerSlap: 10,
  ratingAngryLeave: 0.5,
  ratingSlowCounter: 0.25,
};

/** Khách mới tới cách nhau bao lâu: đổi theo mốc ca, trong cùng mốc thì giữ nguyên */
const SPAWN_BY_DAY: ReadonlyArray<{ fromDay: number; interval: Range }> = [
  { fromDay: 1, interval: [15, 20] },
  { fromDay: 6, interval: [13.5, 17.5] },
  { fromDay: 8, interval: [12, 15] },
];
/** Từ ca này kiên nhẫn của khách cố định (trước đó dùng BASE) */
const PATIENCE_FIXED_FROM_DAY = 8;
const PATIENCE_FIXED_ORDER_SEC = 25;
const PATIENCE_FIXED_FOOD_SEC = 35;
/** Ca bắt đầu có từng tình huống (mục 9: mỗi ca giới thiệu riêng một thứ) */
export const BOSS_FROM_DAY = 2;
export const RUNAWAY_FROM_DAY = 3;
export const CAT_FROM_DAY = 4;
export const GANG_FROM_DAY = 5;
/** Sự cố bếp và cửa hàng — mỗi ca giới thiệu riêng một thứ (mục 9) */
export const FIRE_FROM_DAY = 6;
export const SHIPPER_FROM_DAY = 7;
export const SUPPLY_FROM_DAY = 8;
export const BLACKOUT_FROM_DAY = 9;
export const INSPECTOR_FROM_DAY = 10;
/** Chủ quán bắt đầu hỏi sổ bất ngờ lúc bạn đang bưng đồ */
const AMBUSH_FROM_DAY = 3;
/** Từ ca này mọi thứ đã có đủ: bắt đầu tăng độ khó chung + sự kiện ngày */
export const MIXED_FROM_DAY = 6;
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

/** Dựng lại đúng kế hoạch ca đang dở (tâm trạng + sự kiện) để chơi lại không "đổ xúc xắc" lại */
export function restorePlan(day: number, moodId: MoodId, eventId: DayEventId | null): ShiftPlan {
  const mood = BOSS_MOODS.find((m) => m.id === moodId) ?? pickMood();
  const event = DAY_EVENTS.find((e) => e.id === eventId) ?? null;
  return { day, mood, event };
}

export function planShift(day: number): ShiftPlan {
  const event = day >= MIXED_FROM_DAY && Math.random() < DAY_EVENT_CHANCE ? pickWeighted(DAY_EVENTS) : null;
  return { day, mood: pickMood(), event };
}

export function getShiftConfig(day: number, event: DayEvent | null = null): ShiftConfig {
  const mixedDays = Math.max(0, day - MIXED_FROM_DAY + 1);
  const patienceMul = event?.patienceMultiplier ?? 1;
  const spawnMul = event?.spawnMultiplier ?? 1;
  // Mốc cuối cùng có fromDay <= day
  const spawn = [...SPAWN_BY_DAY].reverse().find((s) => day >= s.fromDay) ?? SPAWN_BY_DAY[0];
  const fixedPatience = day >= PATIENCE_FIXED_FROM_DAY;
  return {
    ...BASE,
    features: {
      boss: day >= BOSS_FROM_DAY,
      runaway: day >= RUNAWAY_FROM_DAY,
      cat: day >= CAT_FROM_DAY,
      gang: day >= GANG_FROM_DAY,
      fire: day >= FIRE_FROM_DAY,
      shipper: day >= SHIPPER_FROM_DAY,
      supply: day >= SUPPLY_FROM_DAY,
      blackout: day >= BLACKOUT_FROM_DAY,
      inspector: day >= INSPECTOR_FROM_DAY,
    },
    spawnIntervalSec: [spawn.interval[0] * spawnMul, spawn.interval[1] * spawnMul],
    patienceOrderSec: (fixedPatience ? PATIENCE_FIXED_ORDER_SEC : BASE.patienceOrderSec) * patienceMul,
    patienceFoodSec: (fixedPatience ? PATIENCE_FIXED_FOOD_SEC : BASE.patienceFoodSec) * patienceMul,
    // Đứng chờ ở quầy: luôn đúng BASE, không đổi theo ca hay sự kiện
    patienceCounterSec: BASE.patienceCounterSec,
    runawayChance: BASE.runawayChance * (event?.runawayMultiplier ?? 1),
    gangChance: Math.min(1, BASE.gangChance + GANG_CHANCE_PER_DAY * Math.max(0, day - GANG_FROM_DAY)),
    bossAmbushPerSec: day >= AMBUSH_FROM_DAY ? BASE.bossAmbushPerSec : 0,
    // Ngày mưa: mất điện chắc chắn (mục 5: "hợp với ca mưa")
    powerChance: event?.id === 'rain' ? 1 : BASE.powerChance,
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
