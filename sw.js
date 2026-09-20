/* Service Worker لتطبيق "حساباتي"
   الهدف: التطبيق يفتح ويشتغل من غير نت بعد أول فتحة، ويتحدّث لوحده لما ينزل إصدار جديد. */

const VERSION = 'v9';
const SHELL_CACHE = `hesabaty-shell-${VERSION}`;
const ASSETS_CACHE = `hesabaty-assets-${VERSION}`;

// ملفات التطبيق نفسه (بتتحمّل وقت التثبيت)
const SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-192-maskable.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png',
  './icons/favicon.png'
];

// المكتبات الخارجية اللي التطبيق بيحمّلها (بتتخزّن أول ما تتطلب)
const RUNTIME_HOSTS = [
  'cdn.tailwindcss.com',
  'cdn.jsdelivr.net',
  'cdnjs.cloudflare.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

// المكتبات دي بتتحمّل من أول تثبيت، عشان التطبيق يفتح بشكله الكامل حتى لو أول فتحة أوفلاين
const LIB_FILES = [
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/sweetalert2@11',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800;900&display=swap'
];

async function cacheExternal(cache, url) {
  try {
    const res = await fetch(url, { mode: 'cors', cache: 'reload' });
    if (res && res.ok) { await cache.put(url, res.clone()); return; }
  } catch (e) {}
  try {
    // لو المصدر مش بيسمح بـ CORS، بنخزّنه كـ opaque وبرضه بيشتغل
    const res = await fetch(url, { mode: 'no-cors', cache: 'reload' });
    if (res) await cache.put(url, res.clone());
  } catch (e) {}
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL_CACHE);
    // addAll بتفشل كلها لو ملف واحد فشل، فبنحمّل كل ملف لوحده
    await Promise.all(SHELL_FILES.map(async url => {
      try { await shell.add(new Request(url, { cache: 'reload' })); } catch (e) {}
    }));
    const assets = await caches.open(ASSETS_CACHE);
    await Promise.all(LIB_FILES.map(url => cacheExternal(assets, url)));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => {
      if (k !== SHELL_CACHE && k !== ASSETS_CACHE && k.startsWith('hesabaty-')) return caches.delete(k);
    }));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

// شبكة الأول وبعدين الكاش: بيضمن إنك تشوف آخر نسخة وانت أونلاين، وتفتح عادي وانت أوفلاين
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const fresh = await fetch(request);
    if (fresh && (fresh.ok || fresh.type === 'opaque')) cache.put(request, fresh.clone());
    return fresh;
  } catch (e) {
    const cached = await cache.match(request) || await cache.match('./index.html') || await cache.match('./');
    if (cached) return cached;
    throw e;
  }
}

// الكاش الأول مع تحديث في الخلفية: أسرع فتح للمكتبات الخارجية
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request).then(res => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone());
    return res;
  }).catch(() => null);
  return cached || network || fetch(request);
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // فتح التطبيق نفسه
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req, SHELL_CACHE));
    return;
  }

  // ملفات التطبيق المحلية
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(req, SHELL_CACHE));
    return;
  }

  // المكتبات والخطوط الخارجية
  if (RUNTIME_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(req, ASSETS_CACHE));
    return;
  }
});
