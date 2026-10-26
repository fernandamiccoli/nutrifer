// Progress: weight log with chart, and the last two weeks of physical activity.
import * as db from '../db.js';
import { state } from '../state.js';
import { computeTargets } from '../goals.js';
import { esc, icon, num, dec, parseDec, toast, todayKey, shiftKey, keysBetween, shortDate, longDate } from '../util.js';
import { dayActivity, workoutSummary } from '../activity.js';
import { columns, hbars } from '../charts.js';

const main = document.getElementById('main');

export async function renderProgress() {
  const weights = (await db.all('weights')).sort((a, b) => a.date.localeCompare(b.date));
  const latest = weights.at(-1);
  const first = weights[0];
  const change = latest && first && latest !== first ? latest.kg - first.kg : null;
  const from = shiftKey(todayKey(), -13);
  const workouts = await db.byDateRange('workouts', from, todayKey());

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

    ${activityHtml(workouts, from)}
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

function activityHtml(workouts, from) {
  const kg = state.profile.weightKg;
  const days = keysBetween(from, todayKey()).map((date) => ({ date, ...dayActivity(workouts.filter((w) => w.date === date), kg) }));
  const total = days.reduce((a, d) => ({ minutes: a.minutes + d.minutes, totalKcal: a.totalKcal + d.totalKcal, sessions: a.sessions + d.sessions }), { minutes: 0, totalKcal: 0, sessions: 0 });
  const muscles = {};
  for (const w of workouts) for (const m of workoutSummary(w, kg).muscles) muscles[m] = (muscles[m] ?? 0) + 1;
  return `
    <section class="settings-block" aria-labelledby="act-title">
      <div class="block-head">
        <h2 id="act-title">Actividad, últimas 2 semanas</h2>
        ${total.sessions ? `<p class="figure-sm">${num.format(total.minutes)} min <span>${total.sessions} ${total.sessions === 1 ? 'sesión' : 'sesiones'} · ~${num.format(total.totalKcal)} kcal en total</span></p>` : ''}
      </div>
      ${total.sessions ? `
        ${columns({
          data: days.map((d) => ({ label: shortDate(d.date).replace('.', ''), value: d.minutes || null, tip: `${shortDate(d.date)}: ${d.minutes ? `${num.format(d.minutes)} min, ~${num.format(d.totalKcal)} kcal` : 'sin actividad'}` })),
          kind: 'activity', unit: 'min',
        })}
        ${Object.keys(muscles).length ? `<h3 class="sub-title">Músculos trabajados (sesiones)</h3>${hbars(Object.entries(muscles).sort((a, b) => b[1] - a[1]).map(([m, n]) => ({ label: m, value: n, valueLabel: String(n) })), { valueWidth: '2em' })}` : ''}`
        : '<p class="hint">Todavía no registraste actividad. Se carga desde la pantalla del día.</p>'}
    </section>`;
}
