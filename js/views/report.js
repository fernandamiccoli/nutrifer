// Report for the nutritionist: printable page (save as PDF) and CSV exports.
import * as db from '../db.js';
import { state } from '../state.js';
import {
  MEALS, momentLabel, sortMeds, esc, icon, num, dec, sumMacros, todayKey, shiftKey, keysBetween,
  longDate, parseKey, urlFor, releaseUrls, download, toast,
} from '../util.js';
import { findFood, isProduce } from '../catalog.js';
import { GOALS, PRODUCE_TARGET_G, targetsForDay } from '../goals.js';
import { dayActivity, workoutSummary, partLabel } from '../activity.js';
import { prepSummary } from '../prep.js';
import { columns, hbars, macroShares, statTile, dotGrid, weightLine } from '../charts.js';
import { estimateNutrition, hasKey, AI_MESSAGES } from '../ai.js';

const main = document.getElementById('main');

let range = { preset: '7', from: shiftKey(todayKey(), -6), to: todayKey(), photos: true };

export function renderReport() {
  main.innerHTML = `
    <header class="page-head no-print">
      <h1>Informe</h1>
      <p class="lede">Elegí el período, revisalo y guardalo como PDF para mandárselo a tu nutricionista.</p>
    </header>

    <form class="report-controls no-print">
      <fieldset class="segmented">
        <legend>Período</legend>
        <label><input type="radio" name="preset" value="7" ${range.preset === '7' ? 'checked' : ''}><span>Últimos 7 días</span></label>
        <label><input type="radio" name="preset" value="30" ${range.preset === '30' ? 'checked' : ''}><span>Últimos 30 días</span></label>
        <label><input type="radio" name="preset" value="custom" ${range.preset === 'custom' ? 'checked' : ''}><span>Elegir fechas</span></label>
      </fieldset>
      <div class="field-grid custom-range" ${range.preset === 'custom' ? '' : 'hidden'}>
        <label class="field"><span>Desde</span><input type="date" name="from" value="${range.from}" max="${todayKey()}"></label>
        <label class="field"><span>Hasta</span><input type="date" name="to" value="${range.to}" max="${todayKey()}"></label>
      </div>
      <label class="switch"><input type="checkbox" name="photos" ${range.photos ? 'checked' : ''}><span>Incluir las fotos de los platos</span></label>
      <div class="report-actions">
        <button type="button" class="primary" data-r="print">Guardar como PDF</button>
        <button type="button" class="chip" data-r="csv-detail">${icon.report}<span>CSV detallado</span></button>
        <button type="button" class="chip" data-r="csv-days">${icon.report}<span>CSV por día</span></button>
        <button type="button" class="chip" data-r="csv-foods">${icon.report}<span>CSV por alimento</span></button>
      </div>
      <p class="hint">En la ventana de impresión elegí <strong>Guardar como PDF</strong> como destino.</p>
      <div class="ai-fill" aria-live="polite"></div>
    </form>

    <article class="report" aria-label="Vista previa del informe"><p class="hint">Armando el informe...</p></article>
  `;

  const form = main.querySelector('.report-controls');
  form.addEventListener('change', () => {
    range.preset = form.preset.value;
    range.photos = form.photos.checked;
    if (range.preset === 'custom') {
      range.from = form.from.value || range.from;
      range.to = form.to.value || range.to;
      if (range.from > range.to) [range.from, range.to] = [range.to, range.from];
    } else {
      range.to = todayKey();
      range.from = shiftKey(range.to, -(Number(range.preset) - 1));
    }
    form.querySelector('.custom-range').hidden = range.preset !== 'custom';
    paintReport();
  });
  form.addEventListener('click', async (ev) => {
    const r = ev.target.closest('[data-r]')?.dataset.r;
    if (r === 'print') {
      await Promise.all([...main.querySelectorAll('.report img')].map((img) => img.decode().catch(() => {})));
      window.print();
    }
    if (r === 'csv-detail') exportCsv('detail');
    if (r === 'csv-days') exportCsv('days');
    if (r === 'csv-foods') exportCsv('foods');
    if (r === 'ai-fill') fillMissingWithAi();
  });
  paintReport();
}

