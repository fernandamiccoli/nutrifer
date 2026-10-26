// Orientative targets: Mifflin-St Jeor BMR x activity factor, adjusted by goals.
// The nutritionist's numbers always win; the profile lets the user override them.

export const ACTIVITY = {
  sedentary: { label: 'Poca actividad', hint: 'Trabajo sentada, casi sin ejercicio', factor: 1.2 },
  light: { label: 'Liviana', hint: 'Caminatas o ejercicio 1 a 3 veces por semana', factor: 1.375 },
  moderate: { label: 'Moderada', hint: 'Ejercicio 3 a 5 veces por semana', factor: 1.55 },
  high: { label: 'Alta', hint: 'Ejercicio intenso casi todos los días', factor: 1.725 },
};

// Several goals can be active at once. Only the weight ones change the numbers.
export const GOALS = {
  lose: { label: 'Bajar de peso' },
  gain: { label: 'Ganar masa muscular' },
  maintain: { label: 'Mantener mi peso' },
  antiinflammatory: { label: 'Comer antiinflamatorio' },
  balanced: { label: 'Comer equilibrado' },
  macros: { label: 'Controlar macros' },
};

export const PRODUCE_TARGET_G = 400; // WHO: at least 400 g of fruit and vegetables per day
export const BOTTLE_ML = 500;

const FAT_SHARE = 0.28;

function weightStrategy(goals) {
  const lose = goals.includes('lose');
  const gain = goals.includes('gain');
  if (lose && gain) return { kcalFactor: 0.95, proteinPerKg: 1.8 }; // recomposition
  if (lose) return { kcalFactor: 0.85, proteinPerKg: 1.6 };
  if (gain) return { kcalFactor: 1.1, proteinPerKg: 1.8 };
  return { kcalFactor: 1, proteinPerKg: 1.4 };
}

export function computeTargets({ sex, age, heightCm, weightKg, activity, goals }) {
  const { kcalFactor, proteinPerKg } = weightStrategy(goals);
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161);
  const kcal = Math.round((base * ACTIVITY[activity].factor * kcalFactor) / 10) * 10;
  const protein = Math.round(weightKg * proteinPerKg);
  const fat = Math.round((kcal * FAT_SHARE) / 9);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { kcal, protein, carbs, fat };
}

// Profiles saved before multi-goal support stored a single `goal`.
export function normalizeProfile(p) {
  if (!p) return p;
  const goals = p.goals ?? (p.goal ? [p.goal] : ['maintain']);
  return { waterGoalMl: 2000, name: '', ...p, goals };
}
