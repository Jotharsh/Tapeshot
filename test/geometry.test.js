import test from 'node:test';
import assert from 'node:assert/strict';
import { homographyFromPoints, applyH, orderCorners, quadInfo, estimateAspect, calibrate, lengthBetween, uncertainty, mmPerPixel, checkReference, dist } from '../js/geometry.js';
import { makeCamera, SCENE, groundTruth } from '../js/sample.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b} ± ${tol}, got ${a}`);
const A4 = { long: 297, short: 210 };

test('a homography maps the four chosen points exactly, and others sensibly', () => {
  const src = [{ x: 100, y: 120 }, { x: 540, y: 90 }, { x: 600, y: 420 }, { x: 80, y: 400 }];
  const dst = [{ x: 0, y: 0 }, { x: 297, y: 0 }, { x: 297, y: 210 }, { x: 0, y: 210 }];
  const H = homographyFromPoints(src, dst);
  src.forEach((p, i) => { const q = applyH(H, p); near(q.x, dst[i].x, 1e-6); near(q.y, dst[i].y, 1e-6); });
  const centre = applyH(H, { x: (100 + 600) / 2, y: 255 });
  assert.ok(centre.x > 100 && centre.x < 200 && centre.y > 80 && centre.y < 130, JSON.stringify(centre));
});

test('degenerate corners (three in a line) are refused', () => {
  const H = homographyFromPoints([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 5, y: 5 }], [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]);
  assert.ok(H === null || H.some((v) => !Number.isFinite(v)) || true);   // must not throw
  assert.equal(calibrate([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 5, y: 5 }], 297, 210), null);
});

test('corners come back clockwise from the top-left, whatever order they were tapped in', () => {
  const sq = [{ x: 10, y: 10 }, { x: 90, y: 12 }, { x: 88, y: 70 }, { x: 8, y: 68 }];
  const want = orderCorners(sq);
  for (const perm of [[2, 0, 3, 1], [3, 2, 1, 0], [1, 3, 0, 2], [0, 2, 1, 3]]) {
    assert.deepEqual(orderCorners(perm.map((i) => sq[i])), want);
  }
  assert.deepEqual(want[0], sq[0]);
  assert.ok(quadInfo(want).convex);
  assert.ok(!quadInfo([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10, y: 0 }, { x: 0, y: 10 }]).convex, 'a bow-tie is not a quadrilateral');
});

// --- accuracy, against a camera with known answers ---
function scenario(opts) {
  const cam = makeCamera(opts), truth = groundTruth(cam);
  return { cam, truth, cal: calibrate(truth.corners, A4.long, A4.short, { width: cam.width, height: cam.height }) };
}

test('with exact corners, lengths on the table are right to a fraction of a percent, at every tilt', () => {
  for (const tilt of [0, 10, 25, 40, 50]) for (const roll of [0, 17, -35, 90, 200]) {
    const { truth, cal } = scenario({ tilt, roll, pan: tilt / 3 });
    assert.ok(cal, `calibrates at tilt ${tilt} roll ${roll}`);
    for (const m of truth.measures) {
      const got = lengthBetween(cal.H, m.a, m.b);
      near(got / m.truth, 1, 0.002, `${m.id} at tilt ${tilt}, roll ${roll}: ${got.toFixed(2)} vs ${m.truth}`);
    }
  }
});

test('the paper edge itself comes out as 297 and 210, so the scale is right', () => {
  const { truth, cal } = scenario({ tilt: 30, roll: 12 });
  const [a, b, c] = cal.corners;
  const e1 = lengthBetween(cal.H, a, b), e2 = lengthBetween(cal.H, b, c);
  near(Math.max(e1, e2), 297, 0.01); near(Math.min(e1, e2), 210, 0.01);
});

test('the camera-based aspect estimate recovers the paper ratio when the photo is tilted', () => {
  for (const tilt of [12, 25, 40, 55]) for (const roll of [0, 30, -60]) {
    const { cam, truth } = scenario({ tilt, roll, pan: 8 });
    const q = orderCorners(truth.corners);
    const est = estimateAspect(q, cam.width / 2, cam.height / 2);
    assert.ok(est != null, `an estimate exists at tilt ${tilt}`);
    near(est.focal, cam.f, cam.f * 0.04, `focal length at tilt ${tilt}`);
    const long = Math.max(est.ratio, 1 / est.ratio);
    near(long, 297 / 210, 0.02, `ratio at tilt ${tilt}, roll ${roll}`);
  }
});

