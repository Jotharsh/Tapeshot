// The maths of measuring from a photo. Pure functions, no browser needed, so they can be tested against known answers.
//
// The idea: a sheet of paper of known size lies flat on a surface. Its four corners in the photo tell us how
// that surface is tilted and scaled, as a "homography" (a map from photo pixels to millimetres on the surface).
// Any two points that lie on that same surface can then be turned into millimetres and their distance read off.

export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Solves A x = b by Gaussian elimination with partial pivoting. A is n x n (array of rows). Returns null if singular. */
export function solveLinear(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    if (Math.abs(M[pivot][col]) < 1e-12) return null;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    for (let r = col + 1; r < n; r++) {
      const f = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let c = r + 1; c < n; c++) s -= M[r][c] * x[c];
    x[r] = s / M[r][r];
  }
  return x;
}

const mul3 = (A, B) => {
  const C = new Array(9).fill(0);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) C[i * 3 + j] += A[i * 3 + k] * B[k * 3 + j];
  return C;
};

export function invert3(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-18) return null;
  return [A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d].map((v) => v / det);
}

/** Moves the points so they are centred on 0 and about 1.4 from it on average. Keeps the maths well-conditioned. */
function normalise(pts) {
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length, cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const mean = pts.reduce((s, p) => s + Math.hypot(p.x - cx, p.y - cy), 0) / pts.length || 1;
  const s = Math.SQRT2 / mean;
  return { pts: pts.map((p) => ({ x: (p.x - cx) * s, y: (p.y - cy) * s })), T: [s, 0, -s * cx, 0, s, -s * cy, 0, 0, 1] };
}

/** The 3x3 matrix (row-major, 9 numbers) that maps the four `src` points onto the four `dst` points. Null if they are degenerate. */
export function homographyFromPoints(src, dst) {
  const S = normalise(src), D = normalise(dst);
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = S.pts[i], { x: u, y: v } = D.pts[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  const h = solveLinear(A, b);
  if (!h) return null;
  const Dinv = invert3(D.T);
  if (!Dinv) return null;
  return mul3(Dinv, mul3([...h, 1], S.T));
}

/** Maps one point through a homography. Null when the point is on the horizon (cannot be placed on the surface). */
export function applyH(H, p) {
  const w = H[6] * p.x + H[7] * p.y + H[8];
  if (Math.abs(w) < 1e-12) return null;
  return { x: (H[0] * p.x + H[1] * p.y + H[2]) / w, y: (H[3] * p.x + H[4] * p.y + H[5]) / w };
}

/** Puts four corners in clockwise order on screen (y down), starting with the one nearest the top-left. */
export function orderCorners(pts) {
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length, cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const sorted = [...pts].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  let k = 0, best = Infinity;
  sorted.forEach((p, i) => { if (p.x + p.y < best) { best = p.x + p.y; k = i; } });
  return [...sorted.slice(k), ...sorted.slice(0, k)];
}

/** Twice the signed area (shoelace), and whether the four points make a proper convex quadrilateral. */
export function quadInfo(q) {
  let area2 = 0, sign = 0, convex = true;
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4];
    area2 += a.x * b.y - b.x * a.y;
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-9) convex = false;
    else if (sign === 0) sign = Math.sign(cross);
    else if (Math.sign(cross) !== sign) convex = false;
  }
  return { area: Math.abs(area2) / 2, convex };
}

