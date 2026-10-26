// Create/edit form for the user's own foods. Values can be entered per portion or per 100 g;
// they are always stored per 100 g so every food behaves the same in the portion step.
import { esc, icon } from './util.js';
import { saveMyFood } from './catalog.js';
import { estimateNutrition, aiProgress, aiErrorHtml } from './ai.js';

const MISSING_LABEL = { name: 'nombre', kcal: 'energía', p: 'proteínas', c: 'carbohidratos', f: 'grasas' };

// options: { food?, draft?, missing?, title, onSaved(food), onBack? }
export function renderFoodEditor(container, { food, draft, missing = [], title, onSaved, onBack, onClose }) {
  const src = food ?? draft ?? {};
  const fromLabel = !!draft; // barcode drafts come per 100 g
  // perUnit foods have no known weight: values are stored per portion (unit.g is a virtual 100).
  const mode = src.perUnit || !(food || fromLabel) ? 'portion' : 'g100';
  const unit = src.unit ? { ...src.unit, g: src.perUnit ? '' : src.unit.g } : { label: 'unidad', g: '' };
  const factor = !src.perUnit && mode === 'portion' && unit.g ? unit.g / 100 : 1;
  const show = (v) => (v === null || v === undefined || v === '' ? '' : Math.round(v * factor * 10) / 10);

  container.innerHTML = `
    <form class="sheet-body food-editor" novalidate>
      <header class="sheet-head">
        ${onBack ? `<button type="button" class="icon-btn" data-ed="back" aria-label="Volver">${icon.prev}</button>` : ''}
        <h2 id="add-title">${esc(title)}</h2>
        <button type="button" class="icon-btn" data-ed="close" aria-label="Cerrar">${icon.close}</button>
      </header>

      ${missing.length ? `<p class="notice">Open Food Facts no tiene ${missing.map((k) => MISSING_LABEL[k]).join(', ')}. Completalo con la etiqueta del envase.</p>` : ''}
      ${src.barcode ? `<p class="hint">Código ${esc(src.barcode)}</p>` : ''}

      <label class="field ${missing.includes('name') ? 'is-missing' : ''}"><span>Nombre</span><input name="name" required maxlength="80" value="${esc(src.name)}" placeholder="Ej.: pan sin TACC de mi marca"></label>
      <label class="field"><span>Marca <span class="muted">(opcional)</span></span><input name="brand" maxlength="60" value="${esc(src.brand)}"></label>

      <div class="field-grid">
        <label class="field"><span>Porción</span><input name="unitLabel" maxlength="24" value="${esc(unit.label)}" placeholder="unidad, feta, taza"></label>
        <label class="field"><span>Gramos <span class="muted">(si los sabés)</span></span><input name="unitG" type="number" inputmode="decimal" min="1" step="any" value="${esc(unit.g)}" placeholder="No sé"></label>
      </div>

      <fieldset class="segmented" aria-label="Los valores son">
        <legend>Los valores nutricionales son</legend>
        <label><input type="radio" name="mode" value="portion" ${mode === 'portion' ? 'checked' : ''}><span>por porción</span></label>
        <label><input type="radio" name="mode" value="g100" ${mode === 'g100' ? 'checked' : ''}><span>cada 100 g</span></label>
      </fieldset>

      <p class="hint">Si no sabés los valores, calculalos con IA o dejalos vacíos: el alimento queda marcado para revisar con tu nutricionista.</p>
      <button type="button" class="secondary" data-ed="ai">Calcular con IA</button>
      <p class="ai-out hint" aria-live="polite"></p>
      <div class="field-grid">
        <label class="field ${missing.includes('kcal') ? 'is-missing' : ''}"><span>Energía (kcal)</span><input name="kcal" type="number" inputmode="decimal" min="0" step="any" value="${src.missing ? '' : show(src.kcal)}" placeholder="No sé"></label>
        <label class="field ${missing.includes('p') ? 'is-missing' : ''}"><span>Proteínas (g)</span><input name="p" type="number" inputmode="decimal" min="0" step="any" value="${show(src.p)}"></label>
        <label class="field ${missing.includes('c') ? 'is-missing' : ''}"><span>Carbohidratos (g)</span><input name="c" type="number" inputmode="decimal" min="0" step="any" value="${show(src.c)}"></label>
        <label class="field ${missing.includes('f') ? 'is-missing' : ''}"><span>Grasas (g)</span><input name="f" type="number" inputmode="decimal" min="0" step="any" value="${show(src.f)}"></label>
      </div>

      <fieldset class="segmented" aria-label="Tipo">
        <legend>Cuenta como</legend>
        <label><input type="radio" name="kind" value="" ${!src.tags?.some((t) => t === 'veg' || t === 'fruit') ? 'checked' : ''}><span>Otro</span></label>
        <label><input type="radio" name="kind" value="veg" ${src.tags?.includes('veg') ? 'checked' : ''}><span>Verdura</span></label>
        <label><input type="radio" name="kind" value="fruit" ${src.tags?.includes('fruit') ? 'checked' : ''}><span>Fruta</span></label>
      </fieldset>
      <label class="switch"><input type="checkbox" name="gluten" ${src.tags?.includes('gluten') ? 'checked' : ''}><span>Contiene gluten (TACC)</span></label>

      <p class="form-error" role="alert" hidden></p>
      <button class="primary" type="submit">Guardar en mis alimentos</button>
    </form>`;

  const form = container.querySelector('form');
  let aiNote = src.aiNote ?? '';
  let aiEstimated = !!src.aiEstimated;
  form.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-ed]');
    if (b?.dataset.ed === 'back') onBack?.();
    if (b?.dataset.ed === 'close') onClose?.();
    if (b?.dataset.ed === 'ai') {
      const name = form.name.value.trim();
      const outEl = form.querySelector('.ai-out');
      if (!name) {
        outEl.textContent = 'Escribí primero el nombre del alimento.';
        return form.name.focus();
      }
      const brand = form.brand.value.trim();
      const desc = `1 ${form.unitLabel.value.trim() || 'porción'}${form.unitG.value ? ` de ${form.unitG.value} g` : ''} de ${name}${brand ? ` (${brand})` : ''}`;
      const progress = aiProgress(b, outEl);
      try {
        const r = await estimateNutrition(desc, progress.options);
        form.querySelector('input[name="mode"][value="portion"]').checked = true;
        if (!form.unitG.value && r.grams) form.unitG.value = r.grams;
        form.kcal.value = r.kcal;
        form.p.value = r.protein;
        form.c.value = r.carbs;
        form.f.value = r.fat;
        aiEstimated = true;
        aiNote = `${r.assumptions} (confianza ${r.confidence})`;
        progress.done(`<strong>Estimación de IA, confianza ${esc(r.confidence)}.</strong> ${esc(r.assumptions)} Revisá los valores y guardá.`);
      } catch (err) {
        progress.done(aiErrorHtml(err));
      }
      b.textContent = 'Calcular de nuevo con IA';
    }
  });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const error = form.querySelector('.form-error');
    const number = (name) => {
      const v = parseFloat(form[name].value);
      return Number.isFinite(v) && v >= 0 ? v : null;
    };
    const name = form.name.value.trim();
    const unitG = number('unitG');
    const perPortion = form.mode.value === 'portion';
    const kcal = number('kcal');

    if (!name) {
      error.textContent = 'Poné al menos el nombre.';
      error.hidden = false;
      return;
    }
    if (!perPortion && !unitG && kcal !== null) {
      error.textContent = 'Si los valores son cada 100 g, indicá cuántos gramos tiene la porción, o cambiá a "por porción".';
      error.hidden = false;
      return;
    }

    // Without grams, values stay per portion and unit.g is a virtual 100 so the math still works.
    const perUnit = perPortion && !unitG;
    const scale = (v) => (v === null ? 0 : Math.round((perPortion && !perUnit ? (v / unitG) * 100 : v) * 10) / 10);
    const to100 = scale;
    const tags = [form.kind.value, form.gluten.checked ? 'gluten' : ''].filter(Boolean);
    const saved = await saveMyFood({
      ...(food ?? {}),
      barcode: src.barcode,
      name,
      brand: form.brand.value.trim(),
      kcal: to100(kcal),
      p: to100(number('p')),
      c: to100(number('c')),
      f: to100(number('f')),
      unit: { label: form.unitLabel.value.trim() || 'unidad', g: perUnit ? 100 : unitG || 100 },
      perUnit,
      missing: kcal === null,
      aiEstimated,
      aiNote,
      tags,
    });
    onSaved(saved);
  });

  form.name.focus();
}
