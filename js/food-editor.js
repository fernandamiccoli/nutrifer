// Create/edit form for the user's own foods. Values can be entered per portion or per 100 g;
// they are always stored per 100 g so every food behaves the same in the portion step.
import { esc, icon } from './util.js';
import { saveMyFood } from './catalog.js';

const MISSING_LABEL = { name: 'nombre', kcal: 'energía', p: 'proteínas', c: 'carbohidratos', f: 'grasas' };

// options: { food?, draft?, missing?, title, onSaved(food), onBack? }
export function renderFoodEditor(container, { food, draft, missing = [], title, onSaved, onBack, onClose }) {
  const src = food ?? draft ?? {};
  const fromLabel = !!draft; // barcode drafts come per 100 g
  const mode = food || fromLabel ? 'g100' : 'portion';
  const unit = src.unit ?? { label: 'porción', g: '' };
  const factor = mode === 'portion' && unit.g ? unit.g / 100 : 1;
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
        <label class="field"><span>Porción</span><input name="unitLabel" maxlength="24" value="${esc(unit.label)}" placeholder="feta, unidad, taza"></label>
        <label class="field"><span>Gramos de la porción</span><input name="unitG" type="number" inputmode="decimal" min="1" step="any" value="${esc(unit.g)}" placeholder="Ej.: 30"></label>
      </div>

      <fieldset class="segmented" aria-label="Los valores son">
        <legend>Los valores nutricionales son</legend>
        <label><input type="radio" name="mode" value="portion" ${mode === 'portion' ? 'checked' : ''}><span>por porción</span></label>
        <label><input type="radio" name="mode" value="g100" ${mode === 'g100' ? 'checked' : ''}><span>cada 100 g</span></label>
      </fieldset>

      <div class="field-grid">
        <label class="field ${missing.includes('kcal') ? 'is-missing' : ''}"><span>Energía (kcal)</span><input name="kcal" type="number" inputmode="decimal" min="0" step="any" required value="${show(src.kcal)}"></label>
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
  form.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-ed]');
    if (b?.dataset.ed === 'back') onBack?.();
    if (b?.dataset.ed === 'close') onClose?.();
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

    if (!name || kcal === null) {
      error.textContent = 'Completá al menos el nombre y la energía.';
      error.hidden = false;
      return;
    }
    if (perPortion && !unitG) {
      error.textContent = 'Para cargar valores por porción, indicá cuántos gramos tiene la porción (miralo en la etiqueta o pesalo una vez).';
      error.hidden = false;
      return;
    }

    const to100 = (v) => (v === null ? 0 : Math.round((perPortion ? (v / unitG) * 100 : v) * 10) / 10);
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
      unit: { label: form.unitLabel.value.trim() || 'porción', g: unitG || 100 },
      tags,
    });
    onSaved(saved);
  });

  form.name.focus();
}
