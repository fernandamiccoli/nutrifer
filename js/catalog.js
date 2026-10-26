// Unified food catalog: the starter list plus the user's own foods ("mis alimentos").
import * as db from './db.js';
import { FOODS, COMBOS, baseFood, matches } from './foods.js';

let myFoods = [];

export async function loadMyFoods() {
  myFoods = (await db.all('foods')).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  return myFoods;
}

export const getMyFoods = () => myFoods;

export function findFood(id) {
  return myFoods.find((f) => f.id === id) ?? baseFood(id);
}

export function findByBarcode(code) {
  return myFoods.find((f) => f.barcode === code);
}

export async function saveMyFood(food) {
  const saved = await db.put('foods', { ...food, id: food.id ?? db.newId(), custom: true });
  await loadMyFoods();
  return saved;
}

export async function deleteMyFood(id) {
  await db.remove('foods', id);
  await loadMyFoods();
}

// filter: all | mine | veg | combos
export function search(query, filter = 'all') {
  if (filter === 'combos') return { foods: [], combos: COMBOS.filter((c) => matches(c, query)) };
  let foods;
  if (filter === 'mine') foods = myFoods;
  else if (filter === 'veg') foods = FOODS.filter((f) => f.tags.includes('veg'));
  else foods = [...myFoods, ...FOODS];
  foods = foods.filter((f) => matches(f, query));
  const combos = filter === 'all' && query.trim() ? COMBOS.filter((c) => matches(c, query)) : [];
  return { foods: foods.slice(0, query.trim() ? 40 : 60), combos };
}

// True when the food counts toward the daily fruit and vegetable grams.
export function isProduce(food) {
  return !!food && (food.tags?.includes('veg') || food.tags?.includes('fruit'));
}