const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * Works out the true width:height ratio of a rectangle from how it looks in a photo, without knowing the camera
 * (Zhang and He, "Whiteboard scanning and image enhancement"). It assumes square pixels and the optical centre in the
 * middle of the picture. Takes the corners in order [top-left, top-right, bottom-right, bottom-left] and returns
 * { ratio: |top-left to top-right| / |top-left to bottom-left|, focal: the camera's focal length in pixels },
 * or null when the shape gives no answer (for example a straight-on photo, where the camera cannot be worked out,
 * or a badly marked quad).
 */
export function estimateAspect(q, u0, v0) {
  const m1 = [q[0].x, q[0].y, 1], m2 = [q[1].x, q[1].y, 1], m3 = [q[3].x, q[3].y, 1], m4 = [q[2].x, q[2].y, 1];
  const k2d = dot3(cross3(m2, m4), m3), k3d = dot3(cross3(m3, m4), m2);
  if (Math.abs(k2d) < 1e-9 || Math.abs(k3d) < 1e-9) return null;
  const k2 = dot3(cross3(m1, m4), m3) / k2d, k3 = dot3(cross3(m1, m4), m2) / k3d;
  const n2 = [k2 * m2[0] - m1[0], k2 * m2[1] - m1[1], k2 * m2[2] - m1[2]];
  const n3 = [k3 * m3[0] - m1[0], k3 * m3[1] - m1[1], k3 * m3[2] - m1[2]];
  const den = n2[2] * n3[2];
  // when either edge pair is parallel in the photo the focal length cannot be recovered from this shape
  if (Math.abs(n2[2]) < 1e-6 * Math.hypot(n2[0], n2[1]) || Math.abs(n3[2]) < 1e-6 * Math.hypot(n3[0], n3[1])) return null;
  const f2 = -1 / den * ((n2[0] * n3[0] - (n2[0] * n3[2] + n2[2] * n3[0]) * u0 + den * u0 * u0)
                       + (n2[1] * n3[1] - (n2[1] * n3[2] + n2[2] * n3[1]) * v0 + den * v0 * v0));
  if (!(f2 > 0) || !Number.isFinite(f2)) return null;
  const f = Math.sqrt(f2);
  const a2 = [(n2[0] - u0 * n2[2]) / f, (n2[1] - v0 * n2[2]) / f, n2[2]];
  const a3 = [(n3[0] - u0 * n3[2]) / f, (n3[1] - v0 * n3[2]) / f, n3[2]];
  const ratio = Math.hypot(...a2) / Math.hypot(...a3);
  return Number.isFinite(ratio) && ratio > 0 ? { ratio, focal: f } : null;
}

/**
 * Sets up the measuring surface from the four marked corners of the reference.
 * @param corners   four points (any order) in photo pixels
 * @param longSide  the reference's long side, in mm
 * @param shortSide the reference's short side, in mm
 * @param opts      { width, height } of the photo (for the optical centre); { rotate: true } to swap which edge is long
 * @returns {{H, width, height, landscape, ratio, fromCamera, mismatch}|null}
 *   H maps photo pixels to mm on the surface; `mismatch` is how far the marked shape is from the expected one (0 = perfect).
 */
export function calibrate(corners, longSide, shortSide, { width = 0, height = 0, rotate = false } = {}) {
  if (corners.length !== 4) return null;
  const q = orderCorners(corners);
  const { area, convex } = quadInfo(q);
  if (!convex || area < 1) return null;
  const apparent = (dist(q[0], q[1]) + dist(q[3], q[2])) / (dist(q[1], q[2]) + dist(q[0], q[3]));
  // The camera-based ratio can be unstable when the photo is nearly straight-on or the corners are a little off, so it is
  // only trusted when the camera it implies is plausible (a phone's focal length is around the picture's long side) and
  // the answer is not wildly different from how the shape looks.
  const est = estimateAspect(q, width / 2, height / 2);
  const long = Math.max(width, height);
  const trusted = est && (!long || (est.focal > 0.3 * long && est.focal < 6 * long)) && est.ratio / apparent < 3.5 && apparent / est.ratio < 3.5;
  const ratio = trusted ? est.ratio : apparent;          // physical |TL-TR| / |TL-BL|
  const target = longSide / shortSide;
  let landscape = Math.abs(Math.log(ratio / target)) <= Math.abs(Math.log(ratio * target));
  if (rotate) landscape = !landscape;
  const W = landscape ? longSide : shortSide, Hh = landscape ? shortSide : longSide;
  const H = homographyFromPoints(q, [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: Hh }, { x: 0, y: Hh }]);
  if (!H) return null;
  return { H, width: W, height: Hh, landscape, ratio, fromCamera: Boolean(trusted), mismatch: Math.abs(Math.log(ratio / (W / Hh))), corners: q };
}

