// Shared helpers: formatting, dates, escaping, toast, icons, object URLs.

export const num = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
export const dec = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });
export const amountFmt = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });

export const MEALS = [
  { id: 'desayuno', label: 'Desayuno' },
  { id: 'almuerzo', label: 'Almuerzo' },
  { id: 'merienda', label: 'Merienda' },
  { id: 'cena', label: 'Cena' },
  { id: 'colacion', label: 'Colaciones' },
];

export const mealLabel = (id) => MEALS.find((m) => m.id === id)?.label ?? id;

// When each medication or supplement is taken: before, during or after a meal.
// "En ayunas" sits before breakfast and "Antes de dormir" after dinner.
// short = label inside the meal block; label = full label for selectors and the report.
const MED_MEALS = [
  ['desayuno', 'Desayuno', 'del desayuno'],
  ['almuerzo', 'Almuerzo', 'del almuerzo'],
  ['merienda', 'Merienda', 'de la merienda'],
  ['cena', 'Cena', 'de la cena'],
];
export const MED_MOMENTS = MED_MEALS.flatMap(([meal, , of]) => [
  ...(meal === 'desayuno' ? [{ id: 'ayunas', meal, slot: 'antes', short: 'En ayunas', label: 'En ayunas' }] : []),
  { id: `${meal}-antes`, meal, slot: 'antes', short: 'Antes', label: `Antes ${of}` },
  { id: `${meal}-durante`, meal, slot: 'durante', short: 'Durante', label: `Durante ${of.replace(/^del /, 'el ').replace(/^de la /, 'la ')}` },
  { id: `${meal}-despues`, meal, slot: 'despues', short: 'Después', label: `Después ${of}` },
  ...(meal === 'cena' ? [{ id: 'dormir', meal, slot: 'despues', short: 'Antes de dormir', label: 'Antes de dormir' }] : []),
]);
export const MED_MOMENT_GROUPS = MED_MEALS.map(([meal, label]) => ({ label, moments: MED_MOMENTS.filter((m) => m.meal === meal) }));

// Moments used by earlier versions of the app.
const LEGACY_MOMENTS = {
  desayuno: 'desayuno-durante',
  mediodia: 'almuerzo-durante',
  merienda: 'merienda-durante',
  cena: 'cena-durante',
  noche: 'cena-despues',
};
export const normalizeMoment = (id) => LEGACY_MOMENTS[id] ?? id ?? '';

const MOMENT_INDEX = new Map(MED_MOMENTS.map((m, i) => [m.id, i]));
export const momentOf = (id) => MED_MOMENTS.find((m) => m.id === normalizeMoment(id));
export const momentLabel = (id) => momentOf(id)?.label ?? 'Sin momento';

// Order of the day (meds without a moment last), then the list order.
export function sortMeds(meds) {
  const idx = (m) => MOMENT_INDEX.get(normalizeMoment(m.moment)) ?? 99;
  return meds.slice().sort((a, b) => idx(a) - idx(b) || a.order - b.order);
}

export function dateKey(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const todayKey = () => dateKey(new Date());

export function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function shiftKey(key, days) {
  const d = parseKey(key);
  d.setDate(d.getDate() + days);
  return dateKey(d);
}

export function keysBetween(from, to) {
  const out = [];
  for (let k = from; k <= to; k = shiftKey(k, 1)) out.push(k);
  return out;
}

export const longDate = (key) => parseKey(key).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
export const shortDate = (key) => parseKey(key).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
// 24 h "HH:MM": readable and valid as an <input type="time"> value.
export const timeOf = (ms) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// Decimal numbers typed with comma or dot ("77,4" or "77.4"). Number inputs reject the comma on many phones.
export function parseDec(value) {
  const n = parseFloat(String(value ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[ch]);
}

// Spanish plural for portion labels: porción → porciones, unidad → unidades, taza → tazas.
export function plural(word) {
  const [head, ...rest] = word.split(' ');
  const tail = rest.length ? ` ${rest.map(plural).join(' ')}` : '';
  if (head.endsWith('ión')) return `${head.slice(0, -3)}iones${tail}`;
  return /[aeiou]$/.test(head) ? `${head}s${tail}` : `${head}es${tail}`;
}

export function sumMacros(entries) {
  return entries.reduce(
    (acc, e) => ({
      kcal: acc.kcal + e.kcal,
      protein: acc.protein + e.protein,
      carbs: acc.carbs + e.carbs,
      fat: acc.fat + e.fat,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

export function formatDuration(ms) {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
}

const toastEl = document.getElementById('toast');
let toastTimer;
export function toast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('is-visible'), 2600);
}

let objectUrls = [];
export function urlFor(blob) {
  const url = URL.createObjectURL(blob);
  objectUrls.push(url);
  return url;
}
export function releaseUrls() {
  objectUrls.forEach((url) => URL.revokeObjectURL(url));
  objectUrls = [];
}

export function download(filename, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export const icon = {
  prev: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M14.5 6 8.5 12l6 6"/></svg>',
  next: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9.5 6 6 6-6 6"/></svg>',
  plus: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  minus: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 12h14"/></svg>',
  camera: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 8.5h3l1.6-2.5h6.8L17 8.5h3v10H4z"/><circle cx="12" cy="13" r="3.2"/></svg>',
  note: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 5h14v10l-4 4H5z"/><path d="M15 19v-4h4"/></svg>',
  close: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg>',
  trash: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/></svg>',
  edit: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 19h4L19 9l-4-4L5 15z"/><path d="m13.5 6.5 4 4"/></svg>',
  spark: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.5 6.5l2.5 2.5M15 15l2.5 2.5M17.5 6.5 15 9M9 15l-2.5 2.5"/></svg>',
  barcode: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7V5h3M17 5h3v2M20 17v2h-3M7 19H4v-2M8 8v8M11 8v8M14 8v8M17 8v8"/></svg>',
  clock: '<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 2"/></svg>',
  bottle: '<svg aria-hidden="true" viewBox="0 0 24 32"><path class="bottle-outline" d="M9 2h6v3l2 3v20a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V8l2-3z"/><path class="bottle-fill" d="M7.9 12h8.2v16a1 1 0 0 1-1 1H8.9a1 1 0 0 1-1-1z"/></svg>',
  day: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h10"/></svg>',
  chart: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 19h16"/><path d="m5 15 4-4 3 2 6-6"/></svg>',
  report: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/></svg>',
  user: '<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c1.2-3.6 3.8-5.5 7-5.5s5.8 1.9 7 5.5"/></svg>',
};
