// Progress: weight log with chart.
import * as db from '../db.js';
import { state } from '../state.js';
import { computeTargets } from '../goals.js';
import { esc, icon, dec, parseDec, toast, todayKey, shortDate, longDate } from '../util.js';

const main = document.getElementById('main');

export async function renderProgress() {
  const weights = (await db.all('weights')).sort((a, b) => a.date.localeCompare(b.date));
  const latest = weights.at(-1);
  const first = weights[0];
  const change = latest && first && latest !== first ? latest.kg - first.kg : null;

  main.innerHTML = `
    <header class="page-head">
      <h1>Progreso</h1>
    </header>

    <section class="settings-block" aria-labelledby="weight-title">
      <div class="block-head">
        <h2 id="weight-title">Peso</h2>
        ${latest ? `<p class="figure-sm">${dec.format(latest.kg)} kg${change !== null ? ` <span class="${change <= 0 ? 'down' : 'up'}">${change > 0 ? '+' : ''}${dec.format(change)} kg desde el ${shortDate(first.date)}</span>` : ''}</p>` : ''}
      </div>
      <form class="weight-form">
        <label class="field"><span>Fecha</span><input name="date" type="date" value="${todayKey()}" max="${todayKey()}" required></label>
        <label class="field"><span>Peso (kg)</span><input name="kg" type="text" inputmode="decimal" autocomplete="off" pattern="[0-9]{2,3}([.,][0-9])?" required placeholder="${latest ? dec.format(latest.kg) : '68,5'}"></label>
        <button class="chip strong" type="submit">${icon.plus}<span>Registrar</span></button>
      </form>
      ${weights.length >= 2 ? weightChart(weights) : '<p class="hint">Con dos registros o más vas a ver el gráfico. Pesate siempre en las mismas condiciones, por ejemplo en ayunas.</p>'}
      ${weights.length ? `
        <ul class="items history" role="list">
          ${weights.slice(-8).reverse().map((w) => `
            <li class="item">
              <div class="item-main"><span class="item-name">${dec.format(w.kg)} kg</span><span class="item-qty">${esc(longDate(w.date))}</span></div>
              <span></span>
              <button class="icon-btn small" data-weight-delete="${w.id}" aria-label="Borrar registro del ${esc(longDate(w.date))}">${icon.trash}</button>
            </li>`).join('')}
        </ul>` : ''}
    </section>
  `;

  main.querySelector('.weight-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const date = ev.target.date.value;
    const kg = parseDec(ev.target.kg.value);
    if (!date || !(kg >= 30 && kg <= 300)) return ev.target.reportValidity();
    await db.put('weights', { id: date, date, kg });
    await maybeUpdateProfileWeight();
    toast('Peso registrado');
    renderProgress();
  });
  main.querySelectorAll('[data-weight-delete]').forEach((b) => b.addEventListener('click', async () => {
    await db.remove('weights', b.dataset.weightDelete);
    await maybeUpdateProfileWeight();
    renderProgress();
  }));
}

// The most recent weigh-in feeds the automatic targets (not the nutritionist's numbers).
export async function maybeUpdateProfileWeight() {
  const latest = (await db.all('weights')).sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  const p = state.profile;
  if (!latest || latest.kg === p.weightKg) return;
  const next = { ...p, weightKg: latest.kg };
  if (!p.custom) next.targets = computeTargets(next);
  state.profile = await db.put('profile', next);
}

function weightChart(weights) {
  const W = 400;
  const H = 190;
  const pad = { t: 14, r: 10, b: 28, l: 42 };
  const kgs = weights.map((w) => w.kg);
  const min = Math.floor(Math.min(...kgs) - 0.5);
  const max = Math.ceil(Math.max(...kgs) + 0.5);
  const t0 = new Date(weights[0].date).getTime();
  const t1 = new Date(weights.at(-1).date).getTime();
  const x = (d) => pad.l + ((new Date(d).getTime() - t0) / Math.max(1, t1 - t0)) * (W - pad.l - pad.r);
  const y = (kg) => pad.t + (1 - (kg - min) / Math.max(0.1, max - min)) * (H - pad.t - pad.b);
  const path = weights.map((w, i) => `${i ? 'L' : 'M'}${x(w.date).toFixed(1)},${y(w.kg).toFixed(1)}`).join(' ');
  const ticks = [min, (min + max) / 2, max];
  return `
    <figure class="chart">
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolución del peso: de ${dec.format(weights[0].kg)} a ${dec.format(weights.at(-1).kg)} kg">
        ${ticks.map((k) => `<line class="grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y(k)}" y2="${y(k)}"/><text class="axis" x="${pad.l - 8}" y="${y(k) + 4}" text-anchor="end">${dec.format(k)}</text>`).join('')}
        <text class="axis" x="${pad.l}" y="${H - 6}">${shortDate(weights[0].date)}</text>
        <text class="axis" x="${W - pad.r}" y="${H - 6}" text-anchor="end">${shortDate(weights.at(-1).date)}</text>
        <path class="line" d="${path}"/>
        ${weights.map((w) => `<circle class="dot" cx="${x(w.date)}" cy="${y(w.kg)}" r="3.5"><title>${shortDate(w.date)}: ${dec.format(w.kg)} kg</title></circle>`).join('')}
      </svg>
    </figure>`;
}