async function collect(from, to) {
  const [entries, photos, notes, water, medlog, workouts, weights, meds] = await Promise.all([
    db.byDateRange('entries', from, to),
    range.photos ? db.byDateRange('photos', from, to) : [],
    db.byDateRange('notes', from, to),
    db.byDateRange('water', from, to),
    db.byDateRange('medlog', from, to),
    db.byDateRange('workouts', from, to),
    db.byDateRange('weights', from, to),
    db.all('meds', { includeDeleted: true }),
  ]);
  const days = keysBetween(from, to).map((date) => {
    const dayEntries = entries.filter((e) => e.date === date);
    return {
      date,
      entries: dayEntries,
      totals: sumMacros(dayEntries),
      produceG: dayEntries.reduce((s, e) => s + (isProduce(findFood(e.foodId)) ? e.grams ?? 0 : 0), 0),
      photos: photos.filter((p) => p.date === date),
      notes: notes.filter((n) => n.date === date),
      waterMl: water.find((w) => w.date === date)?.ml ?? 0,
      meds: medlog.filter((l) => l.date === date && l.taken).map((l) => ({ ...l, med: meds.find((m) => m.id === l.medId) })),
      workouts: workouts.filter((w) => w.date === date),
      weight: weights.find((w) => w.date === date)?.kg,
      activity: dayActivity(workouts.filter((w) => w.date === date), state.profile.weightKg),
    };
  });
  // Each day's target includes the activity actually logged that day.
  for (const d of days) d.target = targetsForDay(state.profile, d.activity.kcal);
  return { days, meds: sortMeds(meds.filter((m) => !m.deleted)), weights: weights.sort((a, b) => a.date.localeCompare(b.date)) };
}

