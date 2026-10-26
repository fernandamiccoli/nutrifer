// Report for the nutritionist: printable page (save as PDF) and CSV exports.
import * as db from '../db.js';
import { state } from '../state.js';
import {
  MEALS, momentLabel, sortMeds, esc, icon, num, dec, sumMacros, todayKey, shiftKey, keysBetween,
  longDate, parseKey, urlFor, releaseUrls, download, toast,
} from '../util.js';
import { findFood, isProduce } from '../catalog.js';
import { GOALS, PRODUCE_TARGET_G } from '../goals.js';
import { INTENSITY } from './day.js';
import { prepSummary } from '../prep.js';

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
    };
  });
  return { days, meds: sortMeds(meds.filter((m) => !m.deleted)), weights: weights.sort((a, b) => a.date.localeCompare(b.date)) };
}

async function paintReport() {
  releaseUrls();
  const { from, to } = range;
  const { days, meds, weights } = await collect(from, to);
  const logged = days.filter((d) => d.entries.length);
  const avg = (fn, list = logged) => (list.length ? list.reduce((s, d) => s + fn(d), 0) / list.length : 0);
  const p = state.profile;
  const t = p.targets;
  const waterDays = days.filter((d) => d.waterMl > 0);
  const workoutList = days.flatMap((d) => d.workouts);

  const fmtRange = `${parseKey(from).toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })} al ${parseKey(to).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}`;

  main.querySelector('.report').innerHTML = `
    <header class="report-head">
      <p class="report-kicker">NutriFer · Registro alimentario</p>
      <h2>${esc(p.name || 'Mi registro')}</h2>
      <p>Del ${fmtRange} · ${days.length} días · generado el ${new Date().toLocaleDateString('es-AR')}${p.nutritionist ? ` · para ${esc(p.nutritionist)}` : ''}</p>
      <p class="muted">Objetivos: ${p.goals.map((g) => GOALS[g]?.label).filter(Boolean).join(', ')}. Meta diaria: ${num.format(t.kcal)} kcal · P ${t.protein} g · C ${t.carbs} g · G ${t.fat} g${p.custom ? ' (indicada por la nutricionista)' : ' (cálculo orientativo)'}.</p>
    </header>

    <section class="report-summary">
      <h3>Resumen del período</h3>
      <table>
        <tbody>
          <tr><th scope="row">Días con comidas registradas</th><td>${logged.length} de ${days.length}</td></tr>
          <tr><th scope="row">Energía promedio por día</th><td>${num.format(avg((d) => d.totals.kcal))} kcal <span class="muted">(meta ${num.format(t.kcal)})</span></td></tr>
          <tr><th scope="row">Proteínas / carbohidratos / grasas</th><td>${num.format(avg((d) => d.totals.protein))} / ${num.format(avg((d) => d.totals.carbs))} / ${num.format(avg((d) => d.totals.fat))} g</td></tr>
          <tr><th scope="row">Distribución de la energía</th><td>${energySplit(logged, t)}</td></tr>
          <tr><th scope="row">Frutas y verduras</th><td>${num.format(avg((d) => d.produceG))} g por día <span class="muted">(referencia OMS: ${PRODUCE_TARGET_G} g)</span></td></tr>
          <tr><th scope="row">Agua</th><td>${waterDays.length ? `${dec.format(avg((d) => d.waterMl, waterDays) / 1000)} L por día en ${waterDays.length} días registrados` : 'Sin registro'}</td></tr>
          <tr><th scope="row">Peso</th><td>${weights.length ? (weights.length > 1 ? `${dec.format(weights[0].kg)} → ${dec.format(weights.at(-1).kg)} kg (${weights.at(-1).kg - weights[0].kg > 0 ? '+' : ''}${dec.format(weights.at(-1).kg - weights[0].kg)} kg)` : `${dec.format(weights[0].kg)} kg`) : 'Sin registro'}</td></tr>
          <tr><th scope="row">Actividad física</th><td>${workoutList.length ? `${workoutList.length} ${workoutList.length === 1 ? 'sesión' : 'sesiones'}, ${num.format(workoutList.reduce((s, w) => s + (w.minutes || 0), 0))} min en total` : 'Sin registro'}</td></tr>
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
      ${d.workouts.length ? `<p class="report-line"><strong>Actividad:</strong> ${d.workouts.map((w) => `${esc(w.type)}${w.detail ? ` (${esc(w.detail)})` : ''}, ${num.format(w.minutes)} min, ${INTENSITY[w.intensity]?.toLowerCase() ?? ''}${w.note ? `: ${esc(w.note)}` : ''}`).join('; ')}</p>` : ''}
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
    rows = [['Fecha', 'kcal', 'Proteínas (g)', 'Carbohidratos (g)', 'Grasas (g)', 'Frutas y verduras (g)', 'Agua (L)', 'Actividad (min)', 'Actividad', 'Medicación tomada', 'Peso (kg)']];
    for (const d of days) {
      rows.push([
        d.date, d.totals.kcal, d.totals.protein, d.totals.carbs, d.totals.fat, d.produceG,
        d.waterMl / 1000,
        d.workouts.reduce((s, w) => s + (w.minutes || 0), 0),
        d.workouts.map((w) => `${w.type}${w.detail ? ` ${w.detail}` : ''}`).join(', '),
        medsByMoment(d.meds).map(([label, names]) => `${label}: ${names.join(', ')}`).join('; '),
        d.weight ?? '',
      ]);
    }
  }
  const name = `nutrifer-${{ detail: 'detalle', days: 'dias', foods: 'alimentos' }[kind]}-${range.from}-a-${range.to}.csv`;
  download(name, new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }));
  toast('CSV descargado');
}
