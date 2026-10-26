// Profile: personal data, goals (several), daily targets, water goal, medication list, data backup.
import * as db from '../db.js';
import { state } from '../state.js';
import { ACTIVITY, GOALS, BOTTLE_ML, computeTargets, normalizeProfile } from '../goals.js';
import { esc, icon, toast, sortMeds, normalizeMoment, MED_MOMENT_GROUPS } from '../util.js';
import { getMyFoods } from '../catalog.js';
import { exportBackup, importBackup } from '../backup.js';

const main = document.getElementById('main');
const WATER_BOTTLES = [3, 4, 5, 6];

export async function renderProfile() {
  const firstRun = !state.profile;
  const p = state.profile ?? normalizeProfile({
    sex: 'female', age: '', heightCm: '', weightKg: '', activity: 'light', goals: ['lose'], custom: false,
  });
  const meds = (await db.all('meds')).sort((a, b) => a.order - b.order);
  let lastBackup = 0;
  try { lastBackup = Number(localStorage.getItem('nutrifer:lastBackup')) || 0; } catch { /* storage blocked */ }

  main.innerHTML = `
    <header class="page-head">
      <h1>${firstRun ? 'Antes de empezar' : 'Tu perfil'}</h1>
      <p class="lede">${firstRun
        ? 'Con estos datos calculo una meta diaria orientativa. Si tu nutricionista te dio números, podés cargarlos abajo.'
        : 'Si cambia tu peso o tu plan, actualizalo acá.'}</p>
    </header>

    <form class="profile" novalidate>
      <div class="field-grid">
        <label class="field"><span>Tu nombre <span class="muted">(para el informe)</span></span><input name="name" maxlength="60" value="${esc(p.name)}" autocomplete="given-name"></label>
        <label class="field"><span>Tu nutricionista</span><input name="nutritionist" maxlength="60" value="${esc(p.nutritionist ?? '')}" autocomplete="off"></label>
      </div>

      <fieldset class="segmented">
        <legend>Sexo biológico <span class="muted">(cambia la fórmula)</span></legend>
        <label><input type="radio" name="sex" value="female" ${p.sex === 'female' ? 'checked' : ''}><span>Femenino</span></label>
        <label><input type="radio" name="sex" value="male" ${p.sex === 'male' ? 'checked' : ''}><span>Masculino</span></label>
      </fieldset>

      <div class="field-grid three">
        <label class="field"><span>Edad</span><input name="age" type="number" inputmode="numeric" min="14" max="100" value="${esc(p.age)}" required></label>
        <label class="field"><span>Altura (cm)</span><input name="heightCm" type="number" inputmode="numeric" min="120" max="230" value="${esc(p.heightCm)}" required></label>
        <label class="field"><span>Peso (kg)</span><input name="weightKg" type="number" inputmode="decimal" min="30" max="300" step="0.1" value="${esc(p.weightKg)}" required></label>
      </div>

      <fieldset class="options">
        <legend>Actividad física</legend>
        ${Object.entries(ACTIVITY).map(([key, a]) => `
          <label class="option">
            <input type="radio" name="activity" value="${key}" ${p.activity === key ? 'checked' : ''}>
            <span class="option-text"><strong>${a.label}</strong><span>${a.hint}</span></span>
          </label>`).join('')}
      </fieldset>

      <fieldset class="segmented wrap">
        <legend>Objetivos <span class="muted">(podés elegir varios)</span></legend>
        ${Object.entries(GOALS).map(([key, g]) => `
          <label><input type="checkbox" name="goals" value="${key}" ${p.goals.includes(key) ? 'checked' : ''}><span>${g.label}</span></label>`).join('')}
      </fieldset>

      <section class="targets" aria-labelledby="targets-title">
        <div class="targets-head">
          <h2 id="targets-title">Meta diaria</h2>
          <label class="switch">
            <input type="checkbox" name="custom" ${p.custom ? 'checked' : ''}>
            <span>Usar los números de mi nutricionista</span>
          </label>
        </div>
        <div class="field-grid four">
          <label class="field"><span>Energía (kcal)</span><input name="t-kcal" type="number" inputmode="numeric" min="800" max="6000"></label>
          <label class="field"><span>Proteínas (g)</span><input name="t-protein" type="number" inputmode="numeric" min="0"></label>
          <label class="field"><span>Carbohidratos (g)</span><input name="t-carbs" type="number" inputmode="numeric" min="0"></label>
          <label class="field"><span>Grasas (g)</span><input name="t-fat" type="number" inputmode="numeric" min="0"></label>
        </div>
        <p class="hint targets-hint"></p>
      </section>

      <fieldset class="segmented">
        <legend>Agua por día <span class="muted">(botellas de 500 cm³)</span></legend>
        ${WATER_BOTTLES.map((n) => `<label><input type="radio" name="water" value="${n * BOTTLE_ML}" ${p.waterGoalMl === n * BOTTLE_ML ? 'checked' : ''}><span>${n} (${(n * BOTTLE_ML / 1000).toLocaleString('es-AR')} L)</span></label>`).join('')}
      </fieldset>

      <p class="form-error" role="alert" hidden></p>
      <button class="primary" type="submit">${firstRun ? 'Guardar y empezar' : 'Guardar perfil'}</button>
    </form>

    ${firstRun ? '' : `
    <section class="settings-block" id="meds" aria-labelledby="meds-title">
      <h2 id="meds-title">Medicación y suplementos</h2>
      <p class="hint">Cada una aparece en la pantalla del día antes, durante o después de la comida que elijas, para que marques lo que tomaste. Solo para tu registro; no son indicaciones.</p>
      <ul class="med-edit" role="list">
        ${sortMeds(meds).map((m) => `
          <li data-id="${m.id}">
            ${momentSelect('med-moment', m.moment, `Momento de ${esc(m.name)}`)}
            <input class="inline-input" name="med-name" value="${esc(m.name)}" aria-label="Nombre" maxlength="60">
            <input class="inline-input dose" name="med-dose" value="${esc(m.dose)}" aria-label="Dosis de ${esc(m.name)}" placeholder="Dosis" maxlength="30">
            <button class="icon-btn small" data-med="delete" aria-label="Quitar ${esc(m.name)}">${icon.trash}</button>
          </li>`).join('')}
      </ul>
      <form class="med-add">
        ${momentSelect('moment', '', 'Momento')}
        <input class="inline-input" name="name" placeholder="Agregar medicación o suplemento" maxlength="60" aria-label="Nombre">
        <input class="inline-input dose" name="dose" placeholder="Dosis" maxlength="30" aria-label="Dosis">
        <button class="chip" type="submit">${icon.plus}<span>Agregar</span></button>
      </form>
    </section>

    <section class="settings-block" aria-labelledby="foods-title">
      <h2 id="foods-title">Mis alimentos</h2>
      <p class="hint">${getMyFoods().length ? `Tenés ${getMyFoods().length} guardados.` : 'Los que escaneás o creás quedan acá.'}</p>
      <a class="chip as-link" href="#/alimentos">${icon.edit}<span>Ver y editar</span></a>
    </section>

    <section class="settings-block" aria-labelledby="data-title">
      <h2 id="data-title">Tus datos</h2>
      <p class="hint">Todo queda guardado en este dispositivo. Descargá una copia cada semana para no perder nada si se borra el navegador. ${lastBackup ? `Última copia: ${new Date(lastBackup).toLocaleDateString('es-AR')}.` : 'Todavía no descargaste ninguna.'}</p>
      <div class="meal-actions">
        <button class="chip strong" data-backup="export">Descargar copia</button>
        <label class="chip">Restaurar copia<input type="file" accept="application/json,.json" data-backup="import" hidden></label>
      </div>
    </section>`}
  `;

  bindProfileForm(p, firstRun);
  if (!firstRun) bindSettings();
  if (location.hash.endsWith('#meds')) document.getElementById('meds')?.scrollIntoView();
}

