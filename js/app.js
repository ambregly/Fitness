import { CATEGORIES, TYPE_DEFAULTS, CARDIO_TYPES, NUTRIENTS } from './data.js';
import {
  load, save, reset, uid, iso, today, parse, addDays, dow, diffDays, mondayOf,
  DAY_NAMES, DAY_SHORT, longDate, shortDate, validateImport, mergeStates,
} from './store.js';
import { exerciseHistory, recommend, sessionStats, stagnation, e1rm, fmtKg } from './progression.js';
import { lineChart } from './charts.js';

let S = load();
const persist = () => save(S);
persist(); // fixe la date de première ouverture (sert à repérer les jours manqués)

const ui = {
  tab: 'sport',
  sportView: 'today',
  mealsView: 'day',
  suiviView: 'poids',
  workoutDate: today(),
  mealDate: today(),
  progEx: null,
  weightRange: 90,
  histFilter: 'all',
  histDays: 30,
  calMonth: today().slice(0, 7),
  recipeDraft: null,
  day: today(),
};

// ---------- Utilitaires ----------
const $ = (sel, root = document) => root.querySelector(sel);
const h = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const fmt = (v, d = 1) => (Number.isFinite(v) ? String(Math.round(v * 10 ** d) / 10 ** d).replace('.', ',') : '–');
const exById = (id) => S.exercises.find((e) => e.id === id);
const foodById = (id) => S.foods.find((f) => f.id === id);
const recipeById = (id) => S.recipes.find((r) => r.id === id);
const byName = (a, b) => a.name.localeCompare(b.name, 'fr');

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, 2600);
}

// ---------- Nutrition ----------
const ZERO = () => Object.fromEntries(NUTRIENTS.map((n) => [n.key, 0]));
function addInto(acc, food, grams) {
  for (const n of NUTRIENTS) acc[n.key] += ((food[n.key] || 0) * grams) / 100;
  return acc;
}
function recipeTotals(r) {
  const tot = ZERO();
  let grams = 0;
  for (const ing of r.ingredients) {
    const f = foodById(ing.foodId);
    if (f) { addInto(tot, f, num(ing.g)); grams += num(ing.g); }
  }
  const portions = Math.max(1, num(r.portions) || 1);
  const perPortion = Object.fromEntries(Object.entries(tot).map(([k, v]) => [k, v / portions]));
  const cooked = num(r.cookedWeight) || grams;
  const per100 = Object.fromEntries(Object.entries(tot).map(([k, v]) => [k, cooked ? (v * 100) / cooked : 0]));
  return { tot, perPortion, per100, grams, cooked, portions };
}
function itemMacros(it) {
  if (it.kind === 'food') {
    const f = foodById(it.refId);
    return f ? addInto(ZERO(), f, num(it.qty)) : ZERO();
  }
  const r = recipeById(it.refId);
  if (!r) return ZERO();
  const t = recipeTotals(r);
  const factor = it.unit === 'g' ? num(it.qty) / 100 : num(it.qty);
  const base = it.unit === 'g' ? t.per100 : t.perPortion;
  return Object.fromEntries(Object.entries(base).map(([k, v]) => [k, v * factor]));
}
function dayTotals(date) {
  const acc = ZERO();
  for (const it of S.meals[date] || []) {
    const m = itemMacros(it);
    for (const k in acc) acc[k] += m[k];
  }
  return acc;
}
function macroLine(m, short = false) {
  return short
    ? `<span class="macro kcal">${fmt(m.kcal, 0)} kcal</span> <span class="macro">P ${fmt(m.prot)}</span> <span class="macro">G ${fmt(m.gluc)}</span> <span class="macro">L ${fmt(m.lip)}</span> <span class="macro">F ${fmt(m.fib)}</span>`
    : NUTRIENTS.map((n) => `<span class="macro"><em>${n.label}</em> ${fmt(m[n.key], n.key === 'kcal' ? 0 : 1)} ${n.unit}</span>`).join('');
}

// ---------- Sport : statut des jours ----------
const workoutOn = (date) => S.workouts.find((w) => w.date === date);
const workoutDone = (w) => w && w.entries.some((e) => e.sets.some((s) => s.done));
const cardioOn = (date) => S.cardio.filter((c) => c.date === date);
const weightOn = (date) => S.weights.find((w) => w.date === date);

function dayStatus(date) {
  const plan = S.plan[dow(date)];
  const w = workoutOn(date);
  const done = workoutDone(w);
  const planned = plan.active;
  const t = today();
  const missed = planned && !done && date < t && date >= S.createdAt;
  return { planned, done, missed, cardio: cardioOn(date), weight: weightOn(date), meals: (S.meals[date] || []).length > 0, isToday: date === t, future: date > t };
}

function alerts() {
  const t = today();
  const out = [];
  const missed = [];
  for (let i = 1; i <= 14; i++) {
    const d = addDays(t, -i);
    if (d < S.createdAt) break;
    if (dayStatus(d).missed) missed.push(d);
  }
  if (missed.length) {
    const last = missed[0];
    out.push({
      kind: 'warn',
      html: `Séance${missed.length > 1 ? 's' : ''} manquée${missed.length > 1 ? 's' : ''} : ${missed.map((d) => `<strong>${DAY_NAMES[dow(d)].toLowerCase()} ${shortDate(d)}</strong>`).join(', ')}.`,
      action: `<button class="btn small" data-act="catchUp" data-day="${dow(last)}">Faire « ${h(S.plan[dow(last)].name || DAY_NAMES[dow(last)])} » aujourd’hui</button>
               <button class="btn small ghost" data-act="logPast" data-date="${last}">Saisir après coup</button>`,
    });
  }
  const lastW = [...S.weights].sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!lastW) out.push({ kind: 'info', html: 'Aucune pesée enregistrée : ajoute ta première pesée dans <strong>Suivi</strong>.', action: '<button class="btn small" data-act="goto" data-tab="suivi" data-view="poids">Me peser</button>' });
  else {
    const gap = diffDays(lastW.date, t);
    if (gap >= 4) out.push({ kind: 'info', html: `Dernière pesée il y a <strong>${gap} jours</strong> (${shortDate(lastW.date)}).`, action: '<button class="btn small" data-act="goto" data-tab="suivi" data-view="poids">Me peser</button>' });
  }
  const y = addDays(t, -1);
  if (y >= S.createdAt && !(S.meals[y] || []).length) {
    out.push({ kind: 'info', html: 'Repas d’hier non saisis.', action: `<button class="btn small ghost" data-act="gotoMeals" data-date="${y}">Compléter hier</button>` });
  }
  return out;
}

function alertsHtml() {
  const a = alerts();
  if (!a.length) return '';
  return `<div class="alerts">${a.map((x) => `<div class="alert ${x.kind}"><div>${x.html}</div><div class="alert-actions">${x.action || ''}</div></div>`).join('')}</div>`;
}

function weekStrip(refDate = today()) {
  const mon = mondayOf(refDate);
  const cells = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(mon, i);
    const st = dayStatus(d);
    let cls = 'rest'; let icon = '·'; let label = 'repos';
    if (st.planned) { cls = 'planned'; icon = '○'; label = 'prévu'; }
    if (st.done) { cls = 'done'; icon = '✓'; label = 'fait'; }
    if (st.missed) { cls = 'missed'; icon = '✗'; label = 'manqué'; }
    const cardio = st.cardio.length ? `<span class="cardio-dot" title="cardio">♥ ${st.cardio.reduce((a, c) => a + num(c.minutes), 0)}′</span>` : '';
    cells.push(`<button class="day ${cls} ${st.isToday ? 'today' : ''}" data-act="pickWorkoutDate" data-date="${d}" aria-label="${DAY_NAMES[dow(d)]} ${shortDate(d)} : ${label}">
      <span class="dname">${DAY_SHORT[dow(d)]}</span><span class="dnum">${parse(d).getDate()}</span><span class="dicon">${icon}</span>${cardio}</button>`);
  }
  return `<div class="week">${cells.join('')}</div>`;
}

// ---------- Rendu principal ----------
function render() {
  document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === ui.tab));
  const main = $('#main');
  const views = { sport: renderSport, meals: renderMeals, suivi: renderSuivi };
  main.innerHTML = views[ui.tab]();
  // Sur iPhone, la barre de sous-onglets défile : on garde l'onglet actif visible.
  const act = main.querySelector('.subnav .active');
  if (act) act.parentElement.scrollLeft = act.offsetLeft - (act.parentElement.clientWidth - act.offsetWidth) / 2;
  afterRender();
}

function subnav(tab, items) {
  const cur = ui[tab + 'View'];
  return `<nav class="subnav" role="tablist">${items.map(([id, label]) => `<button role="tab" class="${cur === id || (id === 'recipes' && cur === 'recipeEdit') ? 'active' : ''}" data-act="view" data-tab="${tab}" data-view="${id}">${label}</button>`).join('')}</nav>`;
}

// ================= SPORT =================
function renderSport() {
  const nav = subnav('sport', [['today', 'Séance'], ['cardio', 'Cardio'], ['plan', 'Programme'], ['bank', 'Exercices']]);
  const v = { today: sportToday, cardio: sportCardio, plan: sportPlan, bank: sportBank }[ui.sportView]();
  return `<header class="page-head"><h1>Sport</h1><p class="date">${longDate(today())}</p></header>${nav}${v}`;
}

function historyBefore(exId, date) {
  return exerciseHistory(S.workouts.filter((w) => w.date < date), exId);
}

function sportToday() {
  const date = ui.workoutDate;
  const w = workoutOn(date);
  const plan = S.plan[dow(date)];
  let body = '';
  if (!w) {
    const others = Object.entries(S.plan).filter(([d, p]) => p.active && +d !== dow(date));
    body = plan.active
      ? `<div class="card hero"><h2>${h(plan.name || DAY_NAMES[dow(date)])}</h2>
          <p class="muted">${plan.items.length} exercices · ${plan.items.reduce((a, i) => a + num(i.sets), 0)} séries</p>
          <ul class="preview">${plan.items.map((it) => { const ex = exById(it.exId); if (!ex) return ''; const r = recommend(historyBefore(ex.id, date), ex, it.sets, S.settings); return `<li><span>${h(ex.name)}</span><span class="muted">${it.sets} × ${r.weight ? fmtKg(r.weight) + ' · ' : ''}${r.reps.join('/')} reps</span></li>`; }).join('')}</ul>
          <button class="btn primary big" data-act="startWorkout" data-day="${dow(date)}">Commencer la séance</button></div>`
      : `<div class="card hero"><h2>Jour de repos musculation</h2><p class="muted">C’est un bon jour pour une séance de cardio (natation, vélo, course lente).</p>
          <button class="btn primary" data-act="view" data-tab="sport" data-view="cardio">Ajouter du cardio</button></div>`;
    if (others.length) {
      body += `<div class="card"><h3>Faire une autre séance ce jour-là</h3><div class="chips">${others.map(([d, p]) => `<button class="chip" data-act="startWorkout" data-day="${d}">${h(p.name || DAY_NAMES[d])}</button>`).join('')}
        <button class="chip" data-act="startWorkout" data-day="empty">Séance libre</button></div></div>`;
    }
  } else {
    body = `<div class="card workout-head"><div><h2>${h(w.name)}</h2><p class="muted">${w.entries.length} exercices · ${w.entries.reduce((a, e) => a + e.sets.filter((s) => s.done).length, 0)} séries validées</p></div>
      <div class="row-actions"><button class="btn ghost small" data-act="addExToWorkout">+ Exercice</button><button class="btn danger small" data-act="deleteWorkout">Supprimer</button></div></div>
      ${w.entries.map((en, ei) => entryCard(w, en, ei)).join('')}
      <div class="card"><label class="field"><span>Notes de séance</span><textarea data-input="workoutNote" rows="2" placeholder="Sensations, sommeil, douleurs…">${h(w.notes || '')}</textarea></label></div>`;
  }
  return `${alertsHtml()}${weekStrip(date)}
    <div class="toolbar"><label class="field inline"><span>Date</span><input type="date" value="${date}" max="${addDays(today(), 7)}" data-input="workoutDate"></label>
    ${date !== today() ? '<button class="btn ghost small" data-act="pickWorkoutDate" data-date="' + today() + '">Revenir à aujourd’hui</button>' : ''}</div>${body}`;
}

