// Stockage local (sur l'appareil, un espace par compte) + utilitaires de dates.
import { DEFAULT_EXERCISES, DEFAULT_FOODS, DEFAULT_PLAN, PLAN_VERSION, TYPE_DEFAULTS, MEAL_SLOTS } from './data.js';

const BASE_KEY = 'seche-app-v1';
// Sans compte : 'seche-app-v1' (compatibilité) ; avec compte : 'seche-app-v1:<uid>'.
export const storageKey = (user) => (user ? `${BASE_KEY}:${user}` : BASE_KEY);

// Identifiant stable pour les exercices / aliments par défaut : identique sur l'iPad et
// l'iPhone, ce qui permet de fusionner les données des deux appareils.
export const slug = (name) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const exId = (name) => 'ex-' + slug(name);
const foodId = (name) => 'f-' + slug(name);

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

// ---- Dates (toujours en heure locale, format AAAA-MM-JJ) ----
export function iso(d = new Date()) {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
export const today = () => iso(new Date());
export const parse = (s) => new Date(s + 'T12:00:00');
export const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
export const dow = (s) => parse(s).getDay();
export const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
export function mondayOf(s) {
  const d = dow(s);
  return addDays(s, d === 0 ? -6 : 1 - d);
}
export const DAY_NAMES = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
export const DAY_SHORT = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
export const longDate = (s) => parse(s).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
export const shortDate = (s) => parse(s).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

// ---- État initial ----
function defaultPlan(exercises) {
  const byName = Object.fromEntries(exercises.map((e) => [e.name, e.id]));
  const plan = {};
  for (let d = 0; d < 7; d++) {
    const p = DEFAULT_PLAN[d];
    plan[d] = p
      ? { active: true, name: p.name, items: p.exercises.map(([n, sets]) => ({ exId: byName[n], sets })) }
      : { active: false, name: '', items: [] };
  }
  return plan;
}

export function initialState() {
  const exercises = DEFAULT_EXERCISES.map((e) => ({ id: exId(e.name), ...e, ...TYPE_DEFAULTS[e.type] }));
  const plan = defaultPlan(exercises);
  // Réglage spécifique : hip thrust, incrément plus grand (charges lourdes)
  for (const e of exercises) if (e.name.startsWith('Hip thrust')) e.increment = 5;
  return {
    version: 1,
    planVersion: PLAN_VERSION,
    createdAt: today(),
    exercises,
    plan,
    workouts: [],
    cardio: [],
    foods: DEFAULT_FOODS.map((f) => ({ id: foodId(f.name), ...f })),
    recipes: [],
    meals: {},
    mealSlots: [...MEAL_SLOTS],
    weights: [],
    settings: {
      sex: 'F', age: 30, height: 165, activity: 1.55, deficit: 20,
      targets: { kcal: 1800, prot: 130, gluc: 180, lip: 55, fib: 30 },
      confirmTwice: false,
      lastExport: null,
    },
  };
}

export function normalize(s) {
  migrateIds(s);
  const base = initialState();
  const out = { ...base, ...s, settings: { ...base.settings, ...s.settings, targets: { ...base.settings.targets, ...(s.settings || {}).targets } } };
  // Nouveau programme par défaut (un jour de repos entre les séances jambes).
  if ((s.planVersion || 1) < PLAN_VERSION) {
    out.plan = defaultPlan(out.exercises);
    out.planVersion = PLAN_VERSION;
  }
  return out;
}

export function load(user) {
  try {
    const raw = localStorage.getItem(storageKey(user));
    if (raw) return normalize(JSON.parse(raw));
  } catch (e) {
    console.error('Lecture des données impossible', e);
  }
  return initialState();
}

export function hasData(user) {
  try {
    const s = JSON.parse(localStorage.getItem(storageKey(user)) || 'null');
    return !!s && ((s.workouts || []).length + (s.weights || []).length + (s.cardio || []).length + (s.recipes || []).length + Object.keys(s.meals || {}).length) > 0;
  } catch (e) { return false; }
}

export function save(state, user) {
  try {
    localStorage.setItem(storageKey(user), JSON.stringify(state));
    return true;
  } catch (e) {
    console.error('Sauvegarde impossible', e);
    return false;
  }
}

// Anciennes versions : les exercices / aliments par défaut avaient des identifiants
// aléatoires. On les remplace par les identifiants stables, références comprises.
function migrateIds(s) {
  const defEx = new Set(DEFAULT_EXERCISES.map((e) => e.name));
  const defFood = new Set(DEFAULT_FOODS.map((f) => f.name));
  const exMap = {};
  const foodMap = {};
  for (const e of s.exercises || []) {
    if (defEx.has(e.name) && e.id !== exId(e.name)) { exMap[e.id] = exId(e.name); e.id = exId(e.name); }
  }
  for (const f of s.foods || []) {
    if (defFood.has(f.name) && f.id !== foodId(f.name)) { foodMap[f.id] = foodId(f.name); f.id = foodId(f.name); }
  }
  const ex = (id) => exMap[id] || id;
  const fo = (id) => foodMap[id] || id;
  for (const p of Object.values(s.plan || {})) for (const it of p.items || []) it.exId = ex(it.exId);
  for (const w of s.workouts || []) for (const en of w.entries || []) en.exId = ex(en.exId);
  for (const r of s.recipes || []) for (const ing of r.ingredients || []) ing.foodId = fo(ing.foodId);
  for (const list of Object.values(s.meals || {})) for (const it of list) if (it.kind === 'food') it.refId = fo(it.refId);
}

/**
 * Fusionne une sauvegarde (ex. venant de l'iPhone) dans les données locales,
 * sans rien perdre : union des séances, cardio, pesées, repas, recettes, aliments, exercices.
 * En cas de doublon, l'entrée la plus complète (ou importée) l'emporte.
 */
export function mergeStates(local, incoming) {
  migrateIds(incoming);
  const out = structuredClone(local);
  const unionById = (a, b) => {
    const m = new Map(a.map((x) => [x.id, x]));
    for (const x of b || []) m.set(x.id, x);
    return [...m.values()];
  };
  out.exercises = unionById(out.exercises, incoming.exercises);
  out.foods = unionById(out.foods, incoming.foods);
  out.recipes = unionById(out.recipes, incoming.recipes);
  out.cardio = unionById(out.cardio, incoming.cardio);
  // Séances : une par jour ; on garde celle qui a le plus de séries validées.
  const doneCount = (w) => (w.entries || []).reduce((a, e) => a + e.sets.filter((x) => x.done).length, 0);
  const byDate = new Map(out.workouts.map((w) => [w.date, w]));
  for (const w of incoming.workouts || []) {
    const cur = byDate.get(w.date);
    if (!cur || doneCount(w) >= doneCount(cur)) byDate.set(w.date, w);
  }
  out.workouts = [...byDate.values()];
  const wMap = new Map(out.weights.map((w) => [w.date, w]));
  for (const w of incoming.weights || []) wMap.set(w.date, w);
  out.weights = [...wMap.values()];
  for (const [date, items] of Object.entries(incoming.meals || {})) {
    out.meals[date] = unionById(out.meals[date] || [], items);
  }
  for (const slot of incoming.mealSlots || []) if (!out.mealSlots.includes(slot)) out.mealSlots.push(slot);
  if (incoming.createdAt && incoming.createdAt < out.createdAt) out.createdAt = incoming.createdAt;
  return out;
}

export function reset(user) {
  localStorage.removeItem(storageKey(user));
}

// ---- Découpage en blocs pour la synchronisation en ligne ----
// Chaque bloc reste petit (limite Firestore : 1 Mo par document).
export function toChunks(s) {
  const chunks = {
    core: {
      version: s.version, planVersion: s.planVersion, createdAt: s.createdAt, exercises: s.exercises, plan: s.plan,
      foods: s.foods, recipes: s.recipes, mealSlots: s.mealSlots, settings: s.settings,
    },
    weights: { weights: s.weights },
    cardio: { cardio: s.cardio },
  };
  for (const w of s.workouts) (chunks[`workouts-${w.date.slice(0, 4)}`] ||= { workouts: [] }).workouts.push(w);
  for (const [d, items] of Object.entries(s.meals)) {
    if (items.length) (chunks[`meals-${d.slice(0, 7)}`] ||= { meals: {} }).meals[d] = items;
  }
  return chunks;
}

// Remplace dans l'état le contenu d'un bloc (null = bloc supprimé).
export function applyChunk(s, id, data) {
  if (id === 'core') { if (data) Object.assign(s, data); return s; }
  if (id === 'weights') { s.weights = data ? data.weights : []; return s; }
  if (id === 'cardio') { s.cardio = data ? data.cardio : []; return s; }
  if (id.startsWith('workouts-')) {
    const y = id.slice(9);
    s.workouts = s.workouts.filter((w) => w.date.slice(0, 4) !== y).concat(data ? data.workouts : []);
    return s;
  }
  if (id.startsWith('meals-')) {
    const m = id.slice(6);
    for (const d of Object.keys(s.meals)) if (d.slice(0, 7) === m) delete s.meals[d];
    if (data) Object.assign(s.meals, data.meals);
  }
  return s;
}

export function fromChunks(map) {
  const s = initialState();
  s.workouts = []; s.weights = []; s.cardio = []; s.meals = {};
  for (const [id, data] of Object.entries(map)) applyChunk(s, id, data);
  return normalize(s);
}

// Petit hachage (FNV-1a) pour savoir si un bloc a changé.
export function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36) + str.length.toString(36);
}

export function validateImport(obj) {
  return obj && typeof obj === 'object' && Array.isArray(obj.exercises) && Array.isArray(obj.foods) && obj.plan;
}
