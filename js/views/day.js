// Day view: summary, water, medication, meals (time, photos, notes) and activity.
import * as db from '../db.js';
import { state } from '../state.js';
import {
  MEALS, mealLabel, momentOf, sortMeds, esc, icon, num, dec, toast, urlFor, releaseUrls, sumMacros,
  todayKey, parseKey, shiftKey, timeOf,
} from '../util.js';
import { findFood, isProduce } from '../catalog.js';
import { PRODUCE_TARGET_G, BOTTLE_ML } from '../goals.js';
import { openAddFood } from '../add-food.js';
import { compressPhoto } from '../photos.js';
import { prepFieldsHtml, readPrep, prepSummary, syncOilEntry } from '../prep.js';

const main = document.getElementById('main');
const sheet = document.getElementById('add-dialog');
const photoDialog = document.getElementById('photo-dialog');
const photoInput = document.getElementById('photo-input');

export const WORKOUT_TYPES = ['Musculación', 'Caminata', 'Cardio', 'Pádel', 'Biodanza', 'Pilates o yoga', 'Otro'];
export const INTENSITY = { low: 'Suave', mid: 'Moderada', high: 'Intensa' };

let lastRenderedDate = null;
let pendingPhotoMeal = null;

const nowTime = () => timeOf(Date.now());

export async function renderDay() {
  const date = state.currentDate;
  const isToday = date === todayKey();
  const [entries, photos, notes, water, meds, medlog, workouts] = await Promise.all([
    db.byDate('entries', date),
    db.byDate('photos', date),
    db.byDate('notes', date),
    db.get('water', date),
    db.all('meds'),
    db.byDate('medlog', date),
    db.byDate('workouts', date),
  ]);
  releaseUrls();

  const animate = lastRenderedDate !== date;
  lastRenderedDate = date;
  const d = parseKey(date);
  const weekday = d.toLocaleDateString('es-AR', { weekday: 'long' });
  const dayMonth = d.toLocaleDateString('es-AR', { day: 'numeric', month: 'long' });

  const p = state.profile;
  const t = p.targets;
  const totals = sumMacros(entries);
  const left = t.kcal - totals.kcal;
  const produceG = entries.reduce((s, e) => s + (isProduce(findFood(e.foodId)) ? e.grams ?? 0 : 0), 0);

  main.classList.toggle('animate', animate);
  main.innerHTML = `
    <header class="day-head">
      <button class="icon-btn" data-action="prev-day" aria-label="Día anterior">${icon.prev}</button>
      <div class="day-title">
        <p class="weekday">${isToday ? 'Hoy, ' : ''}${esc(weekday)}</p>
        <h1>${esc(dayMonth)}</h1>
      </div>
      <button class="icon-btn" data-action="next-day" aria-label="Día siguiente">${icon.next}</button>
    </header>
    ${isToday ? '' : '<p class="back-today"><button class="link" data-action="today">Volver a hoy</button></p>'}
    ${backupReminder(entries.length)}

    <section class="budget" aria-label="Resumen del día">
      <p class="budget-line">
        <span class="figure">${num.format(totals.kcal)}</span>
        <span class="of">de ${num.format(t.kcal)} kcal</span>
      </p>
      ${meter(totals.kcal, t.kcal, 'kcal')}
      <p class="budget-note">${
        totals.kcal === 0
          ? 'Todavía no registraste comidas.'
          : left >= 0
            ? `Te quedan <strong>${num.format(left)} kcal</strong>.`
            : `Pasaste la meta por <strong>${num.format(-left)} kcal</strong>.`
      }</p>
      <dl class="macros">
        ${macroRow('Proteínas', totals.protein, t.protein, 'g', 'protein')}
        ${macroRow('Carbohidratos', totals.carbs, t.carbs, 'g', 'carbs')}
        ${macroRow('Grasas', totals.fat, t.fat, 'g', 'fat')}
        ${macroRow('Frutas y verduras', produceG, PRODUCE_TARGET_G, 'g', 'produce')}
      </dl>
    </section>

    ${waterBlock(water?.ml ?? 0, p.waterGoalMl)}

    ${medsCount(meds, medlog)}

    <div class="meals">
      ${MEALS.map((meal) => mealBlock(
        meal,
        entries.filter((e) => e.meal === meal.id).sort((a, b) => a.createdAt - b.createdAt),
        photos.filter((ph) => ph.meal === meal.id).sort((a, b) => a.createdAt - b.createdAt),
        notes.find((n) => n.meal === meal.id),
        sortMeds(meds).filter((m) => momentOf(m.moment)?.meal === meal.id),
        medlog,
      )).join('')}
      ${unscheduledMedsBlock(meds, medlog)}
    </div>

    ${workoutsBlock(workouts.sort((a, b) => a.createdAt - b.createdAt))}
  `;
}