function entryCard(w, en, ei) {
  const ex = exById(en.exId);
  if (!ex) return '';
  const hist = historyBefore(ex.id, w.date);
  const rec = recommend(hist, ex, en.sets.length, S.settings);
  const last = hist[hist.length - 1];
  const stag = stagnation(hist);
  const rows = en.sets.map((s, si) => {
    const tw = rec.weight ?? '';
    const tr = rec.reps[si] ?? rec.reps[rec.reps.length - 1];
    return `<tr class="${s.done ? 'done' : ''}">
      <td class="set-n">${si + 1}</td>
      <td><input inputmode="decimal" enterkeyhint="next" data-input="set" data-e="${ei}" data-s="${si}" data-f="w" value="${s.w ?? ''}" placeholder="${tw === '' ? 'kg' : String(tw).replace('.', ',')}" aria-label="Poids série ${si + 1}"></td>
      <td><input inputmode="numeric" enterkeyhint="done" data-input="set" data-e="${ei}" data-s="${si}" data-f="r" value="${s.r ?? ''}" placeholder="${tr}" aria-label="Répétitions série ${si + 1}"></td>
      <td><button class="check ${s.done ? 'on' : ''}" data-act="setDone" data-e="${ei}" data-s="${si}" aria-label="Valider la série">✓</button></td>
      <td><button class="icon-btn" data-act="delSet" data-e="${ei}" data-s="${si}" aria-label="Supprimer la série">×</button></td></tr>`;
  }).join('');
  return `<div class="card exercise status-${rec.status}">
    <div class="ex-head"><div><h3>${h(ex.name)}</h3><p class="muted">${h(ex.category)} · fourchette ${ex.repMin}–${ex.repMax} reps · +${fmtKg(ex.increment)}</p></div>
      <button class="icon-btn" data-act="delEntry" data-e="${ei}" aria-label="Retirer l’exercice">×</button></div>
    <div class="rec"><strong>Objectif :</strong> ${rec.message}<br><span class="muted">${rec.detail}</span>
      ${last ? `<br><span class="muted">Dernière fois (${shortDate(last.date)}) : ${last.sets.map((s) => `${fmt(s.w)}×${s.r}`).join(', ')}</span>` : ''}
      ${stag ? '<br><span class="warn-text">⚠ Pas de progrès sur les 3 dernières séances : vérifie sommeil, déficit calorique, et envisage une semaine allégée (deload).</span>' : ''}</div>
    <table class="sets"><thead><tr><th>#</th><th>Poids (kg)</th><th>Reps</th><th></th><th></th></tr></thead><tbody>${rows}</tbody></table>
    <button class="btn ghost small" data-act="addSet" data-e="${ei}">+ Série</button></div>`;
}

function sportCardio() {
  const t = today();
  const mon = mondayOf(t);
  const week = S.cardio.filter((c) => c.date >= mon && c.date <= addDays(mon, 6));
  const tot = week.reduce((a, c) => a + num(c.minutes), 0);
  const kcal = week.reduce((a, c) => a + num(c.kcal), 0);
  const list = [...S.cardio].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 40);
  return `${weekStrip()}
  <div class="card"><h2>Nouvelle séance de cardio</h2>
    <form class="grid-form" data-form="cardio">
      <label class="field"><span>Activité</span><select name="type">${CARDIO_TYPES.map((c) => `<option value="${c.id}">${c.name}</option>`).join('')}</select></label>
      <label class="field"><span>Date</span><input type="date" name="date" value="${t}" max="${t}"></label>
      <label class="field"><span>Durée (min)</span><input name="minutes" inputmode="numeric" required placeholder="45"></label>
      <label class="field"><span>Distance (km)</span><input name="km" inputmode="decimal" placeholder="optionnel"></label>
      <label class="field"><span>FC moyenne</span><input name="hr" inputmode="numeric" placeholder="optionnel"></label>
      <label class="field"><span>Calories (kcal)</span><input name="kcal" inputmode="numeric" placeholder="auto"></label>
      <label class="field wide"><span>Notes</span><input name="notes" placeholder="ex. 2 km crawl, zone 2…"></label>
      <button class="btn primary wide" type="submit">Enregistrer</button>
    </form>
    <p class="muted small">Si tu laisses « Calories » vide, l’app estime la dépense avec les valeurs MET du Compendium of Physical Activities × ton dernier poids × la durée.</p></div>
  <div class="card"><h2>Cette semaine</h2><p class="stat-line"><strong>${tot} min</strong> de cardio · ≈ ${fmt(kcal, 0)} kcal · ${week.length} séance${week.length > 1 ? 's' : ''}</p>
    <ul class="list">${list.map((c) => { const ty = CARDIO_TYPES.find((x) => x.id === c.type) || { name: c.type }; return `<li><div><strong>${ty.name}</strong> · ${c.minutes} min${c.km ? ` · ${fmt(num(c.km))} km` : ''}${c.hr ? ` · ${c.hr} bpm` : ''}<br><span class="muted">${longDate(c.date)} · ≈ ${fmt(num(c.kcal), 0)} kcal ${c.notes ? '· ' + h(c.notes) : ''}</span></div><button class="icon-btn" data-act="delCardio" data-id="${c.id}" aria-label="Supprimer">×</button></li>`; }).join('') || '<li class="empty">Aucune séance enregistrée.</li>'}</ul></div>`;
}

function sportPlan() {
  const order = [1, 2, 3, 4, 5, 6, 0];
  return `<p class="intro">Chaque semaine, la même séance revient le même jour : l’app compare avec la séance précédente pour calculer tes objectifs. Par défaut : lundi, mercredi, vendredi et dimanche.</p>
  ${order.map((d) => { const p = S.plan[d]; return `<div class="card plan-day ${p.active ? '' : 'off'}">
    <div class="ex-head"><label class="switch"><input type="checkbox" data-input="planActive" data-d="${d}" ${p.active ? 'checked' : ''}><span>${DAY_NAMES[d]}</span></label>
      ${p.active ? `<input class="plan-name" data-input="planName" data-d="${d}" value="${h(p.name)}" placeholder="Nom de la séance">` : '<span class="muted">Repos / cardio</span>'}</div>
    ${p.active ? `<ul class="list plan-items">${p.items.map((it, i) => { const ex = exById(it.exId); return `<li><div><strong>${h(ex ? ex.name : '?')}</strong><br><span class="muted">${ex ? h(ex.category) + ` · ${ex.repMin}–${ex.repMax} reps` : ''}</span></div>
      <div class="row-actions"><label class="sets-input">Séries <input inputmode="numeric" data-input="planSets" data-d="${d}" data-i="${i}" value="${it.sets}"></label>
      <button class="icon-btn" data-act="planMove" data-d="${d}" data-i="${i}" data-dir="-1" aria-label="Monter">↑</button>
      <button class="icon-btn" data-act="planMove" data-d="${d}" data-i="${i}" data-dir="1" aria-label="Descendre">↓</button>
      <button class="icon-btn" data-act="planDel" data-d="${d}" data-i="${i}" aria-label="Retirer">×</button></div></li>`; }).join('')}</ul>
      <button class="btn ghost small" data-act="planAddEx" data-d="${d}">+ Ajouter un exercice</button>` : ''}</div>`; }).join('')}`;
}

function sportBank() {
  const q = (ui.bankQuery || '').toLowerCase();
  const groups = CATEGORIES.map((c) => [c, S.exercises.filter((e) => e.category === c && e.name.toLowerCase().includes(q)).sort(byName)]).filter(([, l]) => l.length);
  const typeLabel = { lower: 'Poly. bas du corps', upper: 'Poly. haut du corps', iso: 'Isolation' };
  return `<div class="toolbar"><input type="search" placeholder="Rechercher un exercice…" data-input="bankQuery" value="${h(ui.bankQuery || '')}"><button class="btn primary small" data-act="exNew">+ Nouvel exercice</button></div>
  ${groups.map(([c, list]) => `<div class="card"><h3>${c} <span class="muted">(${list.length})</span></h3><ul class="list">${list.map((e) => `<li><div><strong>${h(e.name)}</strong><br><span class="muted">${typeLabel[e.type] || ''} · ${e.repMin}–${e.repMax} reps · +${fmtKg(e.increment)}</span></div><button class="btn ghost small" data-act="exEdit" data-id="${e.id}">Modifier</button></li>`).join('')}</ul></div>`).join('') || '<p class="empty">Aucun exercice trouvé.</p>'}`;
}

// ================= REPAS =================
function renderMeals() {
  const nav = subnav('meals', [['day', 'Journée'], ['recipes', 'Recettes'], ['foods', 'Aliments']]);
  const v = { day: mealsDay, recipes: mealsRecipes, recipeEdit: recipeEditor, foods: mealsFoods }[ui.mealsView]();
  return `<header class="page-head"><h1>Repas</h1><p class="date">${longDate(today())}</p></header>${nav}${v}`;
}

function progressBars(tot) {
  const T = S.settings.targets;
  const items = [['kcal', 'Calories', 'kcal'], ['prot', 'Protéines', 'g'], ['gluc', 'Glucides', 'g'], ['lip', 'Lipides', 'g'], ['fib', 'Fibres', 'g']];
  return `<div class="bars">${items.map(([k, label, u]) => { const target = num(T[k]); const pct = target ? Math.min(100, (tot[k] / target) * 100) : 0; const over = target && tot[k] > target * 1.05 && k !== 'prot' && k !== 'fib'; return `<div class="bar ${over ? 'over' : ''}"><div class="bar-label"><span>${label}</span><span><strong>${fmt(tot[k], 0)}</strong> / ${fmt(target, 0)} ${u}</span></div><div class="track"><div class="fill" style="width:${pct}%"></div></div></div>`; }).join('')}</div>`;
}

