import type { FoodItem } from './types'
import { round, uid } from '../lib/util'

interface FoodBase {
  name: string
  portion: string
  grams: number
  kcal: number
  protein: number
  carbs: number
  fat: number
}

export const FOODS: Record<string, FoodBase> = {
  oats:          { name: 'Rolled oats',        portion: '60 g dry',    grams: 60,  kcal: 228, protein: 8.4,  carbs: 40,   fat: 4.2 },
  blueberries:   { name: 'Blueberries',        portion: '80 g',        grams: 80,  kcal: 46,  protein: 0.6,  carbs: 11,   fat: 0.3 },
  greekYogurt:   { name: 'Greek yoghurt',      portion: '150 g',       grams: 150, kcal: 133, protein: 15,   carbs: 6,    fat: 5.4 },
  eggs:          { name: 'Eggs',               portion: '2 large',     grams: 110, kcal: 155, protein: 13,   carbs: 1.1,  fat: 11 },
  sourdough:     { name: 'Sourdough toast',    portion: '2 slices',    grams: 90,  kcal: 218, protein: 8.1,  carbs: 42,   fat: 1.6 },
  avocado:       { name: 'Avocado',            portion: '½ medium',    grams: 70,  kcal: 112, protein: 1.4,  carbs: 6,    fat: 10 },
  granola:       { name: 'Granola',            portion: '45 g',        grams: 45,  kcal: 202, protein: 4.5,  carbs: 29,   fat: 7.4 },
  banana:        { name: 'Banana',             portion: '1 medium',    grams: 118, kcal: 105, protein: 1.3,  carbs: 27,   fat: 0.4 },
  chickenBreast: { name: 'Chicken breast',     portion: '150 g',       grams: 150, kcal: 248, protein: 46,   carbs: 0,    fat: 5.4 },
  brownRice:     { name: 'Brown rice',         portion: '180 g cooked',grams: 180, kcal: 218, protein: 5,    carbs: 46,   fat: 1.7 },
  broccoli:      { name: 'Broccoli',           portion: '120 g',       grams: 120, kcal: 41,  protein: 3.4,  carbs: 8,    fat: 0.4 },
  salmon:        { name: 'Salmon fillet',      portion: '140 g',       grams: 140, kcal: 291, protein: 34,   carbs: 0,    fat: 17 },
  quinoa:        { name: 'Quinoa',             portion: '160 g cooked',grams: 160, kcal: 192, protein: 7,    carbs: 34,   fat: 3.1 },
  mixedGreens:   { name: 'Mixed greens',       portion: '80 g',        grams: 80,  kcal: 18,  protein: 1.6,  carbs: 2.8,  fat: 0.3 },
  lentilSoup:    { name: 'Lentil soup',        portion: '350 ml',      grams: 350, kcal: 245, protein: 15,   carbs: 38,   fat: 3.6 },
  sweetPotato:   { name: 'Sweet potato',       portion: '200 g',       grams: 200, kcal: 172, protein: 3.2,  carbs: 40,   fat: 0.3 },
  tofu:          { name: 'Firm tofu',          portion: '160 g',       grams: 160, kcal: 232, protein: 26,   carbs: 5.6,  fat: 13 },
  pasta:         { name: 'Wholegrain pasta',   portion: '190 g cooked',grams: 190, kcal: 236, protein: 9.5,  carbs: 47,   fat: 1.9 },
  tomatoSauce:   { name: 'Tomato sauce',       portion: '120 g',       grams: 120, kcal: 68,  protein: 1.9,  carbs: 10,   fat: 2.4 },
  steak:         { name: 'Sirloin steak',      portion: '150 g',       grams: 150, kcal: 316, protein: 42,   carbs: 0,    fat: 16 },
  almonds:       { name: 'Almonds',            portion: '28 g',        grams: 28,  kcal: 164, protein: 6,    carbs: 6.1,  fat: 14 },
  apple:         { name: 'Apple',              portion: '1 medium',    grams: 180, kcal: 95,  protein: 0.5,  carbs: 25,   fat: 0.3 },
  proteinShake:  { name: 'Whey shake',         portion: '1 scoop',     grams: 32,  kcal: 122, protein: 24,   carbs: 3,    fat: 1.5 },
  darkChocolate: { name: 'Dark chocolate 85%', portion: '20 g',        grams: 20,  kcal: 119, protein: 1.8,  carbs: 6.4,  fat: 9.6 },
  walnuts:       { name: 'Walnuts',            portion: '25 g',        grams: 25,  kcal: 164, protein: 3.8,  carbs: 3.4,  fat: 16 },
  coffee:        { name: 'Flat white',         portion: '240 ml',      grams: 240, kcal: 118, protein: 6.8,  carbs: 9.6,  fat: 6.2 },
  oliveOil:      { name: 'Olive oil',          portion: '1 tbsp',      grams: 14,  kcal: 119, protein: 0,    carbs: 0,    fat: 14 },
  feta:          { name: 'Feta',               portion: '40 g',        grams: 40,  kcal: 106, protein: 5.6,  carbs: 1.6,  fat: 8.6 },
  chickpeas:     { name: 'Chickpeas',          portion: '120 g',       grams: 120, kcal: 197, protein: 10,   carbs: 33,   fat: 3.2 },
  cucumber:      { name: 'Cucumber',           portion: '80 g',        grams: 80,  kcal: 12,  protein: 0.5,  carbs: 2.9,  fat: 0.1 },
  riceNoodles:   { name: 'Rice noodles',       portion: '170 g cooked',grams: 170, kcal: 192, protein: 3.2,  carbs: 44,   fat: 0.3 },
  prawns:        { name: 'Prawns',             portion: '120 g',       grams: 120, kcal: 119, protein: 28,   carbs: 0,    fat: 0.5 },
}

export const FOOD_KEYS = Object.keys(FOODS)

export function makeFoodItem(key: string, scale = 1, confidence = 1): FoodItem {
  const b = FOODS[key]
  return {
    id: uid(),
    name: b.name,
    portion: b.portion,
    grams: Math.round(b.grams * scale),
    kcal: Math.round(b.kcal * scale),
    protein: round(b.protein * scale, 1),
    carbs: round(b.carbs * scale, 1),
    fat: round(b.fat * scale, 1),
    confidence,
  }
}

export function buildMealFrom(keys: string[], scale = 1): FoodItem[] {
  return keys.map((k) => makeFoodItem(k, scale))
}

/** Recompute an item's macros when the human edits the portion size. */
export function rescaleItem(item: FoodItem, newGrams: number): FoodItem {
  const ratio = item.grams > 0 ? newGrams / item.grams : 1
  return {
    ...item,
    grams: Math.round(newGrams),
    kcal: Math.round(item.kcal * ratio),
    protein: round(item.protein * ratio, 1),
    carbs: round(item.carbs * ratio, 1),
    fat: round(item.fat * ratio, 1),
    portion: `${Math.round(newGrams)} g`,
  }
}

export const mealTotals = (items: FoodItem[]) =>
  items.reduce(
    (a, i) => ({
      kcal: a.kcal + i.kcal,
      protein: round(a.protein + i.protein, 1),
      carbs: round(a.carbs + i.carbs, 1),
      fat: round(a.fat + i.fat, 1),
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  )
