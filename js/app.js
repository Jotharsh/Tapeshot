import { h, toast } from './ui.js';
import { home } from './views/home.js';
import { help, privacy } from './views/more.js';
import { measureScreen } from './views/measure.js';
import { requestPersistence } from './db.js';

/** Routes are hash based (#/m/123) so they work on any static host and inside an installed app. */
const routes = [
  { pattern: /^#\/?$/, view: home },
  { pattern: /^#\/help$/, view: help },
  { pattern: /^#\/privacy$/, view: privacy },
  { pattern: /^#\/m\/([^/]+)$/, view: measureScreen },
];

export function go(path) { location.hash = path; }

const root = document.getElementById('app');
let cleanup = null;
let renderToken = 0;

async function render() {
  const token = ++renderToken;
  try { cleanup?.(); } catch (e) { console.error(e); }
  cleanup = null;
  const hash = location.hash || '#/';
  const match = routes.map((r) => ({ r, m: hash.match(r.pattern) })).find((x) => x.m);
  const screen = h('main', { class: 'screen', id: 'main' });
  root.replaceChildren(screen);
  window.scrollTo(0, 0);
  if (!match) {
    screen.append(h('h1', {}, 'Page not found'), h('a', { class: 'btn primary', href: '#/' }, 'Go home'));
    return;
  }
  try {
    const result = await match.r.view(screen, match.m.slice(1).map(decodeURIComponent), { go });
    if (token !== renderToken) { result?.(); return; }     // the user went somewhere else while this screen was loading
    cleanup = result ?? null;
  } catch (error) {
    console.error(error);
    screen.replaceChildren(
      h('h1', {}, 'Something went wrong'),
      h('p', {}, 'Your photos are safe. Please go back home and try again.'),
      h('a', { class: 'btn primary', href: '#/' }, 'Go home'));
  }
}

window.addEventListener('hashchange', render);
window.addEventListener('unhandledrejection', (e) => { console.error(e.reason); toast('Something went wrong. Please try again.'); });

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const hadController = Boolean(navigator.serviceWorker.controller);
    await navigator.serviceWorker.register('sw.js');
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController) toast('Tapeshot was updated. Close and reopen it to use the new version.', 6000);   // not on the very first install
    });
  } catch (error) {
    console.warn('Offline support could not start:', error);
  }
}

await render();
registerServiceWorker();
requestPersistence();
