// HotelOS PMS — Offline Manager
// Gestiona datos locales en IndexedDB para funcionamiento sin internet

const DB_NAME = 'hotelospms-offline';
const DB_VERSION = 1;

let db = null;

// ── OPEN DB ─────────────────────────────────────────────────
export async function openOfflineDB() {
  if (db) return db;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const database = e.target.result;
      // Sync queue for mutations made offline
      if (!database.objectStoreNames.contains('sync_queue')) {
        const sq = database.createObjectStore('sync_queue', { keyPath: 'id' });
        sq.createIndex('timestamp', 'timestamp');
      }
      // Local cache stores
      if (!database.objectStoreNames.contains('rooms')) {
        database.createObjectStore('rooms', { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains('reservations')) {
        const rs = database.createObjectStore('reservations', { keyPath: 'id' });
        rs.createIndex('check_in_date', 'check_in_date');
        rs.createIndex('status', 'status');
      }
      if (!database.objectStoreNames.contains('guests')) {
        const gs = database.createObjectStore('guests', { keyPath: 'id' });
        gs.createIndex('document_number', 'document_number');
      }
      if (!database.objectStoreNames.contains('offline_checkins')) {
        database.createObjectStore('offline_checkins', { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains('dashboard_cache')) {
        database.createObjectStore('dashboard_cache', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => { db = req.result; resolve(db); };
    req.onerror = () => reject(req.error);
  });
}

// ── GENERIC HELPERS ──────────────────────────────────────────
async function getStore(storeName, mode = 'readonly') {
  const database = await openOfflineDB();
  return database.transaction(storeName, mode).objectStore(storeName);
}

async function dbGet(storeName, key) {
  const store = await getStore(storeName);
  return new Promise((resolve, reject) => {
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = reject;
  });
}

async function dbGetAll(storeName) {
  const store = await getStore(storeName);
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = reject;
  });
}

async function dbPut(storeName, data) {
  const store = await getStore(storeName, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.put(data);
    req.onsuccess = resolve;
    req.onerror = reject;
  });
}

async function dbPutAll(storeName, items) {
  const database = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    items.forEach(item => store.put(item));
    tx.oncomplete = resolve;
    tx.onerror = reject;
  });
}

async function dbDelete(storeName, key) {
  const store = await getStore(storeName, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.delete(key);
    req.onsuccess = resolve;
    req.onerror = reject;
  });
}

// ── ROOMS ────────────────────────────────────────────────────
export const offlineRooms = {
  saveAll: (rooms) => dbPutAll('rooms', rooms),
  getAll: () => dbGetAll('rooms'),
  get: (id) => dbGet('rooms', id),
  updateStatus: async (id, status, hkStatus) => {
    const room = await dbGet('rooms', id);
    if (room) {
      room.status = status;
      if (hkStatus) room.housekeeping_status = hkStatus;
      await dbPut('rooms', room);
    }
  }
};

// ── RESERVATIONS ─────────────────────────────────────────────
export const offlineReservations = {
  saveAll: (reservations) => dbPutAll('reservations', reservations),
  getAll: () => dbGetAll('reservations'),
  getTodayArrivals: async () => {
    const today = new Date().toISOString().split('T')[0];
    const all = await dbGetAll('reservations');
    return all.filter(r => r.check_in_date === today && r.status === 'confirmed');
  },
  getTodayDepartures: async () => {
    const today = new Date().toISOString().split('T')[0];
    const all = await dbGetAll('reservations');
    return all.filter(r => r.check_out_date === today && r.status === 'checked_in');
  },
  get: (id) => dbGet('reservations', id),
  update: async (id, updates) => {
    const res = await dbGet('reservations', id);
    if (res) await dbPut('reservations', { ...res, ...updates });
  }
};

// ── GUESTS ───────────────────────────────────────────────────
export const offlineGuests = {
  saveAll: (guests) => dbPutAll('guests', guests),
  getAll: () => dbGetAll('guests'),
  get: (id) => dbGet('guests', id),
  findByDocument: async (docNumber) => {
    const all = await dbGetAll('guests');
    return all.find(g => g.document_number === docNumber) || null;
  }
};

