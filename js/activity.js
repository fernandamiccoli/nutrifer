// Physical activity: energy estimate by METs and muscle groups worked.
// MET values approximated from the Compendium of Physical Activities (Ainsworth et al.).
// Energy counts only what exercise adds over rest: kcal ≈ (MET − 1) × kg × hours.

export const INTENSITY = { low: 'Suave', mid: 'Moderada', high: 'Intensa' };

export const ACTIVITIES = {
  'Musculación': { low: 3.5, mid: 5, high: 6 },
  'Caminata': { low: 3, mid: 3.8, high: 5 },
  'Cardio': { low: 5, mid: 7, high: 8.5 },
  'Pádel': { low: 5, mid: 6, high: 7.3 },
  'Biodanza': { low: 4, mid: 5, high: 6 },
  'Pilates o yoga': { low: 2.5, mid: 3, high: 4 },
  'Otro': { low: 3, mid: 4, high: 5.5 },
};
export const WORKOUT_TYPES = Object.keys(ACTIVITIES);

export const MUSCLES = ['Piernas', 'Glúteos', 'Espalda', 'Pecho', 'Hombros', 'Brazos', 'Abdomen y core', 'Cuerpo completo'];

export function partKcal({ type, minutes, intensity }, kg) {
  const met = ACTIVITIES[type]?.[intensity] ?? ACTIVITIES.Otro.mid;
  return Math.max(0, Math.round((met - 1) * kg * (minutes / 60)));
}

// Older records kept one type list, total minutes and one intensity for the whole session.
export function workoutParts(w) {
  if (w.parts?.length) return w.parts;
  const types = w.types ?? (w.type ? w.type.split(' + ') : ['Otro']);
  const each = Math.round((w.minutes || 0) / types.length);
  return types.map((type) => ({ type: ACTIVITIES[type] ? type : 'Otro', minutes: each, intensity: w.intensity ?? 'mid' }));
}

export function workoutSummary(w, kg) {
  const parts = workoutParts(w);
  const minutes = parts.reduce((s, p) => s + (p.minutes || 0), 0);
  const kcal = parts.reduce((s, p) => s + partKcal(p, kg), 0);
  return { parts, minutes, kcal, muscles: w.muscles ?? [] };
}

export function dayActivity(workouts, kg) {
  return workouts.reduce((acc, w) => {
    const s = workoutSummary(w, kg);
    return { minutes: acc.minutes + s.minutes, kcal: acc.kcal + s.kcal, sessions: acc.sessions + 1 };
  }, { minutes: 0, kcal: 0, sessions: 0 });
}

export const partLabel = (p) => `${p.type} ${p.minutes} min${p.intensity ? ` (${INTENSITY[p.intensity].toLowerCase()})` : ''}`;