function backupReminder(hasEntries) {
  if (!hasEntries) return '';
  let last = 0;
  try { last = Number(localStorage.getItem('nutrifer:lastBackup')) || 0; } catch { /* storage blocked */ }
  if (Date.now() - last < 7 * 864e5) return '';
  const msg = last ? 'Hace más de una semana que no guardás una copia de tus datos.' : 'Todavía no guardaste ninguna copia de tus datos.';
  return `<p class="banner">${msg} <a href="#/perfil">Descargar copia</a></p>`;
}

function meter(value, target, kind) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  const over = kind !== 'produce' && value > target;
  return `<div class="meter meter-${kind}${over ? ' is-over' : ''}" aria-hidden="true"><span style="--pct:${pct}%"></span></div>`;
}

function macroRow(label, value, target, unit, kind) {
  return `
    <div class="macro">
      <dt>${label}</dt>
      <dd><span class="num">${num.format(value)}</span> / ${num.format(target)} ${unit}</dd>
      ${meter(value, target, kind)}
    </div>`;
}

// ---------- water ----------

function waterBlock(ml, goalMl) {
  const bottles = Math.max(1, Math.round(goalMl / BOTTLE_ML));
  const drunk = ml / BOTTLE_ML;
  const shown = Math.max(bottles, Math.ceil(drunk));
  return `
    <section class="tracker water" aria-labelledby="water-title">
      <header class="tracker-head">
        <h2 id="water-title">Agua</h2>
        <span class="tracker-value">${dec.format(ml / 1000)} de ${dec.format(goalMl / 1000)} L</span>
      </header>
      <ol class="bottles" aria-label="${dec.format(drunk)} botellas de 500 cm³">
        ${Array.from({ length: shown }, (_, i) => {
          const fill = Math.min(1, Math.max(0, drunk - i));
          return `<li class="bottle${fill >= 1 ? ' is-full' : fill > 0 ? ' is-half' : ''}${i >= bottles ? ' is-extra' : ''}">${icon.bottle}</li>`;
        }).join('')}
      </ol>
      <div class="tracker-actions">
        <button class="icon-btn outlined" data-action="water" data-ml="${-BOTTLE_ML}" aria-label="Quitar una botella" ${ml <= 0 ? 'disabled' : ''}>${icon.minus}</button>
        <button class="chip strong" data-action="water" data-ml="${BOTTLE_ML}">${icon.plus}<span>Botella de 500 cm³</span></button>
      </div>
    </section>`;
}

async function addWater(delta) {
  const date = state.currentDate;
  const current = (await db.get('water', date))?.ml ?? 0;
  const ml = Math.max(0, current + delta);
  await db.put('water', { id: date, date, ml });
  await renderDay();
}

// ---------- medication ----------

// Meds tied to a meal render inside that meal, in three slots: before, during and after it.
function mealMedsHtml(meds, medlog, slot) {
  const inSlot = meds.filter((m) => momentOf(m.moment)?.slot === slot);
  if (!inSlot.length) return '';
  const groups = [];
  for (const m of inSlot) {
    const label = momentOf(m.moment).short;
    if (groups.at(-1)?.label !== label) groups.push({ label, meds: [] });
    groups.at(-1).meds.push(m);
  }
  return groups.map((g) => medGroupHtml(g.label, g.meds, medlog, slot)).join('');
}