function daySlots(d) {
  const items = S.meals[d] || [];
  return [...S.mealSlots, ...new Set(items.map((i) => i.slot).filter((s) => !S.mealSlots.includes(s)))];
}
function slotTotals(d, slot) {
  return (S.meals[d] || []).filter((i) => i.slot === slot).reduce((a, it) => { const m = itemMacros(it); for (const k in a) a[k] += m[k]; return a; }, ZERO());
}
function dayTotalsHtml(d) {
  const tot = dayTotals(d);
  return `<h2>${longDate(d)}</h2>${progressBars(tot)}<p class="muted small">${macroLine(tot)}</p>`;
}

function mealsDay() {
  const d = ui.mealDate;
  const items = S.meals[d] || [];
  const slots = daySlots(d);
  return `<div class="toolbar date-nav"><button class="icon-btn" data-act="mealDay" data-n="-1" aria-label="Jour précédent">‹</button>
    <input type="date" value="${d}" data-input="mealDate"><button class="icon-btn" data-act="mealDay" data-n="1" aria-label="Jour suivant">›</button>
    ${d !== today() ? '<button class="btn ghost small" data-act="mealDay" data-n="0">Aujourd’hui</button>' : ''}</div>
  <div class="card" id="day-totals">${dayTotalsHtml(d)}</div>
  ${slots.map((slot, si) => { const its = items.filter((i) => i.slot === slot); const st = slotTotals(d, slot); return `<div class="card meal">
    <div class="ex-head"><h3>${h(slot)}</h3><span class="muted small" id="slot-sum-${si}">${its.length ? macroLine(st, true) : ''}</span></div>
    <ul class="list">${its.map((it) => { const ref = it.kind === 'food' ? foodById(it.refId) : recipeById(it.refId); const m = itemMacros(it); return `<li><div><strong>${h(ref ? ref.name : '(supprimé)')}</strong> ${it.kind === 'recipe' ? '<span class="tag">recette</span>' : ''}<br><span class="muted small" id="im-${it.id}">${macroLine(m, true)}</span></div>
      <div class="row-actions"><input class="qty" inputmode="decimal" data-input="mealQty" data-id="${it.id}" value="${String(it.qty).replace('.', ',')}" aria-label="Quantité"><span class="unit">${it.unit === 'portion' ? 'portion(s)' : 'g'}</span><button class="icon-btn" data-act="mealDel" data-id="${it.id}" aria-label="Retirer">×</button></div></li>`; }).join('')}</ul>
    <button class="btn ghost small" data-act="mealAdd" data-slot="${h(slot)}">+ Ajouter</button></div>`; }).join('')}
  <div class="row-actions wrap"><button class="btn ghost" data-act="slotAdd">+ Ajouter un repas (collation…)</button><button class="btn ghost" data-act="copyDay">Copier les repas de la veille</button><button class="btn ghost" data-act="slotsEdit">Gérer les repas</button></div>`;
}

function mealsRecipes() {
  const q = (ui.recipeQuery || '').toLowerCase();
  const list = S.recipes.filter((r) => r.name.toLowerCase().includes(q)).sort(byName);
  return `<div class="toolbar"><input type="search" placeholder="Rechercher une recette…" data-input="recipeQuery" value="${h(ui.recipeQuery || '')}"><button class="btn primary small" data-act="recipeNew">+ Nouvelle recette</button></div>
  ${list.length ? list.map((r) => { const t = recipeTotals(r); return `<div class="card recipe"><div class="ex-head"><div><h3>${h(r.name)}</h3><p class="muted small">${r.category ? h(r.category) + ' · ' : ''}${t.portions} portion${t.portions > 1 ? 's' : ''} · ${r.ingredients.length} ingrédients</p></div>
    <div class="row-actions"><button class="btn ghost small" data-act="recipeEdit" data-id="${r.id}">Modifier</button><button class="btn ghost small" data-act="recipeDup" data-id="${r.id}">Dupliquer</button></div></div>
    <p class="small"><strong>Par portion :</strong> ${macroLine(t.perPortion, true)}</p></div>`; }).join('') : '<div class="card"><p class="empty">Aucune recette. Crée ta première recette : les macros sont calculées automatiquement à partir des ingrédients.</p></div>'}`;
}

function recipeEditor() {
  const r = ui.recipeDraft;
  if (!r) { ui.mealsView = 'recipes'; return mealsRecipes(); }
  const t = recipeTotals(r);
  const q = (ui.ingQuery || '').toLowerCase();
  const results = q.length >= 2 ? S.foods.filter((f) => f.name.toLowerCase().includes(q)).sort(byName).slice(0, 12) : [];
  return `<div class="card"><h2>${recipeById(r.id) ? 'Modifier la recette' : 'Nouvelle recette'}</h2>
    <div class="grid-form">
      <label class="field wide"><span>Nom</span><input data-input="rField" data-f="name" value="${h(r.name)}" placeholder="ex. Pancakes protéinés"></label>
      <label class="field"><span>Catégorie</span><input data-input="rField" data-f="category" value="${h(r.category || '')}" placeholder="Petit-déj, plat…" list="recipe-cats"></label>
      <label class="field"><span>Nombre de portions</span><input inputmode="decimal" data-input="rField" data-f="portions" value="${r.portions}"></label>
      <label class="field"><span>Poids total cuit (g)</span><input inputmode="decimal" data-input="rField" data-f="cookedWeight" value="${r.cookedWeight || ''}" placeholder="optionnel"></label>
    </div>
    <datalist id="recipe-cats"><option>Petit-déjeuner</option><option>Plat</option><option>Collation</option><option>Dessert</option><option>Sauce</option></datalist>
    <p class="muted small">Le poids cuit permet ensuite de saisir un repas en grammes (ex. 250 g de chili). Sinon, on saisit en portions.</p></div>
  <div class="card"><h3>Ingrédients</h3>
    <div class="ing-search"><input type="search" placeholder="Ajouter un ingrédient : tape « farine », « poulet »…" data-input="ingQuery" value="${h(ui.ingQuery || '')}">
    <ul class="results">${results.map((f) => `<li><button data-act="ingAdd" data-id="${f.id}"><strong>${h(f.name)}</strong><span class="muted small">${fmt(f.kcal, 0)} kcal · P ${fmt(f.prot)} · G ${fmt(f.gluc)} · L ${fmt(f.lip)} /100 g</span></button></li>`).join('')}
    ${q.length >= 2 ? `<li><button data-act="foodNew" data-prefill="${h(ui.ingQuery)}" class="create">+ Créer l’aliment « ${h(ui.ingQuery)} »</button></li>` : ''}</ul></div>
    <table class="ing-table"><thead><tr><th>Ingrédient</th><th>g</th><th>kcal</th><th>P</th><th>G</th><th>L</th><th>Fib.</th><th></th></tr></thead>
    <tbody>${r.ingredients.map((ing, i) => { const f = foodById(ing.foodId); const m = f ? addInto(ZERO(), f, num(ing.g)) : ZERO(); return `<tr id="ing-${i}"><td>${h(f ? f.name : '(supprimé)')}</td><td><input class="qty" inputmode="decimal" data-input="ingG" data-i="${i}" value="${String(ing.g).replace('.', ',')}"></td>${ingCells(m)}<td><button class="icon-btn" data-act="ingDel" data-i="${i}" aria-label="Retirer">×</button></td></tr>`; }).join('') || '<tr><td colspan="8" class="empty">Aucun ingrédient.</td></tr>'}</tbody></table></div>
  <div class="card totals" id="recipe-totals">${recipeTotalsHtml(t)}</div>
  <div class="card"><label class="field"><span>Préparation / notes</span><textarea rows="3" data-input="rField" data-f="notes">${h(r.notes || '')}</textarea></label></div>
  <div class="row-actions wrap sticky-actions"><button class="btn primary" data-act="recipeSave">Enregistrer la recette</button><button class="btn ghost" data-act="recipeCancel">Annuler</button>${recipeById(r.id) ? '<button class="btn danger" data-act="recipeDel">Supprimer</button>' : ''}</div>`;
}

const ingCells = (m) => `<td>${fmt(m.kcal, 0)}</td><td>${fmt(m.prot)}</td><td>${fmt(m.gluc)}</td><td>${fmt(m.lip)}</td><td>${fmt(m.fib)}</td>`;

function recipeTotalsHtml(t) {
  return `<h3>Valeurs nutritionnelles</h3><table class="nutri"><thead><tr><th></th><th>Total (${fmt(t.grams, 0)} g cru)</th><th>Par portion</th><th>Pour 100 g${t.cooked !== t.grams ? ' cuit' : ''}</th></tr></thead>
    <tbody>${NUTRIENTS.map((n) => `<tr><th>${n.label}</th><td>${fmt(t.tot[n.key], n.key === 'kcal' ? 0 : 1)} ${n.unit}</td><td><strong>${fmt(t.perPortion[n.key], n.key === 'kcal' ? 0 : 1)} ${n.unit}</strong></td><td>${fmt(t.per100[n.key], n.key === 'kcal' ? 0 : 1)} ${n.unit}</td></tr>`).join('')}</tbody></table>`;
}

function mealsFoods() {
  const q = (ui.foodQuery || '').toLowerCase();
  const list = S.foods.filter((f) => f.name.toLowerCase().includes(q)).sort(byName);
  return `<div class="toolbar"><input type="search" placeholder="Rechercher un aliment…" data-input="foodQuery" value="${h(ui.foodQuery || '')}"><button class="btn primary small" data-act="foodNew">+ Aliment</button><button class="btn ghost small" data-act="offOpen">Chercher en ligne</button></div>
  <div class="card"><p class="muted small">Valeurs pour 100 g. Tu peux corriger une valeur à partir de l’étiquette de ton produit, ou importer un produit depuis Open Food Facts (nom ou code-barres).</p>
  <ul class="list">${list.map((f) => `<li><div><strong>${h(f.name)}</strong>${f.brand ? ` <span class="muted small">${h(f.brand)}</span>` : ''}<br><span class="muted small">${fmt(f.kcal, 0)} kcal · P ${fmt(f.prot)} · G ${fmt(f.gluc)} · L ${fmt(f.lip)} · Fib ${fmt(f.fib)}</span></div><button class="btn ghost small" data-act="foodEdit" data-id="${f.id}">Modifier</button></li>`).join('') || '<li class="empty">Aucun aliment.</li>'}</ul></div>`;
}

// ================= SUIVI =================
function renderSuivi() {
  const nav = subnav('suivi', [['poids', 'Poids'], ['prog', 'Progression'], ['hist', 'Historique'], ['cal', 'Calendrier'], ['settings', 'Réglages']]);
  const v = { poids: suiviWeight, prog: suiviProg, hist: suiviHistory, cal: suiviCal, settings: suiviSettings }[ui.suiviView]();
  return `<header class="page-head"><h1>Suivi</h1><p class="date">${longDate(today())}</p></header>${nav}${v}`;
}

function movingAvg(weights) {
  const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.map((w) => {
    const win = sorted.filter((x) => x.date <= w.date && x.date >= addDays(w.date, -6));
    return { x: w.date, y: win.reduce((a, x) => a + num(x.kg), 0) / win.length };
  });
}

