import { pick } from '../core/Random';
import type { EyeStyle, HairStyle, HumanoidLook, MouthStyle, BrowStyle } from './Humanoid';

// Ngoại hình mọi nhân vật. Khung người chung (Humanoid), mỗi người một kiểu ăn mặc + khuôn mặt.

/** Ông chủ dkhanh: theo ảnh mẫu — tóc đen rối kiểu anime, áo khoác đen mở khóa có mũ trùm xám,
 *  áo thun trắng, quần kaki túi hộp bó gấu, giày thể thao đen đế trắng */
export const BOSS_LOOK: HumanoidLook = {
  shirt: 0xf5f5f5,
  jacket: { color: 0x1c1c1c, hood: 0xdcdcdc, trim: 0xeeeeee, open: true },
  pants: 0xc8ac82,
  cargo: true,
  shoes: 0x161616,
  soles: 0xf2f2f2,
  skin: 0xf3d2b3,
  hair: { style: 'anime', color: 0x141414 },
  eyes: 'anime',
  eyeColor: 0x3b2314,
  mouth: 'line',
  build: 1.02,
};

/** Nhân viên (người chơi): đồng phục quán — mũ đỏ, áo xanh, tạp dề */
export const STAFF_LOOK: HumanoidLook = {
  shirt: 0x2f6fd6,
  pants: 0x2b2b3a,
  skin: 0xf1c7a1,
  hat: 0xd63031,
  apron: true,
  hair: { style: 'short', color: 0x1b1b1b },
  shoes: 0xecf0f1,
  eyes: 'round',
  mouth: 'smile',
  blush: true,
};

/** Nhóm giang hồ: chung chất xăm trổ kính râm, nhưng mỗi đứa một kiểu */
export const GANG_LOOKS: readonly HumanoidLook[] = [
  // Đại ca: đầu trọc, áo đen, xăm xanh, dây chuyền vàng, râu quai nón
  { shirt: 0x151515, pants: 0x2d3436, skin: 0xc68642, arms: 0x2c5f7c, sleeves: 'none', build: 1.25, sunglasses: true, goldChain: true, beard: 0x1b1b1b, brows: 'angry', shoes: 0x111111 },
  // Đàn em mào gà đỏ, áo khoác da đỏ đô kéo kín
  { shirt: 0x2b2b2b, jacket: { color: 0x5c1a1a, hood: 0x2b2b2b, trim: 0x1b1b1b, open: false }, pants: 0x1e272e, skin: 0xe0ac69, hair: { style: 'mohawk', color: 0xb03a2e }, sunglasses: true, brows: 'angry', mouth: 'open', shoes: 0x111111, soles: 0xbbbbbb, build: 1.1 },
  // Đàn em đầu đinh, áo ba lỗ xám, xăm đỏ, quần túi hộp
  { shirt: 0x555555, pants: 0x3d3d29, cargo: true, skin: 0x8d5524, arms: 0x7a2e2e, sleeves: 'none', hair: { style: 'buzz', color: 0x1b1b1b }, sunglasses: true, brows: 'thick', goldChain: true, shoes: 0x2b1d14, build: 1.18 },
  // Đàn em tóc vàng, áo thun tím than tay dài, kính râm
  { shirt: 0x1f1b3a, sleeves: 'long', pants: 0x111111, skin: 0xf1c7a1, hair: { style: 'spiky', color: 0xd4a017 }, sunglasses: true, mouth: 'smile', brows: 'angry', shoes: 0xecf0f1, soles: 0x111111, build: 1.12 },
];

// ---------- Khách ngẫu nhiên, không trùng ----------

