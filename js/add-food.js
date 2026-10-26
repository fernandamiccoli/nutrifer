// "Agregar alimento" sheet: search with filters, combos, barcode scan, portion step, quick entry.
import * as db from './db.js';
import { state } from './state.js';
import { esc, icon, num, dec, amountFmt, plural, mealLabel, toast } from './util.js';
import { search, findFood, findByBarcode } from './catalog.js';
import { COMBOS, nutrientsFor, comboTotals } from './foods.js';
import { renderFoodEditor } from './food-editor.js';
import { startScan, lookupBarcode } from './barcode.js';
import { prepFieldsHtml, readPrep, syncOilEntry } from './prep.js';

const dialog = document.getElementById('add-dialog');
let onDone = () => {};
let filter = 'all';
let lastQuery = '';
let activeScan = null;

const FILTERS = [
  ['all', 'Todo'],
  ['mine', 'Mis alimentos'],
  ['veg', 'Verduras'],
  ['combos', 'Combinaciones'],
];

dialog.addEventListener('close', () => {
  activeScan?.stop();
  activeScan = null;
});
dialog.addEventListener('click', (ev) => {
  if (ev.target === dialog) dialog.close();
});

export function openAddFood(mealId, done) {
  onDone = done;
  dialog.dataset.meal = mealId;
  filter = mealId === 'almuerzo' || mealId === 'cena' ? filter : (filter === 'combos' ? 'all' : filter);
  lastQuery = '';
  showSearch();
  dialog.showModal();
}

const mealName = () => mealLabel(dialog.dataset.meal).toLowerCase();

function showSearch() {
  dialog.innerHTML = `
    <div class="sheet-body">
      <header class="sheet-head">
        <h2 id="add-title">Agregar a ${mealName()}</h2>
        <button type="button" class="icon-btn" data-a="close" aria-label="Cerrar">${icon.close}</button>
      </header>
      <div class="search-row">
        <label class="search">
          <span class="visually-hidden">Buscar alimento</span>
          <input type="search" name="q" placeholder="Buscar: pollo, kiwi, quinoa..." autocomplete="off" enterkeyhint="search" value="${esc(lastQuery)}">
        </label>
        <button type="button" class="icon-btn outlined" data-a="scan" aria-label="Escanear código de barras">${icon.barcode}</button>
      </div>
      <div class="filters" role="group" aria-label="Filtrar">
        ${FILTERS.map(([id, label]) => `<button type="button" class="filter" data-a="filter" data-f="${id}" aria-pressed="${filter === id}">${label}</button>`).join('')}
      </div>
      <ul class="results" role="list"></ul>
      <p class="sheet-links">
        <button type="button" class="link" data-a="create">Crear alimento nuevo</button>
        <button type="button" class="link" data-a="quick">Cargar solo esta vez</button>
      </p>
    </div>`;

  const input = dialog.querySelector('input[name="q"]');
  const paint = () => {
    lastQuery = input.value;
    const { foods, combos } = search(input.value, filter);
    const list = dialog.querySelector('.results');
    const comboHtml = combos.map((c) => {
      const t = comboTotals(c);
      return `<li><button type="button" class="result combo" data-a="combo" data-id="${c.id}">
        <span class="result-name">${esc(c.name)}<span class="result-sub">${c.items.length} ingredientes · sin TACC</span></span>
        <span class="result-meta">${num.format(t.kcal)} kcal</span>
      </button></li>`;
    }).join('');
    const foodHtml = foods.map((f) => `
      <li><button type="button" class="result" data-a="pick" data-id="${f.id}">
        <span class="result-name">${esc(f.name)}${f.custom ? '<span class="tag">mío</span>' : ''}${f.tags?.includes('gluten') ? '<span class="tag warn">con TACC</span>' : ''}
          ${f.brand ? `<span class="result-sub">${esc(f.brand)}</span>` : ''}</span>
        <span class="result-meta">${f.missing ? 'sin datos' : `${num.format(f.kcal * f.unit.g / 100)} kcal`} · ${esc(f.unit.label)}</span>
      </button></li>`).join('');
    const emptyMsg = filter === 'mine'
      ? 'Todavía no guardaste alimentos propios. Escaneá un código o creá uno.'
      : 'Sin resultados. Probá con otra palabra, escaneá el código o creá el alimento.';
    list.innerHTML = comboHtml + foodHtml || `<li class="results-empty">${emptyMsg}</li>`;
  };
  input.addEventListener('input', paint);
  dialog.querySelector('.sheet-body').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-a]');
    if (!b) return;
    const a = b.dataset.a;
    if (a === 'close') dialog.close();
    if (a === 'filter') {
      filter = b.dataset.f;
      dialog.querySelectorAll('.filter').forEach((x) => x.setAttribute('aria-pressed', x === b));
      paint();
    }
    if (a === 'pick') showPortion(findFood(b.dataset.id));
    if (a === 'combo') showCombo(COMBOS.find((c) => c.id === b.dataset.id));
    if (a === 'create') showEditor({ title: 'Crear alimento' });
    if (a === 'quick') showQuick();
    if (a === 'scan') showScanner();
  });
  paint();
  if (matchMedia('(pointer: fine)').matches) input.focus();
}