async function paintReport() {
  releaseUrls();
  const { from, to } = range;
  const { days, meds, weights } = await collect(from, to);
  const logged = days.filter((d) => d.entries.length);
  const avg = (fn, list = logged) => (list.length ? list.reduce((s, d) => s + fn(d), 0) / list.length : 0);
  const p = state.profile;
  const t = p.targets; // base target (a day without exercise)
  const dayT = (k) => avg((d) => d.target[k]);
  const avgT = logged.length ? { kcal: dayT('kcal'), protein: dayT('protein'), carbs: dayT('carbs'), fat: dayT('fat') } : t;
  const waterDays = days.filter((d) => d.waterMl > 0);
  const workoutList = days.flatMap((d) => d.workouts);

  const fmtRange = `${parseKey(from).toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })} al ${parseKey(to).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}`;

  paintAiFill(days);
  main.querySelector('.report').innerHTML = `
    <header class="report-head">
      <p class="report-kicker">NutriFer · Registro alimentario</p>
      <h2>${esc(p.name || 'Mi registro')}</h2>
      <p>Del ${fmtRange} · ${days.length} días · generado el ${new Date().toLocaleDateString('es-AR')}${p.nutritionist ? ` · para ${esc(p.nutritionist)}` : ''}</p>
      <p class="muted">Objetivos: ${p.goals.map((g) => GOALS[g]?.label).filter(Boolean).join(', ')}. Meta base: ${num.format(t.kcal)} kcal · P ${t.protein} g · C ${t.carbs} g · G ${t.fat} g${p.custom ? ' (indicada por la nutricionista)' : ' (cálculo orientativo para un día sin ejercicio; cada día suma la actividad registrada)'}.</p>
    </header>

    ${overviewHtml({ days, logged, avg, t: avgT, p, weights, meds })}

    <section class="report-summary">
      <h3>Datos del período</h3>
      <table>
        <tbody>
          <tr><th scope="row">Días con comidas registradas</th><td>${logged.length} de ${days.length}</td></tr>
          <tr><th scope="row">Energía promedio por día</th><td>${num.format(avg((d) => d.totals.kcal))} kcal <span class="muted">(meta ${num.format(t.kcal)})</span></td></tr>
          <tr><th scope="row">Proteínas / carbohidratos / grasas</th><td>${num.format(avg((d) => d.totals.protein))} / ${num.format(avg((d) => d.totals.carbs))} / ${num.format(avg((d) => d.totals.fat))} g</td></tr>
          <tr><th scope="row">Distribución de la energía</th><td>${energySplit(logged, t)}</td></tr>
          <tr><th scope="row">Frutas y verduras</th><td>${num.format(avg((d) => d.produceG))} g por día <span class="muted">(referencia OMS: ${PRODUCE_TARGET_G} g)</span></td></tr>
          <tr><th scope="row">Agua</th><td>${waterDays.length ? `${dec.format(avg((d) => d.waterMl, waterDays) / 1000)} L por día en ${waterDays.length} días registrados` : 'Sin registro'}</td></tr>
          <tr><th scope="row">Peso</th><td>${weights.length ? (weights.length > 1 ? `${dec.format(weights[0].kg)} → ${dec.format(weights.at(-1).kg)} kg (${weights.at(-1).kg - weights[0].kg > 0 ? '+' : ''}${dec.format(weights.at(-1).kg - weights[0].kg)} kg)` : `${dec.format(weights[0].kg)} kg`) : 'Sin registro'}</td></tr>
          <tr><th scope="row">Actividad física</th><td>${workoutList.length ? `${workoutList.length} ${workoutList.length === 1 ? 'sesión' : 'sesiones'}, ${num.format(days.reduce((s, d) => s + d.activity.minutes, 0))} min, ~${num.format(days.reduce((s, d) => s + d.activity.kcal, 0))} kcal estimadas` : 'Sin registro'}</td></tr>
          <tr><th scope="row">Meta de energía</th><td>${p.custom ? `${num.format(t.kcal)} kcal fijas (plan de la nutricionista)` : `${num.format(t.kcal)} kcal en días sin ejercicio; promedio con la actividad registrada: ${num.format(avgT.kcal)} kcal`}</td></tr>
        </tbody>
      </table>
      ${meds.length ? `
        <h4>Medicación y suplementos (días tomados)</h4>
        <ul class="med-adherence">
          ${meds.map((m) => `<li>${esc(m.name)}${m.dose ? ` ${esc(m.dose)}` : ''} <span class="muted">(${esc(momentLabel(m.moment).toLowerCase())})</span>: <strong>${days.filter((d) => d.meds.some((x) => x.medId === m.id)).length}/${days.length}</strong></li>`).join('')}
        </ul>` : ''}
    </section>

    ${foodAnalysisHtml(days)}

    ${days.slice().reverse().map(dayHtml).join('')}
  `;
}

const dayShort = (key) => {
  const d = parseKey(key);
  return `${d.toLocaleDateString('es-AR', { weekday: 'short' }).slice(0, 2)} ${d.getDate()}`;
};

