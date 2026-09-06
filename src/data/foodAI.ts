import type { FoodItem } from './types'
import { makeFoodItem } from './foods'
import { uid } from '../lib/util'

export interface Recognition {
  id: string
  /** Best-guess dish name — a label for the plate, not a claim about it. */
  dish: string
  items: FoodItem[]
  /** Overall model confidence, 0–1. Always surfaced to the human. */
  confidence: number
  /** Plausible alternatives so the human can correct rather than retype. */
  alternatives: string[]
  /** Named reason the model is unsure, when it is. */
  caveat?: string
}

interface Scene {
  dish: string
  keys: string[]
  scales: number[]
  confidences: number[]
  alternatives: string[]
  caveat?: string
}

const SCENES: Scene[] = [
  {
    dish: 'Salmon, sweet potato and greens',
    keys: ['salmon', 'sweetPotato', 'broccoli', 'oliveOil'],
    scales: [1, 0.9, 1.1, 1],
    confidences: [0.94, 0.88, 0.83, 0.51],
    alternatives: ['Trout instead of salmon', 'Roast potato instead of sweet potato'],
    caveat: 'Cooking oil is hard to see in a photo — the estimate assumes about one tablespoon.',
  },
  {
    dish: 'Chicken and rice bowl',
    keys: ['chickenBreast', 'brownRice', 'broccoli'],
    scales: [1, 1.15, 0.85],
    confidences: [0.91, 0.79, 0.86],
    alternatives: ['Turkey instead of chicken', 'White rice instead of brown'],
    caveat: 'Rice portions are the least reliable part of this estimate.',
  },
  {
    dish: 'Greek yoghurt bowl',
    keys: ['greekYogurt', 'blueberries', 'granola'],
    scales: [1, 1, 0.8],
    confidences: [0.93, 0.9, 0.72],
    alternatives: ['Skyr instead of Greek yoghurt', 'Muesli instead of granola'],
  },
  {
    dish: 'Mediterranean chickpea salad',
    keys: ['chickpeas', 'feta', 'cucumber', 'mixedGreens', 'oliveOil'],
    scales: [1, 0.9, 1, 1, 0.8],
    confidences: [0.87, 0.76, 0.9, 0.92, 0.48],
    alternatives: ['Halloumi instead of feta', 'Butter beans instead of chickpeas'],
    caveat: 'Dressing quantity is a rough estimate.',
  },
  {
    dish: 'Prawn noodle bowl',
    keys: ['prawns', 'riceNoodles', 'mixedGreens'],
    scales: [1, 1, 0.9],
    confidences: [0.82, 0.85, 0.8],
    alternatives: ['Tofu instead of prawns', 'Egg noodles instead of rice noodles'],
    caveat: 'Broth and sauces are not visible, so sodium and added fat are not estimated.',
  },
  {
    dish: 'Eggs on sourdough with avocado',
    keys: ['eggs', 'sourdough', 'avocado'],
    scales: [1, 1, 1],
    confidences: [0.95, 0.89, 0.91],
    alternatives: ['Poached instead of fried', 'Rye instead of sourdough'],
  },
  {
    dish: 'Steak and greens',
    keys: ['steak', 'mixedGreens', 'sweetPotato'],
    scales: [0.95, 1, 0.75],
    confidences: [0.9, 0.88, 0.63],
    alternatives: ['Rump instead of sirloin', 'Regular potato instead of sweet potato'],
    caveat: 'Portion depth is hard to judge from one angle — check the steak weight.',
  },
]

/** A low-confidence outcome the flow has to handle gracefully, not hide. */
const UNCLEAR: Scene = {
  dish: 'Mixed plate',
  keys: ['chickenBreast', 'brownRice'],
  scales: [0.8, 0.8],
  confidences: [0.44, 0.41],
  alternatives: ['Pork instead of chicken', 'Couscous instead of rice'],
  caveat: 'The photo is dim and the plate is partly out of frame. Please check every item.',
}

/**
 * Simulates on-device meal recognition. Deterministic per photo seed so the
 * same "photo" always yields the same proposal — a real model would too.
 */
export function recognise(seed: number): Recognition {
  const unclear = seed % 7 === 3
  const scene = unclear ? UNCLEAR : SCENES[seed % SCENES.length]
  const items = scene.keys.map((k, i) => makeFoodItem(k, scene.scales[i], scene.confidences[i]))
  const confidence = items.reduce((a, i) => a + i.confidence, 0) / items.length
  return {
    id: uid(),
    dish: scene.dish,
    items,
    confidence,
    alternatives: scene.alternatives,
    caveat: scene.caveat,
  }
}

export function confidenceBand(c: number): { label: string; tone: 'high' | 'medium' | 'low' } {
  if (c >= 0.85) return { label: 'High confidence', tone: 'high' }
  if (c >= 0.65) return { label: 'Moderate confidence', tone: 'medium' }
  return { label: 'Low confidence — please check', tone: 'low' }
}
