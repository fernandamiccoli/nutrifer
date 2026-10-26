// Router and startup.
import * as db from './db.js';
import { state } from './state.js';
import { normalizeProfile, computeTargets } from './goals.js';
import { loadMyFoods } from './catalog.js';
import { releaseUrls } from './util.js';
import { renderDay } from './views/day.js';
import { renderProfile } from './views/profile.js';
import { renderProgress } from './views/progress.js';
import { renderReport } from './views/report.js';
import { renderMyFoods } from './views/myfoods.js';

const main = document.getElementById('main');

const VIEWS = {
  dia: renderDay,
  progreso: renderProgress,
  informe: renderReport,
  perfil: renderProfile,
  alimentos: renderMyFoods,
};
const TAB_OF = { alimentos: 'perfil' };

function route() {
  const [path] = location.hash.slice(1).split('#');
  const [, view = 'dia', param] = path.split('/');
  const key = VIEWS[view] ? view : 'dia';

  document.querySelectorAll('.tabs a').forEach((a) => {
    if (a.dataset.tab === (TAB_OF[key] ?? key)) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });

  if (!state.profile) return renderProfile();
  if (key === 'dia' && param && /^\d{4}-\d{2}-\d{2}$/.test(param)) state.currentDate = param;
  releaseUrls();
  main.dataset.view = key;
  return VIEWS[key]();
}

window.addEventListener('hashchange', () => {
  route();
  window.scrollTo(0, 0);
});

// A focused number input silently changes value on mouse wheel; release focus instead.
document.addEventListener('wheel', (ev) => {
  if (ev.target instanceof HTMLInputElement && ev.target.type === 'number' && ev.target === document.activeElement) {
    ev.target.blur();
  }
}, { passive: true });

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js')
    .then((reg) => {
      // Look for a new version whenever the app comes back to the foreground.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    })
    .catch(() => { /* offline support is optional */ });
  // A new version took over: reload once so every screen uses it.
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    location.reload();
  });
}

(async function init() {
  const stored = await db.get('profile', 'me');
  state.profile = normalizeProfile(stored);
  // Profiles from before daily-activity targets used a general activity level: move to the base target.
  if (state.profile?.activity) {
    const { activity, ...rest } = state.profile;
    if (!rest.custom) rest.targets = computeTargets(rest);
    state.profile = await db.put('profile', rest);
  }
  await loadMyFoods();
  route();
})();
