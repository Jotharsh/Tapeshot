import { h, icon, backLabel } from '../ui.js';
import { APP_VERSION } from '../config.js';

const page = (screen, title, ...content) => screen.append(
  h('div', { class: 'topbar' }, h('a', { class: 'btn ghost back', href: '#/' }, backLabel('Home')), h('h1', {}, title)),
  h('div', { class: 'prose' }, ...content));

export function help(screen) {
  page(screen, 'How measuring works',
    h('h2', {}, 'In four steps'),
    h('ol', { class: 'steps' },
      h('li', {}, h('b', {}, 'Lay a reference beside the thing.'), ' A sheet of A4 or Letter paper, or a bank card, lying flat on the same surface. It must be one whose real size you know.'),
      h('li', {}, h('b', {}, 'Take the photo from above.'), ' Keep the whole reference in the picture and not hidden by anything. Straight down is best. A steep angle still works, but loses accuracy.'),
      h('li', {}, h('b', {}, 'Mark the four corners of the reference.'), ' Tap each corner. Drag a point to fix it, and pinch to zoom in first. A magnifier appears while you drag.'),
      h('li', {}, h('b', {}, 'Tap the two ends of what you want to measure.'), ' The length appears on the photo, with a give-or-take figure.')),
    h('h2', {}, 'What works and what does not'),
    h('ul', {},
      h('li', {}, h('b', {}, 'Works: '), 'anything lying on the same flat surface as the reference: a table, a floor, a wall with the sheet stuck to it, a drawing, a plank.'),
      h('li', {}, h('b', {}, 'Does not work: '), 'heights. The top of a tall object is not on the reference\'s surface, so it reads too big. Measure along the surface instead.'),
      h('li', {}, h('b', {}, 'Wrinkled or curled paper '), 'gives a wrong scale. Press it flat, or tape the corners down.'),
      h('li', {}, h('b', {}, 'Wide-angle lenses '), 'bend straight lines near the edges of a photo. Keep the thing near the middle, close to the reference.')),
    h('h2', {}, 'How accurate is it?'),
    h('p', {}, 'On a flat surface, with the corners placed to within a pixel or two, a test with made-up photos with known sizes came out within about 1 to 2 percent. The "give or take" figure shown next to each length is worked out from how much it would change if every point you placed were nudged by a couple of pixels. It does not include lens distortion, a curled sheet, or measuring something off the surface, so treat it as a best case.'),
    h('p', {}, 'Use it for estimates, planning and quick checks. For anything where an error matters, such as cutting, ordering materials by the metre, or safety, check with a real tape measure.'),
    h('h2', {}, 'The grid'),
    h('p', {}, 'The grid button draws a square grid on the surface once the reference is marked. If its lines run along the edges of your table and look evenly spaced, the corners are well placed. If they swing away, drag the corners until they behave.'));
}

export function privacy(screen) {
  page(screen, 'Privacy',
    h('p', {}, 'Tapeshot works entirely on this device. Your photos and measurements are stored in your browser and never sent anywhere. There is no account, no server, no analytics and no adverts.'),
    h('p', {}, 'The only time a photo leaves the app is when you choose to save or share it. Deleting a photo removes it from this device for good.'),
    h('p', { class: 'muted' }, `Tapeshot ${APP_VERSION}. Set in Geist (SIL Open Font Licence). Open source under the MIT licence.`));
}
