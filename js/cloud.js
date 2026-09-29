// Compte en ligne (Firebase Auth) + synchronisation des données (Firestore).
//
// Principe « local d'abord » : l'app lit et écrit toujours dans le stockage de
// l'appareil ; les données sont découpées en blocs (voir store.toChunks) et chaque
// bloc modifié est envoyé dans users/{uid}/chunks/{bloc}. Les modifications faites
// sur un autre appareil arrivent en temps réel. Si un même bloc a été modifié des
// deux côtés, les deux versions sont fusionnées (store.mergeStates).
import { firebaseConfig } from './firebase-config.js';
import { toChunks, applyChunk, fromChunks, mergeStates, hash, initialState } from './store.js';

const EMULATOR = /[?&]emulator\b/.test(location.search);
const CONFIG = EMULATOR ? { apiKey: 'demo-key', authDomain: 'demo-seche.firebaseapp.com', projectId: 'demo-seche', appId: 'demo' } : firebaseConfig;

let fb = null;
let auth = null;
let db = null;

export const configured = () => !!(CONFIG && CONFIG.apiKey);

const DEVICE_KEY = 'seche-device';
const deviceId = (() => {
  let d = localStorage.getItem(DEVICE_KEY);
  if (!d) { d = Math.random().toString(36).slice(2, 12); localStorage.setItem(DEVICE_KEY, d); }
  return d;
})();

/** Charge Firebase et écoute l'état de connexion. Renvoie false si non configuré / hors ligne. */
export async function init(onUser) {
  if (!configured()) return false;
  try {
    fb = await import('./vendor/firebase.js');
  } catch (e) {
    console.warn('Firebase indisponible', e);
    return false;
  }
  const app = fb.initializeApp(CONFIG);
  auth = fb.initializeAuth(app, { persistence: [fb.indexedDBLocalPersistence, fb.browserLocalPersistence] });
  db = fb.initializeFirestore(app, {});
  if (EMULATOR) {
    fb.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    fb.connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }
  fb.onAuthStateChanged(auth, (u) => onUser(u ? { uid: u.uid, email: u.email, name: u.displayName || '' } : null));
  return true;
}

const FR_ERRORS = {
  'auth/invalid-email': 'Adresse e-mail invalide.',
  'auth/missing-password': 'Indique un mot de passe.',
  'auth/weak-password': 'Mot de passe trop court (6 caractères minimum).',
  'auth/email-already-in-use': 'Un compte existe déjà avec cet e-mail : connecte-toi.',
  'auth/invalid-credential': 'E-mail ou mot de passe incorrect.',
  'auth/wrong-password': 'E-mail ou mot de passe incorrect.',
  'auth/user-not-found': 'Aucun compte avec cet e-mail.',
  'auth/too-many-requests': 'Trop de tentatives, réessaie dans quelques minutes.',
  'auth/network-request-failed': 'Pas de connexion internet.',
  'auth/operation-not-allowed': 'La connexion par e-mail n’est pas encore activée dans Firebase (Authentication › Sign-in method › E-mail/Mot de passe).',
  'permission-denied': 'Accès refusé par Firebase : vérifie les règles Firestore (voir le guide).',
};
export const errorText = (e) => FR_ERRORS[e && e.code] || (e && e.message) || 'Erreur inconnue.';

export async function signUp(email, password, name) {
  const cred = await fb.createUserWithEmailAndPassword(auth, email, password);
  if (name) await fb.updateProfile(cred.user, { displayName: name });
  return cred.user;
}
export const signIn = (email, password) => fb.signInWithEmailAndPassword(auth, email, password);
export const signOutUser = () => fb.signOut(auth);
export const resetPassword = (email) => fb.sendPasswordResetEmail(auth, email);

// Abonnement aux notifications de cet appareil : users/{uid}/push/{appareil}
export async function savePushSubscription(uid, subscription, tz) {
  await fb.setDoc(fb.doc(db, 'users', uid, 'push', deviceId), { subscription: JSON.parse(JSON.stringify(subscription)), tz, ua: navigator.userAgent.slice(0, 120), updatedAt: fb.serverTimestamp() });
}
export async function deletePushSubscription(uid) {
  await fb.deleteDoc(fb.doc(db, 'users', uid, 'push', deviceId));
}

const chunksCol = (uid) => fb.collection(db, 'users', uid, 'chunks');

/** Récupère une fois tous les blocs du compte : {id: data}. */
export async function fetchAll(uid) {
  const snap = await fb.getDocs(chunksCol(uid));
  const map = {};
  const hashes = {};
  snap.forEach((d) => { const v = d.data(); map[d.id] = JSON.parse(v.json); hashes[d.id] = v.h; });
  return { map, hashes, empty: snap.empty };
}

// Fusion de deux versions d'un même bloc, sans rien perdre (union).
function mergeChunk(id, a, b) {
  return toChunks(mergeStates(fromChunks({ [id]: a }), fromChunks({ [id]: b })))[id] || null;
}

/**
 * Synchronisation d'un compte.
 *  getState()          → état courant
 *  onRemote(state)     → appelé quand des données arrivent d'un autre appareil
 *  onStatus(status)    → 'ok' | 'pending' | 'offline' | 'error'
 */