function medGroupHtml(label, meds, medlog, slot = 'none') {
  return `
    <div class="med-slot slot-${slot}">
      <p class="slot-label">${esc(label)}</p>
      <ul class="med-list" role="list">
        ${meds.map((m) => {
          const taken = medlog.find((l) => l.medId === m.id)?.taken;
          return `
            <li class="med${taken ? ' is-taken' : ''}">
              <label class="med-check">
                <input type="checkbox" data-action="med-toggle" data-id="${m.id}" ${taken ? 'checked' : ''}>
                <span class="med-name">${esc(m.name)}${m.dose ? ` <span class="muted">${esc(m.dose)}</span>` : ''}</span>
              </label>
            </li>`;
        }).join('')}
      </ul>
    </div>`;
}

function unscheduledMedsBlock(meds, medlog) {
  const loose = meds.filter((m) => !momentOf(m.moment));
  if (!loose.length) return '';
  return `
    <section class="meal loose-meds" aria-labelledby="loose-meds-title">
      <header class="meal-head"><h2 id="loose-meds-title">Medicación sin momento</h2></header>
      ${medGroupHtml('Elegí en el Perfil si va antes, durante o después de una comida', loose, medlog)}
    </section>`;
}

function medsCount(meds, medlog) {
  if (!meds.length) return '';
  const taken = meds.filter((m) => medlog.find((l) => l.medId === m.id)?.taken).length;
  return `<p class="meds-count">Medicación y suplementos: <strong>${taken} de ${meds.length}</strong> tomados · <a href="#/perfil#meds">editar lista</a></p>`;
}

async function toggleMed(medId, taken) {
  const date = state.currentDate;
  const id = `${date}|${medId}`;
  await db.put('medlog', { id, date, medId, taken });
  await renderDay();
}

// ---------- meals ----------

function mealBlock(meal, entries, photos, info, meds = [], medlog = []) {
  const kcal = sumMacros(entries).kcal;
  const empty = entries.length === 0 && photos.length === 0 && !info?.text;
  return `
    <section class="meal${empty ? ' is-empty' : ''}" aria-labelledby="meal-${meal.id}">
      <header class="meal-head">
        <h2 id="meal-${meal.id}">${meal.label}</h2>
        <label class="time-input">
          <span class="visually-hidden">Hora de ${meal.label.toLowerCase()}</span>
          <input type="time" data-action="meal-time" data-meal="${meal.id}" value="${esc(info?.time ?? '')}">
        </label>
        ${entries.length ? `<span class="meal-kcal">${num.format(kcal)} kcal</span>` : ''}
      </header>

      ${mealMedsHtml(meds, medlog, 'antes')}

      ${photos.length ? `
        <ul class="photo-strip" role="list">
          ${photos.map((ph, i) => `
            <li><button class="thumb" data-action="open-photo" data-id="${ph.id}" aria-label="Ver foto ${i + 1} de ${meal.label}">
              <img src="${urlFor(ph.blob)}" alt="" width="${ph.width}" height="${ph.height}" loading="lazy">
            </button></li>`).join('')}
        </ul>` : ''}

      ${entries.length ? `
        <ul class="items" role="list">
          ${entries.map((e) => `
            <li class="item${e.parentId ? ' item-child' : ''}">
              <button class="item-main" data-action="edit-entry" data-id="${e.id}" aria-label="Editar ${esc(e.name)}">
                <span class="item-name">${esc(e.name)}</span>
                <span class="item-qty">${esc(e.qtyLabel)}${prepSummary(e) ? ` · ${esc(prepSummary(e))}` : ''}${e.macrosMissing ? ' · <span class="warn-text">sin macros</span>' : ''}</span>
              </button>
              <span class="item-kcal">${num.format(e.kcal)}</span>
              <button class="icon-btn small" data-action="delete-entry" data-id="${e.id}" aria-label="Quitar ${esc(e.name)}">${icon.trash}</button>
            </li>`).join('')}
        </ul>` : ''}

      ${mealMedsHtml(meds, medlog, 'durante')}

      ${info?.text ? `<p class="note-text" data-action="edit-note" data-meal="${meal.id}">${esc(info.text)}</p>` : ''}

      ${mealMedsHtml(meds, medlog, 'despues')}

      <div class="meal-actions">
        <button class="chip" data-action="add-food" data-meal="${meal.id}">${icon.plus}<span>Alimento</span></button>
        <button class="chip" data-action="add-photo" data-meal="${meal.id}">${icon.camera}<span>Foto</span></button>
        <button class="chip" data-action="edit-note" data-meal="${meal.id}">${icon.note}<span>${info?.text ? 'Editar nota' : 'Nota'}</span></button>
      </div>
    </section>`;
}

