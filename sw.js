// Network-first for the app's own files (updates show up right away), cache fallback offline.
// Third-party requests (fonts, Open Food Facts, scanner library) pass through untouched.

const CACHE = 'nutrifer-v8';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/styles.css',
  'js/app.js', 'js/db.js', 'js/util.js', 'js/state.js', 'js/goals.js', 'js/foods.js', 'js/catalog.js',
  'js/photos.js', 'js/prep.js', 'js/ai.js', 'js/barcode.js', 'js/backup.js', 'js/food-editor.js', 'js/add-food.js',
  'js/views/day.js', 'js/views/profile.js', 'js/views/progress.js', 'js/views/report.js', 'js/views/myfoods.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-180.png',
];

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (ev) => {
  const url = new URL(ev.request.url);
  if (ev.request.method !== 'GET' || url.origin !== self.location.origin) return;
  ev.respondWith(
    fetch(ev.request, { cache: 'no-cache' })
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(ev.request, copy));
        return res;
      })
      .catch(() => caches.match(ev.request, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html'))),
  );
});
