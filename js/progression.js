// Moteur de surcharge progressive : « double progression ».
//
// Principe (voir docs/surcharge-progressive.md pour les sources) :
//  1. On travaille dans une fourchette de répétitions (ex. 6–10) avec une charge fixe.
//  2. Tant que toutes les séries n'atteignent pas le haut de la fourchette,
//     on garde la charge et on vise +1 répétition par série.
//  3. Quand toutes les séries atteignent le haut de la fourchette
//     (optionnellement sur 2 séances de suite, règle ACSM / NSCA « 2-for-2 »),
//     on augmente la charge de l'incrément de l'exercice et on repart plus bas
//     dans la fourchette. Le nombre de répétitions visé à la nouvelle charge est
//     estimé avec la formule d'Epley.
//  4. Si les répétitions tombent sous le bas de la fourchette deux séances de suite,
//     on baisse la charge d'environ 5–10 %.

export function e1rm(weight, reps) {
  if (!weight || !reps) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

// Répétitions réalisables à `weight` pour un 1RM estimé donné (Epley inversée).
export function repsAt(oneRm, weight) {
  if (!oneRm || !weight) return 0;
  return 30 * (oneRm / weight - 1);
}

export function roundTo(value, step) {
  if (!step) return Math.round(value * 10) / 10;
  return Math.round(Math.round(value / step) * step * 100) / 100;
}

const validSets = (sets) => (sets || []).filter((s) => s.done && +s.w > 0 && +s.r > 0)
  .map((s) => ({ w: +s.w, r: +s.r }));

// Historique d'un exercice : [{date, sets:[{w,r}]}] trié par date croissante.
export function exerciseHistory(workouts, exId) {
  const out = [];
  for (const wo of workouts) {
    for (const en of wo.entries || []) {
      if (en.exId !== exId) continue;
      const sets = validSets(en.sets);
      if (sets.length) out.push({ date: wo.date, workoutId: wo.id, sets });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export function sessionStats(session) {
  const top = Math.max(...session.sets.map((s) => s.w));
  const topSets = session.sets.filter((s) => s.w === top);
  const best = Math.max(...session.sets.map((s) => e1rm(s.w, s.r)));
  const volume = session.sets.reduce((a, s) => a + s.w * s.r, 0);
  return { top, topSets, e1rm: best, volume };
}

function allAtTop(session, weight, repMax) {
  const sets = session.sets.filter((s) => s.w === weight);
  return sets.length > 0 && sets.every((s) => s.r >= repMax);
}

/**
 * Recommandation pour la prochaine séance.
 * @param {Array} history  résultat de exerciseHistory
 * @param {Object} ex      {repMin, repMax, increment}
 * @param {number} nSets   nombre de séries prévues
 * @param {Object} opts    {confirmTwice:boolean}
 * @returns {{status, weight, reps:number[], message, detail}}
 */
export function recommend(history, ex, nSets, opts = {}) {
  const { repMin, repMax } = ex;
  const inc = +ex.increment || 2.5;
  nSets = nSets || 3;
  if (!history.length) {
    return {
      status: 'new', weight: null, reps: Array(nSets).fill(repMin),
      message: `Première fois : choisis une charge qui te permet ${repMin}–${repMax} reps en gardant 1 à 3 reps en réserve.`,
      detail: 'Note la charge et les répétitions : l’app calculera la suite.',
    };
  }
  const last = history[history.length - 1];
  const prev = history.length > 1 ? history[history.length - 2] : null;
  const { top, topSets } = sessionStats(last);
  const reached = allAtTop(last, top, repMax);
  const confirmed = !opts.confirmTwice || (prev && allAtTop(prev, top, repMax));

  if (reached && confirmed) {
    const newW = roundTo(top + inc, inc < 1 ? 0.25 : 0.5);
    // 1RM estimé à partir de la meilleure série à la charge de travail
    const best = Math.max(...topSets.map((s) => e1rm(s.w, s.r)));
    const est = Math.floor(repsAt(best, newW));
    const target = Math.max(repMin, Math.min(repMax - 1, est));
    return {
      status: 'up', weight: newW, reps: Array(nSets).fill(target),
      message: `Haut de fourchette atteint (${repMax} reps) ✅ → monte à ${fmtKg(newW)} et vise ${target} reps par série.`,
      detail: `+${fmtKg(inc)} (${pct(inc / top)}). Puis reprends la montée en répétitions jusqu’à ${repMax}.`,
    };
  }
  if (reached && !confirmed) {
    return {
      status: 'confirm', weight: top, reps: Array(nSets).fill(repMax),
      message: `${repMax} reps atteintes à ${fmtKg(top)} : confirme une 2ᵉ fois avant d’augmenter.`,
      detail: 'Règle des 2 séances consécutives (ACSM 2009 / NSCA « 2-for-2 »).',
    };
  }

  const minReps = Math.min(...topSets.map((s) => s.r));
  if (minReps < repMin) {
    const prevTop = prev ? sessionStats(prev) : null;
    const prevBelow = prevTop && prevTop.top === top && Math.min(...prevTop.topSets.map((s) => s.r)) < repMin;
    if (prevBelow) {
      const newW = roundTo(top * 0.92, inc < 1 ? 0.25 : 0.5);
      return {
        status: 'down', weight: newW, reps: Array(nSets).fill(Math.min(repMax, repMin + 2)),
        message: `Sous ${repMin} reps deux séances de suite → redescends à ${fmtKg(newW)} (≈ −8 %).`,
        detail: 'En sèche, garder une charge lourde bien exécutée prime sur le fait de forcer l’augmentation.',
      };
    }
    return {
      status: 'hold', weight: top, reps: Array(nSets).fill(repMin),
      message: `Garde ${fmtKg(top)} et vise au moins ${repMin} reps sur chaque série.`,
      detail: 'Si c’est encore sous la fourchette la prochaine fois, l’app proposera de baisser la charge.',
    };
  }

  // Dans la fourchette : +1 rep par série (jusqu'au haut de la fourchette).
  const lastReps = [];
  for (let i = 0; i < nSets; i++) lastReps.push(topSets[i] ? topSets[i].r : minReps);
  const target = lastReps.map((r) => Math.min(repMax, r + 1));
  return {
    status: 'reps', weight: top, reps: target,
    message: `Garde ${fmtKg(top)} et ajoute 1 rep par série : ${target.join(' / ')}.`,
    detail: `Quand toutes les séries atteignent ${repMax} reps, la charge augmentera de ${fmtKg(inc)}.`,
  };
}

// Détection de stagnation : le meilleur 1RM estimé des 3 dernières séances
// ne dépasse pas celui des 3 précédentes.
export function stagnation(history) {
  if (history.length < 6) return false;
  const e = history.map((h) => sessionStats(h).e1rm);
  const recent = Math.max(...e.slice(-3));
  const before = Math.max(...e.slice(-6, -3));
  return recent <= before;
}

export function fmtKg(v) {
  return `${String(Math.round(v * 100) / 100).replace('.', ',')} kg`;
}
function pct(x) {
  return `${String(Math.round(x * 1000) / 10).replace('.', ',')} %`;
}