const SKINS = [0xf6dcc4, 0xf1c7a1, 0xdcae84, 0xb98257, 0x8a5a3c];
const HAIR_STYLES: readonly HairStyle[] = ['short', 'spiky', 'bun', 'long', 'ponytail', 'anime', 'buzz', 'curly', 'bob', 'sidepart', 'mohawk'];
const HAIR_COLORS = [0x1b1b1b, 0x3b2314, 0x6b3e1e, 0xc9a227, 0xb03a2e, 0x7f8c8d, 0xe8e2d0, 0x5b4a8a];
const TOP_COLORS = [0xe84393, 0x00b894, 0xfdcb6e, 0x6c5ce7, 0xe17055, 0x0984e3, 0x2d3436, 0xffffff, 0x81ecec, 0xa29bfe, 0xfab1a0, 0x55efc4];
const JACKET_COLORS = [0x2d3436, 0x0c2461, 0x6d214f, 0x1e824c, 0x8e6e53, 0xb33939, 0x40407a, 0xd1ccc0];
const HOOD_COLORS = [0xdcdcdc, 0x95a5a6, 0x2d3436, 0xf8c291];
const PANTS_COLORS = [0x34495e, 0x2c3e50, 0x1e3799, 0x6d4c41, 0x4a4a4a, 0x8e7c5a, 0xc8ac82, 0x111111, 0x7f8fa6];
const SHOE_COLORS = [0x222222, 0xecf0f1, 0xc0392b, 0x795548, 0x0984e3, 0xf6b93b];
const EYE_COLORS = [0x1a1a1a, 0x3b2314, 0x2e86de, 0x218c74];
const EYES: readonly EyeStyle[] = ['round', 'anime', 'sleepy', 'happy'];
const MOUTHS: readonly MouthStyle[] = ['line', 'smile', 'open'];
const BROWS: readonly BrowStyle[] = ['normal', 'thin', 'thick', 'angry'];
type Outfit = 'tee' | 'tank' | 'longsleeve' | 'openJacket' | 'zipJacket';
const OUTFITS: readonly Outfit[] = ['tee', 'tee', 'tank', 'longsleeve', 'openJacket', 'zipJacket'];

/** Bao nhiêu khách gần nhất phải khác nhau (đủ phủ một ca) */
const UNIQUE_WINDOW = 24;
const MAX_TRIES = 60;

/** Dấu nhận dạng trang phục và khuôn mặt: khách mới không được trùng cái nào với khách gần đây */
function outfitKey(l: HumanoidLook): string {
  return `${l.jacket ? `j${l.jacket.color}` : `s${l.shirt}${l.sleeves}`}|${l.pants}`;
}
function faceKey(l: HumanoidLook): string {
  return `${l.hair?.style ?? 'bald'}${l.hair?.color ?? ''}|${l.hat ?? ''}|${l.eyes}`;
}

const recentOutfits: string[] = [outfitKey(BOSS_LOOK), outfitKey(STAFF_LOOK)];
const recentFaces: string[] = [faceKey(BOSS_LOOK), faceKey(STAFF_LOOK)];
const RESERVED = recentOutfits.length;

function randomLook(): HumanoidLook {
  const outfit = pick(OUTFITS);
  const skin = pick(SKINS);
  const hatted = Math.random() < 0.15;
  const look: HumanoidLook = {
    shirt: pick(TOP_COLORS),
    pants: pick(PANTS_COLORS),
    skin,
    shoes: pick(SHOE_COLORS),
    sleeves: outfit === 'tank' ? 'none' : outfit === 'longsleeve' ? 'long' : 'short',
    hair: Math.random() < 0.9 ? { style: pick(HAIR_STYLES), color: pick(HAIR_COLORS) } : undefined,
    eyes: pick(EYES),
    eyeColor: pick(EYE_COLORS),
    brows: pick(BROWS),
    mouth: pick(MOUTHS),
    build: 0.9 + Math.random() * 0.25,
  };
  if (outfit === 'openJacket' || outfit === 'zipJacket') {
    look.jacket = { color: pick(JACKET_COLORS), hood: pick(HOOD_COLORS), trim: pick(HOOD_COLORS), open: outfit === 'openJacket' };
  }
  if (hatted) look.hat = pick(TOP_COLORS);
  if (Math.random() < 0.35) look.cargo = true;
  else if (Math.random() < 0.2) look.shorts = true;
  if (Math.random() < 0.5) look.soles = pick([0xf2f2f2, 0x111111, 0xd35400]);
  if (Math.random() < 0.2) look.glasses = pick([0x1b1b1b, 0x8e6e53, 0xc0392b]);
  if (Math.random() < 0.12) look.beard = look.hair?.color ?? 0x1b1b1b;
  else if (Math.random() < 0.1) look.mustache = look.hair?.color ?? 0x1b1b1b;
  if (Math.random() < 0.2) look.blush = true;
  return look;
}

/** Ngoại hình khách mới: khác trang phục VÀ khác khuôn mặt với mọi khách gần đây (và với ông chủ, nhân viên) */
export function uniqueCustomerLook(): HumanoidLook {
  let look = randomLook();
  for (let i = 0; i < MAX_TRIES && (recentOutfits.includes(outfitKey(look)) || recentFaces.includes(faceKey(look))); i++) {
    look = randomLook();
  }
  for (const [list, key] of [
    [recentOutfits, outfitKey(look)],
    [recentFaces, faceKey(look)],
  ] as const) {
    list.push(key);
    // Giữ nguyên 2 mục đầu (ông chủ, nhân viên), bỏ khách cũ nhất
    if (list.length > RESERVED + UNIQUE_WINDOW) list.splice(RESERVED, 1);
  }
  return look;
}
