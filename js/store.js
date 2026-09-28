// Stockage local (sur l'iPad) + utilitaires de dates.
import { DEFAULT_EXERCISES, DEFAULT_FOODS, DEFAULT_PLAN, TYPE_DEFAULTS, MEAL_SLOTS } from './data.js';

const KEY = 'seche-app-v1';

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
function initialState() {
  const exercises = DEFAULT_EXERCISES.map((e) => ({ id: exId(e.name), ...e, ...TYPE_DEFAULTS[e.type] }));
  const byName = Object.fromEntries(exercises.map((e) => [e.name, e.id]));
  const plan = {};
  for (let d = 0; d < 7; d++) {
    const p = DEFAULT_PLAN[d];
    plan[d] = p
      ? { active: true, name: p.name, items: p.exercises.map(([n, sets]) => ({ exId: byName[n], sets })) }
      : { active: false, name: '', items: [] };
  }
  // Réglage spécifique : hip thrust, incrément plus grand (charges lourdes)
  for (const e of exercises) if (e.name.startsWith('Hip thrust')) e.increment = 5;
  return {
    version: 1,
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

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      migrateIds(s);
      const base = initialState();
      return { ...base, ...s, settings: { ...base.settings, ...s.settings, targets: { ...base.settings.targets, ...(s.settings || {}).targets } } };
    }
  } catch (e) {
    console.error('Lecture des données impossible', e);
  }
  return initialState();
}

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
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

export function reset() {
  localStorage.removeItem(KEY);
}

export function validateImport(obj) {
  return obj && typeof obj === 'object' && Array.isArray(obj.exercises) && Array.isArray(obj.foods) && obj.plan;
}