// Meal info (time + note) lives in the `notes` store, one record per day and meal.
async function saveMealInfo(mealId, changes) {
  const date = state.currentDate;
  const id = `${date}|${mealId}`;
  const current = (await db.get('notes', id)) ?? { id, date, meal: mealId, text: '', time: '' };
  const next = { ...current, ...changes };
  if (!next.text && !next.time) await db.remove('notes', id);
  else await db.put('notes', next);
}

// Logging something today for a meal without a time stamps it with the current time.
async function ensureMealTime(mealId) {
  if (state.currentDate !== todayKey()) return;
  const info = await db.get('notes', `${state.currentDate}|${mealId}`);
  if (!info?.time) await saveMealInfo(mealId, { time: nowTime() });
}

async function editNote(mealId) {
  const info = await db.get('notes', `${state.currentDate}|${mealId}`);
  sheet.innerHTML = `
    <form class="sheet-body">
      <header class="sheet-head">
        <h2 id="add-title">Nota de ${mealLabel(mealId).toLowerCase()}</h2>
        <button type="button" class="icon-btn" data-a="close" aria-label="Cerrar">${icon.close}</button>
      </header>
      <label class="field">
        <span>Para vos y tu nutricionista</span>
        <textarea name="text" rows="4" maxlength="600" placeholder="Ej.: comí afuera, porción grande, me cayó pesado">${esc(info?.text ?? '')}</textarea>
      </label>
      <button class="primary" type="submit">Guardar nota</button>
    </form>`;
  const form = sheet.querySelector('form');
  form.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-a="close"]')) sheet.close();
  });
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const text = form.text.value.trim();
    await saveMealInfo(mealId, { text });
    sheet.close();
    await renderDay();
    toast(text ? 'Nota guardada' : 'Nota borrada');
  });
  sheet.showModal();
  form.text.focus();
}

async function deleteEntry(id) {
  const entry = await db.get('entries', id);
  await db.remove('entries', id);
  if (entry) await syncOilEntry(entry, 0);
  await renderDay();
  toast(`${entry?.name ?? 'Alimento'} quitado`);
}

// Preparation, note and added oil of an already logged food.
async function editEntry(id) {
  const e = await db.get('entries', id);
  if (!e) return;
  if (e.parentId) return editEntry(e.parentId); // the oil row edits through its food
  const oil = (await db.byDate('entries', e.date)).find((x) => x.parentId === e.id);
  sheet.innerHTML = `
    <form class="sheet-body">
      <header class="sheet-head">
        <h2 id="add-title">${esc(e.name)}</h2>
        <button type="button" class="icon-btn" data-a="close" aria-label="Cerrar">${icon.close}</button>
      </header>
      <p class="hint">${esc(e.qtyLabel)} · ${num.format(e.kcal)} kcal</p>
      ${prepFieldsHtml({ prep: e.prep, itemNote: e.itemNote, oilG: oil?.grams ?? 0 })}
      <button class="primary" type="submit">Guardar</button>
      <button type="button" class="ghost danger-text" data-a="delete">Quitar este alimento</button>
    </form>`;
  const form = sheet.querySelector('form');
  form.addEventListener('click', async (ev) => {
    const a = ev.target.closest('[data-a]')?.dataset.a;
    if (a === 'close') sheet.close();
    if (a === 'delete') {
      sheet.close();
      await deleteEntry(e.id);
    }
  });
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const { oilG, ...prep } = readPrep(form);
    const saved = await db.put('entries', { ...e, ...prep });
    await syncOilEntry(saved, oilG);
    sheet.close();
    await renderDay();
    toast('Alimento actualizado');
  });
  sheet.showModal();
}

// ---------- photos ----------