// The graphic summary at the top of the report.
function overviewHtml({ days, logged, avg, t, p, weights, meds }) {
  if (!logged.length) return '<section class="overview"><p class="muted">Todavía no hay comidas registradas en este período.</p></section>';
  const aP = avg((d) => d.totals.protein);
  const aC = avg((d) => d.totals.carbs);
  const aF = avg((d) => d.totals.fat);

  const allEntries = days.flatMap((d) => d.entries);
  const totalKcal = allEntries.reduce((s, e) => s + e.kcal, 0) || 1;
  const byMeal = MEALS.map((m) => ({ m, kcal: allEntries.filter((e) => e.meal === m.id).reduce((s, e) => s + e.kcal, 0) }))
    .filter((x) => x.kcal > 0);
  const top = analyzeFoods(days).rows.slice(0, 8);
  const missing = allEntries.filter((e) => e.macrosMissing).length;

  return `
    <section class="overview">
      <h3>Panorama</h3>
      ${missing ? `<p class="notice">${missing} ${missing === 1 ? 'alimento no tiene' : 'alimentos no tienen'} calorías ni macros, así que los totales quedan por debajo de lo real.</p>` : ''}
      <div class="tiles">
        ${statTile({ label: 'Energía promedio', value: avg((d) => d.totals.kcal), target: t.kcal, unit: 'kcal', kind: 'kcal' })}
        ${statTile({ label: 'Proteínas', value: aP, target: t.protein, unit: 'g', kind: 'protein' })}
        ${statTile({ label: 'Carbohidratos', value: aC, target: t.carbs, unit: 'g', kind: 'carbs' })}
        ${statTile({ label: 'Grasas', value: aF, target: t.fat, unit: 'g', kind: 'fat' })}
      </div>
      <p class="muted chart-note">Promedios de los ${logged.length} ${logged.length === 1 ? 'día' : 'días'} con comidas registradas.</p>

      <div class="chart-block">
        <h4>Energía por día</h4>
        ${columns({
          data: days.map((d) => ({
            label: dayShort(d.date), value: d.entries.length ? d.totals.kcal : null, target: d.target.kcal,
            tip: `${dayShort(d.date)}: ${d.entries.length ? `${num.format(d.totals.kcal)} kcal` : 'sin registro'} de ${num.format(d.target.kcal)}${d.activity.kcal ? ` (con ${num.format(d.activity.kcal)} kcal de actividad)` : ''}`,
          })),
          kind: 'kcal', unit: 'kcal',
        })}
      </div>

      <div class="chart-grid">
        <div class="chart-block">
          <h4>De dónde vienen las calorías</h4>
          ${macroShares([
            { label: 'Tu promedio', p: aP, c: aC, f: aF },
            { label: 'Meta', p: t.protein, c: t.carbs, f: t.fat },
          ])}
        </div>
        <div class="chart-block">
          <h4>Energía por comida</h4>
          ${hbars(byMeal.map((x) => ({ label: x.m.label, value: x.kcal, valueLabel: `${Math.round((x.kcal * 100) / totalKcal)}%` })))}
        </div>
      </div>

      <div class="chart-block">
        <h4>Alimentos que más energía aportaron</h4>
        ${hbars(top.map((r) => ({ label: r.name, value: r.kcal, valueLabel: `${num.format(r.kcal)} kcal · ${Math.round(r.share)}%` })), { valueWidth: '8.5em' })}
      </div>

      <div class="chart-grid">
        <div class="chart-block">
          <h4>Frutas y verduras por día</h4>
          ${columns({
            data: days.map((d) => ({ label: dayShort(d.date), value: d.entries.length ? d.produceG : null })),
            target: PRODUCE_TARGET_G, targetLabel: `${PRODUCE_TARGET_G} g`, kind: 'produce', unit: 'g',
          })}
        </div>
        <div class="chart-block">
          <h4>Agua por día</h4>
          ${columns({
            data: days.map((d) => ({ label: dayShort(d.date), value: d.waterMl ? d.waterMl / 1000 : null, tip: `${dayShort(d.date)}: ${d.waterMl ? `${dec.format(d.waterMl / 1000)} L` : 'sin registro'}` })),
            target: p.waterGoalMl / 1000, targetLabel: `${dec.format(p.waterGoalMl / 1000)} L`, kind: 'water', unit: 'L',
          })}
        </div>
      </div>

      ${activityChartsHtml(days)}

      ${weights.length >= 2 ? `
        <div class="chart-block">
          <h4>Peso</h4>
          ${weightLine(weights.map((w) => ({ label: dayShort(w.date), kg: w.kg })))}
        </div>` : ''}

      ${meds.length ? `
        <div class="chart-block">
          <h4>Medicación y suplementos</h4>
          ${dotGrid({
            days: days.map((d) => ({ short: dayShort(d.date), long: longDate(d.date) })),
            rows: meds.map((m) => {
              const cells = days.map((d) => d.meds.some((x) => x.medId === m.id));
              return { label: m.name, taken: cells.filter(Boolean).length, cells };
            }),
          })}
        </div>` : ''}
    </section>`;
}

