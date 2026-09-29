// Rappels (notifications) : logique partagée entre l'app et l'envoi automatique
// (tools/notify/notify.mjs, lancé toutes les heures par GitHub Actions).
// Aucune dépendance au navigateur.
import { addDays, diffDays, dow } from './store.js';

export const NOTIF_DEFAULTS = {
  meals: true, mealsHour: 21, // rappel du soir si des repas ne sont pas notés
  sport: true, sportHour: 19, // rappel si la séance du jour n'est pas faite
  weigh: true, weighHour: 8, // rappel de pesée le matin
  weighEvery: 'auto', // 'auto' (5 jours, puis 7 quand la progression est bonne), 5 ou 7
};

export const notifSettings = (state) => ({ ...NOTIF_DEFAULTS, ...((state.settings || {}).notif || {}) });

// Les collations sont facultatives : seuls les repas principaux sont rappelés.
const isMainMeal = (slot) => !/collation|snack|go[uû]ter|pr[ée]-?training|post-?training/i.test(slot);

/**
 * Fréquence des pesées. Mode auto : tous les 5 jours au début, puis toutes les
 * semaines dès que la progression est bonne, c.-à-d. sur les 3 dernières semaines
 * (au moins 3 pesées sur 10 jours ou plus) une perte de 0,4 à 1,2 % du poids par semaine.
 */
export function weighInterval(state, today) {
  const mode = notifSettings(state).weighEvery;
  if (mode === 5 || mode === 7 || mode === '5' || mode === '7') return { days: +mode, auto: false, good: null };
  const recent = [...(state.weights || [])]
    .filter((w) => w.date > addDays(today, -21) && w.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  let good = false;
  let rate = null;
  if (recent.length >= 3) {
    const first = recent[0];
    const last = recent[recent.length - 1];
    const days = diffDays(first.date, last.date);
    if (days >= 10) {
      rate = ((+first.kg - +last.kg) / +first.kg) * 100 * (7 / days); // % perdu par semaine
      good = rate >= 0.4 && rate <= 1.2;
    }
  }
  return { days: good ? 7 : 5, auto: true, good, rate };
}

export function nextWeighDate(state, today) {
  const last = [...(state.weights || [])].sort((a, b) => b.date.localeCompare(a.date))[0];
  const { days } = weighInterval(state, today);
  if (!last) return today;
  const next = addDays(last.date, days);
  return next < today ? today : next;
}

export function missingMeals(state, date) {
  const items = (state.meals || {})[date] || [];
  const filled = new Set(items.map((i) => i.slot));
  return (state.mealSlots || []).filter((s) => isMainMeal(s) && !filled.has(s));
}

export function workoutDoneOn(state, date) {
  const w = (state.workouts || []).find((x) => x.date === date);
  return !!w && w.entries.some((e) => e.sets.some((s) => s.done));
}

/**
 * Rappels à envoyer maintenant.
 * @param state     données du compte
 * @param today     'AAAA-MM-JJ' dans le fuseau de l'utilisateur
 * @param hour      heure locale (0–23)
 * @param lastSent  {meals, sport, weigh} : date du dernier envoi de chaque rappel
 */
export function dueReminders(state, today, hour, lastSent = {}) {
  const ns = notifSettings(state);
  const out = [];
  // Fenêtre de 3 h après l'heure choisie : la tâche automatique peut avoir du retard.
  const inWindow = (h) => hour >= h && hour < h + 3;

  if (ns.weigh && inWindow(ns.weighHour) && lastSent.weigh !== today && nextWeighDate(state, today) <= today) {
    const { days, auto, good } = weighInterval(state, today);
    out.push({
      kind: 'weigh', url: './?open=poids',
      title: 'C’est le jour de la pesée ⚖️',
      body: `Pèse-toi à jeun et note ton poids.${auto ? (good ? ' Belle progression : pesée toutes les semaines.' : ` Prochaine dans ${days} jours.`) : ''}`,
    });
  }
  const plan = (state.plan || {})[dow(today)];
  if (ns.sport && plan && plan.active && inWindow(ns.sportHour) && lastSent.sport !== today && !workoutDoneOn(state, today)) {
    out.push({
      kind: 'sport', url: './?open=sport',
      title: 'Séance du jour pas encore notée 🏋️',
      body: `${plan.name || 'Séance de musculation'} : si c’est fait, pense à valider tes séries.`,
    });
  }
  if (ns.meals && inWindow(ns.mealsHour) && lastSent.meals !== today) {
    const missing = missingMeals(state, today);
    if (missing.length) {
      const none = missing.length === (state.mealSlots || []).filter(isMainMeal).length;
      out.push({
        kind: 'meals', url: './?open=repas',
        title: none ? 'Aucun repas noté aujourd’hui 🍽️' : 'Repas à compléter 🍽️',
        body: none ? 'Note tes repas pour suivre tes calories et tes protéines.' : `Il manque : ${missing.join(', ').toLowerCase()}.`,
      });
    }
  }
  return out;
}

/** Date et heure locales dans un fuseau donné (ex. 'Europe/Paris'). */
export function localNow(tz, now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: tz || 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: +parts.hour };
}