function showPortion(food) {
  const noGrams = !!food.perUnit;
  dialog.innerHTML = `
    <form class="sheet-body">
      <header class="sheet-head">
        <button type="button" class="icon-btn" data-a="back" aria-label="Volver a la búsqueda">${icon.prev}</button>
        <h2 id="add-title">${esc(food.name)}</h2>
        <button type="button" class="icon-btn" data-a="close" aria-label="Cerrar">${icon.close}</button>
      </header>
      <div class="portion">
        <label class="field">
          <span>Cantidad</span>
          <input name="amount" type="number" inputmode="decimal" min="0.25" step="any" value="1" required>
        </label>
        <fieldset class="segmented" aria-label="Unidad">
          <label><input type="radio" name="unit" value="unit" checked><span>${esc(food.unit.label)}${noGrams ? '' : ` (${dec.format(food.unit.g)} g)`}</span></label>
          ${noGrams ? '' : '<label><input type="radio" name="unit" value="g"><span>gramos</span></label>'}
        </fieldset>
      </div>
      <dl class="portion-preview"></dl>
      ${prepFieldsHtml()}
      <button class="primary" type="submit">Agregar a ${mealName()}</button>
    </form>`;

  const form = dialog.querySelector('form');
  const calc = () => {
    const amount = parseFloat(form.amount.value) || 0;
    const byGrams = form.unit.value === 'g';
    const grams = byGrams ? amount : amount * food.unit.g;
    const units = `${amountFmt.format(amount)} ${amount === 1 ? food.unit.label : plural(food.unit.label)}`;
    return {
      ...nutrientsFor(food, grams),
      ...(noGrams ? { grams: null } : {}),
      ...(food.missing ? { macrosMissing: true } : {}),
      qtyLabel: byGrams ? `${dec.format(grams)} g` : noGrams ? units : `${units} · ${dec.format(grams)} g`,
    };
  };
  const paint = () => {
    const v = calc();
    if (food.missing) {
      form.querySelector('.portion-preview').outerHTML = '<p class="notice portion-preview">Este alimento no tiene valores nutricionales cargados. Queda marcado "sin macros" para revisarlo con tu nutricionista.</p>';
      return;
    }
    form.querySelector('.portion-preview').innerHTML = `
      <div><dt>Energía</dt><dd>${num.format(v.kcal)} kcal</dd></div>
      <div><dt>Proteínas</dt><dd>${dec.format(v.protein)} g</dd></div>
      <div><dt>Carbohidratos</dt><dd>${dec.format(v.carbs)} g</dd></div>
      <div><dt>Grasas</dt><dd>${dec.format(v.fat)} g</dd></div>`;
  };
  form.addEventListener('input', (ev) => {
    if (ev.target.name === 'unit') form.amount.value = ev.target.value === 'g' ? food.unit.g : 1;
    paint();
  });
  form.addEventListener('click', (ev) => {
    const a = ev.target.closest('[data-a]')?.dataset.a;
    if (a === 'back') showSearch();
    if (a === 'close') dialog.close();
  });
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const v = calc();
    if (v.grams <= 0) return;
    const { oilG, ...prep } = readPrep(form);
    await saveEntries([{ foodId: food.id, name: food.name, ...v, ...prep }], null, oilG);
  });
  paint();
  if (matchMedia('(pointer: fine)').matches) form.amount.select();
}

