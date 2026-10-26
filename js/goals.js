// Orientative targets: Mifflin-St Jeor BMR x 1.2 (a day of ordinary life, no exercise),
// plus the exercise actually logged that day, all adjusted by the weight goal.
// The nutritionist's numbers always win: when the profile uses them they stay fixed.

const DAILY_LIFE_FACTOR = 1.2;

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

// exerciseKcal: energy of the activity logged that day (0 = rest day, the base target).
export function computeTargets({ sex, age, heightCm, weightKg, goals }, exerciseKcal = 0) {
  const { kcalFactor, proteinPerKg } = weightStrategy(goals);
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161);
  const kcal = Math.round(((bmr * DAILY_LIFE_FACTOR + exerciseKcal) * kcalFactor) / 10) * 10;
  const protein = Math.round(weightKg * proteinPerKg);
  const fat = Math.round((kcal * FAT_SHARE) / 9);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { kcal, protein, carbs, fat };
}

// The target for one day: the nutritionist's fixed numbers, or the base plus that day's exercise.
export function targetsForDay(profile, exerciseKcal = 0) {
  if (profile.custom || !exerciseKcal) return profile.targets;
  return computeTargets(profile, exerciseKcal);
}

// Profiles saved before multi-goal support stored a single `goal`.
export function normalizeProfile(p) {
  if (!p) return p;
  const goals = p.goals ?? (p.goal ? [p.goal] : ['maintain']);
  return { waterGoalMl: 2000, name: '', ...p, goals };
}
