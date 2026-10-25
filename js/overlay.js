// Draws the marks on top of the photo: corners, the reference outline, grid, and measurements.
// One function serves both the live screen and the saved image, so what you see is what you export.
import { invert3, applyH } from './geometry.js';
import { formatLength, formatPlusMinus } from './units.js';

export const MARK = '#ffd23f';      // the yellow of a tape measure; the dark outline keeps it readable on any photo
const DARK = 'rgba(8, 9, 10, 0.9)';

function outlined(ctx, k, draw) {
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 5.5 * k; draw(); ctx.stroke();
  ctx.strokeStyle = MARK; ctx.lineWidth = 2.6 * k; draw(); ctx.stroke();
  ctx.restore();
}

function handle(ctx, p, k, { label, ring = false, selected = false }) {
  ctx.save();
  const r = (ring ? 8 : 11) * k * (selected ? 1.15 : 1);
  ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fillStyle = ring ? '#111' : MARK; ctx.fill();
  ctx.lineWidth = 2.6 * k; ctx.strokeStyle = ring ? MARK : '#111'; ctx.stroke();
  ctx.lineWidth = 1.4 * k; ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(p.x, p.y, r + 2 * k, 0, Math.PI * 2); ctx.stroke();
  if (ring) { ctx.beginPath(); ctx.arc(p.x, p.y, 2.4 * k, 0, Math.PI * 2); ctx.fillStyle = MARK; ctx.fill(); }
  if (label) {
    ctx.fillStyle = '#111'; ctx.font = `700 ${12 * k}px "Geist Mono", ui-monospace, monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, p.x, p.y + 0.5 * k);
  }
  ctx.restore();
}

function pill(ctx, x, y, lines, k) {
  ctx.save();
  const sizes = [15 * k, 11.5 * k];
  const widths = lines.map((t, i) => { ctx.font = `${i ? 500 : 600} ${sizes[i]}px "Geist Mono", ui-monospace, monospace`; return ctx.measureText(t).width; });
  const pad = 8 * k, w = Math.max(...widths) + pad * 2, lineH = (i) => sizes[i] * 1.25;
  const h = lines.reduce((s, _, i) => s + lineH(i), 0) + pad * 1.1;
  const rx = x - w / 2, ry = y - h / 2, r = 7 * k;
  ctx.beginPath(); ctx.roundRect(rx, ry, w, h, r); ctx.fillStyle = DARK; ctx.fill();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  let cy = ry + pad * 0.55;
  lines.forEach((t, i) => {
    ctx.font = `${i ? 500 : 600} ${sizes[i]}px "Geist Mono", ui-monospace, monospace`;
    ctx.fillStyle = i ? 'rgba(255,255,255,0.7)' : MARK;
    ctx.fillText(t, x, cy + lineH(i) / 2); cy += lineH(i);
  });
  ctx.restore();
}

const MM_STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
const IN_STEPS = [3.175, 6.35, 12.7, 25.4, 50.8, 101.6, 304.8, 609.6, 1219.2];

/** A grid laid on the measuring surface. If its lines run along the table's own edges, the reference was marked well. */
function drawGrid(ctx, o, k) {
  const { cal, toScreen, unit } = o;
  const Hinv = invert3(cal.H);
  if (!Hinv) return;
  const steps = unit === 'in' || unit === 'ftin' ? IN_STEPS : MM_STEPS;
  const mid = applyH(Hinv, { x: cal.width / 2, y: cal.height / 2 });
  const mid2 = applyH(Hinv, { x: cal.width / 2 + steps[0], y: cal.height / 2 });
  if (!mid || !mid2) return;
  const a = toScreen(mid), b = toScreen(mid2);
  const pxPer = Math.hypot(a.x - b.x, a.y - b.y) / steps[0];                // screen px per mm near the reference
  const step = steps.find((s) => s * pxPer >= 26 * k) ?? steps[steps.length - 1];
  const x0 = -cal.width, x1 = cal.width * 2, y0 = -cal.height, y1 = cal.height * 2;
  const line = (p, q) => { const s = applyH(Hinv, p), e = applyH(Hinv, q); if (!s || !e) return; const A = toScreen(s), B = toScreen(e); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); };
  const paint = (width, colour) => {
    ctx.beginPath();
    for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) line({ x, y: y0 }, { x, y: y1 });
    for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) line({ x: x0, y }, { x: x1, y });
    ctx.lineWidth = width; ctx.strokeStyle = colour; ctx.stroke();
  };
  ctx.save(); ctx.lineCap = 'butt';
  paint(2.6 * k, 'rgba(0,0,0,0.28)'); paint(1 * k, 'rgba(255,255,255,0.62)');
  ctx.restore();
}

/**
 * o: { toScreen(p), k (size factor), corners, cal, measurements: [{id, a, b, mm, pm}], pending, selected, showGrid, unit, bounds: {w, h} (the photo's size) }
 * `selected` is { kind: 'corner' | 'measure' | 'end', id }.
 */
export function drawOverlay(ctx, o) {
  const { toScreen, k, corners, cal, measurements, pending, selected, unit } = o;
  if (o.showGrid && cal) {
    ctx.save();
    if (o.bounds) { const a = toScreen({ x: 0, y: 0 }), b = toScreen({ x: o.bounds.w, y: o.bounds.h }); ctx.beginPath(); ctx.rect(a.x, a.y, b.x - a.x, b.y - a.y); ctx.clip(); }   // the grid stays on the photo
    drawGrid(ctx, o, k);
    ctx.restore();
  }

  // reference outline
  if (corners.length) {
    const pts = (cal ? cal.corners : corners).map(toScreen);
    outlined(ctx, k, () => {
      ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      if (pts.length === 4) ctx.closePath();
    });
    if (cal) { ctx.save(); ctx.globalAlpha = 0.07; ctx.fillStyle = MARK; ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.fill(); ctx.restore(); }
  }

  // measurements
  for (const m of measurements) {
    const a = toScreen(m.a), b = toScreen(m.b);
    const isSel = selected && selected.kind !== 'corner' && String(selected.id).split(':')[0] === m.id;
    ctx.save(); ctx.lineCap = 'round';
    const draw = () => { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); };
    ctx.strokeStyle = 'rgba(0,0,0,0.65)'; ctx.lineWidth = (isSel ? 6.4 : 5) * k; draw(); ctx.stroke();
    ctx.strokeStyle = MARK; ctx.lineWidth = (isSel ? 3.4 : 2.4) * k; draw(); ctx.stroke();
    ctx.restore();
    const ang = Math.atan2(b.y - a.y, b.x - a.x), nx = -Math.sin(ang), ny = Math.cos(ang);
    const flip = ny > 0 ? -1 : 1;                                         // keep the label above the line
    const second = [m.label, m.pm != null ? formatPlusMinus(m.pm, unit) : ''].filter(Boolean).join('  ');
    pill(ctx, (a.x + b.x) / 2 + nx * flip * 34 * k, (a.y + b.y) / 2 + ny * flip * 34 * k, second ? [formatLength(m.mm, unit), second] : [formatLength(m.mm, unit)], k);
    handle(ctx, a, k, { ring: true, selected: isSel }); handle(ctx, b, k, { ring: true, selected: isSel });
  }

  // reference corners on top
  corners.forEach((c, i) => handle(ctx, toScreen(c), k, { label: String(i + 1), selected: selected?.kind === 'corner' && selected.id === i }));

  if (pending) {
    const p = toScreen(pending);
    handle(ctx, p, k, { ring: true });
    ctx.save(); ctx.strokeStyle = MARK; ctx.lineWidth = 1.6 * k; ctx.setLineDash([4 * k, 4 * k]);
    ctx.beginPath(); ctx.arc(p.x, p.y, 17 * k, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }
}