function activityChartsHtml(days) {
  const sessions = days.flatMap((d) => d.workouts);
  if (!sessions.length) return '';
  const kg = state.profile.weightKg;
  const muscles = {};
  for (const w of sessions) for (const m of workoutSummary(w, kg).muscles) muscles[m] = (muscles[m] ?? 0) + 1;
  const byType = {};
  for (const w of sessions) for (const part of workoutSummary(w, kg).parts) byType[part.type] = (byType[part.type] ?? 0) + part.minutes;
  return `
    <div class="chart-grid">
      <div class="chart-block">
        <h4>Actividad por día (minutos)</h4>
        ${columns({
          data: days.map((d) => ({
            label: dayShort(d.date), value: d.activity.minutes || null,
            tip: `${dayShort(d.date)}: ${d.activity.minutes ? `${num.format(d.activity.minutes)} min, ~${num.format(d.activity.kcal)} kcal` : 'sin actividad'}`,
          })),
          kind: 'activity', unit: 'min',
        })}
      </div>
      <div class="chart-block">
        <h4>Minutos por tipo de actividad</h4>
        ${hbars(Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([type, min]) => ({ label: type, value: min, valueLabel: `${num.format(min)} min` })), { valueWidth: '4.5em' })}
      </div>
    </div>
    ${Object.keys(muscles).length ? `
      <div class="chart-block">
        <h4>Músculos trabajados (sesiones)</h4>
        ${hbars(Object.entries(muscles).sort((a, b) => b[1] - a[1]).map(([m, n]) => ({ label: m, value: n, valueLabel: `${n}` })), { valueWidth: '2em' })}
      </div>` : ''}`;
}

// ---------- AI fill: estimate every food in the period that has no calories/macros ----------

let fillRunning = false;

function paintAiFill(days) {
  const box = main.querySelector('.ai-fill');
  if (!box || fillRunning) return;
  const missing = days.flatMap((d) => d.entries).filter((e) => e.macrosMissing).length;
  box.innerHTML = missing
    ? `<p class="notice">${missing} ${missing === 1 ? 'alimento no tiene' : 'alimentos no tienen'} calorías ni macros en este período.
        ${hasKey() ? '<button type="button" class="chip strong" data-r="ai-fill">Completar con IA</button>' : '<a href="#/perfil#ai">Conectá Gemini en el Perfil</a> para completarlos.'}</p>`
    : '';
}

async function fillMissingWithAi() {
  if (fillRunning) return;
  fillRunning = true;
  const box = main.querySelector('.ai-fill');
  const { days } = await collect(range.from, range.to);
  const todo = days.flatMap((d) => d.entries).filter((e) => e.macrosMissing);
  let done = 0;
  let failed = 0;
  let lastError = '';
  for (const e of todo) {
    box.innerHTML = `<p class="notice">Calculando con IA ${done + failed + 1} de ${todo.length}: ${esc(e.name)}...</p>`;
    try {
      const desc = [`${e.qtyLabel} de ${e.name}`, e.prep?.toLowerCase(), e.itemNote].filter(Boolean).join(', ');
      const r = await estimateNutrition(desc);
      await db.put('entries', {
        ...e,
        kcal: r.kcal, protein: r.protein, carbs: r.carbs, fat: r.fat,
        grams: e.grams ?? r.grams,
        macrosMissing: false,
        aiEstimated: true,
        aiNote: `${r.assumptions} (confianza ${r.confidence})`,
      });
      done += 1;
    } catch (err) {
      failed += 1;
      lastError = AI_MESSAGES[err.code] ?? AI_MESSAGES.network;
      if (['nokey', 'key', 'quota'].includes(err.code)) break;
    }
  }
  fillRunning = false;
  await paintReport();
  toast(failed ? `Completados ${done}; ${failed} sin completar. ${lastError}` : `Completados ${done} con IA`);
}

