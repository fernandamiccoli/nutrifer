// IndexedDB wrapper. Every record carries updatedAt so phase 6 sync can merge per record.

const DB_NAME = 'nutrifer';
const DB_VERSION = 2;
export const STORES = ['profile', 'entries', 'photos', 'notes', 'foods', 'water', 'weights', 'fasts', 'meds', 'medlog', 'workouts'];

let dbPromise;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (db.objectStoreNames.contains(name)) continue;
        const store = db.createObjectStore(name, { keyPath: 'id' });
        if (name !== 'profile') store.createIndex('date', 'date');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function promisify(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(store, mode = 'readonly') {
  const db = await open();
  return db.transaction(store, mode).objectStore(store);
}

export async function get(store, id) {
  const row = await promisify((await tx(store)).get(id));
  return row?.deleted ? undefined : row;
}

export async function put(store, record) {
  const stamped = { ...record, updatedAt: Date.now() };
  await promisify((await tx(store, 'readwrite')).put(stamped));
  return stamped;
}

// Soft delete keeps a tombstone so a deletion can propagate during sync.
export async function remove(store, id) {
  const current = await promisify((await tx(store)).get(id));
  if (!current) return;
  await put(store, { id, date: current.date, deleted: true });
}

export async function byDate(store, date) {
  const index = (await tx(store)).index('date');
  const rows = await promisify(index.getAll(date));
  return rows.filter((r) => !r.deleted);
}

export async function byDateRange(store, from, to) {
  const index = (await tx(store)).index('date');
  const rows = await promisify(index.getAll(IDBKeyRange.bound(from, to)));
  return rows.filter((r) => !r.deleted);
}

export async function all(store, { includeDeleted = false } = {}) {
  const rows = await promisify((await tx(store)).getAll());
  return includeDeleted ? rows : rows.filter((r) => !r.deleted);
}

// Import path: keep whichever version of each record is newer.
export async function mergeRecords(store, records) {
  const db = await open();
  const t = db.transaction(store, 'readwrite');
  const os = t.objectStore(store);
  let written = 0;
  for (const rec of records) {
    const current = await promisify(os.get(rec.id));
    if (!current || (rec.updatedAt ?? 0) > (current.updatedAt ?? 0)) {
      os.put(rec);
      written += 1;
    }
  }
  await new Promise((resolve, reject) => {
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
  });
  return written;
}

export function newId() {
  return crypto.randomUUID();
}
