// Journal des actions : avant chaque modification, on garde une copie de l'état
// précédent. « Annuler » restaure cette copie. Stocké dans IndexedDB (place
// suffisante pour des copies complètes), séparément pour chaque compte.

const DB = 'seche-journal';
const STORE = 'entries';
const MAX = 150; // entrées conservées par compte

let dbp = null;
function db() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        const os = req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        os.createIndex('user', 'user');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbp;
}

function tx(mode, fn) {
  return db().then((d) => new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(out && 'result' in out ? out.result : out);
    t.onerror = () => reject(t.error);
  }));
}

/** Ajoute une entrée {label, before (JSON de l'état avant l'action)}. */
export async function addEntry(user, label, before) {
  await tx('readwrite', (os) => os.add({ user: user || 'local', t: Date.now(), label, before }));
  await trim(user);
}

/** Met à jour la dernière entrée (regroupe une saisie en plusieurs frappes). */
export async function touchLast(user) {
  const last = await lastEntry(user);
  if (!last) return;
  last.t = Date.now();
  await tx('readwrite', (os) => os.put(last));
}

export async function lastEntry(user) {
  const all = await list(user, 1);
  return all[0] || null;
}

/** Entrées les plus récentes d'abord (sans l'état, pour l'affichage). */
export function list(user, limit = MAX) {
  return db().then((d) => new Promise((resolve, reject) => {
    const out = [];
    const t = d.transaction(STORE, 'readonly');
    const req = t.objectStore(STORE).index('user').openCursor(IDBKeyRange.only(user || 'local'), 'prev');
    req.onsuccess = () => {
      const c = req.result;
      if (c && out.length < limit) { out.push(c.value); c.continue(); } else resolve(out);
    };
    req.onerror = () => reject(req.error);
  }));
}

export function get(id) {
  return tx('readonly', (os) => os.get(id));
}

/** Supprime les entrées d'id >= fromId (celles qu'on vient d'annuler). */
export async function removeFrom(user, fromId) {
  const entries = await list(user);
  await tx('readwrite', (os) => { for (const e of entries) if (e.id >= fromId) os.delete(e.id); });
}

async function trim(user) {
  const entries = await list(user, 100000);
  if (entries.length <= MAX) return;
  await tx('readwrite', (os) => { for (const e of entries.slice(MAX)) os.delete(e.id); });
}

export function clear(user) {
  return list(user, 100000).then((entries) => tx('readwrite', (os) => { for (const e of entries) os.delete(e.id); }));
}