test('portrait or landscape is chosen correctly even when the paper looks nearly square from a steep angle', () => {
  for (const roll of [0, 45, 90, 135, 180, 270, 310]) {
    const { truth, cal } = scenario({ tilt: 55, roll, pan: 10 });
    for (const m of truth.measures) near(lengthBetween(cal.H, m.a, m.b) / m.truth, 1, 0.004, `${m.id} roll ${roll}`);
  }
});

test('a straight-on photo (no camera estimate possible) still works', () => {
  const { cal, truth } = scenario({ tilt: 0, roll: 25 });
  assert.equal(cal.fromCamera, false);
  for (const m of truth.measures) near(lengthBetween(cal.H, m.a, m.b) / m.truth, 1, 0.002);
});

test('the long and short sides can be forced the other way when a photo is ambiguous', () => {
  const { cam, truth } = scenario({ tilt: 0, roll: 0 });
  const swapped = calibrate(truth.corners, A4.long, A4.short, { width: cam.width, height: cam.height, rotate: true });
  const got = lengthBetween(swapped.H, truth.measures[0].a, truth.measures[0].b);
  assert.ok(Math.abs(got / truth.measures[0].truth - 1) > 0.2, 'forcing the wrong way gives a clearly wrong answer, so the control is meaningful');
});

test('placing corners a pixel or two off still gives a good answer, and the stated uncertainty is honest', () => {
  const { cam, truth } = scenario({ tilt: 20, roll: 5 });
  let seed = 3;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 - 0.5; };
  const errors = [];
  for (let t = 0; t < 120; t++) {
    const noisy = truth.corners.map((p) => ({ x: p.x + rnd() * 5, y: p.y + rnd() * 5 }));
    const cal = calibrate(noisy, A4.long, A4.short, { width: cam.width, height: cam.height });
    const m = truth.measures[0];
    errors.push(lengthBetween(cal.H, { x: m.a.x + rnd() * 5, y: m.a.y + rnd() * 5 }, { x: m.b.x + rnd() * 5, y: m.b.y + rnd() * 5 }) - m.truth);
  }
  const rms = Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / errors.length);
  const m = truth.measures[0];
  const claimed = uncertainty(truth.corners, A4.long, A4.short, m.a, m.b, { sigma: 1.44, width: cam.width, height: cam.height });
  assert.ok(rms < 4, `real error with ±2.5 px slips is small (${rms.toFixed(2)} mm on 180 mm)`);
  assert.ok(claimed > 0, 'there is a claimed uncertainty');
  near(claimed / rms, 1, 0.45, `the stated ± (${claimed.toFixed(2)} mm) is close to the real spread (${rms.toFixed(2)} mm)`);
});

test('uncertainty is repeatable, grows with sloppier tapping and with the photo angle', () => {
  const { cam, truth } = scenario({ tilt: 20 });
  const m = truth.measures[0], run = (sigma, tr = truth) => uncertainty(tr.corners, 297, 210, tr.measures[0].a, tr.measures[0].b, { sigma, width: cam.width, height: cam.height });
  assert.equal(run(1.5), run(1.5));
  assert.ok(run(3) > run(1.5) * 1.6);
  const steep = scenario({ tilt: 55 });
  const cs = uncertainty(steep.truth.corners, 297, 210, steep.truth.measures[0].a, steep.truth.measures[0].b, { sigma: 1.5, width: steep.cam.width, height: steep.cam.height });
  assert.ok(cs > run(1.5), `a steep photo is less certain (${cs.toFixed(2)} vs ${run(1.5).toFixed(2)})`);
});

test('mm per pixel is sensible and the reference check speaks up about real problems', () => {
  const { cam, truth, cal } = scenario({ tilt: 20 });
  const mp = mmPerPixel(cal.H, truth.measures[0].a);
  near(mp, 297 / dist(truth.corners[0], truth.corners[1]), 0.15);
  assert.equal(checkReference(cal, cam.width, cam.height).length, 0, 'a good photo raises nothing');
  const small = scenario({ tilt: 20, f: 300 });
  assert.ok(checkReference(small.cal, small.cam.width, small.cam.height).some((i) => /small/i.test(i.text)));
  const steep = scenario({ tilt: 70 });
  assert.ok(checkReference(steep.cal, steep.cam.width, steep.cam.height).some((i) => /angle/i.test(i.text)));
  assert.equal(checkReference(null, 100, 100)[0].level, 'bad');
  // marking a sheet of paper while telling the app it is a square is noticed
  const wrong = calibrate(truth.corners, 100, 100, { width: cam.width, height: cam.height });
  assert.ok(checkReference(wrong, cam.width, cam.height).some((i) => /does not look like/.test(i.text)));
});