photoInput.addEventListener('change', async () => {
  const files = [...photoInput.files];
  photoInput.value = '';
  if (!files.length || !pendingPhotoMeal) return;
  let totalKb = 0;
  try {
    for (const file of files) {
      const { blob, width, height } = await compressPhoto(file);
      totalKb += blob.size / 1024;
      await db.put('photos', { id: db.newId(), date: state.currentDate, meal: pendingPhotoMeal, blob, width, height, createdAt: Date.now() });
    }
  } catch {
    toast('No pude leer esa imagen. Probá con otra.');
    return;
  }
  await ensureMealTime(pendingPhotoMeal);
  await renderDay();
  toast(files.length === 1 ? `Foto guardada (${num.format(totalKb)} KB)` : `${files.length} fotos guardadas`);
});

async function openPhoto(id) {
  const photo = await db.get('photos', id);
  if (!photo) return;
  photoDialog.innerHTML = `
    <figure>
      <img src="${urlFor(photo.blob)}" alt="Foto de ${mealLabel(photo.meal).toLowerCase()}" width="${photo.width}" height="${photo.height}">
      <figcaption>
        <span>${mealLabel(photo.meal)} · ${timeOf(photo.createdAt)}</span>
        <span class="viewer-actions">
          <button class="ghost danger" data-action="delete-photo" data-id="${photo.id}">${icon.trash}<span>Borrar foto</span></button>
          <button class="ghost" data-action="close">Cerrar</button>
        </span>
      </figcaption>
    </figure>`;
  photoDialog.showModal();
}

photoDialog.addEventListener('click', async (ev) => {
  const btn = ev.target.closest('[data-action]');
  if (ev.target === photoDialog || btn?.dataset.action === 'close') return photoDialog.close();
  if (btn?.dataset.action === 'delete-photo') {
    if (!confirm('¿Borrar esta foto? No se puede recuperar.')) return;
    await db.remove('photos', btn.dataset.id);
    photoDialog.close();
    await renderDay();
    toast('Foto borrada');
  }
});

// ---------- activity ----------

function workoutsBlock(workouts) {
  return `
    <section class="activity" aria-labelledby="activity-title">
      <header class="meal-head">
        <h2 id="activity-title">Actividad física</h2>
        ${workouts.length ? `<span class="meal-kcal">${num.format(workouts.reduce((s, w) => s + (w.minutes || 0), 0))} min</span>` : ''}
      </header>
      ${workouts.length ? `
        <ul class="items" role="list">
          ${workouts.map((w) => `
            <li class="item">
              <div class="item-main">
                <span class="item-name">${esc(w.type)}${w.detail ? `: ${esc(w.detail)}` : ''}</span>
                <span class="item-qty">${w.minutes ? `${num.format(w.minutes)} min` : ''}${w.intensity ? ` · ${INTENSITY[w.intensity]}` : ''}${w.time ? ` · ${esc(w.time)}` : ''}${w.note ? ` · ${esc(w.note)}` : ''}</span>
              </div>
              <button class="icon-btn small" data-action="edit-workout" data-id="${w.id}" aria-label="Editar ${esc(w.type)}">${icon.edit}</button>
            </li>`).join('')}
        </ul>` : '<p class="tracker-note">¿Fuiste al gimnasio o hiciste otra actividad? Registrala acá.</p>'}
      <div class="meal-actions">
        <button class="chip" data-action="edit-workout">${icon.plus}<span>Actividad</span></button>
      </div>
    </section>`;
}