function showCombo(combo) {
  const rows = combo.items.map(([id, g]) => ({ food: findFood(id), g }));
  dialog.innerHTML = `
    <form class="sheet-body">
      <header class="sheet-head">
        <button type="button" class="icon-btn" data-a="back" aria-label="Volver a la búsqueda">${icon.prev}</button>
        <h2 id="add-title">${esc(combo.name)}</h2>
        <button type="button" class="icon-btn" data-a="close" aria-label="Cerrar">${icon.close}</button>
      </header>
      <p class="hint">Destildá lo que no comiste y ajustá los gramos. Cada ingrediente queda registrado por separado.</p>
      <ul class="combo-items" role="list">
        ${rows.map((r, i) => `
          <li>
            <label class="combo-check"><input type="checkbox" name="on-${i}" checked><span>${esc(r.food.name)}</span></label>
            <label class="combo-grams"><span class="visually-hidden">Gramos de ${esc(r.food.name)}</span><input name="g-${i}" type="number" inputmode="numeric" min="1" step="any" value="${r.g}"><span aria-hidden="true">g</span></label>
          </li>`).join('')}
      </ul>
      <p class="combo-total"></p>
      <button class="primary" type="submit">Agregar a ${mealName()}</button>
    </form>`;
  const form = dialog.querySelector('form');
  const selected = () => rows
    .map((r, i) => ({ ...r, on: form[`on-${i}`].checked, g: parseFloat(form[`g-${i}`].value) || 0 }))
    .filter((r) => r.on && r.g > 0);
  const paint = () => {
    const items = selected();
    const kcal = items.reduce((s, r) => s + nutrientsFor(r.food, r.g).kcal, 0);
    form.querySelector('.combo-total').innerHTML = `<strong>${num.format(kcal)} kcal</strong> en ${items.length} ${items.length === 1 ? 'ingrediente' : 'ingredientes'}`;
  };
  form.addEventListener('input', paint);
  form.addEventListener('click', (ev) => {
    const a = ev.target.closest('[data-a]')?.dataset.a;
    if (a === 'back') showSearch();
    if (a === 'close') dialog.close();
  });
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const items = selected();
    if (!items.length) return;
    await saveEntries(items.map((r) => ({
      foodId: r.food.id,
      name: r.food.name,
      combo: combo.name,
      qtyLabel: `${dec.format(r.g)} g`,
      ...nutrientsFor(r.food, r.g),
    })), combo.name);
  });
  paint();
}

function showEditor({ title, draft, missing }) {
  renderFoodEditor(dialog, {
    title,
    draft,
    missing,
    onBack: showSearch,
    onClose: () => dialog.close(),
    onSaved: (food) => {
      toast(`${food.name} guardado en mis alimentos`);
      showPortion(food);
    },
  });
}

function showQuick() {
  dialog.innerHTML = `
    <form class="sheet-body">
      <header class="sheet-head">
        <button type="button" class="icon-btn" data-a="back" aria-label="Volver a la búsqueda">${icon.prev}</button>
        <h2 id="add-title">Cargar solo esta vez</h2>
        <button type="button" class="icon-btn" data-a="close" aria-label="Cerrar">${icon.close}</button>
      </header>
      <p class="hint">Para algo que no vas a repetir. Si lo comés seguido, mejor creá el alimento.</p>
      <label class="field"><span>Qué comiste</span><input name="name" required maxlength="80" placeholder="Ej.: empanada de carne al horno"></label>
      <label class="field"><span>Porción</span><input name="qty" maxlength="40" placeholder="Ej.: 2 unidades"></label>
      <div class="field-grid">
        <label class="field"><span>Energía (kcal)</span><input name="kcal" type="number" inputmode="numeric" min="0" required></label>
        <label class="field"><span>Proteínas (g)</span><input name="protein" type="number" inputmode="decimal" min="0" step="any"></label>
        <label class="field"><span>Carbohidratos (g)</span><input name="carbs" type="number" inputmode="decimal" min="0" step="any"></label>
        <label class="field"><span>Grasas (g)</span><input name="fat" type="number" inputmode="decimal" min="0" step="any"></label>
      </div>
      <button class="primary" type="submit">Agregar a ${mealName()}</button>
    </form>`;
  const form = dialog.querySelector('form');
  form.addEventListener('click', (ev) => {
    const a = ev.target.closest('[data-a]')?.dataset.a;
    if (a === 'back') showSearch();
    if (a === 'close') dialog.close();
  });
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!form.name.value.trim() || !form.kcal.value) return form.reportValidity();
    const n = (v) => parseFloat(v) || 0;
    await saveEntries([{
      name: form.name.value.trim(),
      qtyLabel: form.qty.value.trim() || 'porción',
      kcal: Math.round(n(form.kcal.value)),
      protein: n(form.protein.value),
      carbs: n(form.carbs.value),
      fat: n(form.fat.value),
      macrosMissing: !form.protein.value && !form.carbs.value && !form.fat.value,
    }]);
  });
  form.name.focus();
}