function weightStats() {
  const sorted = [...S.weights].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 2) return null;
  const last = sorted[sorted.length - 1].date;
  const avg = (from, to) => { const l = sorted.filter((w) => w.date > from && w.date <= to); return l.length ? l.reduce((a, w) => a + num(w.kg), 0) / l.length : null; };
  const a1 = avg(addDays(last, -7), last);
  const a0 = avg(addDays(last, -14), addDays(last, -7));
  const first = num(sorted[0].kg);
  return { a1, a0, delta: a0 && a1 ? a1 - a0 : null, pct: a0 && a1 ? ((a1 - a0) / a0) * 100 : null, total: num(sorted[sorted.length - 1].kg) - first, since: sorted[0].date };
}

function suiviWeight() {
  const t = today();
  const st = weightStats();
  let verdict = '';
  if (st && st.pct != null) {
    const p = -st.pct;
    const [cls, txt] = p > 1 ? ['warn', 'Perte rapide (> 1 %/sem) : risque de perdre du muscle, envisage de remonter un peu les calories.']
      : p >= 0.5 ? ['good', 'Dans la cible recommandée (0,5–1 % du poids par semaine).']
        : p > 0 ? ['info', 'Perte lente (< 0,5 %/sem) : c’est ok pour préserver le muscle ; baisse légèrement les calories si ça stagne 2–3 semaines.']
          : ['info', 'Pas de baisse sur la semaine : regarde la tendance sur 2–3 semaines avant d’ajuster (eau, cycle, sel…).'];
    verdict = `<div class="alert ${cls}"><div>${txt}</div></div>`;
  }
  const entries = [...S.weights].sort((a, b) => b.date.localeCompare(a.date));
  return `<div class="card"><h2>Pesée</h2><form class="grid-form" data-form="weight">
      <label class="field"><span>Date</span><input type="date" name="date" value="${t}" max="${t}"></label>
      <label class="field"><span>Poids (kg)</span><input name="kg" inputmode="decimal" required placeholder="${entries[0] ? String(entries[0].kg).replace('.', ',') : '60,0'}"></label>
      <button class="btn primary" type="submit">Enregistrer</button></form>
    <p class="muted small">Conseil : pèse-toi le matin à jeun, après un passage aux toilettes. Seule la moyenne sur 7 jours compte vraiment.</p></div>
  ${st ? `<div class="stats">
    <div class="stat"><span class="label">Moyenne 7 j</span><span class="value">${fmt(st.a1)} kg</span></div>
    <div class="stat"><span class="label">Évolution / semaine</span><span class="value">${st.delta == null ? '–' : (st.delta > 0 ? '+' : '') + fmt(st.delta, 2) + ' kg'}</span><span class="sub">${st.pct == null ? '' : (st.pct > 0 ? '+' : '') + fmt(st.pct, 2) + ' %'}</span></div>
    <div class="stat"><span class="label">Depuis le ${shortDate(st.since)}</span><span class="value">${(st.total > 0 ? '+' : '') + fmt(st.total)} kg</span></div></div>${verdict}` : ''}
  <div class="card"><div class="ex-head"><h2>Courbe de poids</h2><div class="chips">${[[30, '1 mois'], [90, '3 mois'], [180, '6 mois'], [0, 'Tout']].map(([n, l]) => `<button class="chip ${ui.weightRange === n ? 'active' : ''}" data-act="weightRange" data-n="${n}">${l}</button>`).join('')}</div></div>
    <div class="legend"><span><i style="background:var(--series-1)"></i>Pesée</span><span><i class="line" style="background:var(--series-2)"></i>Moyenne 7 jours</span></div>
    <div id="weight-chart" class="chart-box"></div></div>
  <div class="card"><h3>Historique</h3><ul class="list">${entries.slice(0, 60).map((w) => `<li><div><strong>${fmt(num(w.kg))} kg</strong><br><span class="muted small">${longDate(w.date)}</span></div><button class="icon-btn" data-act="weightDel" data-date="${w.date}" aria-label="Supprimer">×</button></li>`).join('') || '<li class="empty">Aucune pesée.</li>'}</ul></div>`;
}

function suiviProg() {
  const withHist = S.exercises.filter((e) => exerciseHistory(S.workouts, e.id).length).sort(byName);
  if (!withHist.length) return '<div class="card"><p class="empty">Enregistre tes premières séances : la progression de chaque exercice apparaîtra ici.</p></div>';
  if (!ui.progEx || !withHist.find((e) => e.id === ui.progEx)) ui.progEx = withHist[0].id;
  const ex = exById(ui.progEx);
  const hist = exerciseHistory(S.workouts, ex.id);
  const nSets = Math.max(...Object.values(S.plan).flatMap((p) => p.items.filter((i) => i.exId === ex.id).map((i) => num(i.sets))), hist[hist.length - 1].sets.length);
  const rec = recommend(hist, ex, nSets, S.settings);
  const overview = withHist.map((e) => {
    const hh = exerciseHistory(S.workouts, e.id);
    const l = hh[hh.length - 1];
    const s = sessionStats(l);
    const r = recommend(hh, e, l.sets.length, S.settings);
    const prev = hh.length > 1 ? sessionStats(hh[hh.length - 2]).e1rm : null;
    const trend = prev == null ? '' : s.e1rm > prev + 0.1 ? '<span class="up">▲</span>' : s.e1rm < prev - 0.1 ? '<span class="down">▼</span>' : '<span class="muted">=</span>';
    return `<tr data-act="progPick" data-id="${e.id}" class="${e.id === ex.id ? 'sel' : ''}"><td><strong>${h(e.name)}</strong></td><td>${shortDate(l.date)}</td><td>${fmt(s.top)} × ${Math.max(...s.topSets.map((x) => x.r))} ${trend}</td><td>${r.weight ? fmt(r.weight) + ' kg' : '–'} × ${r.reps.join('/')}</td></tr>`;
  }).join('');
  return `<div class="card"><label class="field"><span>Exercice</span><select data-input="progEx">${CATEGORIES.map((c) => { const l = withHist.filter((e) => e.category === c); return l.length ? `<optgroup label="${c}">${l.map((e) => `<option value="${e.id}" ${e.id === ex.id ? 'selected' : ''}>${h(e.name)}</option>`).join('')}</optgroup>` : ''; }).join('')}</select></label></div>
  <div class="card rec-card status-${rec.status}"><h2>Prochaine séance · ${h(ex.name)}</h2><p class="big-target">${rec.weight ? fmtKg(rec.weight) : '?'} × ${rec.reps.join(' / ')}</p><p>${rec.message}</p><p class="muted small">${rec.detail}</p>
    ${stagnation(hist) ? '<p class="warn-text">⚠ Stagnation sur 3 séances : normal en sèche avancée. Priorise l’exécution et la récupération, ou fais une semaine allégée (−40 % de séries).</p>' : ''}
    <p class="muted small">Fourchette ${ex.repMin}–${ex.repMax} reps · incrément +${fmtKg(ex.increment)} · <button class="linklike" data-act="exEdit" data-id="${ex.id}">modifier</button></p></div>
  <div class="card"><h3>Évolution</h3><div class="legend"><span><i class="line" style="background:var(--series-1)"></i>1RM estimé (Epley)</span><span><i style="background:var(--series-2)"></i>Charge de travail</span></div><div id="prog-chart" class="chart-box"></div></div>
  <div class="card"><h3>Historique</h3><table class="hist"><thead><tr><th>Date</th><th>Séries</th><th>Volume</th><th>1RM est.</th></tr></thead><tbody>
    ${[...hist].reverse().map((s) => { const st = sessionStats(s); return `<tr><td>${shortDate(s.date)}</td><td>${s.sets.map((x) => `${fmt(x.w)}×${x.r}`).join(', ')}</td><td>${fmt(st.volume, 0)} kg</td><td>${fmt(st.e1rm)} kg</td></tr>`; }).join('')}</tbody></table></div>
  <div class="card"><h3>Tous les exercices</h3><table class="hist clickable"><thead><tr><th>Exercice</th><th>Dernière</th><th>Meilleure série</th><th>Prochain objectif</th></tr></thead><tbody>${overview}</tbody></table></div>`;
}

// ---------- Historique de toutes les saisies ----------
function historyDates() {
  const f = ui.histFilter;
  const set = new Set();
  if (f === 'all' || f === 'muscu') S.workouts.filter(workoutDone).forEach((w) => set.add(w.date));
  if (f === 'all' || f === 'cardio') S.cardio.forEach((c) => set.add(c.date));
  if (f === 'all' || f === 'poids') S.weights.forEach((w) => set.add(w.date));
  if (f === 'all' || f === 'repas') Object.entries(S.meals).forEach(([d, l]) => { if (l.length) set.add(d); });
  return [...set].sort().reverse();
}

function historyDayHtml(d) {
  const f = ui.histFilter;
  const parts = [];
  const w = workoutOn(d);
  if ((f === 'all' || f === 'muscu') && workoutDone(w)) {
    const lines = w.entries.map((en) => {
      const ex = exById(en.exId);
      const done = en.sets.filter((x) => x.done);
      return done.length ? `<li><strong>${h(ex ? ex.name : '?')}</strong> <span class="muted">${done.map((x) => `${fmt(num(x.w))}×${x.r}`).join(', ')}</span></li>` : '';
    }).join('');
    parts.push(`<div class="h-item"><div class="h-kind muscu">Muscu</div><div class="h-body"><div class="h-title">${h(w.name)} <button class="linklike" data-act="pickWorkoutDate" data-date="${d}">ouvrir</button></div><ul class="h-sets">${lines}</ul>${w.notes ? `<p class="muted small">${h(w.notes)}</p>` : ''}</div></div>`);
  }
  if (f === 'all' || f === 'cardio') {
    for (const c of cardioOn(d)) {
      const ty = CARDIO_TYPES.find((x) => x.id === c.type) || { name: c.type };
      parts.push(`<div class="h-item"><div class="h-kind cardio">Cardio</div><div class="h-body"><div class="h-title">${ty.name}</div><span class="muted small">${c.minutes} min${c.km ? ` · ${fmt(num(c.km))} km` : ''}${c.hr ? ` · ${c.hr} bpm` : ''} · ≈ ${fmt(num(c.kcal), 0)} kcal${c.notes ? ' · ' + h(c.notes) : ''}</span></div></div>`);
    }
  }
  const wt = weightOn(d);
  if ((f === 'all' || f === 'poids') && wt) {
    parts.push(`<div class="h-item"><div class="h-kind poids">Pesée</div><div class="h-body"><div class="h-title">${fmt(num(wt.kg))} kg</div></div></div>`);
  }
  const meals = S.meals[d] || [];
  if ((f === 'all' || f === 'repas') && meals.length) {
    const tot = dayTotals(d);
    const names = meals.map((it) => { const r = it.kind === 'food' ? foodById(it.refId) : recipeById(it.refId); return r ? h(r.name) : '?'; });
    parts.push(`<div class="h-item"><div class="h-kind repas">Repas</div><div class="h-body"><div class="h-title">${macroLine(tot, true)} <button class="linklike" data-act="gotoMeals" data-date="${d}">ouvrir</button></div><span class="muted small">${names.join(', ')}</span></div></div>`);
  }
  return parts.join('');
}