// Share of energy from protein, carbs and fat (4/4/9 kcal per g), against the target split.
function energySplit(logged, t) {
  const tot = logged.reduce((a, d) => ({ p: a.p + d.totals.protein, c: a.c + d.totals.carbs, f: a.f + d.totals.fat }), { p: 0, c: 0, f: 0 });
  const kcal = tot.p * 4 + tot.c * 4 + tot.f * 9;
  if (!kcal) return 'Sin datos';
  const pct = (g, k, total) => Math.round((g * k * 100) / total);
  const targetKcal = t.protein * 4 + t.carbs * 4 + t.fat * 9;
  return `P ${pct(tot.p, 4, kcal)}% · C ${pct(tot.c, 4, kcal)}% · G ${pct(tot.f, 9, kcal)}% <span class="muted">(meta P ${pct(t.protein, 4, targetKcal)}% · C ${pct(t.carbs, 4, targetKcal)}% · G ${pct(t.fat, 9, targetKcal)}%)</span>`;
}

// Every food eaten in the period, grouped, with how much energy each one contributed.
export function analyzeFoods(days) {
  const map = new Map();
  for (const d of days) {
    for (const e of d.entries) {
      const key = e.foodId ?? e.name.trim().toLowerCase();
      const food = findFood(e.foodId);
      const row = map.get(key) ?? {
        name: food?.name ?? e.name, times: 0, grams: 0, kcal: 0, protein: 0, carbs: 0, fat: 0,
        days: new Set(), meals: new Set(), missingMacros: false, ai: false, gluten: !!food?.tags?.includes('gluten'), unknownGrams: false,
      };
      row.times += 1;
      row.grams += e.grams ?? 0;
      row.unknownGrams ||= !e.grams;
      row.kcal += e.kcal;
      row.protein += e.protein;
      row.carbs += e.carbs;
      row.fat += e.fat;
      row.days.add(d.date);
      row.meals.add(e.meal);
      row.ai ||= !!e.aiEstimated;
      row.missingMacros ||= !!e.macrosMissing || (e.kcal > 0 && !e.protein && !e.carbs && !e.fat);
      map.set(key, row);
    }
  }
  const rows = [...map.values()].sort((a, b) => b.kcal - a.kcal);
  const total = rows.reduce((s, r) => s + r.kcal, 0);
  return { rows: rows.map((r) => ({ ...r, share: total ? (r.kcal * 100) / total : 0 })), total };
}

