const V = 'edu-v8';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'features.js', 'modules.js', 'pro.js', 'pro2.js', 'manifest.json', 'icon.svg'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.hostname.includes('firestore') || u.hostname.includes('googleapis.com') && u.pathname.includes('identitytoolkit')) return;
  // الملفات المحلية: الشبكة أولاً (علشان التحديثات توصل) ثم الكاش
  if (u.origin === location.origin) {
    e.respondWith(fetch(r).then(res => { const c = res.clone(); caches.open(V).then(ca => ca.put(r, c)); return res; }).catch(() => caches.match(r).then(m => m || caches.match('index.html'))));
    return;
  }
  // المكتبات الخارجية (خطوط، QR، باركود، Firebase): كاش أولاً
  e.respondWith(caches.match(r).then(m => m || fetch(r).then(res => { if (res.ok || res.type === 'opaque') { const c = res.clone(); caches.open(V).then(ca => ca.put(r, c)); } return res; }).catch(() => m)));
});