/** The distance in mm between two photo points that both lie on the reference surface. Null if either is unplaceable. */
export function lengthBetween(H, a, b) {
  const p = applyH(H, a), q = applyH(H, b);
  return p && q ? Math.hypot(p.x - q.x, p.y - q.y) : null;
}

/** About how many mm one photo pixel is worth at a point on the surface. */
export function mmPerPixel(H, p) {
  const o = applyH(H, p), dx = applyH(H, { x: p.x + 1, y: p.y }), dy = applyH(H, { x: p.x, y: p.y + 1 });
  if (!o || !dx || !dy) return null;
  return Math.sqrt(Math.abs((dx.x - o.x) * (dy.y - o.y) - (dx.y - o.y) * (dy.x - o.x)));
}

function rng(seed) {                                      // small repeatable random numbers, so the same photo gives the same answer
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function gauss(r) { return Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()); }

/**
 * How much a measurement could be off just from not placing the points exactly. Each of the four corners and the two
 * ends is nudged by a small random amount (about `sigma` pixels, the sort of slip a fingertip makes), the measurement is
 * worked out again, and the spread is reported (one standard deviation, in mm). It does not include lens distortion or
 * measuring something that is not on the surface.
 */
export function uncertainty(corners, longSide, shortSide, a, b, { sigma = 1.5, samples = 300, seed = 7, width = 0, height = 0, rotate = false } = {}) {
  const base = calibrate(corners, longSide, shortSide, { width, height, rotate });
  if (!base) return null;
  const r = rng(seed), results = [];
  const jitter = (p) => ({ x: p.x + gauss(r) * sigma, y: p.y + gauss(r) * sigma });
  for (let i = 0; i < samples; i++) {
    // keep the same long/short assignment as the real measurement, so the spread is about placement only
    const q = base.corners.map(jitter);
    const H = homographyFromPoints(q, [{ x: 0, y: 0 }, { x: base.width, y: 0 }, { x: base.width, y: base.height }, { x: 0, y: base.height }]);
    if (!H) continue;
    const len = lengthBetween(H, jitter(a), jitter(b));
    if (len != null && Number.isFinite(len)) results.push(len);
  }
  if (results.length < 20) return null;
  const mean = results.reduce((s, v) => s + v, 0) / results.length;
  return Math.sqrt(results.reduce((s, v) => s + (v - mean) ** 2, 0) / (results.length - 1));
}

/** Plain-language problems with the marked reference, so the person can fix them before trusting a number. */
export function checkReference(cal, imageWidth, imageHeight) {
  const issues = [];
  if (!cal) return [{ level: 'bad', text: 'Those four corners do not make a proper four-sided shape. Try placing them again, one at each corner.' }];
  const { area } = quadInfo(cal.corners);
  const share = area / (imageWidth * imageHeight);
  if (share < 0.015) issues.push({ level: 'warn', text: 'The reference is small in the photo. Move closer, so it fills more of the picture and corners can be placed more exactly.' });
  const edges = [dist(cal.corners[0], cal.corners[1]), dist(cal.corners[1], cal.corners[2]), dist(cal.corners[2], cal.corners[3]), dist(cal.corners[3], cal.corners[0])];
  const skew = Math.max(edges[0] / edges[2], edges[2] / edges[0], edges[1] / edges[3], edges[3] / edges[1]);
  if (skew > 2.2) issues.push({ level: 'warn', text: 'The photo was taken at a steep angle. Measurements will be less exact. Try shooting from straight above.' });
  if (cal.mismatch > 0.12) issues.push({ level: 'warn', text: 'The marked shape does not look like the chosen reference. Check that each corner is on a real corner and the right reference is chosen. A very steep angle can also cause this: try shooting from higher up.' });
  return issues;
}