function foodAnalysisHtml(days) {
  const { rows, total } = analyzeFoods(days);
  if (!rows.length) return '';
  const toReview = rows.filter((r) => r.missingMacros || r.gluten);
  return `
    <section class="report-foods">
      <h3>Análisis por alimento</h3>
      <p class="muted">${rows.length} alimentos distintos, ${num.format(total)} kcal en el período. Ordenados por cuánta energía aportaron.${rows.some((r) => r.ai) ? ' Los marcados <span class="tag">IA</span> son estimaciones de Gemini a partir de la descripción: conviene revisarlos.' : ''}</p>
      <div class="table-scroll">
        <table class="food-table">
          <thead><tr><th scope="col">Alimento</th><th scope="col">Veces</th><th scope="col">Gramos</th><th scope="col">kcal</th><th scope="col">% energía</th><th scope="col">P</th><th scope="col">C</th><th scope="col">G</th></tr></thead>
          <tbody>
            ${rows.map((r) => `
              <tr>
                <th scope="row">${esc(r.name)}${r.missingMacros ? ' <span class="tag warn">sin macros</span>' : ''}${r.gluten ? ' <span class="tag warn">con TACC</span>' : ''}${r.ai ? ' <span class="tag">IA</span>' : ''}</th>
                <td>${r.times}</td>
                <td>${r.unknownGrams && !r.grams ? '?' : num.format(r.grams)}</td>
                <td>${num.format(r.kcal)}</td>
                <td>${dec.format(r.share)}%</td>
                <td>${num.format(r.protein)}</td>
                <td>${num.format(r.carbs)}</td>
                <td>${num.format(r.fat)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      ${toReview.length ? `<p class="report-line"><strong>Para revisar:</strong> ${toReview.map((r) => `${esc(r.name)} (${[r.missingMacros ? 'faltan proteínas, carbohidratos y grasas' : '', r.gluten ? 'contiene gluten' : ''].filter(Boolean).join(', ')})`).join('; ')}.</p>` : ''}
    </section>`;
}

// Taken meds of one day as [[moment label, [names]]], in the order of the day.
function medsByMoment(taken) {
  const groups = [];
  for (const m of sortMeds(taken.map((x) => x.med).filter(Boolean))) {
    const label = momentLabel(m.moment);
    if (groups.at(-1)?.[0] !== label) groups.push([label, []]);
    groups.at(-1)[1].push(m.name);
  }
  return groups;
}

function dayHtml(d) {
  const has = d.entries.length || d.photos.length || d.notes.length || d.waterMl || d.meds.length || d.workouts.length;
  if (!has) {
    return `<section class="report-day empty"><h3>${esc(longDate(d.date))}</h3><p class="muted">Sin registros.</p></section>`;
  }
  const facts = [
    d.entries.length ? `${num.format(d.totals.kcal)} kcal · P ${num.format(d.totals.protein)} · C ${num.format(d.totals.carbs)} · G ${num.format(d.totals.fat)} g` : '',
    d.produceG ? `Frutas y verduras ${num.format(d.produceG)} g` : '',
    d.waterMl ? `Agua ${dec.format(d.waterMl / 1000)} L` : '',
    d.weight ? `Peso ${dec.format(d.weight)} kg` : '',
  ].filter(Boolean);

  return `
    <section class="report-day">
      <h3>${esc(longDate(d.date))}</h3>
      <p class="report-facts">${facts.map(esc).join(' · ')}</p>
      ${MEALS.map((m) => {
        const items = d.entries.filter((e) => e.meal === m.id).sort((a, b) => a.createdAt - b.createdAt);
        const photos = d.photos.filter((p) => p.meal === m.id);
        const info = d.notes.find((n) => n.meal === m.id);
        if (!items.length && !photos.length && !info?.text) return '';
        return `
          <div class="report-meal">
            <h4>${m.label}${info?.time ? ` <span class="muted">${esc(info.time)}</span>` : ''}${items.length ? `<span class="report-kcal">${num.format(sumMacros(items).kcal)} kcal</span>` : ''}</h4>
            ${items.length ? `<ul>${items.map((e) => `<li><span>${esc(e.name)} <span class="muted">${esc([e.qtyLabel, prepSummary(e)].filter(Boolean).join(' · '))}</span>${e.aiEstimated ? ' <span class="tag">IA</span>' : ''}</span><span>${num.format(e.kcal)}</span></li>`).join('')}</ul>` : ''}
            ${info?.text ? `<p class="report-note">${esc(info.text)}</p>` : ''}
            ${photos.length ? `<div class="report-photos">${photos.map((p) => `<img src="${urlFor(p.blob)}" alt="Foto de ${m.label.toLowerCase()}">`).join('')}</div>` : ''}
          </div>`;
      }).join('')}
      ${d.meds.length ? `<p class="report-line"><strong>Medicación y suplementos:</strong> ${medsByMoment(d.meds).map(([label, names]) => `${esc(label)}: ${names.map(esc).join(', ')}`).join('; ')}</p>` : ''}
      ${d.workouts.length ? `<p class="report-line"><strong>Actividad (~${num.format(d.activity.kcal)} kcal):</strong> ${d.workouts.map((w) => {
        const s = workoutSummary(w, state.profile.weightKg);
        return `${esc(s.parts.map(partLabel).join(' + '))}${w.detail ? ` (${esc(w.detail)})` : ''}${s.muscles.length ? `; músculos: ${esc(s.muscles.join(', '))}` : ''}${w.note ? `; ${esc(w.note)}` : ''}`;
      }).join('. ')}</p>` : ''}
    </section>`;
}

// ---------- CSV (Excel in es-AR expects ; and decimal comma) ----------

const cell = (v) => {
  const s = typeof v === 'number' ? String(Math.round(v * 10) / 10).replace('.', ',') : String(v ?? '');
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (rows) => `﻿${rows.map((r) => r.map(cell).join(';')).join('\r\n')}`;

async function exportCsv(kind) {
  const { days } = await collect(range.from, range.to);
  let rows;
  if (kind === 'detail') {
    rows = [['Fecha', 'Comida', 'Hora', 'Alimento', 'Cantidad', 'Gramos', 'Preparación', 'Nota del alimento', 'kcal', 'Proteínas (g)', 'Carbohidratos (g)', 'Grasas (g)', 'Estimado con IA', 'Nota de la comida']];
    for (const d of days) {
      for (const m of MEALS) {
        const info = d.notes.find((n) => n.meal === m.id);
        d.entries.filter((e) => e.meal === m.id).sort((a, b) => a.createdAt - b.createdAt).forEach((e) => {
          rows.push([d.date, m.label, info?.time ?? '', e.name, e.qtyLabel, e.grams ?? '', e.prep ?? '', e.itemNote ?? '', e.kcal, e.protein, e.carbs, e.fat, e.aiEstimated ? `sí: ${e.aiNote ?? ''}` : '', info?.text ?? '']);
        });
      }
    }
  } else if (kind === 'foods') {
    rows = [['Alimento', 'Veces', 'Días', 'Gramos', 'kcal', '% energía', 'Proteínas (g)', 'Carbohidratos (g)', 'Grasas (g)', 'Observación']];
    for (const r of analyzeFoods(days).rows) {
      rows.push([r.name, r.times, r.days.size, r.grams, r.kcal, r.share, r.protein, r.carbs, r.fat,
        [r.missingMacros ? 'sin macros' : '', r.gluten ? 'con TACC' : ''].filter(Boolean).join(', ')]);
    }
  } else {
    rows = [['Fecha', 'kcal', 'Proteínas (g)', 'Carbohidratos (g)', 'Grasas (g)', 'Frutas y verduras (g)', 'Agua (L)', 'Actividad (min)', 'Gasto actividad (kcal)', 'Meta del día (kcal)', 'Actividad', 'Músculos', 'Medicación tomada', 'Peso (kg)']];
    for (const d of days) {
      rows.push([
        d.date, d.totals.kcal, d.totals.protein, d.totals.carbs, d.totals.fat, d.produceG,
        d.waterMl / 1000,
        d.activity.minutes,
        d.activity.kcal,
        d.target.kcal,
        d.workouts.map((w) => workoutSummary(w, state.profile.weightKg).parts.map(partLabel).join(' + ')).join('; '),
        [...new Set(d.workouts.flatMap((w) => w.muscles ?? []))].join(', '),
        medsByMoment(d.meds).map(([label, names]) => `${label}: ${names.join(', ')}`).join('; '),
        d.weight ?? '',
      ]);
    }
  }
  const name = `nutrifer-${{ detail: 'detalle', days: 'dias', foods: 'alimentos' }[kind]}-${range.from}-a-${range.to}.csv`;
  download(name, new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }));
  toast('CSV descargado');
}
