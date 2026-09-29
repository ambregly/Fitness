// Service worker : l'app fonctionne hors ligne (salle de sport, piscine…).
// Incrémenter VERSION à chaque mise à jour des fichiers.
const VERSION = 'seche-v4';
const FILES = [
  './', 'index.html', 'css/style.css', 'js/app.js', 'js/data.js', 'js/store.js', 'js/progression.js', 'js/charts.js', 'js/journal.js', 'js/cloud.js', 'js/firebase-config.js', 'js/vendor/firebase.js',
  'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
  'docs/surcharge-progressive.html', 'docs/compte.html',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Réseau d'abord (pour recevoir les mises à jour), cache en secours hors ligne.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // Firebase (gros fichier qui ne change qu'avec VERSION) : cache d'abord.
  if (url.pathname.includes('/js/vendor/')) {
    e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
    return;
  }
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))),
  );
});
