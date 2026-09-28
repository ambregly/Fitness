// Petit graphique en courbes SVG sans dépendance, avec info-bulle au toucher.
// series : [{name, color:'var(--series-1)', points:[{x:Date|string, y:number}], dots:boolean, line:boolean}]

const NS = 'http://www.w3.org/2000/svg';
const DAY = 86400000;

const toTime = (x) => (x instanceof Date ? x.getTime() : new Date(x + 'T12:00:00').getTime());
const fmtDate = (t) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
const fmtNum = (v, d = 1) => String(Math.round(v * 10 ** d) / 10 ** d).replace('.', ',');

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

export function lineChart(container, series, { unit = 'kg', height = 260, decimals = 1 } = {}) {
  container.innerHTML = '';
  const all = series.flatMap((s) => s.points.map((p) => ({ t: toTime(p.x), y: p.y })));
  if (!all.length) {
    container.innerHTML = '<p class="empty">Pas encore de données.</p>';
    return;
  }
  const width = Math.max(320, container.clientWidth || 600);
  const m = { top: 16, right: 16, bottom: 28, left: 44 };
  const w = width - m.left - m.right;
  const h = height - m.top - m.bottom;

  let tMin = Math.min(...all.map((p) => p.t));
  let tMax = Math.max(...all.map((p) => p.t));
  if (tMax - tMin < DAY * 6) { tMin -= DAY * 3; tMax += DAY * 3; }
  let yMin = Math.min(...all.map((p) => p.y));
  let yMax = Math.max(...all.map((p) => p.y));
  const pad = Math.max((yMax - yMin) * 0.12, 0.5);
  yMin -= pad; yMax += pad;
  const step = niceStep(yMax - yMin, 5);
  yMin = Math.floor(yMin / step) * step;
  yMax = Math.ceil(yMax / step) * step;

  const X = (t) => m.left + ((t - tMin) / (tMax - tMin)) * w;
  const Y = (v) => m.top + (1 - (v - yMin) / (yMax - yMin)) * h;

  const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, width: '100%', height, role: 'img', class: 'chart' });
  const grid = el('g', { class: 'grid' }, svg);
  for (let v = yMin; v <= yMax + 1e-9; v += step) {
    el('line', { x1: m.left, x2: width - m.right, y1: Y(v), y2: Y(v) }, grid);
    const t = el('text', { x: m.left - 6, y: Y(v) + 4, 'text-anchor': 'end', class: 'axis-label' }, grid);
    t.textContent = fmtNum(v, step < 1 ? 1 : 0);
  }
  const nTicks = Math.min(6, Math.max(2, Math.floor(w / 110)));
  for (let i = 0; i <= nTicks; i++) {
    const t = tMin + ((tMax - tMin) * i) / nTicks;
    const tx = el('text', { x: X(t), y: height - 8, 'text-anchor': i === 0 ? 'start' : i === nTicks ? 'end' : 'middle', class: 'axis-label' }, grid);
    tx.textContent = fmtDate(t);
  }

  for (const s of series) {
    const pts = s.points.map((p) => ({ t: toTime(p.x), y: p.y })).sort((a, b) => a.t - b.t);
    if (s.line !== false && pts.length > 1) {
      el('path', {
        d: pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)},${Y(p.y).toFixed(1)}`).join(''),
        fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
      }, svg);
    }
    if (s.dots) {
      for (const p of pts) {
        el('circle', { cx: X(p.t), cy: Y(p.y), r: 4, fill: s.color, stroke: 'var(--surface)', 'stroke-width': 2 }, svg);
      }
    }
  }

  // Couche d'interaction : réticule + info-bulle
  const cross = el('line', { y1: m.top, y2: m.top + h, class: 'crosshair', visibility: 'hidden' }, svg);
  const hoverDots = series.map((s) => el('circle', { r: 5, fill: s.color, stroke: 'var(--surface)', 'stroke-width': 2, visibility: 'hidden' }, svg));
  const hit = el('rect', { x: m.left, y: m.top, width: w, height: h, fill: 'transparent' }, svg);
  container.style.position = 'relative';
  container.appendChild(svg);
  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  tip.hidden = true;
  container.appendChild(tip);

  const sorted = series.map((s) => s.points.map((p) => ({ t: toTime(p.x), y: p.y, label: p.label })).sort((a, b) => a.t - b.t));
  const move = (ev) => {
    const r = svg.getBoundingClientRect();
    const px = ((ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left) * (width / r.width);
    const t = tMin + ((px - m.left) / w) * (tMax - tMin);
    // point le plus proche sur la première série non vide
    let ref = null;
    for (const pts of sorted) {
      for (const p of pts) if (!ref || Math.abs(p.t - t) < Math.abs(ref.t - t)) ref = p;
    }
    if (!ref) return;
    cross.setAttribute('x1', X(ref.t)); cross.setAttribute('x2', X(ref.t));
    cross.setAttribute('visibility', 'visible');
    const lines = [`<strong>${new Date(ref.t).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</strong>`];
    sorted.forEach((pts, i) => {
      const p = pts.find((q) => Math.abs(q.t - ref.t) < DAY / 2);
      if (p) {
        hoverDots[i].setAttribute('cx', X(p.t)); hoverDots[i].setAttribute('cy', Y(p.y));
        hoverDots[i].setAttribute('visibility', 'visible');
        lines.push(`<span class="swatch" style="background:${series[i].color}"></span>${series[i].name} : <strong>${fmtNum(p.y, decimals)} ${unit}</strong>${p.label ? ` <span class="muted">${p.label}</span>` : ''}`);
      } else hoverDots[i].setAttribute('visibility', 'hidden');
    });
    tip.innerHTML = lines.join('<br>');
    tip.hidden = false;
    const left = (X(ref.t) / width) * r.width;
    tip.style.left = `${Math.min(Math.max(left - tip.offsetWidth / 2, 0), r.width - tip.offsetWidth)}px`;
    tip.style.top = '0px';
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