async function editWorkout(id) {
  const w = id ? await db.get('workouts', id) : null;
  // Several activities can share one session (e.g. musculación + caminata). `type` keeps the joined label.
  const types = w?.types ?? (w?.type ? [w.type] : ['Musculación']);
  sheet.innerHTML = `
    <form class="sheet-body">
      <header class="sheet-head">
        <h2 id="add-title">${w ? 'Editar actividad' : 'Agregar actividad'}</h2>
        <button type="button" class="icon-btn" data-a="close" aria-label="Cerrar">${icon.close}</button>
      </header>
      <fieldset class="segmented wrap">
        <legend>Qué hiciste <span class="muted">(podés elegir varias)</span></legend>
        ${WORKOUT_TYPES.map((tp) => `<label><input type="checkbox" name="types" value="${tp}" ${types.includes(tp) ? 'checked' : ''}><span>${tp}</span></label>`).join('')}
      </fieldset>
      <label class="field"><span>Detalle <span class="muted">(opcional)</span></span><input name="detail" maxlength="80" value="${esc(w?.detail ?? '')}" placeholder="Ej.: piernas y glúteos + 30 min de caminata"></label>
      <div class="field-grid">
        <label class="field"><span>Minutos</span><input name="minutes" type="number" inputmode="numeric" min="1" max="600" value="${esc(w?.minutes ?? '')}" required></label>
        <label class="field"><span>Hora</span><input name="time" type="time" value="${esc(w?.time ?? (state.currentDate === todayKey() ? nowTime() : ''))}"></label>
      </div>
      <fieldset class="segmented">
        <legend>Intensidad</legend>
        ${Object.entries(INTENSITY).map(([k, label]) => `<label><input type="radio" name="intensity" value="${k}" ${(w?.intensity ?? 'mid') === k ? 'checked' : ''}><span>${label}</span></label>`).join('')}
      </fieldset>
      <label class="field"><span>Nota <span class="muted">(opcional)</span></span><input name="note" maxlength="120" value="${esc(w?.note ?? '')}" placeholder="Ej.: con profe, me dolió la rodilla"></label>
      <button class="primary" type="submit">${w ? 'Guardar cambios' : 'Agregar actividad'}</button>
      ${w ? '<button type="button" class="ghost danger-text" data-a="delete">Borrar actividad</button>' : ''}
    </form>`;
  const form = sheet.querySelector('form');
  form.addEventListener('click', async (ev) => {
    const a = ev.target.closest('[data-a]')?.dataset.a;
    if (a === 'close') sheet.close();
    if (a === 'delete') {
      await db.remove('workouts', w.id);
      sheet.close();
      await renderDay();
      toast('Actividad borrada');
    }
  });
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const minutes = parseInt(form.minutes.value, 10);
    const chosen = [...form.querySelectorAll('input[name="types"]:checked')].map((i) => i.value);
    if (!chosen.length) return toast('Elegí al menos una actividad.');
    if (!(minutes > 0)) return form.reportValidity();
    await db.put('workouts', {
      id: w?.id ?? db.newId(),
      date: state.currentDate,
      createdAt: w?.createdAt ?? Date.now(),
      types: chosen,
      type: chosen.join(' + '),
      detail: form.detail.value.trim(),
      minutes,
      time: form.time.value,
      intensity: form.intensity.value,
      note: form.note.value.trim(),
    });
    sheet.close();
    await renderDay();
    toast(w ? 'Actividad actualizada' : 'Actividad registrada');
  });
  sheet.showModal();
}

// ---------- events ----------

function go(key) {
  location.hash = `#/dia/${key}`;
}

main.addEventListener('click', async (ev) => {
  if (!main.querySelector('.day-head')) return;
  const btn = ev.target.closest('[data-action]');
  if (!btn || btn.matches('input')) return;
  const { action, meal, id } = btn.dataset;
  if (action === 'prev-day') go(shiftKey(state.currentDate, -1));
  if (action === 'next-day') go(shiftKey(state.currentDate, 1));
  if (action === 'today') go(todayKey());
  if (action === 'add-food') openAddFood(meal, async () => { await ensureMealTime(meal); await renderDay(); });
  if (action === 'edit-note') editNote(meal);
  if (action === 'open-photo') openPhoto(id);
  if (action === 'add-photo') {
    pendingPhotoMeal = meal;
    photoInput.click();
  }
  if (action === 'delete-entry') deleteEntry(id);
  if (action === 'edit-entry') editEntry(id);
  if (action === 'water') addWater(Number(btn.dataset.ml));
  if (action === 'edit-workout') editWorkout(id);
});

main.addEventListener('change', async (ev) => {
  const el = ev.target;
  if (el.dataset.action === 'med-toggle') toggleMed(el.dataset.id, el.checked);
  if (el.dataset.action === 'meal-time') {
    await saveMealInfo(el.dataset.meal, { time: el.value });
    toast(`Horario de ${mealLabel(el.dataset.meal).toLowerCase()}: ${el.value || 'sin hora'}`);
  }
});