function suiviHistory() {
  const dates = historyDates();
  const shown = dates.slice(0, ui.histDays);
  const filters = [['all', 'Tout'], ['muscu', 'Musculation'], ['cardio', 'Cardio'], ['poids', 'Pesées'], ['repas', 'Repas']];
  const nWorkouts = S.workouts.filter(workoutDone).length;
  const nMealDays = Object.values(S.meals).filter((l) => l.length).length;
  return `<div class="stats"><div class="stat"><span class="label">Séances muscu</span><span class="value">${nWorkouts}</span></div><div class="stat"><span class="label">Séances cardio</span><span class="value">${S.cardio.length}</span></div><div class="stat"><span class="label">Pesées</span><span class="value">${S.weights.length}</span></div><div class="stat"><span class="label">Jours de repas</span><span class="value">${nMealDays}</span></div></div>
  <div class="chips hist-filters">${filters.map(([id, l]) => `<button class="chip ${ui.histFilter === id ? 'active' : ''}" data-act="histFilter" data-f="${id}">${l}</button>`).join('')}</div>
  ${shown.map((d) => `<div class="card h-day"><h3 class="cap">${longDate(d)} <span class="muted small">${parse(d).getFullYear()}</span></h3>${historyDayHtml(d)}</div>`).join('') || '<div class="card"><p class="empty">Rien d’enregistré pour l’instant.</p></div>'}
  ${dates.length > shown.length ? `<button class="btn ghost big" data-act="histMore">Afficher plus (${dates.length - shown.length} jours restants)</button>` : ''}
  <div class="card"><h3>Exporter l’historique</h3><p class="muted small">Fichiers CSV lisibles dans Numbers ou Excel.</p>
    <div class="row-actions wrap"><button class="btn ghost small" data-act="csv" data-k="series">Séries de muscu</button><button class="btn ghost small" data-act="csv" data-k="cardio">Cardio</button><button class="btn ghost small" data-act="csv" data-k="poids">Pesées</button><button class="btn ghost small" data-act="csv" data-k="repas">Repas</button></div></div>`;
}

function csvFile(kind) {
  const rows = [];
  if (kind === 'series') {
    rows.push(['date', 'seance', 'exercice', 'categorie', 'serie', 'poids_kg', 'reps', '1rm_estime']);
    for (const w of [...S.workouts].sort((a, b) => a.date.localeCompare(b.date))) {
      for (const en of w.entries) {
        const ex = exById(en.exId);
        en.sets.filter((x) => x.done).forEach((x, i) => rows.push([w.date, w.name, ex ? ex.name : '?', ex ? ex.category : '', i + 1, num(x.w), num(x.r), Math.round(e1rm(num(x.w), num(x.r)) * 10) / 10]));
      }
    }
  } else if (kind === 'cardio') {
    rows.push(['date', 'activite', 'minutes', 'km', 'fc_moy', 'kcal', 'notes']);
    for (const c of [...S.cardio].sort((a, b) => a.date.localeCompare(b.date))) rows.push([c.date, (CARDIO_TYPES.find((x) => x.id === c.type) || { name: c.type }).name, c.minutes, c.km, c.hr, c.kcal, c.notes]);
  } else if (kind === 'poids') {
    rows.push(['date', 'poids_kg', 'moyenne_7j']);
    const avg = Object.fromEntries(movingAvg(S.weights).map((p) => [p.x, Math.round(p.y * 100) / 100]));
    for (const w of [...S.weights].sort((a, b) => a.date.localeCompare(b.date))) rows.push([w.date, num(w.kg), avg[w.date]]);
  } else {
    rows.push(['date', 'repas', 'type', 'nom', 'quantite', 'unite', ...NUTRIENTS.map((n) => n.key)]);
    for (const d of Object.keys(S.meals).sort()) {
      for (const it of S.meals[d]) {
        const r = it.kind === 'food' ? foodById(it.refId) : recipeById(it.refId);
        const m = itemMacros(it);
        rows.push([d, it.slot, it.kind === 'food' ? 'aliment' : 'recette', r ? r.name : '?', it.qty, it.unit, ...NUTRIENTS.map((n) => Math.round(m[n.key] * 10) / 10)]);
      }
    }
  }
  // Point-virgule + virgule décimale : format attendu par Numbers / Excel en français.
  const cell = (v) => { const t = typeof v === 'number' ? String(v).replace('.', ',') : String(v ?? ''); return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  return '﻿' + rows.map((r) => r.map(cell).join(';')).join('\n');
}

function download(name, content, type) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function suiviCal() {
  const [y, m] = ui.calMonth.split('-').map(Number);
  const first = `${ui.calMonth}-01`;
  const start = mondayOf(first);
  const cells = [];
  let stats = { done: 0, missed: 0, cardio: 0, weigh: 0 };
  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i);
    const inMonth = parse(d).getMonth() === m - 1;
    if (!inMonth && i >= 35) break;
    const st = dayStatus(d);
    if (inMonth) { stats.done += st.done ? 1 : 0; stats.missed += st.missed ? 1 : 0; stats.cardio += st.cardio.length; stats.weigh += st.weight ? 1 : 0; }
    const marks = [
      st.done ? '<span class="m done" title="Musculation faite">✓</span>' : st.missed ? '<span class="m missed" title="Séance manquée">✗</span>' : st.planned && !st.future ? '' : st.planned ? '<span class="m planned" title="Séance prévue">○</span>' : '',
      st.cardio.length ? '<span class="m cardio" title="Cardio">♥</span>' : '',
      st.weight ? '<span class="m weigh" title="Pesée">⚖</span>' : '',
      st.meals ? '<span class="m meals" title="Repas saisis">●</span>' : '',
    ].join('');
    cells.push(`<div class="cal-cell ${inMonth ? '' : 'out'} ${st.isToday ? 'today' : ''}"><span class="n">${parse(d).getDate()}</span><div class="marks">${marks}</div></div>`);
  }
  const label = parse(first).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  return `<div class="card"><div class="ex-head"><button class="icon-btn" data-act="calMonth" data-n="-1" aria-label="Mois précédent">‹</button><h2 class="cap">${label}</h2><button class="icon-btn" data-act="calMonth" data-n="1" aria-label="Mois suivant">›</button></div>
    <div class="cal">${['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((d) => `<div class="cal-h">${d}</div>`).join('')}${cells.join('')}</div>
    <div class="legend cal-legend"><span><b class="m done">✓</b> muscu faite</span><span><b class="m missed">✗</b> séance manquée</span><span><b class="m planned">○</b> prévue</span><span><b class="m cardio">♥</b> cardio</span><span><b class="m weigh">⚖</b> pesée</span><span><b class="m meals">●</b> repas saisis</span></div></div>
  <div class="stats"><div class="stat"><span class="label">Séances faites</span><span class="value">${stats.done}</span></div><div class="stat"><span class="label">Séances manquées</span><span class="value">${stats.missed}</span></div><div class="stat"><span class="label">Cardio</span><span class="value">${stats.cardio}</span></div><div class="stat"><span class="label">Pesées</span><span class="value">${stats.weigh}</span></div></div>`;
}

function suiviSettings() {
  const st = S.settings;
  const lastW = [...S.weights].sort((a, b) => b.date.localeCompare(a.date))[0];
  return `<div class="card"><h2>Objectifs nutritionnels quotidiens</h2><div class="grid-form">
    ${[['kcal', 'Calories (kcal)'], ['prot', 'Protéines (g)'], ['gluc', 'Glucides (g)'], ['lip', 'Lipides (g)'], ['fib', 'Fibres (g)']].map(([k, l]) => `<label class="field"><span>${l}</span><input inputmode="decimal" data-input="target" data-k="${k}" value="${st.targets[k]}"></label>`).join('')}</div></div>
  <div class="card"><h2>Calculateur de sèche</h2>
    <div class="grid-form">
      <label class="field"><span>Sexe</span><select data-input="setting" data-k="sex"><option value="F" ${st.sex === 'F' ? 'selected' : ''}>Femme</option><option value="H" ${st.sex === 'H' ? 'selected' : ''}>Homme</option></select></label>
      <label class="field"><span>Âge</span><input inputmode="numeric" data-input="setting" data-k="age" value="${st.age}"></label>
      <label class="field"><span>Taille (cm)</span><input inputmode="numeric" data-input="setting" data-k="height" value="${st.height}"></label>
      <label class="field"><span>Activité</span><select data-input="setting" data-k="activity">${[[1.375, 'Légère'], [1.55, 'Modérée (4 muscu + cardio)'], [1.725, 'Élevée'], [1.9, 'Très élevée']].map(([v, l]) => `<option value="${v}" ${num(st.activity) === v ? 'selected' : ''}>${l} (×${String(v).replace('.', ',')})</option>`).join('')}</select></label>
      <label class="field"><span>Déficit (%)</span><input inputmode="numeric" data-input="setting" data-k="deficit" value="${st.deficit}"></label>
    </div>
    <p class="muted small">Poids utilisé : ${lastW ? fmt(num(lastW.kg)) + ' kg (dernière pesée)' : 'aucune pesée — enregistre ton poids d’abord'}. Formule de Mifflin-St Jeor × niveau d’activité − déficit ; protéines 2,2 g/kg, lipides 25 % des calories, glucides = reste, fibres 14 g / 1000 kcal.</p>
    <button class="btn primary" data-act="calcTargets" ${lastW ? '' : 'disabled'}>Calculer et appliquer</button></div>
  <div class="card"><h2>Surcharge progressive</h2><label class="switch"><input type="checkbox" data-input="setting" data-k="confirmTwice" ${st.confirmTwice ? 'checked' : ''}><span>Exiger le haut de fourchette sur 2 séances de suite avant d’augmenter la charge (règle ACSM / NSCA « 2-for-2 », plus prudente)</span></label>
  <p class="muted small">Les fourchettes de répétitions et incréments se règlent par exercice dans Sport › Exercices. <a href="docs/surcharge-progressive.html" target="_blank" rel="noopener">Méthode et sources</a></p></div>
  <div class="card"><h2>Sauvegarde et iPhone ↔ iPad</h2><p class="muted small">Les données restent sur l’appareil (aucun compte, aucun serveur). Exporte régulièrement une sauvegarde dans Fichiers / iCloud Drive. ${st.lastExport ? 'Dernier export : ' + longDate(st.lastExport) + '.' : 'Aucun export pour l’instant.'}</p>
    <p class="muted small">Pour retrouver tes données sur l’autre appareil : <strong>Exporter</strong> ici → enregistrer dans iCloud Drive → sur l’autre appareil, <strong>Importer</strong> puis <strong>Fusionner</strong>.</p>
    <div class="row-actions wrap"><button class="btn primary" data-act="exportData">Exporter (JSON)</button><label class="btn ghost file-btn">Importer<input type="file" accept="application/json,.json" data-input="importFile" hidden></label><button class="btn danger" data-act="resetAll">Tout effacer</button></div></div>`;
}