// ── OFFLINE CHECK-IN ─────────────────────────────────────────
export const offlineCheckins = {
  // Save a check-in done while offline
  save: async (checkinData) => {
    const item = {
      id: crypto.randomUUID(),
      ...checkinData,
      offline: true,
      timestamp: new Date().toISOString(),
      synced: false
    };
    await dbPut('offline_checkins', item);
    // Update local room and reservation state immediately
    await offlineRooms.updateStatus(checkinData.room_id, 'occupied');
    await offlineReservations.update(checkinData.reservation_id, { status: 'checked_in' });
    return item;
  },
  getPending: async () => {
    const all = await dbGetAll('offline_checkins');
    return all.filter(c => !c.synced);
  },
  markSynced: async (id) => {
    const item = await dbGet('offline_checkins', id);
    if (item) await dbPut('offline_checkins', { ...item, synced: true });
  }
};

// ── SYNC QUEUE ───────────────────────────────────────────────
export const syncQueue = {
  add: async (operation) => {
    const item = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      synced: false,
      retries: 0,
      ...operation
    };
    await dbPut('sync_queue', item);
    // Register background sync
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      const registration = await navigator.serviceWorker.ready;
      await registration.sync.register('hotelospms-sync');
    }
    return item;
  },

  getPending: async () => {
    const all = await dbGetAll('sync_queue');
    return all.filter(i => !i.synced).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  },

  markSynced: (id) => dbDelete('sync_queue', id),

  count: async () => {
    const pending = await syncQueue.getPending();
    return pending.length;
  },

  // Process queue manually (when online)
  processAll: async (token) => {
    const pending = await syncQueue.getPending();
    const results = [];

    for (const item of pending) {
      try {
        const response = await fetch(item.url, {
          method: item.method,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            ...item.headers
          },
          body: item.body ? JSON.stringify(item.body) : undefined
        });

        if (response.ok) {
          await syncQueue.markSynced(item.id);
          results.push({ id: item.id, success: true, url: item.url });
        } else {
          results.push({ id: item.id, success: false, url: item.url, error: response.statusText });
        }
      } catch (err) {
        // Increment retry count
        await dbPut('sync_queue', { ...item, retries: (item.retries || 0) + 1 });
        results.push({ id: item.id, success: false, url: item.url, error: err.message });
      }
    }
    return results;
  }
};

// ── DASHBOARD CACHE ──────────────────────────────────────────
export const dashboardCache = {
  save: (data) => dbPut('dashboard_cache', { key: 'last', data, savedAt: new Date().toISOString() }),
  get: async () => {
    const item = await dbGet('dashboard_cache', 'last');
    return item ? { ...item.data, _cached: true, _cachedAt: item.savedAt } : null;
  }
};

// ── PRELOAD CRITICAL DATA ────────────────────────────────────
// Call this when online to preload all data needed for offline
export async function preloadOfflineData(token, hotelId) {
  console.log('[Offline] Preloading data for offline use...');
  const headers = { 'Authorization': `Bearer ${token}` };

  try {
    const [rooms, reservations, guests, dashboard] = await Promise.allSettled([
      fetch('/api/rooms/rack', { headers }).then(r => r.json()),
      fetch('/api/reservations?limit=200', { headers }).then(r => r.json()),
      fetch('/api/guests?limit=500', { headers }).then(r => r.json()),
      fetch('/api/dashboard', { headers }).then(r => r.json())
    ]);

    if (rooms.status === 'fulfilled') {
      const allRooms = (rooms.value || []).flatMap(f => f.rooms || []);
      await offlineRooms.saveAll(allRooms);
      console.log(`[Offline] Cached ${allRooms.length} rooms`);
    }

    if (reservations.status === 'fulfilled') {
      const resData = reservations.value?.data || [];
      await offlineReservations.saveAll(resData);
      console.log(`[Offline] Cached ${resData.length} reservations`);
    }

    if (guests.status === 'fulfilled') {
      const guestData = guests.value?.data || [];
      await offlineGuests.saveAll(guestData);
      console.log(`[Offline] Cached ${guestData.length} guests`);
    }

    if (dashboard.status === 'fulfilled') {
      await dashboardCache.save(dashboard.value);
    }

    console.log('[Offline] Preload complete');
    return true;
  } catch (err) {
    console.error('[Offline] Preload failed:', err.message);
    return false;
  }
}
