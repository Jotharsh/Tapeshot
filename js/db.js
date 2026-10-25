// Everything lives in IndexedDB on this device. No server, no account.
// Photos are kept apart from the small records, so the list of past measurements loads quickly.
import { DEFAULT_SETTINGS } from './config.js';

const DB_NAME = 'tapeshot';
const DB_VERSION = 1;
let dbPromise;

export function openDB() {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('sessions', { keyPath: 'id' });
      db.createObjectStore('photos', { keyPath: 'id' });
      db.createObjectStore('settings', { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('The database is open in another tab. Close other Tapeshot tabs and try again.'));
  });
  return dbPromise;
}

const wrap = (request) => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

async function transact(names, mode, work) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(names, mode);
    const stores = Object.fromEntries(names.map((n) => [n, t.objectStore(n)]));
    let result;
    Promise.resolve(work(stores)).then((r) => { result = r; }, (e) => { try { t.abort(); } catch {} reject(e); });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error ?? new Error('The change could not be saved.'));
  });
}

export const newId = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`);

/** A new measuring session: the photo, plus what has been marked on it so far. */
export async function createSession({ photo, thumb, width, height, name, hint, reference, custom, unit }) {
  const session = {
    id: newId(), name: name ?? '', hint: hint ?? '', createdAt: Date.now(), updatedAt: Date.now(), width, height, thumb,
    reference, custom: custom ?? null, unit, rotate: false, corners: [], measurements: [],
  };
  await transact(['sessions', 'photos'], 'readwrite', ({ sessions, photos }) => {
    sessions.put(session);
    photos.put({ id: session.id, photo });
  });
  return session;
}

export async function saveSession(session) {
  session.updatedAt = Date.now();
  await transact(['sessions'], 'readwrite', ({ sessions }) => { sessions.put(session); });
}

export const getSession = (id) => transact(['sessions'], 'readonly', ({ sessions }) => wrap(sessions.get(id)));
export async function getPhoto(id) { return (await transact(['photos'], 'readonly', ({ photos }) => wrap(photos.get(id))))?.photo ?? null; }

export async function listSessions() {
  const all = await transact(['sessions'], 'readonly', ({ sessions }) => wrap(sessions.getAll()));
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteSession(id) {
  await transact(['sessions', 'photos'], 'readwrite', ({ sessions, photos }) => { sessions.delete(id); photos.delete(id); });
}

export async function getSettings() {
  const rows = await transact(['settings'], 'readonly', ({ settings }) => wrap(settings.getAll()));
  return { ...DEFAULT_SETTINGS, ...Object.fromEntries(rows.map((r) => [r.key, r.value])) };
}
export async function setSettings(patch) {
  await transact(['settings'], 'readwrite', ({ settings }) => { for (const [key, value] of Object.entries(patch)) settings.put({ key, value }); });
}

export async function requestPersistence() {
  try { return (await navigator.storage?.persist?.()) ?? false; } catch { return false; }
}
