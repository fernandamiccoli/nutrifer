// "Mis alimentos": list, edit and delete the user's own foods.
import { esc, icon, num, toast } from '../util.js';
import { getMyFoods, deleteMyFood } from '../catalog.js';
import { renderFoodEditor } from '../food-editor.js';

const main = document.getElementById('main');
const sheet = document.getElementById('add-dialog');

export function renderMyFoods() {
  const foods = getMyFoods();
  main.innerHTML = `
    <header class="page-head">
      <p class="back-link"><a href="#/perfil">${icon.prev}<span>Perfil</span></a></p>
      <h1>Mis alimentos</h1>
      <p class="lede">Los valores se guardan cada 100 g. Al cargar una comida elegís la porción o los gramos.</p>
    </header>
    <div class="meal-actions"><button class="chip strong" data-f="new">${icon.plus}<span>Crear alimento</span></button></div>
    ${foods.length ? `
      <ul class="items myfoods" role="list">
        ${foods.map((f) => `
          <li class="item">
            <div class="item-main">
              <span class="item-name">${esc(f.name)}${f.tags?.includes('gluten') ? '<span class="tag warn">con TACC</span>' : ''}</span>
              <span class="item-qty">${[f.brand, f.missing ? 'sin datos nutricionales' : f.perUnit ? `${num.format(f.kcal)} kcal por ${f.unit.label}` : `${num.format(f.kcal)} kcal cada 100 g`, f.perUnit ? '' : `${f.unit.label} de ${num.format(f.unit.g)} g`].filter(Boolean).map(esc).join(' · ')}</span>
            </div>
            <button class="icon-btn small" data-f="edit" data-id="${f.id}" aria-label="Editar ${esc(f.name)}">${icon.edit}</button>
            <button class="icon-btn small" data-f="delete" data-id="${f.id}" aria-label="Borrar ${esc(f.name)}">${icon.trash}</button>
          </li>`).join('')}
      </ul>` : '<p class="hint empty-state">Todavía no tenés alimentos propios. Escaneá un código de barras al cargar una comida o creá uno acá.</p>'}
  `;
}

main.addEventListener('click', async (ev) => {
  if (!main.querySelector('.myfoods, .empty-state')) return;
  const b = ev.target.closest('[data-f]');
  if (!b) return;
  const food = getMyFoods().find((f) => f.id === b.dataset.id);
  if (b.dataset.f === 'delete') {
    if (!confirm(`¿Borrar ${food.name}? Lo que ya registraste se mantiene.`)) return;
    await deleteMyFood(food.id);
    toast(`${food.name} borrado`);
    renderMyFoods();
    return;
  }
  renderFoodEditor(sheet, {
    food: b.dataset.f === 'edit' ? food : undefined,
    title: b.dataset.f === 'edit' ? 'Editar alimento' : 'Crear alimento',
    onClose: () => sheet.close(),
    onSaved: (saved) => {
      sheet.close();
      toast(`${saved.name} guardado`);
      renderMyFoods();
    },
  });
  sheet.showModal();
});
