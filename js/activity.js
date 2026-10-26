// Physical activity: minutes and calories burned per activity, plus muscle groups worked.
// Each activity has a personal reference in kcal per hour (editable in the profile; the treadmill
// one comes from Fernanda's own reading). Logging fills calories from it and they can be corrected.
// Defaults for the rest come from the Compendium of Physical Activities (MET × kg).
//
// The calories logged for each activity are the only reference: they are shown as they are and
// added as they are to that day's target.

export const ACTIVITIES = {
  'Cinta': { met: 5.2, fixedKcalPerHour: 400 },
  'Musculación': { met: 5 },
  'Caminata al aire libre': { met: 4.3 },
  'Cardio (bici, elíptico)': { met: 7 },
  'Pádel': { met: 6 },
  'Biodanza': { met: 5 },
  'Pilates o yoga': { met: 3 },
  'Otro': { met: 4 },
};
export const WORKOUT_TYPES = Object.keys(ACTIVITIES);

// Names used before the treadmill had its own entry.
const LEGACY_TYPES = { 'Caminata': 'Caminata al aire libre', 'Cardio': 'Cardio (bici, elíptico)' };
const typeOf = (t) => LEGACY_TYPES[t] ?? (ACTIVITIES[t] ? t : 'Otro');

// Older records also carried an intensity per activity.
const LEGACY_INTENSITY_FACTOR = { low: 0.75, mid: 1, high: 1.25 };

export const MUSCLES = ['Piernas', 'Glúteos', 'Espalda', 'Pecho', 'Hombros', 'Brazos', 'Abdomen y core', 'Cuerpo completo'];

export function defaultRates(kg) {
  return Object.fromEntries(Object.entries(ACTIVITIES).map(([type, a]) => [type, a.fixedKcalPerHour ?? Math.round((a.met * kg) / 5) * 5]));
}

// The user's reference kcal/hour per activity (profile overrides on top of the defaults).
export function ratesFor(profile) {
  return { ...defaultRates(profile.weightKg), ...(profile.activityRates ?? {}) };
}

export const kcalFromRate = (rate, minutes) => Math.round((rate * (minutes || 0)) / 60);

// Total burned by one activity: what was logged, or the reference rate for those minutes.
export function partKcal(part, rates) {
  if (part.kcal > 0) return Math.round(part.kcal);
  if (part.deviceKcal > 0) return Math.round(part.deviceKcal);
  const base = kcalFromRate(rates[typeOf(part.type)] ?? rates.Otro, part.minutes);
  return Math.round(base * (LEGACY_INTENSITY_FACTOR[part.intensity] ?? 1));
}

export function workoutParts(w) {
  const parts = w.parts?.length
    ? w.parts
    : (w.types ?? (w.type ? w.type.split(' + ') : ['Otro'])).map((type, _, all) => ({
      type, minutes: Math.round((w.minutes || 0) / all.length), intensity: w.intensity ?? 'mid',
    }));
  return parts.map((p) => ({ ...p, type: typeOf(p.type) }));
}

export function workoutSummary(w, profile) {
  const rates = ratesFor(profile);
  const parts = workoutParts(w).map((p) => ({ ...p, kcal: partKcal(p, rates) }));
  const minutes = parts.reduce((s, p) => s + (p.minutes || 0), 0);
  const totalKcal = parts.reduce((s, p) => s + p.kcal, 0);
  return { parts, minutes, totalKcal, muscles: w.muscles ?? [] };
}

export function dayActivity(workouts, profile) {
  return workouts.reduce((acc, w) => {
    const s = workoutSummary(w, profile);
    return {
      minutes: acc.minutes + s.minutes,
      totalKcal: acc.totalKcal + s.totalKcal,
      sessions: acc.sessions + 1,
    };
  }, { minutes: 0, totalKcal: 0, sessions: 0 });
}

export const partLabel = (p) => `${p.type} ${p.minutes} min, ${p.kcal} kcal`;
