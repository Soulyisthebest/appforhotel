// HotelOS PMS — Service Worker v1.0
// Estrategia: Cache First para assets, Network First para API con fallback local

const CACHE_VERSION = 'hotelospms-v1';
const STATIC_CACHE  = `${CACHE_VERSION}-static`;
const API_CACHE     = `${CACHE_VERSION}-api`;
const SYNC_QUEUE    = 'hotelospms-sync-queue';

// Assets críticos que se cachean al instalar
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap'
];

// Endpoints de API que se cachean para offline
const CACHEABLE_API = [
  '/api/rooms/rack',
  '/api/reservations/today',
  '/api/checkin/pending',
  '/api/checkout/pending',
  '/api/housekeeping/room-status',
  '/api/dashboard',
  '/api/rates/room-types',
  '/api/staff',
  '/api/hotels/me'
];

// ── INSTALL ─────────────────────────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Installing HotelOS PMS Service Worker...');
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(STATIC_ASSETS.filter(u => !u.startsWith('/api'))))
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE ─────────────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith('hotelospms-') && k !== STATIC_CACHE && k !== API_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH ────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin (except fonts/icons)
  if (request.method !== 'GET') {
    // Queue mutations for sync when offline
    if (request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH') {
      event.respondWith(handleMutation(request));
    }
    return;
  }

  // API requests — Network First with cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstAPI(request));
    return;
  }

  // Static assets — Cache First
  event.respondWith(cacheFirstStatic(request));
});

// Network first for API: try network, fall back to cache
async function networkFirstAPI(request) {
  const url = new URL(request.url);
  const isCacheable = CACHEABLE_API.some(path => url.pathname.startsWith(path));

  try {
    const response = await fetch(request.clone());
    if (response.ok && isCacheable) {
      const cache = await caches.open(API_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // Offline — try cache
    if (isCacheable) {
      const cached = await caches.match(request);
      if (cached) {
        console.log('[SW] Offline — serving from cache:', url.pathname);
        // Add offline header so frontend can show indicator
        const headers = new Headers(cached.headers);
        headers.set('X-Served-Offline', 'true');
        headers.set('X-Cache-Time', cached.headers.get('date') || 'unknown');
        return new Response(cached.body, { status: 200, headers });
      }
    }
    // Return offline error response
    return new Response(
      JSON.stringify({
        error: 'Sin conexión',
        offline: true,
        message: 'No hay conexión a internet. Los datos mostrados son del último acceso.'
      }),
      { status: 503, headers: { 'Content-Type': 'application/json', 'X-Offline': 'true' } }
    );
  }
}

// Cache first for static assets
async function cacheFirstStatic(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Return app shell for navigation requests (SPA)
    if (request.mode === 'navigate') {
      const shell = await caches.match('/index.html');
      if (shell) return shell;
    }
    return new Response('Sin conexión', { status: 503 });
  }
}

// Queue mutations when offline, sync when back online
async function handleMutation(request) {
  try {
    return await fetch(request.clone());
  } catch {
    // Store in IndexedDB sync queue
    const body = await request.clone().text();
    await addToSyncQueue({
      url: request.url,
      method: request.method,
      headers: Object.fromEntries(request.headers),
      body,
      timestamp: new Date().toISOString(),
      id: crypto.randomUUID()
    });

    return new Response(
      JSON.stringify({
        offline: true,
        queued: true,
        message: 'Sin conexión. La acción se ejecutará automáticamente cuando vuelva internet.'
      }),
      { status: 202, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// ── BACKGROUND SYNC ──────────────────────────────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'hotelospms-sync') {
    console.log('[SW] Background sync triggered');
    event.waitUntil(processSyncQueue());
  }
});

async function processSyncQueue() {
  const queue = await getSyncQueue();
  console.log(`[SW] Processing ${queue.length} queued operations`);

  for (const item of queue) {
    try {
      const response = await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.body
      });
      if (response.ok) {
        await removeFromSyncQueue(item.id);
        console.log(`[SW] Synced: ${item.method} ${item.url}`);
        // Notify clients
        const clients = await self.clients.matchAll();
        clients.forEach(client => client.postMessage({
          type: 'SYNC_SUCCESS',
          item: { url: item.url, method: item.method, timestamp: item.timestamp }
        }));
      }
    } catch (err) {
      console.error(`[SW] Sync failed for ${item.url}:`, err.message);
    }
  }
}

// ── INDEXEDDB HELPERS ────────────────────────────────────────
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('hotelospms-offline', 1);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('sync_queue')) {
        db.createObjectStore('sync_queue', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('offline_checkins')) {
        db.createObjectStore('offline_checkins', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('offline_reservations')) {
        db.createObjectStore('offline_reservations', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function addToSyncQueue(item) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sync_queue', 'readwrite');
    tx.objectStore('sync_queue').add(item);
    tx.oncomplete = resolve;
    tx.onerror = reject;
  });
}

async function getSyncQueue() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sync_queue', 'readonly');
    const req = tx.objectStore('sync_queue').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = reject;
  });
}

async function removeFromSyncQueue(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sync_queue', 'readwrite');
    tx.objectStore('sync_queue').delete(id);
    tx.oncomplete = resolve;
    tx.onerror = reject;
  });
}

// ── PUSH NOTIFICATIONS ───────────────────────────────────────
self.addEventListener('push', event => {
  const data = event.data?.json() || {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'HotelOS PMS', {
      body: data.message || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-72.png',
      data: data.url || '/',
      actions: data.actions || []
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data || '/')
  );
});

console.log('[SW] HotelOS PMS Service Worker loaded');