function momentSelect(name, value, label) {
  return `<select class="inline-input moment-select" name="${name}" aria-label="${label}">
    <option value="" ${value ? '' : 'selected'}>Sin momento</option>
    ${MED_MOMENT_GROUPS.map((g) => `<optgroup label="${g.label}">
      ${g.moments.map((m) => `<option value="${m.id}" ${m.id === normalizeMoment(value) ? 'selected' : ''}>${m.label}</option>`).join('')}
    </optgroup>`).join('')}
  </select>`;
}

function bindProfileForm(p, firstRun) {
  const form = main.querySelector('form.profile');
  const targetInputs = ['kcal', 'protein', 'carbs', 'fat'].map((k) => form[`t-${k}`]);

  const readBase = () => ({
    name: form.name.value.trim(),
    nutritionist: form.nutritionist.value.trim(),
    sex: form.sex.value,
    age: parseInt(form.age.value, 10),
    heightCm: parseFloat(form.heightCm.value),
    weightKg: parseFloat(form.weightKg.value),
    activity: form.activity.value,
    goals: [...form.querySelectorAll('input[name="goals"]:checked')].map((i) => i.value),
    waterGoalMl: Number(form.water.value) || 2000,
  });
  const baseValid = (b) => b.age >= 14 && b.age <= 100 && b.heightCm >= 120 && b.heightCm <= 230 && b.weightKg >= 30 && b.weightKg <= 300;

  const sync = (ev) => {
    // "Mantener" excludes the two weight-change goals and vice versa.
    if (ev?.target.name === 'goals' && ev.target.checked) {
      const exclusive = ev.target.value === 'maintain' ? ['lose', 'gain'] : ['lose', 'gain'].includes(ev.target.value) ? ['maintain'] : [];
      exclusive.forEach((v) => { form.querySelector(`input[name="goals"][value="${v}"]`).checked = false; });
    }
    const custom = form.custom.checked;
    targetInputs.forEach((input) => { input.readOnly = !custom; });
    const hint = form.querySelector('.targets-hint');
    if (custom) {
      hint.textContent = 'Estos números reemplazan el cálculo automático.';
      return;
    }
    const b = readBase();
    if (!baseValid(b)) {
      targetInputs.forEach((input) => { input.value = ''; });
      hint.textContent = 'Completá edad, altura y peso para ver el cálculo.';
      return;
    }
    const t = computeTargets(b);
    form['t-kcal'].value = t.kcal;
    form['t-protein'].value = t.protein;
    form['t-carbs'].value = t.carbs;
    form['t-fat'].value = t.fat;
    hint.textContent = 'Cálculo orientativo (fórmula Mifflin-St Jeor). No reemplaza la indicación de tu nutricionista.';
  };

  if (p.custom && p.targets) {
    form['t-kcal'].value = p.targets.kcal;
    form['t-protein'].value = p.targets.protein;
    form['t-carbs'].value = p.targets.carbs;
    form['t-fat'].value = p.targets.fat;
  }
  form.addEventListener('input', sync);
  sync();

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const error = form.querySelector('.form-error');
    const fail = (msg) => { error.textContent = msg; error.hidden = false; };
    const b = readBase();
    const targets = {
      kcal: parseInt(form['t-kcal'].value, 10),
      protein: parseInt(form['t-protein'].value, 10),
      carbs: parseInt(form['t-carbs'].value, 10),
      fat: parseInt(form['t-fat'].value, 10),
    };
    if (!baseValid(b)) return fail('Revisá edad (14 a 100), altura en cm (120 a 230) y peso en kg (30 a 300).');
    if (!b.goals.length) return fail('Elegí al menos un objetivo.');
    if (!(targets.kcal >= 800) || [targets.protein, targets.carbs, targets.fat].some((v) => !(v >= 0))) {
      return fail('La meta de energía tiene que ser de al menos 800 kcal y los macros no pueden quedar vacíos.');
    }
    const { goal, ...rest } = p; // drop the legacy single-goal field
    state.profile = await db.put('profile', { ...rest, id: 'me', ...b, custom: form.custom.checked, targets });
    toast('Perfil guardado');
    if (firstRun) {
      if (location.hash === '#/dia') window.dispatchEvent(new HashChangeEvent('hashchange'));
      else location.hash = '#/dia';
    }
  });
}

