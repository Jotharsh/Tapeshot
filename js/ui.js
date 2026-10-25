// Tiny helpers so every screen is plain DOM, with no framework and no build step.
export function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key in node && key !== 'list' && key !== 'form') node[key] = value;
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function toast(message, ms = 2800) {
  const host = document.getElementById('toasts');
  const node = h('div', { class: 'toast' }, message);
  host.append(node);
  setTimeout(() => node.remove(), ms);
}

function openDialog(content) {
  return new Promise((resolve) => {
    const dialog = h('dialog', {}, content(resolve));
    dialog.addEventListener('close', () => { dialog.remove(); resolve(dialog.returnValue || null); });
    dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
    document.body.append(dialog);
    dialog.showModal();
  });
}

/** A yes/no question. Resolves true only if the user chose the main button. */
export async function confirmDialog({ title, message = '', confirmText = 'Yes', cancelText = 'Cancel', danger = false }) {
  const result = await openDialog(() => [
    h('h2', {}, title),
    message && h('p', {}, message),
    h('div', { class: 'actions' },
      h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, onclick: (e) => e.target.closest('dialog').close('yes') }, confirmText),
      h('button', { class: 'btn', onclick: (e) => e.target.closest('dialog').close('no'), autofocus: true }, cancelText)),
  ]);
  return result === 'yes';
}

/** A list of big buttons. Resolves with the chosen action's id, or null if dismissed. */
export function sheet({ title, message = '', actions }) {
  return openDialog(() => [
    h('h2', {}, title),
    message && h('p', { class: 'muted' }, message),
    h('div', { class: 'actions' },
      actions.map((a) => h('button', { class: `btn ${a.danger ? 'danger' : a.primary ? 'primary' : ''}${a.selected ? ' selected' : ''}`, onclick: (e) => e.target.closest('dialog').close(a.id), disabled: a.disabled },
        a.label, a.detail && h('span', { class: 'detail' }, a.detail))),
      h('button', { class: 'btn ghost', onclick: (e) => e.target.closest('dialog').close('') }, 'Close')),
  ]);
}

/** Asks for some text. Resolves with the text, or null if cancelled. `validate` returns an error message or ''. */
export function promptDialog({ title, message = '', label, value = '', placeholder = '', confirmText = 'Save', validate }) {
  return openDialog(() => {
    const input = h('input', { type: 'text', value, placeholder, 'aria-label': label, autocomplete: 'off', autofocus: true });
    const error = h('p', { class: 'error', role: 'alert' });
    const submit = (e) => {
      e.preventDefault();
      const problem = validate?.(input.value) ?? '';
      if (problem) { error.textContent = problem; input.focus(); return; }
      e.target.closest('dialog').close(`ok:${input.value}`);
    };
    return h('form', { onsubmit: submit },
      h('h2', {}, title), message && h('p', { class: 'muted' }, message),
      h('label', { class: 'field' }, h('span', {}, label), input), error,
      h('div', { class: 'actions' },
        h('button', { class: 'btn primary', type: 'submit' }, confirmText),
        h('button', { class: 'btn', type: 'button', onclick: (e) => e.target.closest('dialog').close('') }, 'Cancel')));
  }).then((r) => (r && r.startsWith('ok:') ? r.slice(3) : null));
}

const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const TIME_FORMAT = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });
export const formatDate = (value) => DATE_FORMAT.format(new Date(value));
export const formatTime = (value) => TIME_FORMAT.format(new Date(value));

/** Object URLs for Blobs, all released together when a screen is left. */
export function urlTracker() {
  const urls = [];
  return {
    url(blob) { if (!blob) return ''; const u = URL.createObjectURL(blob); urls.push(u); return u; },
    release() { urls.splice(0).forEach((u) => URL.revokeObjectURL(u)); },
  };
}

export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  camera: '<path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H8l1.2-1.7a1 1 0 0 1 .8-.3h4a1 1 0 0 1 .8.3L16 6h1.5A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z"/><circle cx="12" cy="12.5" r="3.4"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="M20.5 16l-5-5-9 8.5"/>',
  back: '<path d="M14.5 5.5L8 12l6.5 6.5"/>',
  dots: '<circle cx="5.5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18.5" cy="12" r="1.2"/>',
  share: '<path d="M12 15V4M8 8l4-4 4 4"/><path d="M5 12v6.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V12"/>',
  download: '<path d="M12 4v11M8 11l4 4 4-4"/><path d="M5 19.5h14"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.8 12.5h9.4L17.5 7"/>',
  undo: '<path d="M9 7L4.5 11.5 9 16"/><path d="M5 11.5h8.5a5 5 0 0 1 0 10H11" transform="translate(0 -3)"/>',
  grid: '<path d="M4 9h16M4 15h16M9 4v16M15 4v16"/>',
  fit: '<path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6A1.5 1.5 0 0 0 14 4.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  ruler: '<path d="M3.5 15.5l12-12 5 5-12 12z"/><path d="M7.5 11.5l2 2M10.5 8.5l2 2M13.5 5.5l2 2"/>',
};

/** A small line icon. The shapes above are fixed text written in this file, never user input. */
export function icon(name, size = 22) {
  const span = document.createElement('span');
  span.className = 'icon';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
  return span;
}
export const backLabel = (text) => [icon('back', 20), text];