// ---------- Après rendu : graphiques ----------
function afterRender() {
  const wc = $('#weight-chart');
  if (wc) {
    let pts = [...S.weights].sort((a, b) => a.date.localeCompare(b.date));
    const avg = movingAvg(pts);
    const from = ui.weightRange ? addDays(today(), -ui.weightRange) : '0000';
    pts = pts.filter((p) => p.date >= from);
    lineChart(wc, [
      { name: 'Pesée', color: 'var(--series-1)', points: pts.map((p) => ({ x: p.date, y: num(p.kg) })), dots: true, line: false },
      { name: 'Moyenne 7 j', color: 'var(--series-2)', points: avg.filter((p) => p.x >= from), dots: false },
    ], { unit: 'kg' });
  }
  const pc = $('#prog-chart');
  if (pc && ui.progEx) {
    const hist = exerciseHistory(S.workouts, ui.progEx);
    lineChart(pc, [
      { name: '1RM estimé', color: 'var(--series-1)', points: hist.map((s) => ({ x: s.date, y: sessionStats(s).e1rm })), dots: true },
      { name: 'Charge', color: 'var(--series-2)', points: hist.map((s) => { const st = sessionStats(s); return { x: s.date, y: st.top, label: `× ${Math.max(...st.topSets.map((x) => x.r))}` }; }), dots: true, line: false },
    ], { unit: 'kg' });
  }
}

// ---------- Dialogues ----------
const dlg = () => $('#dlg');
function openDialog(html) {
  $('#dlg-body').innerHTML = html;
  dlg().showModal();
}
function closeDialog() { if (dlg().open) dlg().close(); }

let pickerCb = null;
function openExercisePicker(cb) {
  pickerCb = cb;
  ui.pickCat = ui.pickCat || 'Tous';
  ui.pickQuery = '';
  openDialog(`<h2>Choisir un exercice</h2><input type="search" placeholder="Rechercher…" data-input="pickQuery" autofocus>
    <div class="chips" id="pick-cats"></div><ul class="list pick" id="pick-list"></ul>
    <div class="row-actions"><button class="btn ghost" data-act="exNew" data-from-picker="1">+ Créer un exercice</button><button class="btn" data-act="closeDialog">Fermer</button></div>`);
  renderPicker();
}
function renderPicker() {
  const cats = ['Tous', ...CATEGORIES];
  $('#pick-cats').innerHTML = cats.map((c) => `<button class="chip ${ui.pickCat === c ? 'active' : ''}" data-act="pickCat" data-c="${c}">${c}</button>`).join('');
  const q = (ui.pickQuery || '').toLowerCase();
  const list = S.exercises.filter((e) => (ui.pickCat === 'Tous' || e.category === ui.pickCat) && e.name.toLowerCase().includes(q)).sort(byName);
  $('#pick-list').innerHTML = list.map((e) => `<li><button data-act="pickEx" data-id="${e.id}"><strong>${h(e.name)}</strong><span class="muted small">${h(e.category)}</span></button></li>`).join('') || '<li class="empty">Aucun résultat.</li>';
}

