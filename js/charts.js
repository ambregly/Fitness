// Graphiques SVG sans dépendance, avec info-bulle au toucher.
// lineChart : series [{name, color, points:[{x:'AAAA-MM-JJ', y, label?}], dots, line}]
// barChart  : days [{x:'AAAA-MM-JJ', y:number|null, tip?:html}], une barre par jour.
// Option commune : xMin / xMax ('AAAA-MM-JJ') pour fixer la période affichée.

const NS = 'http://www.w3.org/2000/svg';
const DAY = 86400000;

const toTime = (x) => (x instanceof Date ? x.getTime() : new Date(x + 'T12:00:00').getTime());
const fmtNum = (v, d = 1) => String(Math.round(v * 10 ** d) / 10 ** d).replace('.', ',');
const longTip = (t) => new Date(t).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

function el(name, attrs = {}, parent) {
  const n = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
}

function niceStep(range, target) {
  const raw = range / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
}

// Graduations de l'axe du temps adaptées à la durée affichée.
function timeTicks(tMin, tMax, width) {
  const span = (tMax - tMin) / DAY;
  const ticks = [];
  const d = new Date(tMin); d.setHours(12, 0, 0, 0);
  if (span <= 10) {
    for (; d.getTime() <= tMax + 1; d.setDate(d.getDate() + 1)) {
      ticks.push({ t: d.getTime(), label: d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' }) });
    }
  } else if (span <= 100) {
    while (d.getDay() !== 1) d.setDate(d.getDate() + 1); // lundis
    for (; d.getTime() <= tMax + 1; d.setDate(d.getDate() + 7)) {
      ticks.push({ t: d.getTime(), label: d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) });
    }
  } else {
    d.setDate(1); if (d.getTime() < tMin - DAY) d.setMonth(d.getMonth() + 1);
    for (; d.getTime() <= tMax + 1; d.setMonth(d.getMonth() + 1)) {
      ticks.push({ t: d.getTime(), label: d.toLocaleDateString('fr-FR', { month: 'short' }) });
    }
  }
  // Évite les étiquettes qui se chevauchent sur petit écran.
  const maxLabels = Math.max(2, Math.floor(width / 58));
  const every = Math.ceil(ticks.length / maxLabels);
  return ticks.filter((_, i) => i % every === 0);
}

function frame(container, height) {
  container.innerHTML = '';
  const width = Math.max(300, container.clientWidth || 600);
  const m = { top: 16, right: 12, bottom: 28, left: 44 };
  return { width, height, m, w: width - m.left - m.right, h: height - m.top - m.bottom };
}

function yAxis(svg, f, yMin, yMax, step, Y) {
  const grid = el('g', { class: 'grid' }, svg);
  for (let v = yMin; v <= yMax + 1e-9; v += step) {
    el('line', { x1: f.m.left, x2: f.width - f.m.right, y1: Y(v), y2: Y(v) }, grid);
    const t = el('text', { x: f.m.left - 6, y: Y(v) + 4, 'text-anchor': 'end', class: 'axis-label' }, grid);
    t.textContent = fmtNum(v, step < 1 ? 1 : 0);
  }
  return grid;
}

function xAxis(grid, f, tMin, tMax, X) {
  for (const tk of timeTicks(tMin, tMax, f.w)) {
    const tx = el('text', { x: X(tk.t), y: f.height - 8, 'text-anchor': 'middle', class: 'axis-label' }, grid);
    tx.textContent = tk.label;
  }
}

function tooltip(container, svg) {
  container.style.position = 'relative';
  container.appendChild(svg);
  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  tip.hidden = true;
  container.appendChild(tip);
  return tip;
}

function placeTip(tip, svg, x, width) {
  const r = svg.getBoundingClientRect();
  const left = (x / width) * r.width;
  tip.hidden = false;
  tip.style.left = `${Math.min(Math.max(left - tip.offsetWidth / 2, 0), r.width - tip.offsetWidth)}px`;
  tip.style.top = '0px';
}

function pointerT(ev, svg, f, tMin, tMax) {
  const r = svg.getBoundingClientRect();
  const px = ((ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left) * (f.width / r.width);
  return tMin + ((px - f.m.left) / f.w) * (tMax - tMin);
}

export function lineChart(container, series, { unit = 'kg', height = 260, decimals = 1, xMin, xMax, empty = 'Pas encore de données.' } = {}) {
  const f = frame(container, height);
  const all = series.flatMap((s) => s.points.map((p) => ({ t: toTime(p.x), y: p.y })));
  if (!all.length) { container.innerHTML = `<p class="empty chart-empty">${empty}</p>`; return; }

  let tMin = xMin ? toTime(xMin) : Math.min(...all.map((p) => p.t));
  let tMax = xMax ? toTime(xMax) : Math.max(...all.map((p) => p.t));
  if (tMax - tMin < DAY * 6) { const c = (tMin + tMax) / 2; tMin = c - DAY * 3.5; tMax = c + DAY * 3.5; }
  const padT = (tMax - tMin) * 0.02;
  tMin -= padT; tMax += padT;
  let yMin = Math.min(...all.map((p) => p.y));
  let yMax = Math.max(...all.map((p) => p.y));
  const pad = Math.max((yMax - yMin) * 0.12, 0.5);
  yMin -= pad; yMax += pad;
  const step = niceStep(yMax - yMin, 5);
  yMin = Math.floor(yMin / step) * step;
  yMax = Math.ceil(yMax / step) * step;

  const X = (t) => f.m.left + ((t - tMin) / (tMax - tMin)) * f.w;
  const Y = (v) => f.m.top + (1 - (v - yMin) / (yMax - yMin)) * f.h;
  const svg = el('svg', { viewBox: `0 0 ${f.width} ${height}`, width: '100%', height, role: 'img', class: 'chart' });
  const grid = yAxis(svg, f, yMin, yMax, step, Y);
  xAxis(grid, f, tMin, tMax, X);

  const sorted = series.map((s) => s.points.map((p) => ({ t: toTime(p.x), y: p.y, label: p.label })).sort((a, b) => a.t - b.t));
  sorted.forEach((pts, i) => {
    const s = series[i];
    if (s.line !== false && pts.length > 1) {
      el('path', {
        d: pts.map((p, k) => `${k ? 'L' : 'M'}${X(p.t).toFixed(1)},${Y(p.y).toFixed(1)}`).join(''),
        fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
      }, svg);
    }
    // Beaucoup de points (vue 6 mois / 1 an) : points plus petits pour garder la courbe lisible.
    const r = pts.length > 60 ? 2 : pts.length > 25 ? 3 : 4;
    if (s.dots) for (const p of pts) el('circle', { cx: X(p.t), cy: Y(p.y), r, fill: s.color, stroke: r > 2 ? 'var(--surface)' : 'none', 'stroke-width': 1.5 }, svg);
  });

  const cross = el('line', { y1: f.m.top, y2: f.m.top + f.h, class: 'crosshair', visibility: 'hidden' }, svg);
  const hoverDots = series.map((s) => el('circle', { r: 6, fill: s.color, stroke: 'var(--surface)', 'stroke-width': 2, visibility: 'hidden' }, svg));
  const hit = el('rect', { x: f.m.left, y: f.m.top, width: f.w, height: f.h, fill: 'transparent' }, svg);
  const tip = tooltip(container, svg);

  const move = (ev) => {
    const t = pointerT(ev, svg, f, tMin, tMax);
    let ref = null;
    for (const pts of sorted) for (const p of pts) if (!ref || Math.abs(p.t - t) < Math.abs(ref.t - t)) ref = p;
    if (!ref) return;
    cross.setAttribute('x1', X(ref.t)); cross.setAttribute('x2', X(ref.t));
    cross.setAttribute('visibility', 'visible');
    const lines = [`<strong>${longTip(ref.t)}</strong>`];
    sorted.forEach((pts, i) => {
      const p = pts.find((q) => Math.abs(q.t - ref.t) < DAY / 2);
      if (p) {
        hoverDots[i].setAttribute('cx', X(p.t)); hoverDots[i].setAttribute('cy', Y(p.y));
        hoverDots[i].setAttribute('visibility', 'visible');
        lines.push(`${series.length > 1 ? `<span class="swatch" style="background:${series[i].color}"></span>${series[i].name} : ` : ''}<strong>${fmtNum(p.y, decimals)} ${unit}</strong>${p.label ? ` <span class="muted">${p.label}</span>` : ''}`);
      } else hoverDots[i].setAttribute('visibility', 'hidden');
    });
    tip.innerHTML = lines.join('<br>');
    placeTip(tip, svg, X(ref.t), f.width);
  };
  const leave = () => {
    tip.hidden = true;
    cross.setAttribute('visibility', 'hidden');
    hoverDots.forEach((d) => d.setAttribute('visibility', 'hidden'));
  };
  hit.addEventListener('pointermove', move);
  hit.addEventListener('pointerdown', move);
  hit.addEventListener('pointerleave', leave);
}

export function barChart(container, days, { unit = 'kcal', height = 240, target = 0, xMin, xMax, empty = 'Aucune donnée.' } = {}) {
  const f = frame(container, height);
  const vals = days.filter((d) => d.y != null && d.y > 0);
  if (!vals.length) { container.innerHTML = `<p class="empty chart-empty">${empty}</p>`; return; }
  const t0 = toTime(xMin || days[0].x);
  const t1 = toTime(xMax || days[days.length - 1].x);
  const n = Math.round((t1 - t0) / DAY) + 1;
  const tMin = t0 - DAY / 2;
  const tMax = t1 + DAY / 2;
  let yMax = Math.max(target || 0, ...vals.map((d) => d.y)) * 1.1;
  const step = niceStep(yMax, 4);
  yMax = Math.ceil(yMax / step) * step;
  const X = (t) => f.m.left + ((t - tMin) / (tMax - tMin)) * f.w;
  const Y = (v) => f.m.top + (1 - v / yMax) * f.h;
  const band = f.w / n;
  const bw = Math.max(1, Math.min(28, band - (band > 4 ? 2 : 0.5)));

  const svg = el('svg', { viewBox: `0 0 ${f.width} ${height}`, width: '100%', height, role: 'img', class: 'chart' });
  const grid = yAxis(svg, f, 0, yMax, step, Y);
  xAxis(grid, f, tMin, tMax, X);
  const bars = el('g', {}, svg);
  const rects = new Map();
  for (const d of vals) {
    const x = X(toTime(d.x)) - bw / 2;
    const y = Y(d.y);
    const hgt = f.m.top + f.h - y;
    const r = Math.min(4, bw / 2, hgt);
    // Coins arrondis uniquement en haut, la barre reste posée sur l'axe.
    const path = `M${x},${y + hgt}V${y + r}Q${x},${y} ${x + r},${y}H${x + bw - r}Q${x + bw},${y} ${x + bw},${y + r}V${y + hgt}Z`;
    rects.set(d.x, el('path', { d: path, fill: 'var(--series-1)', class: 'bar-mark' }, bars));
  }
  if (target) {
    el('line', { x1: f.m.left, x2: f.width - f.m.right, y1: Y(target), y2: Y(target), class: 'target-line' }, svg);
    const lbl = el('text', { x: f.width - f.m.right, y: Y(target) - 5, 'text-anchor': 'end', class: 'target-label' }, svg);
    lbl.textContent = `objectif ${fmtNum(target, 0)}`;
  }
  const hit = el('rect', { x: f.m.left, y: f.m.top, width: f.w, height: f.h, fill: 'transparent' }, svg);
  const tip = tooltip(container, svg);
  let active = null;
  const move = (ev) => {
    const t = pointerT(ev, svg, f, tMin, tMax);
    let ref = null;
    for (const d of vals) if (!ref || Math.abs(toTime(d.x) - t) < Math.abs(toTime(ref.x) - t)) ref = d;
    if (!ref) return;
    if (active) active.classList.remove('active');
    active = rects.get(ref.x); active.classList.add('active');
    tip.innerHTML = `<strong>${longTip(toTime(ref.x))}</strong><br><strong>${fmtNum(ref.y, 0)} ${unit}</strong>${target ? ` <span class="muted">(${ref.y > target ? '+' : ''}${fmtNum(ref.y - target, 0)} vs objectif)</span>` : ''}${ref.tip ? '<br>' + ref.tip : ''}`;
    placeTip(tip, svg, X(toTime(ref.x)), f.width);
  };
  hit.addEventListener('pointermove', move);
  hit.addEventListener('pointerdown', move);
  hit.addEventListener('pointerleave', () => { tip.hidden = true; if (active) active.classList.remove('active'); });
}
