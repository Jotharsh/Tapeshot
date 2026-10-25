import { h, icon, toast, sheet, confirmDialog, formatDate, urlTracker, plural } from '../ui.js';
import { listSessions, createSession, deleteSession, getSettings } from '../db.js';
import { processPhoto } from '../image.js';
import { referenceById, formatLength } from '../units.js';
import { installMode, promptInstall, dismissInstall, onInstallChange } from '../install.js';

function installBanner() {
  const box = h('div');
  const draw = () => {
    box.replaceChildren();
    const mode = installMode();
    if (!mode) return;
    const text = {
      prompt: 'Install Tapeshot on this device. It then opens like any other app, even with no signal.',
      ios: 'To install: tap the Share button (the square with an arrow), then tap "Add to Home Screen".',
      mac: 'To install: in Safari, choose File, then "Add to Dock".',
    }[mode];
    box.append(h('div', { class: 'banner', role: 'note' }, h('p', {}, text),
      h('div', { class: 'row' },
        mode === 'prompt' && h('button', { class: 'btn primary', onclick: promptInstall }, 'Install'),
        h('button', { class: 'btn ghost', onclick: dismissInstall, 'aria-label': 'Not now, hide the install message' }, 'Not now'))));
  };
  draw();
  return { node: box, stop: onInstallChange(draw) };
}

export async function home(screen) {
  const urls = urlTracker();
  const banner = installBanner();

  async function startWith(file, extra = {}) {
    const settings = await getSettings();
    try {
      const { photo, thumb, width, height } = await processPhoto(file);
      const session = await createSession({ photo, thumb, width, height, reference: settings.reference, custom: settings.custom, unit: settings.unit, ...extra });
      location.hash = `#/m/${session.id}`;
    } catch (error) {
      console.error(error);
      toast(error.message || 'That photo could not be opened. Please try another one.');
    }
  }

  const pick = (capture) => h('input', { type: 'file', accept: 'image/*', hidden: true, ...(capture ? { capture: 'environment' } : {}),
    onchange: (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) startWith(f); } });
  const camera = pick(true), gallery = pick(false);

  async function trySample() {
    const { renderSample } = await import('../sample.js');
    const { canvas } = renderSample();
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
    canvas.width = canvas.height = 0;
    await startWith(blob, { name: 'Sample photo', hint: 'Made-up photo with known sizes: the box is 180 mm wide, the pen 150 mm long, the card 85.6 mm.' });
  }

  async function rowMenu(s) {
    const choice = await sheet({ title: s.name || 'Photo', actions: [
      { id: 'open', label: 'Open', primary: true }, { id: 'delete', label: 'Delete', danger: true }] });
    if (choice === 'open') location.hash = `#/m/${s.id}`;
    if (choice === 'delete' && await confirmDialog({ title: 'Delete this photo?', message: 'The photo and its measurements will be removed from this device.', confirmText: 'Delete', danger: true })) {
      await deleteSession(s.id); toast('Deleted.'); home(screen);
    }
  }

  const sessions = await listSessions();
  const recent = sessions.length && h('section', { 'aria-labelledby': 'recent-h' },
    h('h2', { class: 'sectionhead', id: 'recent-h' }, 'Recent'),
    h('ul', { class: 'list', role: 'list' }, sessions.map((s) => {
      const ref = referenceById(s.reference, s.custom);
      return h('li', { class: 'srow' },
        h('a', { class: 'row-main', href: `#/m/${s.id}` },
          h('span', { class: 'thumb' }, h('img', { src: urls.url(s.thumb), alt: '', width: 56, height: 56 })),
          h('span', { class: 'row-text' },
            h('span', { class: 'row-title' }, s.name || `Photo, ${formatDate(s.createdAt)}`),
            h('span', { class: 'muted small' }, `${plural(s.measurements.length, 'measurement')} · ${ref.name} · ${formatDate(s.updatedAt)}`))),
        h('button', { class: 'iconbtn', 'aria-label': `More for ${s.name || 'this photo'}`, onclick: () => rowMenu(s) }, icon('dots', 22)));
    })));

  screen.append(
    h('div', { class: 'topbar home' },
      h('img', { class: 'logo', src: 'icons/icon-192.png', width: 30, height: 30, alt: '' }),
      h('span', { class: 'brand' }, 'Tapeshot'),
      h('a', { class: 'btn ghost', href: '#/help' }, 'How it works')),
    h('div', { class: 'tape', 'aria-hidden': 'true' }),
    h('h1', { class: 'hero' }, 'Measure anything from a photo.'),
    h('p', { class: 'lead' }, 'Put a sheet of paper or a card next to it, take the picture, then tap the two ends.'),
    banner.node,
    h('div', { class: 'stack' },
      h('button', { class: 'btn primary big', onclick: () => camera.click() }, icon('camera', 24), 'Take a photo'),
      h('button', { class: 'btn big', onclick: () => gallery.click() }, icon('image', 24), 'Choose from gallery'),
      h('button', { class: 'btn ghost', onclick: trySample }, 'Or try it on a sample photo'),
      camera, gallery),
    h('ol', { class: 'steps' },
      h('li', {}, h('b', {}, 'Lay a reference beside it.'), ' A sheet of A4 or Letter paper, or a bank card, lying flat on the same surface.'),
      h('li', {}, h('b', {}, 'Photograph from above.'), ' The straighter, the better. Keep the whole sheet in the picture.'),
      h('li', {}, h('b', {}, 'Mark the four corners, then the two ends.'), ' You get the length in the unit you like.')),
    recent,
    h('footer', { class: 'foot' }, h('a', { href: '#/privacy' }, 'Privacy'), h('span', {}, 'Everything stays on this device.')));

  return () => { urls.release(); banner.stop(); };
}