function openExerciseForm(ex, fromPicker) {
  const e = ex || { name: '', category: ui.pickCat && ui.pickCat !== 'Tous' ? ui.pickCat : 'Fessiers', type: 'lower', ...TYPE_DEFAULTS.lower };
  const used = ex && S.workouts.some((w) => w.entries.some((en) => en.exId === ex.id));
  openDialog(`<h2>${ex ? 'Modifier' : 'Nouvel'} exercice</h2><form class="grid-form" data-form="exercise" data-id="${ex ? ex.id : ''}" data-from-picker="${fromPicker ? 1 : ''}">
    <label class="field wide"><span>Nom</span><input name="name" required value="${h(e.name)}"></label>
    <label class="field"><span>Catégorie</span><select name="category">${CATEGORIES.map((c) => `<option ${c === e.category ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
    <label class="field"><span>Type</span><select name="type" data-input="exType">${[['lower', 'Polyarticulaire bas du corps'], ['upper', 'Polyarticulaire haut du corps'], ['iso', 'Isolation']].map(([v, l]) => `<option value="${v}" ${v === e.type ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="field"><span>Reps min</span><input name="repMin" inputmode="numeric" value="${e.repMin}"></label>
    <label class="field"><span>Reps max</span><input name="repMax" inputmode="numeric" value="${e.repMax}"></label>
    <label class="field"><span>Incrément (kg)</span><input name="increment" inputmode="decimal" value="${String(e.increment).replace('.', ',')}"></label>
    <p class="muted small wide">Fourchettes conseillées : 6–10 reps sur les gros mouvements (hip thrust, squat…), 10–15 sur l’isolation. Incrément : la plus petite charge que tu peux ajouter (souvent 2,5 kg haut du corps, 5 kg bas du corps, 1 kg poulie/haltères).</p>
    <div class="row-actions wide"><button class="btn primary" type="submit">Enregistrer</button>${ex && !used ? '<button class="btn danger" type="button" data-act="exDel" data-id="' + ex.id + '">Supprimer</button>' : ''}<button class="btn ghost" type="button" data-act="closeDialog">Annuler</button></div></form>`);
}

function openFoodForm(f, prefill = '') {
  const x = f || { name: prefill, kcal: '', prot: '', gluc: '', sucres: '', lip: '', ags: '', fib: '', sel: '' };
  const used = f && S.recipes.some((r) => r.ingredients.some((i) => i.foodId === f.id));
  openDialog(`<h2>${f ? 'Modifier l’aliment' : 'Nouvel aliment'}</h2><form class="grid-form" data-form="food" data-id="${f ? f.id : ''}">
    <label class="field wide"><span>Nom</span><input name="name" required value="${h(x.name)}"></label>
    ${NUTRIENTS.map((n) => `<label class="field"><span>${n.label} (${n.unit}/100 g)</span><input name="${n.key}" inputmode="decimal" value="${x[n.key] === '' ? '' : String(x[n.key]).replace('.', ',')}" ${n.key === 'kcal' ? 'required' : ''}></label>`).join('')}
    <div class="row-actions wide"><button class="btn primary" type="submit">Enregistrer</button>${f && !used ? '<button class="btn danger" type="button" data-act="foodDel" data-id="' + f.id + '">Supprimer</button>' : ''}<button class="btn ghost" type="button" data-act="closeDialog">Annuler</button></div>
    ${used ? '<p class="muted small wide">Aliment utilisé dans une recette : il ne peut pas être supprimé.</p>' : ''}</form>`);
}

let pendingImport = null;
let offResults = [];
function openOff() {
  offResults = [];
  openDialog(`<h2>Chercher sur Open Food Facts</h2><form class="toolbar" data-form="off"><input type="search" name="q" placeholder="Nom du produit ou code-barres" required autofocus><button class="btn primary" type="submit">Chercher</button></form>
    <p class="muted small">Base collaborative : vérifie les valeurs avec l’étiquette. Nécessite une connexion internet.</p><ul class="list pick" id="off-list"></ul><div class="row-actions"><button class="btn" data-act="closeDialog">Fermer</button></div>`);
}
async function offSearch(q) {
  const list = $('#off-list');
  list.innerHTML = '<li class="empty">Recherche…</li>';
  const fields = 'product_name,product_name_fr,brands,nutriments,code';
  try {
    let products;
    if (/^\d{8,14}$/.test(q.trim())) {
      const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${q.trim()}.json?fields=${fields}`);
      const j = await r.json();
      products = j.product ? [j.product] : [];
    } else {
      const r = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=25&fields=${fields}`);
      const j = await r.json();
      products = j.products || [];
    }
    offResults = products.filter((p) => p.nutriments && (p.nutriments['energy-kcal_100g'] != null)).map((p) => {
      const n = p.nutriments;
      return {
        name: p.product_name_fr || p.product_name || 'Produit', brand: p.brands || '',
        kcal: +n['energy-kcal_100g'] || 0, prot: +n.proteins_100g || 0, gluc: +n.carbohydrates_100g || 0, sucres: +n.sugars_100g || 0,
        lip: +n.fat_100g || 0, ags: +n['saturated-fat_100g'] || 0, fib: +n.fiber_100g || 0, sel: +n.salt_100g || 0,
      };
    });
    list.innerHTML = offResults.map((f, i) => `<li><button data-act="offImport" data-i="${i}"><strong>${h(f.name)}</strong><span class="muted small">${h(f.brand)} · ${fmt(f.kcal, 0)} kcal · P ${fmt(f.prot)} · G ${fmt(f.gluc)} · L ${fmt(f.lip)} /100 g</span></button></li>`).join('') || '<li class="empty">Aucun produit trouvé.</li>';
  } catch (e) {
    list.innerHTML = '<li class="empty">Recherche impossible (hors ligne ?).</li>';
  }
}

let mealSlot = null;
function openMealPicker(slot) {
  mealSlot = slot;
  ui.mealPickTab = S.recipes.length ? 'recipes' : 'foods';
  ui.mealPickQuery = '';
  openDialog(`<h2>Ajouter au ${h(slot.toLowerCase())}</h2><div class="subnav" id="mp-tabs"></div><input type="search" placeholder="Rechercher…" data-input="mealPickQuery"><ul class="list pick" id="mp-list"></ul><div class="row-actions"><button class="btn" data-act="closeDialog">Terminé</button></div>`);
  renderMealPicker();
}
function renderMealPicker() {
  $('#mp-tabs').innerHTML = [['recipes', 'Mes recettes'], ['foods', 'Aliments']].map(([id, l]) => `<button class="${ui.mealPickTab === id ? 'active' : ''}" data-act="mpTab" data-t="${id}">${l}</button>`).join('');
  const q = (ui.mealPickQuery || '').toLowerCase();
  if (ui.mealPickTab === 'recipes') {
    const l = S.recipes.filter((r) => r.name.toLowerCase().includes(q)).sort(byName);
    $('#mp-list').innerHTML = l.map((r) => { const t = recipeTotals(r); return `<li class="mp-item"><div><strong>${h(r.name)}</strong><br><span class="muted small">1 portion : ${fmt(t.perPortion.kcal, 0)} kcal · P ${fmt(t.perPortion.prot)} · G ${fmt(t.perPortion.gluc)} · L ${fmt(t.perPortion.lip)}</span></div>
      <div class="row-actions"><input class="qty" inputmode="decimal" value="1" id="mpq-${r.id}"><select id="mpu-${r.id}"><option value="portion">portion(s)</option>${num(r.cookedWeight) ? '<option value="g">g</option>' : ''}</select><button class="btn primary small" data-act="mpAdd" data-kind="recipe" data-id="${r.id}">Ajouter</button></div></li>`; }).join('') || '<li class="empty">Aucune recette. Crée-en dans Repas › Recettes.</li>';
  } else {
    const l = S.foods.filter((f) => f.name.toLowerCase().includes(q)).sort(byName).slice(0, 60);
    $('#mp-list').innerHTML = l.map((f) => `<li class="mp-item"><div><strong>${h(f.name)}</strong><br><span class="muted small">${fmt(f.kcal, 0)} kcal · P ${fmt(f.prot)} · G ${fmt(f.gluc)} · L ${fmt(f.lip)} /100 g</span></div>
      <div class="row-actions"><input class="qty" inputmode="decimal" value="100" id="mpq-${f.id}"><span class="unit">g</span><button class="btn primary small" data-act="mpAdd" data-kind="food" data-id="${f.id}">Ajouter</button></div></li>`).join('') || '<li class="empty">Aucun aliment.</li>';
  }
}

// ---------- Actions (clics) ----------
function newWorkout(date, day) {
  const p = day === 'empty' ? { name: 'Séance libre', items: [] } : S.plan[day];
  const w = { id: uid(), date, planDay: day === 'empty' ? null : +day, name: p.name || DAY_NAMES[day], notes: '', entries: [] };
  for (const it of p.items) {
    if (!exById(it.exId)) continue;
    w.entries.push({ exId: it.exId, sets: Array.from({ length: Math.max(1, num(it.sets)) }, () => ({ w: '', r: '', done: false })) });
  }
  S.workouts.push(w);
  persist();
  return w;
}

const actions = {
  goto(el) { ui.tab = el.dataset.tab; if (el.dataset.view) ui[ui.tab + 'View'] = el.dataset.view; render(); window.scrollTo(0, 0); },
  view(el) { ui[el.dataset.tab + 'View'] = el.dataset.view; render(); },
  gotoMeals(el) { ui.tab = 'meals'; ui.mealsView = 'day'; ui.mealDate = el.dataset.date; render(); window.scrollTo(0, 0); },
  closeDialog: closeDialog,
  // Sport
  pickWorkoutDate(el) { ui.workoutDate = el.dataset.date; ui.tab = 'sport'; ui.sportView = 'today'; render(); },
  startWorkout(el) { newWorkout(ui.workoutDate, el.dataset.day); render(); },
  catchUp(el) { ui.workoutDate = today(); ui.sportView = 'today'; ui.tab = 'sport'; if (!workoutOn(today())) newWorkout(today(), el.dataset.day); else toast('Une séance existe déjà aujourd’hui.'); render(); },
  logPast(el) { ui.workoutDate = el.dataset.date; ui.sportView = 'today'; ui.tab = 'sport'; render(); },
  setDone(el) {
    const w = workoutOn(ui.workoutDate);
    const en = w.entries[+el.dataset.e];
    const s = en.sets[+el.dataset.s];
    if (!s.done) {
      const row = el.closest('tr');
      const [wi, ri] = row.querySelectorAll('input');
      if (s.w === '' || s.w == null) s.w = num(wi.placeholder) || '';
      if (s.r === '' || s.r == null) s.r = num(ri.placeholder) || '';
      if (!s.w || !s.r) { toast('Indique le poids et les répétitions.'); return; }
    }
    s.done = !s.done;
    persist(); render();
  },
  addSet(el) {
    const en = workoutOn(ui.workoutDate).entries[+el.dataset.e];
    const last = en.sets[en.sets.length - 1];
    en.sets.push({ w: last ? last.w : '', r: '', done: false });
    persist(); render();
  },
  delSet(el) { const en = workoutOn(ui.workoutDate).entries[+el.dataset.e]; en.sets.splice(+el.dataset.s, 1); persist(); render(); },
  delEntry(el) { if (!confirm('Retirer cet exercice de la séance ?')) return; workoutOn(ui.workoutDate).entries.splice(+el.dataset.e, 1); persist(); render(); },
  addExToWorkout() {
    openExercisePicker((id) => { workoutOn(ui.workoutDate).entries.push({ exId: id, sets: [0, 1, 2].map(() => ({ w: '', r: '', done: false })) }); persist(); render(); });
  },
  deleteWorkout() { if (!confirm('Supprimer toute la séance de ce jour ?')) return; S.workouts = S.workouts.filter((w) => w.date !== ui.workoutDate); persist(); render(); },
  delCardio(el) { if (!confirm('Supprimer cette séance de cardio ?')) return; S.cardio = S.cardio.filter((c) => c.id !== el.dataset.id); persist(); render(); },
  planMove(el) {
    const items = S.plan[el.dataset.d].items; const i = +el.dataset.i; const j = i + +el.dataset.dir;
    if (j < 0 || j >= items.length) return;
    [items[i], items[j]] = [items[j], items[i]]; persist(); render();
  },
  planDel(el) { S.plan[el.dataset.d].items.splice(+el.dataset.i, 1); persist(); render(); },
  planAddEx(el) { const d = el.dataset.d; openExercisePicker((id) => { S.plan[d].items.push({ exId: id, sets: 3 }); persist(); render(); }); },
  exNew(el) { openExerciseForm(null, el.dataset.fromPicker); },
  exEdit(el) { openExerciseForm(exById(el.dataset.id)); },
  exDel(el) {
    if (!confirm('Supprimer cet exercice de la banque ?')) return;
    S.exercises = S.exercises.filter((e) => e.id !== el.dataset.id);
    for (const p of Object.values(S.plan)) p.items = p.items.filter((i) => i.exId !== el.dataset.id);
    persist(); closeDialog(); render();
  },
  pickCat(el) { ui.pickCat = el.dataset.c; renderPicker(); },
  pickEx(el) { const cb = pickerCb; closeDialog(); if (cb) cb(el.dataset.id); },
  // Repas
  mealDay(el) { const n = +el.dataset.n; ui.mealDate = n === 0 ? today() : addDays(ui.mealDate, n); render(); },
  mealAdd(el) { openMealPicker(el.dataset.slot); },
  mpTab(el) { ui.mealPickTab = el.dataset.t; renderMealPicker(); },
  mpAdd(el) {
    const id = el.dataset.id;
    const qty = num($(`#mpq-${id}`).value);
    if (!qty) return;
    const unit = el.dataset.kind === 'food' ? 'g' : $(`#mpu-${id}`).value;
    (S.meals[ui.mealDate] ||= []).push({ id: uid(), slot: mealSlot, kind: el.dataset.kind, refId: id, qty, unit });
    persist(); render(); toast('Ajouté ✓');
  },
  mealDel(el) { S.meals[ui.mealDate] = (S.meals[ui.mealDate] || []).filter((i) => i.id !== el.dataset.id); persist(); render(); },
  copyDay() {
    const prev = S.meals[addDays(ui.mealDate, -1)] || [];
    if (!prev.length) { toast('Aucun repas la veille.'); return; }
    if ((S.meals[ui.mealDate] || []).length && !confirm('Ajouter les repas de la veille à ceux déjà saisis ?')) return;
    (S.meals[ui.mealDate] ||= []).push(...prev.map((i) => ({ ...i, id: uid() })));
    persist(); render();
  },
  slotAdd() { const n = prompt('Nom du repas (ex. Collation 2, Pré-training) :'); if (n && n.trim()) { S.mealSlots.push(n.trim()); persist(); render(); } },
  slotsEdit() {
    openDialog(`<h2>Repas de la journée</h2><ul class="list">${S.mealSlots.map((s, i) => `<li><span>${h(s)}</span><div class="row-actions"><button class="icon-btn" data-act="slotMove" data-i="${i}" data-dir="-1">↑</button><button class="icon-btn" data-act="slotMove" data-i="${i}" data-dir="1">↓</button><button class="icon-btn" data-act="slotDel" data-i="${i}">×</button></div></li>`).join('')}</ul><div class="row-actions"><button class="btn" data-act="closeDialog">Fermer</button></div>`);
  },
  slotMove(el) { const i = +el.dataset.i; const j = i + +el.dataset.dir; if (j < 0 || j >= S.mealSlots.length) return; [S.mealSlots[i], S.mealSlots[j]] = [S.mealSlots[j], S.mealSlots[i]]; persist(); actions.slotsEdit(); render(); },
  slotDel(el) { S.mealSlots.splice(+el.dataset.i, 1); persist(); actions.slotsEdit(); render(); },
  recipeNew() { ui.recipeDraft = { id: uid(), name: '', category: '', portions: 1, cookedWeight: '', ingredients: [], notes: '' }; ui.ingQuery = ''; ui.mealsView = 'recipeEdit'; render(); window.scrollTo(0, 0); },
  recipeEdit(el) { ui.recipeDraft = structuredClone(recipeById(el.dataset.id)); ui.ingQuery = ''; ui.mealsView = 'recipeEdit'; render(); window.scrollTo(0, 0); },
  recipeDup(el) { const r = structuredClone(recipeById(el.dataset.id)); r.id = uid(); r.name += ' (copie)'; S.recipes.push(r); persist(); render(); },
  ingAdd(el) { ui.recipeDraft.ingredients.push({ foodId: el.dataset.id, g: 100 }); ui.ingQuery = ''; render(); const inputs = document.querySelectorAll('[data-input="ingG"]'); const last = inputs[inputs.length - 1]; if (last) { last.focus(); last.select(); } },
  ingDel(el) { ui.recipeDraft.ingredients.splice(+el.dataset.i, 1); render(); },
  recipeSave() {
    const r = ui.recipeDraft;
    if (!r.name.trim()) { toast('Donne un nom à la recette.'); return; }
    r.portions = Math.max(1, num(r.portions) || 1);
    const i = S.recipes.findIndex((x) => x.id === r.id);
    if (i >= 0) S.recipes[i] = r; else S.recipes.push(r);
    ui.recipeDraft = null; ui.mealsView = 'recipes'; persist(); render(); toast('Recette enregistrée ✓');
  },
  recipeCancel() { ui.recipeDraft = null; ui.mealsView = 'recipes'; render(); },
  recipeDel() {
    const id = ui.recipeDraft.id;
    const used = Object.values(S.meals).some((l) => l.some((i) => i.refId === id));
    if (!confirm(used ? 'Cette recette est utilisée dans des repas passés (ils afficheront « supprimé »). Supprimer quand même ?' : 'Supprimer cette recette ?')) return;
    S.recipes = S.recipes.filter((r) => r.id !== id); ui.recipeDraft = null; ui.mealsView = 'recipes'; persist(); render();
  },
  foodNew(el) { openFoodForm(null, el.dataset.prefill || ''); },
  foodEdit(el) { openFoodForm(foodById(el.dataset.id)); },
  foodDel(el) { if (!confirm('Supprimer cet aliment ?')) return; S.foods = S.foods.filter((f) => f.id !== el.dataset.id); persist(); closeDialog(); render(); },
  offOpen() { openOff(); },
  offImport(el) {
    const f = { id: uid(), ...offResults[+el.dataset.i] };
    S.foods.push(f); persist(); toast(`« ${f.name} » ajouté aux aliments ✓`); el.disabled = true; render();
  },
  // Suivi
  weightDel(el) { if (!confirm('Supprimer cette pesée ?')) return; S.weights = S.weights.filter((w) => w.date !== el.dataset.date); persist(); render(); },
  weightRange(el) { ui.weightRange = +el.dataset.n; render(); },
  progPick(el) { ui.progEx = el.dataset.id; render(); window.scrollTo(0, 0); },
  calMonth(el) { const d = parse(ui.calMonth + '-01'); d.setMonth(d.getMonth() + +el.dataset.n); ui.calMonth = iso(d).slice(0, 7); render(); },
  calcTargets() {
    const st = S.settings;
    const lastW = [...S.weights].sort((a, b) => b.date.localeCompare(a.date))[0];
    const kg = num(lastW.kg);
    const bmr = 10 * kg + 6.25 * num(st.height) - 5 * num(st.age) + (st.sex === 'H' ? 5 : -161);
    const kcal = Math.round((bmr * num(st.activity) * (1 - num(st.deficit) / 100)) / 10) * 10;
    const prot = Math.round(kg * 2.2);
    const lip = Math.round((kcal * 0.25) / 9);
    const gluc = Math.max(0, Math.round((kcal - prot * 4 - lip * 9) / 4));
    const fib = Math.round((kcal / 1000) * 14);
    st.targets = { kcal, prot, gluc, lip, fib };
    persist(); render(); toast(`Objectifs : ${kcal} kcal · P ${prot} g · G ${gluc} g · L ${lip} g`);
  },
  exportData() {
    download(`seche-sauvegarde-${today()}.json`, JSON.stringify(S, null, 1), 'application/json');
    S.settings.lastExport = today(); persist(); render();
  },
  csv(el) { download(`seche-${el.dataset.k}-${today()}.csv`, csvFile(el.dataset.k), 'text/csv;charset=utf-8'); },
  histFilter(el) { ui.histFilter = el.dataset.f; ui.histDays = 30; render(); },
  histMore() { ui.histDays += 30; render(); },
  importMerge() { S = mergeStates(S, pendingImport); pendingImport = null; persist(); closeDialog(); render(); toast('Données fusionnées ✓'); },
  importReplace() {
    if (!confirm('Remplacer toutes les données de cet appareil par la sauvegarde ?')) return;
    save(pendingImport); S = load(); pendingImport = null; closeDialog(); render(); toast('Sauvegarde importée ✓');
  },
  resetAll() {
    if (!confirm('Effacer TOUTES les données (séances, repas, pesées, recettes) ? Pense à exporter avant.')) return;
    if (!confirm('Vraiment tout effacer ? Cette action est définitive.')) return;
    reset(); S = load(); persist(); render();
  },
};

// ---------- Saisies (input / change) ----------
const inputs = {
  workoutDate(el) { if (el.value) { ui.workoutDate = el.value; render(); } },
  set(el) {
    const s = workoutOn(ui.workoutDate).entries[+el.dataset.e].sets[+el.dataset.s];
    s[el.dataset.f] = el.value === '' ? '' : num(el.value);
    persist();
  },
  workoutNote(el) { workoutOn(ui.workoutDate).notes = el.value; persist(); },
  planActive(el) { S.plan[el.dataset.d].active = el.checked; if (el.checked && !S.plan[el.dataset.d].name) S.plan[el.dataset.d].name = DAY_NAMES[el.dataset.d]; persist(); render(); },
  planName(el) { S.plan[el.dataset.d].name = el.value; persist(); },
  planSets(el) { S.plan[el.dataset.d].items[+el.dataset.i].sets = Math.max(1, Math.round(num(el.value)) || 1); persist(); },
  bankQuery(el) { ui.bankQuery = el.value; rerenderKeepFocus(); },
  recipeQuery(el) { ui.recipeQuery = el.value; rerenderKeepFocus(); },
  foodQuery(el) { ui.foodQuery = el.value; rerenderKeepFocus(); },
  ingQuery(el) { ui.ingQuery = el.value; rerenderKeepFocus(); },
  pickQuery(el) { ui.pickQuery = el.value; renderPicker(); },
  mealPickQuery(el) { ui.mealPickQuery = el.value; renderMealPicker(); },
  mealDate(el) { if (el.value) { ui.mealDate = el.value; render(); } },
  mealQty(el) {
    const it = (S.meals[ui.mealDate] || []).find((i) => i.id === el.dataset.id);
    if (!it || !(num(el.value) > 0)) return;
    it.qty = num(el.value); persist();
    // Mise à jour ciblée (un re-rendu complet au blur avalerait le prochain toucher)
    $(`#im-${it.id}`).innerHTML = macroLine(itemMacros(it), true);
    const si = daySlots(ui.mealDate).indexOf(it.slot);
    const sum = $(`#slot-sum-${si}`);
    if (sum) sum.innerHTML = macroLine(slotTotals(ui.mealDate, it.slot), true);
    $('#day-totals').innerHTML = dayTotalsHtml(ui.mealDate);
  },
  rField(el) {
    ui.recipeDraft[el.dataset.f] = el.value;
    if (['portions', 'cookedWeight'].includes(el.dataset.f)) $('#recipe-totals').innerHTML = recipeTotalsHtml(recipeTotals(ui.recipeDraft));
  },
  ingG(el) {
    const ing = ui.recipeDraft.ingredients[+el.dataset.i];
    ing.g = num(el.value);
    const f = foodById(ing.foodId);
    const row = $(`#ing-${el.dataset.i}`);
    if (f && row) {
      row.querySelectorAll('td').forEach((td, k) => { if (k >= 2 && k <= 6) td.remove(); });
      row.children[1].insertAdjacentHTML('afterend', ingCells(addInto(ZERO(), f, ing.g)));
    }
    $('#recipe-totals').innerHTML = recipeTotalsHtml(recipeTotals(ui.recipeDraft));
  },
  progEx(el) { ui.progEx = el.value; render(); },
  target(el) { S.settings.targets[el.dataset.k] = num(el.value); persist(); },
  setting(el) { S.settings[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.tagName === 'SELECT' && el.dataset.k === 'sex' ? el.value : num(el.value); persist(); },
  exType(el) {
    const d = TYPE_DEFAULTS[el.value]; const f = el.form;
    f.repMin.value = d.repMin; f.repMax.value = d.repMax; f.increment.value = String(d.increment).replace('.', ',');
  },
  importFile(el) {
    const file = el.files[0];
    if (!file) return;
    file.text().then((txt) => {
      const obj = JSON.parse(txt);
      if (!validateImport(obj)) throw new Error('format');
      pendingImport = obj;
      el.value = '';
      const n = (obj.workouts || []).length;
      openDialog(`<h2>Importer une sauvegarde</h2><p>Fichier : <strong>${h(file.name)}</strong><br><span class="muted small">${n} séance(s), ${(obj.cardio || []).length} cardio, ${(obj.weights || []).length} pesée(s), ${(obj.recipes || []).length} recette(s).</span></p>
        <p><strong>Fusionner</strong> ajoute les données du fichier à celles de cet appareil, sans rien effacer. C’est le bon choix pour passer de l’iPhone à l’iPad (et inversement).</p>
        <div class="row-actions"><button class="btn primary" data-act="importMerge">Fusionner</button><button class="btn danger" data-act="importReplace">Remplacer tout</button><button class="btn ghost" data-act="closeDialog">Annuler</button></div>`);
    }).catch(() => toast('Fichier de sauvegarde invalide.'));
  },
};

// Champs qui re-rendent au clavier : on garde le focus et le curseur.
function rerenderKeepFocus() {
  const a = document.activeElement;
  const key = a && a.dataset.input;
  const pos = a && a.selectionStart;
  render();
  if (key) {
    const n = document.querySelector(`[data-input="${key}"]`);
    if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) { /* type=search */ } }
  }
}

// ---------- Formulaires ----------
const forms = {
  cardio(f) {
    const fd = Object.fromEntries(new FormData(f));
    const minutes = num(fd.minutes);
    if (!minutes) return;
    const lastW = [...S.weights].sort((a, b) => b.date.localeCompare(a.date))[0];
    const met = (CARDIO_TYPES.find((c) => c.id === fd.type) || { met: 5 }).met;
    const kcal = num(fd.kcal) || Math.round(met * (lastW ? num(lastW.kg) : 60) * (minutes / 60));
    S.cardio.push({ id: uid(), date: fd.date || today(), type: fd.type, minutes, km: num(fd.km) || '', hr: num(fd.hr) || '', kcal, notes: fd.notes || '' });
    persist(); render(); toast('Cardio enregistré ✓');
  },
  weight(f) {
    const fd = Object.fromEntries(new FormData(f));
    const kg = num(fd.kg);
    if (kg < 25 || kg > 300) { toast('Poids invalide.'); return; }
    const date = fd.date || today();
    S.weights = S.weights.filter((w) => w.date !== date);
    S.weights.push({ date, kg });
    persist(); render(); toast('Pesée enregistrée ✓');
  },
  exercise(f) {
    const fd = Object.fromEntries(new FormData(f));
    const data = {
      name: fd.name.trim(), category: fd.category, type: fd.type,
      repMin: Math.max(1, Math.round(num(fd.repMin))), repMax: Math.max(1, Math.round(num(fd.repMax))), increment: num(fd.increment) || 1,
    };
    if (data.repMax <= data.repMin) data.repMax = data.repMin + 2;
    let ex;
    if (f.dataset.id) { ex = exById(f.dataset.id); Object.assign(ex, data); } else { ex = { id: uid(), ...data }; S.exercises.push(ex); }
    persist();
    if (f.dataset.fromPicker && pickerCb) { const cb = pickerCb; closeDialog(); cb(ex.id); } else { closeDialog(); render(); }
  },
  food(f) {
    const fd = Object.fromEntries(new FormData(f));
    const data = { name: fd.name.trim() };
    for (const n of NUTRIENTS) data[n.key] = num(fd[n.key]);
    if (f.dataset.id) Object.assign(foodById(f.dataset.id), data);
    else {
      const food = { id: uid(), ...data };
      S.foods.push(food);
      if (ui.mealsView === 'recipeEdit' && ui.recipeDraft) { ui.recipeDraft.ingredients.push({ foodId: food.id, g: 100 }); ui.ingQuery = ''; }
    }
    persist(); closeDialog(); render();
  },
  off(f) { offSearch(new FormData(f).get('q')); },
};

// ---------- Démarrage ----------
function bind() {
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act]');
    if (t && actions[t.dataset.act]) { e.preventDefault(); actions[t.dataset.act](t, e); }
  });
  document.addEventListener('input', (e) => {
    const t = e.target.closest('[data-input]');
    if (!t || t.type === 'file' || t.type === 'checkbox' || t.tagName === 'SELECT' || t.type === 'date') return;
    inputs[t.dataset.input]?.(t, e);
  });
  document.addEventListener('change', (e) => {
    const t = e.target.closest('[data-input]');
    if (!t) return;
    if (t.type === 'file' || t.type === 'checkbox' || t.tagName === 'SELECT' || t.type === 'date') inputs[t.dataset.input]?.(t, e);
  });
  document.addEventListener('submit', (e) => {
    const f = e.target.closest('[data-form]');
    if (!f) return;
    e.preventDefault();
    forms[f.dataset.form]?.(f);
  });
  document.querySelectorAll('.tabbar button').forEach((b) => b.addEventListener('click', () => {
    if (ui.tab === b.dataset.tab) { window.scrollTo({ top: 0, behavior: 'smooth' }); }
    ui.tab = b.dataset.tab; render();
  }));
  dlg().addEventListener('click', (e) => { if (e.target === dlg()) closeDialog(); });
  // Nouveau jour pendant que l'app est ouverte (iPad en veille la nuit)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && ui.day !== today()) {
      if (ui.workoutDate === ui.day) ui.workoutDate = today();
      if (ui.mealDate === ui.day) ui.mealDate = today();
      ui.day = today();
      render();
    }
  });
  let rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(afterRender, 150); });
}

bind();
render();
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
