// Small chart builders for the report. Plain HTML/CSS bars so text stays at real size on a phone
// and in print; every mark has a title tooltip and every chart has the numbers in text nearby.
import { esc, num, dec } from './util.js';

// Vertical columns, one per day, with an optional target line.
// data: [{ label, value, tip }]; value null = no record that day.
export function columns({ data, target, targetLabel, kind, unit }) {
  const max = Math.max(target || 0, ...data.map((d) => d.value || 0)) * 1.08 || 1;
  const every = data.length > 14 ? Math.ceil(data.length / 10) : 1;
  return `
    <div class="cols cols-${kind}" style="--n:${data.length}" role="img" aria-label="${esc(data.map((d) => `${d.label}: ${d.value == null ? 'sin registro' : `${num.format(d.value)} ${unit}`}`).join('; '))}">
      ${target ? `<span class="cols-target" style="--t:${target / max}"><span>${esc(targetLabel)}</span></span>` : ''}
      ${data.map((d, i) => `
        <div class="col" title="${esc(d.tip ?? `${d.label}: ${d.value == null ? 'sin registro' : `${num.format(d.value)} ${unit}`}`)}">
          <span class="col-bar${d.value == null ? ' is-empty' : ''}${target && d.value > target ? ' is-over' : ''}" style="--h:${((d.value || 0) / max) * 100}%"></span>
          <span class="col-label">${i % every === 0 || i === data.length - 1 ? esc(d.label) : ''}</span>
        </div>`).join('')}
    </div>`;
}

// Horizontal bars with the value at the tip. rows: [{ label, value, valueLabel, color? }]
// valueWidth: same space for every value so all bars share one scale.
export function hbars(rows, { kind = 'brand', valueWidth = '3em' } = {}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return `
    <ul class="hbars hbars-${kind}" role="list" style="--vw:${valueWidth}">
      ${rows.map((r) => `
        <li class="hbar" title="${esc(`${r.label}: ${r.valueLabel}`)}">
          <span class="hbar-label">${esc(r.label)}</span>
          <span class="hbar-track"><span class="hbar-fill"${r.color ? ` data-c="${r.color}"` : ''} style="--w:${(r.value / max) * 100}%"></span><span class="hbar-value">${esc(r.valueLabel)}</span></span>
        </li>`).join('')}
    </ul>`;
}

// Energy split as 100% stacked bars (e.g. "Tu promedio" vs "Meta"), with a legend.
// rows: [{ label, p, c, f }] in grams; converted to kcal shares (4/4/9).
export function macroShares(rows) {
  const share = (r) => {
    const kc = { p: r.p * 4, c: r.c * 4, f: r.f * 9 };
    const total = kc.p + kc.c + kc.f || 1;
    return { p: (kc.p * 100) / total, c: (kc.c * 100) / total, f: (kc.f * 100) / total };
  };
  const names = { p: 'Proteínas', c: 'Carbohidratos', f: 'Grasas' };
  return `
    <div class="shares">
      ${rows.map((r) => {
        const s = share(r);
        return `
          <div class="share-row">
            <span class="share-label">${esc(r.label)}</span>
            <span class="share-bar">
              ${['p', 'c', 'f'].map((k) => `<span class="share-seg seg-${k}" style="--w:${s[k]}%" title="${names[k]}: ${Math.round(s[k])}%">${s[k] >= 14 ? `${Math.round(s[k])}%` : ''}</span>`).join('')}
            </span>
          </div>`;
      }).join('')}
      <p class="legend">${['p', 'c', 'f'].map((k) => `<span><i class="key seg-${k}"></i>${names[k]}</span>`).join('')}</p>
    </div>`;
}

// Average vs target for one figure, as a meter with numbers.
export function statTile({ label, value, target, unit, kind }) {
  const pct = target ? Math.min(100, (value / target) * 100) : 0;
  return `
    <div class="tile">
      <p class="tile-label">${esc(label)}</p>
      <p class="tile-value">${num.format(value)} <span>${esc(unit)}</span></p>
      <div class="meter meter-${kind}${value > target * 1.1 && kind !== 'produce' ? ' is-over' : ''}" aria-hidden="true"><span style="--pct:${pct}%"></span></div>
      <p class="tile-sub">${target ? `${Math.round((value / target) * 100)}% de ${num.format(target)} ${esc(unit)}` : ''}</p>
    </div>`;
}

// Days x items grid of taken / not taken (medication adherence).
export function dotGrid({ days, rows }) {
  return `
    <div class="dotgrid-wrap">
      <table class="dotgrid">
        <thead><tr><th scope="col"><span class="visually-hidden">Medicación</span></th>${days.map((d) => `<th scope="col">${esc(d.short)}</th>`).join('')}</tr></thead>
        <tbody>
          ${rows.map((r) => `
            <tr>
              <th scope="row">${esc(r.label)}<span class="muted"> ${r.taken}/${days.length}</span></th>
              ${r.cells.map((on, i) => `<td title="${esc(`${r.label}, ${days[i].long}: ${on ? 'tomada' : 'no registrada'}`)}"><i class="dot${on ? ' on' : ''}"></i><span class="visually-hidden">${on ? 'sí' : 'no'}</span></td>`).join('')}
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

// Weight line (needs >= 2 points). points: [{ date, label, kg }]
export function weightLine(points) {
  const W = 400;
  const H = 150;
  const pad = { t: 12, r: 12, b: 22, l: 36 };
  const kgs = points.map((p) => p.kg);
  const min = Math.floor(Math.min(...kgs) - 0.5);
  const max = Math.ceil(Math.max(...kgs) + 0.5);
  const x = (i) => pad.l + (i / Math.max(1, points.length - 1)) * (W - pad.l - pad.r);
  const y = (kg) => pad.t + (1 - (kg - min) / Math.max(0.1, max - min)) * (H - pad.t - pad.b);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.kg).toFixed(1)}`).join(' ');
  return `
    <figure class="chart">
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Peso de ${dec.format(points[0].kg)} a ${dec.format(points.at(-1).kg)} kg">
        ${[min, max].map((k) => `<line class="grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y(k)}" y2="${y(k)}"/><text class="axis" x="${pad.l - 6}" y="${y(k) + 4}" text-anchor="end">${dec.format(k)}</text>`).join('')}
        <text class="axis" x="${pad.l}" y="${H - 4}">${esc(points[0].label)}</text>
        <text class="axis" x="${W - pad.r}" y="${H - 4}" text-anchor="end">${esc(points.at(-1).label)}</text>
        <path class="line" d="${path}"/>
        ${points.map((p, i) => `<circle class="dot" cx="${x(i)}" cy="${y(p.kg)}" r="4"><title>${esc(p.label)}: ${dec.format(p.kg)} kg</title></circle>`).join('')}
      </svg>
    </figure>`;
}
