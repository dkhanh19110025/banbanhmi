// Danh sách món. Giá tính bằng nghìn đồng (25 = 25k).
export type DishId = 'thit' | 'pate' | 'trung' | 'dacbiet';

/** Nguyên liệu có thể hết (sự cố "hết nguyên liệu", ca 8+) */
export type IngredientId = 'pate' | 'dua' | 'gas';

export const INGREDIENTS: Record<IngredientId, { name: string; icon: string }> = {
  pate: { name: 'Pate', icon: '🥫' },
  dua: { name: 'Dưa leo', icon: '🥒' },
  gas: { name: 'Gas', icon: '🛢️' },
};

export interface Dish {
  id: DishId;
  name: string;
  price: number;
  color: number;
  /** Phím tắt chọn món trong sổ tay */
  hotkey: string;
  /** Mỗi lần nướng tốn 1 phần mỗi nguyên liệu này */
  ingredients: readonly IngredientId[];
}

export const MENU: readonly Dish[] = [
  { id: 'thit', name: 'Bánh mì thịt', price: 25, color: 0xd2691e, hotkey: 'Z', ingredients: ['dua', 'gas'] },
  { id: 'pate', name: 'Bánh mì pate', price: 20, color: 0x8b5a2b, hotkey: 'X', ingredients: ['pate', 'dua'] },
  { id: 'trung', name: 'Bánh mì trứng', price: 18, color: 0xf2d34f, hotkey: 'C', ingredients: ['gas'] },
  { id: 'dacbiet', name: 'Bánh mì đặc biệt', price: 35, color: 0xc0392b, hotkey: 'V', ingredients: ['pate', 'dua', 'gas'] },
];

export function getDish(id: DishId): Dish {
  const dish = MENU.find((d) => d.id === id);
  if (!dish) throw new Error(`Không có món ${id}`);
  return dish;
}

export function formatMoney(k: number): string {
  return `${k}k`;
}