export class Sync {
  constructor(uid, { getState, onRemote, onStatus }) {
    this.uid = uid;
    this.getState = getState;
    this.onRemote = onRemote;
    this.onStatus = onStatus || (() => {});
    this.metaKey = `seche-sync:${uid}`;
    this.synced = JSON.parse(localStorage.getItem(this.metaKey) || '{}');
    this.timer = null;
    this.unsub = null;
    this.pushing = false;
    this.again = false;
  }

  saveMeta() { localStorage.setItem(this.metaKey, JSON.stringify(this.synced)); }
  static hasMeta(uid) { return !!localStorage.getItem(`seche-sync:${uid}`); }
  setSynced(hashes) { this.synced = { ...hashes }; this.saveMeta(); }

  start() {
    this.unsub = fb.onSnapshot(chunksCol(this.uid), (snap) => this.onSnapshot(snap), (err) => {
      console.warn('Synchro interrompue', err);
      this.onStatus('error');
    });
    this.schedule(0);
  }

  stop() {
    if (this.unsub) this.unsub();
    clearTimeout(this.timer);
  }

  schedule(delay = 1200) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.push(), delay);
  }

  // Envoi des blocs modifiés. Chaque écriture est une transaction : on relit la
  // version en ligne et, si un autre appareil l'a changée depuis notre dernière
  // synchro, on fusionne au lieu d'écraser. Hors ligne, la transaction échoue et
  // on réessaie au retour du réseau (rien n'est perdu : tout reste sur l'appareil).
  async push() {
    if (this.pushing) { this.again = true; return; }
    this.pushing = true;
    const chunks = toChunks(this.getState());
    const ids = new Set([...Object.keys(chunks), ...Object.keys(this.synced)]);
    let failed = false;
    for (const id of ids) {
      const local = chunks[id];
      const h = local ? hash(JSON.stringify(local)) : null;
      if (h === (this.synced[id] ?? null)) continue;
      this.onStatus('pending');
      const ref = fb.doc(db, 'users', this.uid, 'chunks', id);
      const base = this.synced[id];
      try {
        const res = await fb.runTransaction(db, async (tx) => {
          const snap = await tx.get(ref);
          const remote = snap.exists() ? snap.data() : null;
          const remoteChanged = remote && remote.h !== base;
          if (!local) {
            // Supprimé ici : on ne supprime en ligne que si personne ne l'a modifié entre-temps.
            if (remoteChanged) return { h: remote.h, data: JSON.parse(remote.json), merged: true };
            if (remote) tx.delete(ref);
            return { h: null };
          }
          let data = local;
          let merged = false;
          if (remoteChanged && remote.h !== h) { data = mergeChunk(id, local, JSON.parse(remote.json)); merged = true; }
          const json = JSON.stringify(data);
          const nh = hash(json);
          tx.set(ref, { json, h: nh, device: deviceId, updatedAt: fb.serverTimestamp() });
          return { h: nh, data, merged };
        });
        if (res.h) this.synced[id] = res.h; else delete this.synced[id];
        if (res.merged) {
          // Intègre la version fusionnée (en gardant ce qui a pu être saisi pendant l'envoi).
          const state = this.getState();
          const cur = toChunks(state)[id];
          applyChunk(state, id, cur ? mergeChunk(id, cur, res.data) : res.data);
          this.onRemote(state);
          this.again = true;
        }
      } catch (e) {
        failed = true;
        console.warn('Envoi impossible', id, e.code || e);
      }
    }
    this.saveMeta();
    this.pushing = false;
    if (failed) {
      this.onStatus(navigator.onLine ? 'error' : 'offline');
      this.schedule(20000); // on réessaie
    } else if (this.again) {
      this.again = false;
      this.schedule(0);
    } else {
      this.onStatus('ok');
    }
  }

  onSnapshot(snap) {
    const state = this.getState();
    const local = toChunks(state);
    let changed = false;
    let needPush = false;
    for (const ch of snap.docChanges()) {
      if (ch.doc.metadata.hasPendingWrites) continue; // notre propre écriture
      const id = ch.doc.id;
      const localHash = local[id] ? hash(JSON.stringify(local[id])) : undefined;
      const unchangedLocally = localHash === this.synced[id];
      if (ch.type === 'removed') {
        if (unchangedLocally && local[id]) { applyChunk(state, id, null); changed = true; }
        delete this.synced[id];
        continue;
      }
      const v = ch.doc.data();
      if (v.h === localHash) { this.synced[id] = v.h; continue; }
      const remote = JSON.parse(v.json);
      if (unchangedLocally || !local[id]) {
        applyChunk(state, id, remote);
      } else {
        // Modifié des deux côtés : on fusionne sans rien perdre.
        applyChunk(state, id, mergeChunk(id, local[id], remote));
        needPush = true;
      }
      this.synced[id] = v.h;
      changed = true;
    }
    this.saveMeta();
    if (changed) this.onRemote(state);
    if (needPush) this.schedule(0);
    else if (!snap.metadata.fromCache) this.onStatus('ok');
  }
}

export { initialState };
