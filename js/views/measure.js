import { h, icon, toast, sheet, confirmDialog, promptDialog, plural } from '../ui.js';
import { getSession, getPhoto, saveSession, deleteSession, setSettings, newId } from '../db.js';
import { Viewer } from '../viewer.js';
import { drawOverlay } from '../overlay.js';
import { calibrate, lengthBetween, uncertainty, checkReference } from '../geometry.js';
import { referenceById, REFERENCES, UNITS, formatLength, formatPlusMinus, parseSize } from '../units.js';

const GRAB = 16;                                           // how close (screen px) a tap must be to a line to select it

export async function measureScreen(screen, [id], { go }) {
  const session = await getSession(id);
  if (!session) {
    screen.append(h('h1', {}, 'Photo not found'), h('p', {}, 'It may have been deleted.'), h('a', { class: 'btn primary', href: '#/' }, 'Go home'));
    return;
  }
  const blob = await getPhoto(id);
  const bitmap = await createImageBitmap(blob);

  // ---------- state ----------
  let mode = session.corners.length === 4 ? 'measure' : 'reference';
  let pending = null, selected = null, showGrid = false, dragging = false;
  let cal = null, issues = [];
  const noise = new Map();                                 // measurement id + geometry  ->  the "give or take", worked out once
  let saveTimer = 0, panelFrame = 0;

  const ref = () => referenceById(session.reference, session.custom);

  function recompute() {
    const r = ref();
    cal = session.corners.length === 4 ? calibrate(session.corners, r.long, r.short, { width: session.width, height: session.height, rotate: session.rotate }) : null;
    issues = session.corners.length === 4 ? checkReference(cal, session.width, session.height) : [];
    for (const m of session.measurements) m.mm = cal ? lengthBetween(cal.H, m.a, m.b) : null;
  }
  const round = (n) => Math.round(n * 10) / 10;
  function plusMinus(m) {
    if (!cal || m.mm == null || dragging) return null;
    const key = `${m.id}|${session.reference}|${session.rotate}|${[...session.corners, m.a, m.b].map((p) => `${round(p.x)},${round(p.y)}`).join(';')}`;
    if (!noise.has(key)) {
      const r = ref(), sigma = Math.max(1.2, 0.0009 * Math.max(session.width, session.height));    // a fingertip slip of about a pixel or two
      noise.set(key, uncertainty(session.corners, r.long, r.short, m.a, m.b, { sigma, width: session.width, height: session.height, rotate: session.rotate }));
    }
    return noise.get(key);
  }
  const queueSave = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => saveSession(session).catch(console.error), 350); };
  const changed = () => { recompute(); viewer.invalidate(); queuePanel(); queueSave(); };
  const queuePanel = () => { if (!panelFrame) panelFrame = requestAnimationFrame(() => { panelFrame = 0; renderPanel(); renderTop(); }); };

  // ---------- the photo ----------
  const canvas = h('canvas', { class: 'stage-canvas', tabIndex: 0, role: 'img', 'aria-label': 'Your photo. Tap to place points. Pinch or scroll to zoom. Arrow keys move the selected point.' });
  const stage = h('div', { class: 'stage' }, canvas);

  const handles = () => {
    const list = session.corners.map((c, i) => ({ id: `c${i}`, kind: 'corner', index: i, x: c.x, y: c.y }));
    for (const m of session.measurements) for (const w of ['a', 'b']) list.push({ id: `${m.id}:${w}`, kind: 'end', m, which: w, x: m[w].x, y: m[w].y });
    return mode === 'reference' ? list : list.reverse();    // ties go to what the current step is about
  };

  const viewer = new Viewer(canvas, {
    handles,
    draw: (ctx, v) => drawOverlay(ctx, {
      toScreen: (p) => v.toScreen(p), k: 1, corners: session.corners, cal, pending, selected, showGrid, unit: session.unit, bounds: { w: session.width, h: session.height },
      measurements: session.measurements.map((m) => ({ id: m.id, a: m.a, b: m.b, label: m.label, mm: m.mm, pm: plusMinus(m) })),
    }),
    onTap(p) {
      if (mode === 'reference') {
        if (session.corners.length >= 4) return;
        session.corners.push(p); selected = { kind: 'corner', id: session.corners.length - 1 };
        if (session.corners.length === 4) {
          recompute();
          if (cal && !issues.some((i) => i.level === 'bad')) { mode = 'measure'; toast(issues.length ? 'Sheet marked. Check the notes below.' : 'Sheet marked. Now tap the two ends of what you want to measure.', 3600); }
        }
        changed(); return;
      }
      if (!cal) { toast('Mark the four corners of the reference first.'); mode = 'reference'; queuePanel(); return; }
      const near = session.measurements.find((m) => segDist(viewer.toScreen(p), viewer.toScreen(m.a), viewer.toScreen(m.b)) < GRAB);
      if (near && !pending) { selected = { kind: 'measure', id: near.id }; viewer.invalidate(); queuePanel(); return; }
      if (pending) {
        const m = { id: newId().slice(0, 8), a: pending, b: p, label: '', mm: null };
        session.measurements.push(m); pending = null; selected = { kind: 'measure', id: m.id };
      } else { pending = p; selected = null; }
      changed();
    },
    onDragStart(hd) { dragging = true; selected = hd.kind === 'corner' ? { kind: 'corner', id: hd.index } : { kind: 'end', id: hd.id }; },
    onDrag(hd, p) {
      if (hd.kind === 'corner') session.corners[hd.index] = p; else hd.m[hd.which] = p;
      recompute(); viewer.invalidate(); queuePanel();
    },
    onDragEnd() { dragging = false; changed(); },
    onNudge(dx, dy) {
      if (!selected) return false;
      const move = (p) => ({ x: Math.min(session.width, Math.max(0, p.x + dx)), y: Math.min(session.height, Math.max(0, p.y + dy)) });
      if (selected.kind === 'corner') session.corners[selected.id] = move(session.corners[selected.id]);
      else if (selected.kind === 'end') { const [mid, w] = selected.id.split(':'); const m = session.measurements.find((x) => x.id === mid); if (!m) return false; m[w] = move(m[w]); }
      else return false;
      changed(); return true;
    },
  });
  viewer.setImage(bitmap, session.width, session.height);
  const resizer = new ResizeObserver(() => viewer.layout());
  resizer.observe(stage);

  function segDist(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  }

  // ---------- controls over the photo ----------
  const zoomBtn = (name, label, fn) => h('button', { class: 'zoombtn', 'aria-label': label, title: label, onclick: fn }, icon(name, 20));
  const gridBtn = zoomBtn('grid', 'Show a grid on the surface, to check the reference', () => {
    if (!cal) { toast('Mark the reference first. The grid needs it.'); return; }
    showGrid = !showGrid; gridBtn.setAttribute('aria-pressed', String(showGrid)); viewer.invalidate();
  });
  gridBtn.setAttribute('aria-pressed', 'false');
  stage.append(h('div', { class: 'zoombar' },
    zoomBtn('plus', 'Zoom in', () => viewer.zoomCentre(1.5)), zoomBtn('minus', 'Zoom out', () => viewer.zoomCentre(1 / 1.5)),
    zoomBtn('fit', 'Fit the whole photo', () => viewer.fit()), gridBtn));

  // ---------- top bar ----------
  const top = h('div', { class: 'topbar measure-top' });
  function renderTop() {
    top.replaceChildren(
      h('a', { class: 'iconbtn', href: '#/', 'aria-label': 'Back to home' }, icon('back', 22)),
      h('h1', { class: 'title' }, session.name || 'Measure'),
      h('button', { class: 'btn unit', onclick: pickUnit, 'aria-label': `Units: ${UNITS.find((u) => u.id === session.unit)?.name}. Change.` }, { mm: 'mm', cm: 'cm', m: 'm', in: 'in', ftin: 'ft + in' }[session.unit]),
      h('button', { class: 'iconbtn', onclick: menu, 'aria-label': 'More' }, icon('dots', 24)));
  }

  async function pickUnit() {
    const choice = await sheet({ title: 'Show lengths in', actions: UNITS.map((u) => ({ id: u.id, label: u.name, selected: u.id === session.unit })) });
    if (!choice) return;
    session.unit = choice; await setSettings({ unit: choice }); changed(); renderTop();
  }

  async function pickReference() {
    const choice = await sheet({ title: 'What is lying beside it?', message: 'Pick something flat with a known size.',
      actions: [...REFERENCES.map((r) => ({ id: r.id, label: r.name, detail: r.detail, selected: r.id === session.reference })),
        { id: 'custom', label: 'Something else', detail: session.custom ? `${session.custom.long} × ${session.custom.short} mm` : 'type its size', selected: session.reference === 'custom' }] });
    if (!choice) return;
    if (choice === 'custom') {
      const text = await promptDialog({ title: 'Its size', message: 'Type length by width, for example 297 x 210 mm, or 8.5 x 11 in.', label: 'Size', value: session.custom ? `${session.custom.long} x ${session.custom.short} mm` : '',
        placeholder: '297 x 210 mm', confirmText: 'Use this size', validate: (v) => (parseSize(v, 'mm') ? '' : 'Type two numbers with an x between them, for example 100 x 50 mm.') });
      if (!text) return;
      session.custom = parseSize(text, 'mm');
    }
    session.reference = choice; session.rotate = false;
    await setSettings({ reference: choice, custom: session.custom });
    changed();
  }

  async function menu() {
    const choice = await sheet({ title: session.name || 'This photo', actions: [
      { id: 'image', label: 'Save the annotated photo', primary: true },
      { id: 'copy', label: 'Copy the measurements', disabled: !session.measurements.length },
      { id: 'rename', label: 'Name this photo' },
      { id: 'help', label: 'How measuring works' },
      { id: 'delete', label: 'Delete this photo', danger: true }] });
    if (choice === 'image') await saveImage();
    else if (choice === 'copy') await copyText();
    else if (choice === 'rename') {
      const name = await promptDialog({ title: 'Name this photo', label: 'Name', value: session.name, placeholder: 'Kitchen table', confirmText: 'Save' });
      if (name != null) { session.name = name.trim().slice(0, 60); changed(); renderTop(); }
    } else if (choice === 'help') go('/help');
    else if (choice === 'delete' && await confirmDialog({ title: 'Delete this photo?', message: 'The photo and its measurements will be removed from this device.', confirmText: 'Delete', danger: true })) {
      clearTimeout(saveTimer); await deleteSession(session.id); toast('Deleted.'); go('/');
    }
  }

  // ---------- the panel under the photo ----------
  const panel = h('section', { class: 'panel', 'aria-label': 'Steps' });

  function summary() {
    const r = ref();
    return session.measurements.map((m, i) => {
      const pm = plusMinus(m);
      return `${m.label || `Line ${i + 1}`}: ${formatLength(m.mm, session.unit)}${pm ? ` (${formatPlusMinus(pm, session.unit)})` : ''}`;
    }).concat(`Measured against ${r.name} (${r.detail}).`).join('\n');
  }
  async function copyText() {
    try { await navigator.clipboard.writeText(summary()); toast('Copied.'); }
    catch { toast('Copying is not allowed here.'); }
  }

  function renderPanel() {
    const r = ref(), done = session.corners.length === 4 && cal;
    const stepBtn = (id, n, text, enabled = true) => h('button', { class: 'step', 'aria-pressed': String(mode === id), disabled: !enabled,
      onclick: () => { if (id === 'measure' && !cal) { toast('Mark the four corners of the reference first.'); return; } mode = id; pending = null; queuePanel(); viewer.invalidate(); } },
      h('span', { class: 'n' }, done && id === 'reference' ? icon('check', 16) : String(n)), text);
    const body = mode === 'reference' ? referenceBody(r, done) : measureBody();
    panel.replaceChildren(h('div', { class: 'steps-bar', role: 'group', 'aria-label': 'Step' }, stepBtn('reference', 1, 'Reference'), stepBtn('measure', 2, 'Measure')), body);
  }

  function referenceBody(r, done) {
    const n = session.corners.length;
    return h('div', { class: 'panel-body' },
      h('button', { class: 'refchip', onclick: pickReference }, h('span', {}, h('span', { class: 'lbl' }, 'Reference'), h('span', { class: 'val' }, r.name, h('span', { class: 'muted' }, r.detail))), h('span', { class: 'change' }, 'Change')),
      h('p', { class: 'instruction', role: 'status' }, n < 4
        ? `Tap corner ${n + 1} of 4 of the ${r.name} in the photo. Drag a point to adjust it, and zoom in for accuracy.`
        : cal ? 'All four corners are marked. Drag any corner to fine-tune it, or switch to Measure.' : 'Those corners do not make a proper shape. Drag them, or reset and try again.'),
      session.hint && h('p', { class: 'hint' }, session.hint),
      issues.map((i) => h('p', { class: `issue ${i.level}`, role: 'alert' }, i.text)),
      h('div', { class: 'row-actions' },
        n > 0 && h('button', { class: 'btn', onclick: () => { session.corners = []; session.rotate = false; selected = null; mode = 'reference'; changed(); } }, 'Start the corners again'),
        done && !cal.fromCamera && h('button', { class: 'btn ghost', onclick: () => { session.rotate = !session.rotate; changed(); toast('Swapped which side of the reference is long.'); } }, 'Measurements look wrong? Swap the sides'),
        done && h('button', { class: 'btn primary', onclick: () => { mode = 'measure'; queuePanel(); viewer.invalidate(); } }, 'Next: measure')));
  }

  function measureBody() {
    const list = session.measurements;
    return h('div', { class: 'panel-body' },
      h('p', { class: 'instruction', role: 'status' }, pending ? 'Now tap the other end.' : list.length ? 'Tap two more points for another measurement, or tap a line to select it.' : 'Tap one end of what you want to measure, then the other end.'),
      list.length > 0 && h('ul', { class: 'mlist', role: 'list' }, list.map((m, i) => {
        const pm = plusMinus(m), sel = selected && selected.kind !== 'corner' && String(selected.id).split(':')[0] === m.id;
        return h('li', { class: `mrow${sel ? ' sel' : ''}` },
          h('button', { class: 'mmain', onclick: () => { selected = { kind: 'measure', id: m.id }; viewer.invalidate(); queuePanel(); }, 'aria-label': `${m.label || `Line ${i + 1}`}: ${formatLength(m.mm, session.unit)}. Select.` },
            h('span', { class: 'mi' }, String(i + 1)),
            h('span', { class: 'mname' }, m.label || `Line ${i + 1}`),
            h('span', { class: 'mval' }, formatLength(m.mm, session.unit), pm && h('span', { class: 'pm' }, formatPlusMinus(pm, session.unit)))),
          h('button', { class: 'iconbtn', 'aria-label': `Name ${m.label || `line ${i + 1}`}`, onclick: async () => {
            const name = await promptDialog({ title: 'Name this measurement', label: 'Name', value: m.label, placeholder: 'Table width', confirmText: 'Save' });
            if (name != null) { m.label = name.trim().slice(0, 40); changed(); } } }, icon('ruler', 20)),
          h('button', { class: 'iconbtn', 'aria-label': `Delete ${m.label || `line ${i + 1}`}`, onclick: () => { session.measurements = session.measurements.filter((x) => x !== m); if (sel) selected = null; changed(); } }, icon('trash', 20)));
      })),
      h('p', { class: 'note' }, 'Only things lying flat on the same surface as the reference are measured right. Height and tall objects are not.'),
      h('div', { class: 'row-actions' },
        h('button', { class: 'btn', disabled: !list.length && !pending, onclick: () => { if (pending) pending = null; else session.measurements.pop(); changed(); } }, icon('undo', 20), 'Undo'),
        list.length > 1 && h('button', { class: 'btn ghost', onclick: async () => { if (await confirmDialog({ title: 'Remove all measurements?', confirmText: 'Remove all', danger: true })) { session.measurements = []; pending = null; selected = null; changed(); } } }, 'Clear all'),
        list.length > 0 && h('button', { class: 'btn', onclick: copyText }, icon('copy', 20), 'Copy')));
  }

  // ---------- saving the picture ----------
  async function saveImage() {
    const canvas = Object.assign(document.createElement('canvas'), { width: session.width, height: session.height });
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    drawOverlay(ctx, {
      toScreen: (p) => p, k: Math.max(1, session.width / 900), corners: session.corners, cal, pending: null, selected: null, showGrid: false, unit: session.unit,
      measurements: session.measurements.map((m) => ({ id: m.id, a: m.a, b: m.b, label: m.label, mm: m.mm, pm: plusMinus(m) })),
    });
    const out = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
    canvas.width = canvas.height = 0;
    const file = new File([out], `${(session.name || 'tapeshot').replace(/[^\w-]+/g, '-')}.jpg`, { type: 'image/jpeg' });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Measurements' }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    const a = h('a', { href: URL.createObjectURL(file), download: file.name }); document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    toast('Saved to your downloads.');
  }

  recompute();
  renderTop(); renderPanel();
  screen.classList.add('measure');
  screen.append(top, stage, panel);

  return () => {
    clearTimeout(saveTimer); saveSession(session).catch(console.error);
    cancelAnimationFrame(panelFrame); resizer.disconnect(); viewer.destroy(); bitmap.close?.();
    screen.classList.remove('measure');
  };
}
