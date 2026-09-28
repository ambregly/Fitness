// Stockage local (sur l'iPad) + utilitaires de dates.
import { DEFAULT_EXERCISES, DEFAULT_FOODS, DEFAULT_PLAN, TYPE_DEFAULTS, MEAL_SLOTS } from './data.js';

const KEY = 'seche-app-v1';

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
  const exercises = DEFAULT_EXERCISES.map((e) => ({ id: uid(), ...e, ...TYPE_DEFAULTS[e.type] }));
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
    foods: DEFAULT_FOODS.map((f) => ({ id: uid(), ...f })),
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

export function reset() {
  localStorage.removeItem(KEY);
}

export function validateImport(obj) {
  return obj && typeof obj === 'object' && Array.isArray(obj.exercises) && Array.isArray(obj.foods) && obj.plan;
}