function showScanner() {
  dialog.innerHTML = `
    <div class="sheet-body">
      <header class="sheet-head">
        <button type="button" class="icon-btn" data-a="back" aria-label="Volver a la búsqueda">${icon.prev}</button>
        <h2 id="add-title">Escanear código</h2>
        <button type="button" class="icon-btn" data-a="close" aria-label="Cerrar">${icon.close}</button>
      </header>
      <div class="scanner"><video playsinline muted></video><span class="scan-frame" aria-hidden="true"></span></div>
      <p class="hint scan-status" role="status">Apuntá la cámara al código de barras del envase.</p>
      <form class="code-form">
        <label class="field"><span>O escribí los números del código</span><input name="code" inputmode="numeric" pattern="[0-9]{8,14}" maxlength="14" placeholder="7790000000000"></label>
        <button class="secondary" type="submit">Buscar código</button>
      </form>
    </div>`;
  const status = dialog.querySelector('.scan-status');
  dialog.querySelector('.sheet-body').addEventListener('click', (ev) => {
    const a = ev.target.closest('[data-a]')?.dataset.a;
    if (a === 'back') { activeScan?.stop(); showSearch(); }
    if (a === 'close') dialog.close();
  });
  dialog.querySelector('.code-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const code = ev.target.code.value.replace(/\D/g, '');
    if (code.length < 8) return;
    activeScan?.stop();
    handleCode(code, status);
  });

  if (!navigator.mediaDevices?.getUserMedia) {
    status.textContent = 'Este navegador no deja usar la cámara acá. Escribí el código a mano.';
    return;
  }
  activeScan = startScan(dialog.querySelector('video'));
  activeScan.promise
    .then((code) => code && handleCode(code, status))
    .catch(() => { status.textContent = 'No pude abrir la cámara. Revisá el permiso o escribí el código a mano.'; });
}

async function handleCode(code, status) {
  const mine = findByBarcode(code);
  if (mine) return showPortion(mine);
  status.textContent = `Buscando ${code} en Open Food Facts...`;
  try {
    const found = await lookupBarcode(code);
    if (!found) {
      showEditor({ title: 'Producto nuevo', draft: { barcode: code, unit: { label: 'porción', g: '' }, tags: [] } });
      toast('No está en Open Food Facts. Cargalo con la etiqueta.');
      return;
    }
    showEditor({ title: 'Revisá los datos', draft: found.draft, missing: found.missing });
  } catch {
    status.textContent = 'Sin conexión con Open Food Facts. Probá de nuevo o creá el alimento a mano.';
  }
}

async function saveEntries(items, comboName, oilG = 0) {
  const meal = dialog.dataset.meal;
  const now = Date.now();
  for (const [i, item] of items.entries()) {
    const saved = await db.put('entries', { id: db.newId(), date: state.currentDate, meal, createdAt: now + i, ...item });
    if (oilG) await syncOilEntry(saved, oilG);
  }
  dialog.close();
  await onDone();
  toast(comboName ? `${comboName} agregado` : `${items[0].name} agregado`);
}
