// Physical activity: energy estimate by METs and muscle groups worked.
// MET values approximated from the Compendium of Physical Activities (Ainsworth et al.).
// Two numbers per activity:
//   total = MET × kg × hours: what a treadmill or a watch shows (includes the resting burn).
//   extra = (MET − 1) × kg × hours: what exercise adds over rest. Only this goes onto the daily
//           target, because the base target already covers the resting burn.
// When the machine or watch reading is known, it replaces the MET estimate as the total.

export const INTENSITY = { low: 'Suave', mid: 'Moderada', high: 'Intensa' };

export const ACTIVITIES = {
  'Musculación': { low: 3.5, mid: 5, high: 6 },
  'Caminata': { low: 3, mid: 4.3, high: 6 },
  'Cardio': { low: 5, mid: 7, high: 8.5 },
  'Pádel': { low: 5, mid: 6, high: 7.3 },
  'Biodanza': { low: 4, mid: 5, high: 6 },
  'Pilates o yoga': { low: 2.5, mid: 3, high: 4 },
  'Otro': { low: 3, mid: 4, high: 5.5 },
};
export const WORKOUT_TYPES = Object.keys(ACTIVITIES);

export const INTENSITY_HINTS = {
  'Caminata': 'Suave: hasta 4,5 km/h. Moderada: 5 a 6 km/h. Intensa: más rápido o con inclinación.',
  'Musculación': 'Suave: pesos livianos y pausas largas. Moderada: series exigentes. Intensa: pesos altos o circuito sin pausa.',
  'Cardio': 'Suave: podés hablar cómoda. Moderada: hablás entrecortado. Intensa: casi no podés hablar.',
};

export const MUSCLES = ['Piernas', 'Glúteos', 'Espalda', 'Pecho', 'Hombros', 'Brazos', 'Abdomen y core', 'Cuerpo completo'];

export function partEnergy({ type, minutes, intensity, deviceKcal }, kg) {
  const hours = (minutes || 0) / 60;
  const resting = kg * hours; // 1 MET
  if (deviceKcal > 0) return { total: Math.round(deviceKcal), extra: Math.max(0, Math.round(deviceKcal - resting)) };
  const met = ACTIVITIES[type]?.[intensity] ?? ACTIVITIES.Otro.mid;
  return { total: Math.round(met * kg * hours), extra: Math.max(0, Math.round((met - 1) * kg * hours)) };
}

// Older records kept one type list, total minutes and one intensity for the whole session.
export function workoutParts(w) {
  if (w.parts?.length) return w.parts;
  const types = w.types ?? (w.type ? w.type.split(' + ') : ['Otro']);
  const each = Math.round((w.minutes || 0) / types.length);
  return types.map((type) => ({ type: ACTIVITIES[type] ? type : 'Otro', minutes: each, intensity: w.intensity ?? 'mid' }));
}

// kcal = extra over rest (goes to the target); totalKcal = comparable to a machine reading.
export function workoutSummary(w, kg) {
  const parts = workoutParts(w);
  const minutes = parts.reduce((s, p) => s + (p.minutes || 0), 0);
  const energy = parts.map((p) => partEnergy(p, kg));
  return {
    parts,
    minutes,
    kcal: energy.reduce((s, e) => s + e.extra, 0),
    totalKcal: energy.reduce((s, e) => s + e.total, 0),
    muscles: w.muscles ?? [],
    fromDevice: parts.some((p) => p.deviceKcal > 0),
  };
}

export function dayActivity(workouts, kg) {
  return workouts.reduce((acc, w) => {
    const s = workoutSummary(w, kg);
    return {
      minutes: acc.minutes + s.minutes,
      kcal: acc.kcal + s.kcal,
      totalKcal: acc.totalKcal + s.totalKcal,
      sessions: acc.sessions + 1,
    };
  }, { minutes: 0, kcal: 0, totalKcal: 0, sessions: 0 });
}

export const partLabel = (p) => `${p.type} ${p.minutes} min${p.intensity ? ` (${INTENSITY[p.intensity].toLowerCase()})` : ''}${p.deviceKcal > 0 ? `, ${p.deviceKcal} kcal según el aparato` : ''}`;
