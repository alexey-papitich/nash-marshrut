// «Наш маршрут»: чтобы приложение открывалось без сети (метро). Данные офлайн держит сам Firestore (persistence).
// Страница: сначала сеть (новая версия сразу у всех), без сети — из кэша. CDN-скрипты: из кэша. Тайлы карты: кэш с потолком.
// Firestore, Nominatim и разворачиватель ссылок не трогаем.
const SHELL = 'nm-shell-v1', TILES = 'nm-tiles-v1', MAX_TILES = 800;
const CDN = [
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => Promise.all([c.add('./'), ...CDN.map(u => c.add(u).catch(() => {}))])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== SHELL && k !== TILES).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate' && url.origin === location.origin) { e.respondWith(page(req)); return; }
  if (url.origin === location.origin && /\.(png|webmanifest)$/.test(url.pathname)) { e.respondWith(cacheFirst(req, SHELL)); return; }
  if (/^(cdnjs\.cloudflare\.com|www\.gstatic\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)$/.test(url.hostname)) { e.respondWith(cacheFirst(req, SHELL)); return; }
  if (url.hostname === 'tile.openstreetmap.org') { e.respondWith(tile(req)); return; }
});

async function page(req) {
  const c = await caches.open(SHELL);
  try {
    const net = await Promise.race([fetch(req), new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 4000))]); // в метро сеть бывает «есть, но не грузит»
    if (net.ok) c.put('./', net.clone());
    return net;
  } catch (_) {
    return (await c.match('./')) || (await c.match(req)) || Response.error();
  }
}
async function cacheFirst(req, name) {
  const c = await caches.open(name); const hit = await c.match(req); if (hit) return hit;
  const net = await fetch(req); if (net.ok || net.type === 'opaque') c.put(req, net.clone()); return net;
}
let tileCount = 0;
async function tile(req) {
  const c = await caches.open(TILES); const hit = await c.match(req); if (hit) return hit; // тайлы за неделю не меняются
  try { const r = await fetch(req); if (r.ok) { c.put(req, r.clone()); if (++tileCount % 50 === 0) trim(c); } return r; }
  catch (_) { return Response.error(); }
}
async function trim(c) { const ks = await c.keys(); for (const k of ks.slice(0, Math.max(0, ks.length - MAX_TILES))) await c.delete(k); }
