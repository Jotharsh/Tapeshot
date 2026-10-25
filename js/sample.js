// A made-up photo whose true sizes are known, for trying the app without a camera and for testing it.
// A pinhole camera looks at a table from above at an angle; an A4 sheet and a few things lie on it.

/**
 * A pinhole camera looking at a flat surface. Surface points are in mm; `project` gives photo pixels.
 * tilt: how far the camera leans away from straight-down (degrees). roll: turn about the viewing axis.
 */
export function makeCamera({ width = 1600, height = 1200, f = 1300, tilt = 20, pan = 0, roll = 0, distance = 800 } = {}) {
  const rad = (d) => (d * Math.PI) / 180;
  const ct = Math.cos(rad(tilt)), st = Math.sin(rad(tilt)), cp = Math.cos(rad(pan)), sp = Math.sin(rad(pan)), cr = Math.cos(rad(roll)), sr = Math.sin(rad(roll));
  function project(X, Y) {
    // lean the surface about X (tilt), then about Y (pan), then turn it in the picture plane (roll)
    let x = X, y = Y * ct, z = Y * st;
    [x, z] = [x * cp + z * sp, -x * sp + z * cp];
    [x, y] = [x * cr - y * sr, x * sr + y * cr];
    const zc = z + distance;
    return { x: width / 2 + (f * x) / zc, y: height / 2 + (f * y) / zc };
  }
  return { project, width, height, f };
}

/** Where everything is, in mm on the table. The paper's centre is not the middle, so the scene fills the picture. */
export const SCENE = {
  paper: { cx: -130, cy: 0, w: 297, h: 210, ref: 'a4' },
  things: [
    { id: 'box', name: 'Box width', x0: 40, y0: -60, w: 180, h: 120, colour: '#1f4e5f', ends: ['left', 'right'] },
    { id: 'pen', name: 'Pen length', x0: 70, y0: 128, w: 150, h: 14, colour: '#b3202a', ends: ['left', 'right'] },
    { id: 'card', name: 'Card long edge', x0: 110, y0: -175, w: 85.6, h: 54, colour: '#d9a441', ends: ['left', 'right'] },
  ],
};

/** The photo positions of the paper's four corners and each thing's two ends, with the true length in mm. */
export function groundTruth(camera, scene = SCENE) {
  const { paper } = scene;
  const at = (X, Y) => camera.project(X, Y);
  const px = paper.w / 2, py = paper.h / 2;
  const corners = [at(paper.cx - px, paper.cy - py), at(paper.cx + px, paper.cy - py), at(paper.cx + px, paper.cy + py), at(paper.cx - px, paper.cy + py)];
  const measures = scene.things.map((t) => ({ id: t.id, name: t.name, truth: t.w, a: at(t.x0, t.y0 + t.h / 2), b: at(t.x0 + t.w, t.y0 + t.h / 2) }));
  return { corners, measures };
}

function prng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Draws the scene into a canvas and returns it, with the camera and the true positions. Browser only. */
export function renderSample({ width = 1600, height = 1200, tilt = 20, roll = 5, pan = 0 } = {}) {
  const camera = makeCamera({ width, height, tilt, roll, pan });
  const canvas = Object.assign(document.createElement('canvas'), { width, height });
  const ctx = canvas.getContext('2d');
  const P = camera.project;
  const poly = (pts, fill, alpha = 1) => { ctx.globalAlpha = alpha; ctx.fillStyle = fill; ctx.beginPath(); pts.forEach(([X, Y], i) => { const p = P(X, Y); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); }); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1; };
  const rect = (x0, y0, w, h, fill, alpha) => poly([[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]], fill, alpha);
  const line = (X0, Y0, X1, Y1, colour, lw, alpha = 1) => { const a = P(X0, Y0), b = P(X1, Y1); ctx.globalAlpha = alpha; ctx.strokeStyle = colour; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.globalAlpha = 1; };

  ctx.fillStyle = '#4a3b30'; ctx.fillRect(0, 0, width, height);
  const r = prng(11);
  for (let i = -14; i < 14; i++) {                               // table planks
    rect(-1400, i * 95, 2800, 95, i % 2 ? '#9b7a56' : '#a98660');
    for (let g = 0; g < 26; g++) { const X = -1400 + r() * 2800, Y = i * 95 + 6 + r() * 83; line(X, Y, X + 120 + r() * 500, Y + (r() - 0.5) * 6, '#5b4129', 1.2, 0.18); }
    line(-1400, i * 95, 1400, i * 95, '#3a2a1c', 2, 0.55);
  }
  const { paper } = SCENE, px = paper.cx - paper.w / 2, py = paper.cy - paper.h / 2;
  rect(px + 7, py + 9, paper.w, paper.h, '#000', 0.28);                                  // paper, with a soft shadow
  rect(px, py, paper.w, paper.h, '#f6f4ee');
  for (let i = 0; i < 11; i++) line(px + 22, py + 26 + i * 15.5, px + paper.w - 22 - (i % 3) * 40, py + 26 + i * 15.5, '#5d6470', 3, 0.55);
  rect(px + 22, py + 12, 90, 7, '#2c313a', 0.75);
  for (const t of SCENE.things) {
    rect(t.x0 + 5, t.y0 + 7, t.w, t.h, '#000', 0.3);
    rect(t.x0, t.y0, t.w, t.h, t.colour);
    if (t.id === 'box') { rect(t.x0 + 12, t.y0 + 12, t.w - 24, 16, '#e8e2d2', 0.85); rect(t.x0 + 12, t.y0 + t.h - 28, 60, 8, '#e8e2d2', 0.6); }
    if (t.id === 'pen') { rect(t.x0, t.y0, 26, t.h, '#111'); rect(t.x0 + t.w - 18, t.y0 + 4, 18, t.h - 8, '#d8d8d8'); }
  }
  const truth = groundTruth(camera);
  return { canvas, camera, truth };
}

export const sampleBlob = (options) => new Promise((resolve) => renderSample(options).canvas.toBlob(resolve, 'image/jpeg', 0.9));
