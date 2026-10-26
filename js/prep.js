// Per-food preparation details: cooking method, a short note and added olive oil.
// Added oil is logged as its own entry (linked by parentId) so its calories count.
import * as db from './db.js';
import { esc, dec } from './util.js';
import { findFood } from './catalog.js';
import { nutrientsFor } from './foods.js';

export const PREPS = ['A la plancha', 'Hervido', 'Al horno', 'Al vapor', 'Salteado', 'Frito', 'Crudo'];
const OIL = [
  { g: 0, label: 'Sin aceite' },
  { g: 5, label: 'Cucharadita (5 g)' },
  { g: 13, label: 'Cucharada (13 g)' },
];

// open: show the fields expanded (editing a logged food); otherwise they fold to keep the sheet short.
export function prepFieldsHtml({ prep = '', itemNote = '', oilG = 0 } = {}, { open = false } = {}) {
  const summary = [prep, oilG ? `aceite ${oilG} g` : '', itemNote].filter(Boolean).join(' · ');
  return `
    <details class="prep-box" ${open || summary ? 'open' : ''}>
    <summary>Preparación, aceite y nota <span class="muted">${summary ? esc(summary) : '(opcional)'}</span></summary>
    <fieldset class="segmented wrap compact-pills">
      <legend>Preparación <span class="muted">(opcional)</span></legend>
      <label><input type="radio" name="prep" value="" ${prep ? '' : 'checked'}><span>Sin indicar</span></label>
      ${PREPS.map((p) => `<label><input type="radio" name="prep" value="${p}" ${p === prep ? 'checked' : ''}><span>${p}</span></label>`).join('')}
    </fieldset>
    <fieldset class="segmented wrap compact-pills">
      <legend>Le puse aceite de oliva</legend>
      ${OIL.map((o) => `<label><input type="radio" name="oil" value="${o.g}" ${o.g === oilG ? 'checked' : ''}><span>${o.label}</span></label>`).join('')}
    </fieldset>
    <label class="field"><span>Nota del alimento <span class="muted">(opcional)</span></span><input name="itemNote" maxlength="100" value="${esc(itemNote)}" placeholder="Ej.: con un poco de oliva, sin sal"></label>
    </details>`;
}

export function readPrep(form) {
  return {
    prep: form.prep.value,
    itemNote: form.itemNote.value.trim(),
    oilG: Number(form.oil.value) || 0,
  };
}

export function prepSummary(e) {
  return [e.prep, e.itemNote].filter(Boolean).join(' · ');
}

// Creates, updates or removes the olive-oil entry attached to a food entry.
export async function syncOilEntry(parent, oilG) {
  const children = (await db.byDate('entries', parent.date)).filter((e) => e.parentId === parent.id);
  const current = children[0];
  if (!oilG) {
    for (const c of children) await db.remove('entries', c.id);
    return;
  }
  const oil = findFood('aceite-oliva');
  await db.put('entries', {
    ...(current ?? { id: db.newId(), createdAt: parent.createdAt + 0.5 }),
    date: parent.date,
    meal: parent.meal,
    parentId: parent.id,
    foodId: oil.id,
    name: oil.name,
    qtyLabel: `${dec.format(oilG)} g · para ${parent.name.toLowerCase()}`,
    ...nutrientsFor(oil, oilG),
  });
}