function bindSettings() {
  const medList = main.querySelector('.med-edit');
  medList.addEventListener('change', async (ev) => {
    const li = ev.target.closest('li');
    const med = await db.get('meds', li.dataset.id);
    const name = li.querySelector('[name="med-name"]').value.trim();
    if (!name) return;
    const moment = li.querySelector('[name="med-moment"]').value;
    await db.put('meds', { ...med, name, dose: li.querySelector('[name="med-dose"]').value.trim(), moment });
    toast('Lista actualizada');
    if (moment !== (med.moment ?? '')) renderProfile(); // re-sort by moment
  });
  medList.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-med="delete"]');
    if (!btn) return;
    const med = await db.get('meds', btn.closest('li').dataset.id);
    if (!confirm(`¿Quitar ${med.name} de la lista? Lo que ya marcaste en días anteriores se mantiene.`)) return;
    await db.remove('meds', med.id);
    renderProfile();
  });
  main.querySelector('.med-add').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const name = ev.target.name.value.trim();
    if (!name) return;
    const meds = await db.all('meds');
    await db.put('meds', { id: db.newId(), name, dose: ev.target.dose.value.trim(), moment: ev.target.moment.value, order: meds.length });
    toast(`${name} agregado`);
    renderProfile();
  });

  main.querySelector('[data-backup="export"]').addEventListener('click', async () => {
    await exportBackup();
    toast('Copia descargada');
    renderProfile();
  });
  main.querySelector('[data-backup="import"]').addEventListener('change', async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    try {
      const written = await importBackup(file);
      toast(`Copia restaurada: ${written} registros actualizados`);
      location.reload();
    } catch {
      toast('Ese archivo no es una copia de NutriFer.');
    }
  });
}
